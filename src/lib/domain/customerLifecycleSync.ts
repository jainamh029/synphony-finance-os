/**
 * DB-touching wrapper around the pure rules in customerLifecycle.ts. Fetches a customer's
 * contracts/deployments, applies the computed stage (respecting a manual override), and
 * writes a customer_lifecycle_history row whenever the stage actually changes.
 */
import { db } from "@/db/client";
import { customers, contracts, deployments, customerLifecycleHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeLifecycleStage, type LifecycleStage, type LifecycleComputationInput } from "./customerLifecycle";

async function fetchLifecycleInputs(customerId: string): Promise<LifecycleComputationInput> {
  const [customerContracts, customerDeployments] = await Promise.all([
    db.select().from(contracts).where(eq(contracts.customerId, customerId)),
    db.select().from(deployments).where(eq(deployments.customerId, customerId)),
  ]);
  return {
    contracts: customerContracts.map((c) => ({ contractType: c.contractType, status: c.status, endDate: c.endDate })),
    deployments: customerDeployments.map((d) => ({ status: d.status })),
  };
}

/**
 * Recomputes and, if it changed, applies the automatic lifecycle stage for one customer.
 * No-ops silently if the customer's lifecycleSource is "manual" (an override is active) or
 * if the computed stage is null (nothing automatic to conclude) or unchanged.
 */
export async function syncCustomerLifecycle(
  customerId: string,
  triggeringRecordType: string,
  triggeringRecordId?: string,
  actor: string = "system"
): Promise<void> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer || customer.lifecycleSource === "manual") return;

  const inputs = await fetchLifecycleInputs(customerId);
  const newStage = computeLifecycleStage(inputs);
  if (!newStage || newStage === customer.lifecycleStage) return;

  await db.update(customers).set({ lifecycleStage: newStage, updatedAt: new Date().toISOString() }).where(eq(customers.id, customerId));
  await db.insert(customerLifecycleHistory).values({
    id: crypto.randomUUID(),
    customerId,
    previousStage: customer.lifecycleStage,
    newStage,
    source: "automatic",
    triggeringRecordType,
    triggeringRecordId: triggeringRecordId ?? null,
    actor,
    reason: null,
  });
}

/** Explicit manual override — persists until someone calls returnToAutomaticLifecycle(). */
export async function setCustomerLifecycleManual(customerId: string, stage: LifecycleStage, actor: string, reason?: string): Promise<void> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new Error("Customer not found.");

  await db
    .update(customers)
    .set({ lifecycleStage: stage, lifecycleSource: "manual", updatedAt: new Date().toISOString() })
    .where(eq(customers.id, customerId));
  await db.insert(customerLifecycleHistory).values({
    id: crypto.randomUUID(),
    customerId,
    previousStage: customer.lifecycleStage,
    newStage: stage,
    source: "manual",
    triggeringRecordType: "manual",
    triggeringRecordId: null,
    actor,
    reason: reason ?? null,
  });
}

/** Clears the manual override and immediately recomputes the automatic stage. */
export async function returnToAutomaticLifecycle(customerId: string, actor: string): Promise<void> {
  await db.update(customers).set({ lifecycleSource: "automatic", updatedAt: new Date().toISOString() }).where(eq(customers.id, customerId));
  await syncCustomerLifecycle(customerId, "manual_override_cleared", undefined, actor);
}

/** Churn requires an explicit reason — the automatic engine never sets this stage on its own. */
export async function markCustomerChurned(customerId: string, actor: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("A churn reason is required.");
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new Error("Customer not found.");

  await db
    .update(customers)
    .set({ lifecycleStage: "churned", lifecycleSource: "manual", churnReason: reason, updatedAt: new Date().toISOString() })
    .where(eq(customers.id, customerId));
  await db.insert(customerLifecycleHistory).values({
    id: crypto.randomUUID(),
    customerId,
    previousStage: customer.lifecycleStage,
    newStage: "churned",
    source: "manual",
    triggeringRecordType: "manual",
    triggeringRecordId: null,
    actor,
    reason,
  });
}
