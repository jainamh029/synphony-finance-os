"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { deployments, deploymentBudgetItems, robotAssignments, robots, DEPLOYMENT_STATUSES, BUDGET_CATEGORIES } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";
import { validateRobotAssignment } from "@/lib/domain/robotAssignment";
import { syncCustomerLifecycle } from "@/lib/domain/customerLifecycleSync";

const OPS_ROLES = ["admin", "operations", "finance"] as const;

const deploymentSchema = z.object({
  customerId: z.string().min(1),
  contractId: z.string().min(1),
  name: z.string().min(1),
  plannedStartDate: z.string().min(1),
  plannedEndDate: z.string().min(1),
  robotsPlanned: z.coerce.number().int().nonnegative(),
  expectedOperatingHours: z.coerce.number().nonnegative().optional(),
  expectedOutputVolume: z.coerce.number().nonnegative().optional(),
  expectedTechnicianHours: z.coerce.number().nonnegative().optional(),
  expectedUptimePct: z.coerce.number().min(0).max(100).default(90),
  expectedUtilizationPct: z.coerce.number().min(0).max(100).default(70),
  operationsOwner: z.string().optional(),
  financeOwner: z.string().optional(),
  notes: z.string().optional(),
});

export async function createDeployment(formData: FormData) {
  const session = await requireWriteAccess([...OPS_ROLES]);
  const parsed = deploymentSchema.parse(Object.fromEntries(formData));

  const budgetEntries: { category: (typeof BUDGET_CATEGORIES)[number]; amount: number; upfront: boolean }[] = [];
  for (const category of BUDGET_CATEGORIES) {
    const amount = Number(formData.get(`budget_${category}`) ?? 0);
    if (amount > 0) {
      const upfront = formData.get(`upfront_${category}`) === "on";
      budgetEntries.push({ category, amount, upfront });
    }
  }

  const [dep] = await db
    .insert(deployments)
    .values({ id: crypto.randomUUID(), ...parsed, status: "planned", isDemo: false })
    .returning();

  if (budgetEntries.length > 0) {
    // v1 is the initial plan — approved by default so investment-case / P&L comparisons have
    // something to compare against immediately, without a separate "approve the first draft"
    // step. Later revisions (Gap D) are drafts until explicitly approved.
    await db.insert(deploymentBudgetItems).values(
      budgetEntries.map((b) => ({
        id: crypto.randomUUID(), deploymentId: dep.id, category: b.category, plannedAmount: b.amount, isUpfront: b.upfront,
        version: 1, isApproved: true, createdBy: session.email,
      }))
    );
  }

  await syncCustomerLifecycle(parsed.customerId, "deployment", dep.id, session.email);
  revalidatePath("/deployments");
  redirect(`/deployments/${dep.id}`);
}

export async function updateDeploymentStatus(deploymentId: string, formData: FormData) {
  const session = await requireWriteAccess([...OPS_ROLES]);
  const status = String(formData.get("status")) as (typeof DEPLOYMENT_STATUSES)[number];
  const [dep] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));
  const patch: Partial<typeof deployments.$inferInsert> = { status, updatedAt: new Date().toISOString() };
  if (status === "active" || status === "deploying") {
    if (dep && !dep.actualStartDate) patch.actualStartDate = new Date().toISOString().slice(0, 10);
  }
  if (status === "completed") patch.actualEndDate = new Date().toISOString().slice(0, 10);
  await db.update(deployments).set(patch).where(eq(deployments.id, deploymentId));
  if (dep) await syncCustomerLifecycle(dep.customerId, "deployment", deploymentId, session.email);
  revalidatePath(`/deployments/${deploymentId}`);
  revalidatePath("/deployments");
}

export async function updateDeploymentNotes(deploymentId: string, formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const notes = String(formData.get("notes") ?? "");
  const operationsOwner = String(formData.get("operationsOwner") ?? "");
  await db.update(deployments).set({ notes, operationsOwner, updatedAt: new Date().toISOString() }).where(eq(deployments.id, deploymentId));
  revalidatePath(`/deployments/${deploymentId}`);
}

export async function assignRobot(deploymentId: string, formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const robotId = String(formData.get("robotId"));
  const assignmentStart = String(formData.get("assignmentStart") || new Date().toISOString().slice(0, 10));
  if (!robotId) return;

  // The "assign" dropdown only lists available/idle robots, but that's a UI convenience,
  // not a security boundary — the action itself must re-check, since a robot's real status
  // (operating elsewhere, in repair, retired...) can only be trusted from the database, not
  // from whatever robotId a request happens to submit. A robot currently `operating` on
  // another deployment already fails this check, so it doubles as double-booking prevention:
  // reassigning it requires an explicit Unassign first, which is the "defined allocation
  // rule" — not a silent reassignment that quietly drops it from its current deployment.
  const [robot] = await db.select().from(robots).where(eq(robots.id, robotId));
  const validation = validateRobotAssignment(robot ?? null);
  if (!validation.ok) throw new Error(validation.error);

  // Defensive cleanup only — the status gate above is what actually prevents double-booking.
  // This just closes any stray open assignment row that could exist if a robot's status was
  // ever changed directly (e.g. via the Robots page) without going through Unassign.
  await db
    .update(robotAssignments)
    .set({ assignmentEnd: assignmentStart })
    .where(and(eq(robotAssignments.robotId, robotId), isNull(robotAssignments.assignmentEnd)));

  await db.insert(robotAssignments).values({ id: crypto.randomUUID(), robotId, deploymentId, assignmentStart });
  await db.update(robots).set({ status: "operating", updatedAt: new Date().toISOString() }).where(eq(robots.id, robotId));

  revalidatePath(`/deployments/${deploymentId}`);
  revalidatePath("/robots");
}

export async function unassignRobot(deploymentId: string, robotId: string) {
  await requireWriteAccess([...OPS_ROLES]);
  await db
    .update(robotAssignments)
    .set({ assignmentEnd: new Date().toISOString().slice(0, 10) })
    .where(and(eq(robotAssignments.robotId, robotId), eq(robotAssignments.deploymentId, deploymentId), isNull(robotAssignments.assignmentEnd)));
  await db.update(robots).set({ status: "available", updatedAt: new Date().toISOString() }).where(eq(robots.id, robotId));
  revalidatePath(`/deployments/${deploymentId}`);
  revalidatePath("/robots");
}
