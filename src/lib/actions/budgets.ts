"use server";

import { db } from "@/db/client";
import { deploymentBudgetItems, BUDGET_CATEGORIES } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWriteAccess } from "@/lib/auth/session";
import { computeBudgetVariance } from "@/lib/domain/budgetRevision";

const OPS_ROLES = ["admin", "operations", "finance"] as const;

export interface BudgetRevisionResult {
  ok: boolean;
  error?: string;
  version?: number;
  variancePct?: number | null;
}

/**
 * Creates a new draft budget version (copy-on-write — never mutates an approved version's
 * rows, and never touches the actual cost ledger). If the new total differs from the latest
 * approved total by more than the material-change threshold, a non-empty `changeReason` is
 * required; without one, the revision is rejected rather than silently saved unexplained.
 */
export async function createBudgetRevision(deploymentId: string, formData: FormData): Promise<BudgetRevisionResult> {
  const session = await requireWriteAccess([...OPS_ROLES]);

  const entries: { category: (typeof BUDGET_CATEGORIES)[number]; amount: number; upfront: boolean }[] = [];
  for (const category of BUDGET_CATEGORIES) {
    const amount = Number(formData.get(`budget_${category}`) ?? 0);
    if (amount > 0) entries.push({ category, amount, upfront: formData.get(`upfront_${category}`) === "on" });
  }
  const changeReason = String(formData.get("changeReason") ?? "").trim();

  const existing = await db.select().from(deploymentBudgetItems).where(eq(deploymentBudgetItems.deploymentId, deploymentId));
  const latestApproved = existing.filter((r) => r.isApproved);
  const previousTotal = latestApproved.reduce((s, r) => s + r.plannedAmount, 0);
  const newTotal = entries.reduce((s, e) => s + e.amount, 0);

  const variance = computeBudgetVariance(previousTotal, newTotal);
  if (variance.isMaterial && !changeReason) {
    return {
      ok: false,
      error: `This is a ${variance.variancePct!.toFixed(1)}% change from the current approved budget ($${previousTotal.toLocaleString()} -> $${newTotal.toLocaleString()}), which exceeds the 10% material-change threshold. A change reason is required before this can be saved.`,
      variancePct: variance.variancePct,
    };
  }

  const nextVersion = existing.length > 0 ? Math.max(...existing.map((r) => r.version)) + 1 : 1;
  if (entries.length > 0) {
    await db.insert(deploymentBudgetItems).values(
      entries.map((e) => ({
        id: crypto.randomUUID(),
        deploymentId,
        category: e.category,
        plannedAmount: e.amount,
        isUpfront: e.upfront,
        version: nextVersion,
        isApproved: false,
        changeReason: changeReason || null,
        createdBy: session.email,
      }))
    );
  }

  revalidatePath(`/deployments/${deploymentId}`);
  return { ok: true, version: nextVersion, variancePct: variance.variancePct };
}

/** Approves a draft version: marks its rows approved, and un-approves (but keeps) the prior approved version's rows. */
export async function approveBudgetVersion(deploymentId: string, version: number) {
  await requireWriteAccess([...OPS_ROLES]);
  const now = new Date().toISOString();

  await db
    .update(deploymentBudgetItems)
    .set({ isApproved: false, supersededAt: now, updatedAt: now })
    .where(and(eq(deploymentBudgetItems.deploymentId, deploymentId), eq(deploymentBudgetItems.isApproved, true)));

  await db
    .update(deploymentBudgetItems)
    .set({ isApproved: true, updatedAt: now })
    .where(and(eq(deploymentBudgetItems.deploymentId, deploymentId), eq(deploymentBudgetItems.version, version)));

  revalidatePath(`/deployments/${deploymentId}`);
}
