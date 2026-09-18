"use server";

import { db } from "@/db/client";
import { deployments, deploymentBudgetItems, contracts, deploymentInvestmentCases, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWriteAccess } from "@/lib/auth/session";
import { computeInvestmentCase, checkInvestmentCaseThresholds, DEFAULT_FINANCE_THRESHOLDS, type InvestmentCaseAssumptions, type FinanceThresholds } from "@/lib/finance/investmentCase";

const OPS_ROLES = ["admin", "operations", "finance"] as const;
const FINANCE_ROLES = ["admin", "finance"] as const;

async function getFinanceThresholds(): Promise<FinanceThresholds> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "investment_case_thresholds"));
  if (!row) return DEFAULT_FINANCE_THRESHOLDS;
  try {
    return { ...DEFAULT_FINANCE_THRESHOLDS, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_FINANCE_THRESHOLDS;
  }
}

async function buildAssumptions(deploymentId: string): Promise<{ assumptions: InvestmentCaseAssumptions; marginTargetPct: number; paybackTargetMonths: number } | null> {
  const [dep] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  if (!dep) return null;
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, dep.contractId));
  if (!contract) return null;

  const budgetItems = await db
    .select()
    .from(deploymentBudgetItems)
    .where(and(eq(deploymentBudgetItems.deploymentId, deploymentId), eq(deploymentBudgetItems.isApproved, true)));

  const plannedDirectCostTotal = budgetItems.reduce((s, b) => s + b.plannedAmount, 0);
  const plannedUpfrontCostTotal = budgetItems.filter((b) => b.isUpfront).reduce((s, b) => s + b.plannedAmount, 0);

  const marginTargetPct = 20;
  const paybackTargetMonths = 12;

  return {
    marginTargetPct,
    paybackTargetMonths,
    assumptions: {
      contractTotalValue: contract.totalContractValue,
      contractStartDate: contract.startDate,
      contractEndDate: contract.endDate,
      plannedDirectCostTotal,
      plannedUpfrontCostTotal,
      expectedProductiveHours: dep.expectedOperatingHours ?? 0,
      expectedPoundsHarvested: dep.expectedOutputVolume ?? 0,
      robotsPlanned: dep.robotsPlanned,
      depositCollected: contract.depositAmount,
      marginTargetPct,
      paybackTargetMonths,
    },
  };
}

/** Creates a new draft (or re-computes an existing draft's) investment case for a deployment. */
export async function createOrUpdateInvestmentCase(deploymentId: string, scenario: "conservative" | "base" | "aggressive" = "base") {
  await requireWriteAccess([...OPS_ROLES]);
  const built = await buildAssumptions(deploymentId);
  if (!built) throw new Error("Deployment or contract not found.");

  // Conservative/aggressive scales the *performance* assumptions (expected output), not the
  // contract value or approved budget — those are contractual/budgeted facts that don't move
  // with a scenario case, same distinction the Pricing Lab's scenario cases make.
  const factor = scenario === "conservative" ? 0.85 : scenario === "aggressive" ? 1.15 : 1;
  const assumptions = {
    ...built.assumptions,
    expectedProductiveHours: built.assumptions.expectedProductiveHours * factor,
    expectedPoundsHarvested: built.assumptions.expectedPoundsHarvested * factor,
  };

  const outputs = computeInvestmentCase(assumptions);

  const existing = await db.select().from(deploymentInvestmentCases).where(eq(deploymentInvestmentCases.deploymentId, deploymentId));
  const openDraft = existing.find((c) => c.status === "draft" && c.scenario === scenario);
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((c) => c.version)) + 1 : 1;

  if (openDraft) {
    await db
      .update(deploymentInvestmentCases)
      .set({ assumptionsJson: JSON.stringify(assumptions), outputsJson: JSON.stringify(outputs), updatedAt: new Date().toISOString() })
      .where(eq(deploymentInvestmentCases.id, openDraft.id));
  } else {
    await db.insert(deploymentInvestmentCases).values({
      id: crypto.randomUUID(),
      deploymentId,
      version: nextVersion,
      status: "draft",
      scenario,
      assumptionsJson: JSON.stringify(assumptions),
      outputsJson: JSON.stringify(outputs),
    });
  }

  revalidatePath(`/deployments/${deploymentId}`);
}

export async function submitInvestmentCaseForReview(caseId: string, deploymentId: string) {
  const session = await requireWriteAccess([...OPS_ROLES]);
  await db
    .update(deploymentInvestmentCases)
    .set({ status: "submitted", submittedBy: session.email, submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(deploymentInvestmentCases.id, caseId));
  revalidatePath(`/deployments/${deploymentId}`);
}

export type InvestmentCaseDecision = "approved" | "rejected" | "deferred" | "needs_repricing" | "needs_revision";

/**
 * Records a finance decision on an investment case. Approving requires either passing every
 * configured threshold, or an authorized (finance/admin) override with a written reason — the
 * threshold failures at decision time are captured either way, and an approved case is frozen
 * (isImmutable) so its snapshot can never silently drift after the fact.
 */
export async function decideInvestmentCase(
  caseId: string,
  deploymentId: string,
  decision: InvestmentCaseDecision,
  decisionNote: string,
  overrideReason?: string
) {
  const session = await requireWriteAccess([...FINANCE_ROLES]);
  const [investmentCase] = await db.select().from(deploymentInvestmentCases).where(eq(deploymentInvestmentCases.id, caseId));
  if (!investmentCase) throw new Error("Investment case not found.");
  if (investmentCase.isImmutable) throw new Error("This investment case was already approved and is immutable — create a new version instead.");

  const [dep] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  const outputs = JSON.parse(investmentCase.outputsJson) as ReturnType<typeof computeInvestmentCase>;
  const thresholds = await getFinanceThresholds();
  const check = checkInvestmentCaseThresholds(outputs, dep?.expectedUptimePct ?? 0, dep?.expectedUtilizationPct ?? 0, thresholds);

  if (decision === "approved" && !check.passed && !overrideReason?.trim()) {
    throw new Error(
      `Cannot approve: ${check.failures.length} finance threshold(s) failed (${check.failures.map((f) => f.rule).join(", ")}). ` +
        `An override reason is required to approve anyway.`
    );
  }

  // Approving supersedes any other previously-approved case for this deployment.
  if (decision === "approved") {
    await db
      .update(deploymentInvestmentCases)
      .set({ status: "superseded", updatedAt: new Date().toISOString() })
      .where(and(eq(deploymentInvestmentCases.deploymentId, deploymentId), eq(deploymentInvestmentCases.status, "approved")));
  }

  await db
    .update(deploymentInvestmentCases)
    .set({
      status: decision,
      decidedBy: session.email,
      decidedAt: new Date().toISOString(),
      overrideReason: overrideReason?.trim() || null,
      thresholdFailuresJson: JSON.stringify(check.failures),
      decisionNote: decisionNote || null,
      isImmutable: decision === "approved",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(deploymentInvestmentCases.id, caseId));

  // Approval is a financial go-ahead, not an operational status change — the deployment's
  // own status still moves through the normal planned/approved/deploying/active lifecycle
  // via updateDeploymentStatus, but "approved" here at least reflects that finance signed off.
  if (decision === "approved" && dep && dep.status === "planned") {
    await db.update(deployments).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(deployments.id, deploymentId));
  }

  revalidatePath(`/deployments/${deploymentId}`);
}
