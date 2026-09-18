"use server";

import { db } from "@/db/client";
import { costs, laborLogs, robotMetrics, invoices, customers, contracts, robots, deployments, robotAssignments } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWriteAccess } from "@/lib/auth/session";
import {
  metricSchema, costSchema, laborSchema, invoiceCsvSchema, customerCsvSchema, contractCsvSchema, robotCsvSchema,
  deploymentCsvSchema, robotAssignmentCsvSchema, paymentCsvSchema,
  parseCsvRows,
} from "@/lib/validation/csvSchemas";
import { syncCustomerLifecycle } from "@/lib/domain/customerLifecycleSync";
import { generateOrRegenerateSchedule } from "@/lib/domain/invoiceScheduleSync";
import { validateRobotAssignment } from "@/lib/domain/robotAssignment";
import { validatePayment } from "@/lib/domain/payments";

const OPS_ROLES = ["admin", "operations", "finance"] as const;
const FINANCE_ROLES = ["admin", "finance"] as const;
const SALES_ROLES = ["admin", "sales", "finance"] as const;

// ---------------------------------------------------------------------------
// Manual entry
// ---------------------------------------------------------------------------

export async function logRobotMetric(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = metricSchema.parse(Object.fromEntries(formData));
  await db.insert(robotMetrics).values({ id: crypto.randomUUID(), ...parsed, isDemo: false });
  revalidatePath("/data-entry");
  revalidatePath("/robots");
  revalidatePath("/deployments");
}

export async function logCost(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = costSchema.parse(Object.fromEntries(formData));
  await db.insert(costs).values({ id: crypto.randomUUID(), ...parsed, isDemo: false });
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
}

export async function logLabor(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = laborSchema.parse(Object.fromEntries(formData));
  await db.insert(laborLogs).values({ id: crypto.randomUUID(), ...parsed, isDemo: false });
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export interface ImportResult {
  ok: boolean;
  inserted: number;
  errors: string[];
}

async function readFileText(formData: FormData): Promise<{ text: string; error?: string }> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { text: "", error: "No file provided." };
  return { text: await file.text() };
}

export async function importCostsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };
  const { toInsert, errors } = parseCsvRows(text, costSchema);

  if (toInsert.length > 0) await db.insert(costs).values(toInsert.map((row) => ({ id: crypto.randomUUID(), ...row, isDemo: false })));
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importLaborCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };
  const { toInsert, errors } = parseCsvRows(text, laborSchema);

  if (toInsert.length > 0) await db.insert(laborLogs).values(toInsert.map((row) => ({ id: crypto.randomUUID(), ...row, isDemo: false })));
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importMetricsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };
  const { toInsert, errors } = parseCsvRows(text, metricSchema);

  if (toInsert.length > 0) await db.insert(robotMetrics).values(toInsert.map((row) => ({ id: crypto.randomUUID(), ...row, isDemo: false })));
  revalidatePath("/data-entry");
  revalidatePath("/robots");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importInvoicesCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...FINANCE_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };
  const { toInsert, errors } = parseCsvRows(text, invoiceCsvSchema);

  if (toInsert.length > 0) {
    await db.insert(invoices).values(
      toInsert.map((row) => ({ id: crypto.randomUUID(), ...row, deploymentId: row.deploymentId || null, paidDate: row.paidDate || null, isDemo: false }))
    );
  }
  revalidatePath("/data-entry");
  revalidatePath("/invoices");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importCustomersCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...SALES_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };
  const { toInsert, errors } = parseCsvRows(text, customerCsvSchema);

  if (toInsert.length > 0) await db.insert(customers).values(toInsert.map((row) => ({ id: crypto.randomUUID(), ...row, isDemo: false })));
  revalidatePath("/data-entry");
  revalidatePath("/customers");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}

export async function importContractsCsv(formData: FormData): Promise<ImportResult> {
  const session = await requireWriteAccess([...SALES_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };

  // Foreign-key validation the DB itself would only catch as an opaque constraint-violation
  // error — check customerId exists up front so row-level errors stay readable.
  const existingCustomerIds = new Set((await db.select({ id: customers.id }).from(customers)).map((c) => c.id));
  const { toInsert, errors } = parseCsvRows(text, contractCsvSchema);
  const valid: typeof toInsert = [];
  for (const row of toInsert) {
    if (!existingCustomerIds.has(row.customerId)) {
      errors.push(`Contract for customerId ${row.customerId}: no matching customer found.`);
      continue;
    }
    valid.push(row);
  }

  if (valid.length > 0) {
    const rows = valid.map((row) => ({ id: crypto.randomUUID(), ...row, isDemo: false }));
    await db.insert(contracts).values(rows);
    for (const row of rows) {
      // A contract with no billing schedule is invisible on its own Billing Schedule tab and
      // breaks the "always contract-driven" guarantee (Gap A) — imported contracts need the
      // same schedule generation createContract() gives one made through the UI.
      await generateOrRegenerateSchedule(row.id, session.email);
      await syncCustomerLifecycle(row.customerId, "contract_import", row.id, session.email);
    }
  }
  revalidatePath("/data-entry");
  revalidatePath("/contracts");
  return { ok: errors.length === 0, inserted: valid.length, errors };
}

export async function importDeploymentsCsv(formData: FormData): Promise<ImportResult> {
  const session = await requireWriteAccess([...OPS_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };

  const existingCustomerIds = new Set((await db.select({ id: customers.id }).from(customers)).map((c) => c.id));
  const existingContractIds = new Set((await db.select({ id: contracts.id }).from(contracts)).map((c) => c.id));
  const { toInsert, errors } = parseCsvRows(text, deploymentCsvSchema);
  const valid: typeof toInsert = [];
  for (const row of toInsert) {
    if (!existingCustomerIds.has(row.customerId)) {
      errors.push(`Deployment "${row.name}": no matching customer ${row.customerId}.`);
      continue;
    }
    if (!existingContractIds.has(row.contractId)) {
      errors.push(`Deployment "${row.name}": no matching contract ${row.contractId}.`);
      continue;
    }
    valid.push(row);
  }

  if (valid.length > 0) {
    const rows = valid.map((row) => ({ id: crypto.randomUUID(), ...row, isDemo: false }));
    await db.insert(deployments).values(rows);
    for (const row of rows) await syncCustomerLifecycle(row.customerId, "deployment_import", row.id, session.email);
  }
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
  return { ok: errors.length === 0, inserted: valid.length, errors };
}

export async function importRobotAssignmentsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };

  const existingDeploymentIds = new Set((await db.select({ id: deployments.id }).from(deployments)).map((d) => d.id));
  const allRobots = await db.select().from(robots);
  const robotById = new Map(allRobots.map((r) => [r.id, r]));
  const { toInsert, errors } = parseCsvRows(text, robotAssignmentCsvSchema);

  const valid: typeof toInsert = [];
  for (const row of toInsert) {
    if (!existingDeploymentIds.has(row.deploymentId)) {
      errors.push(`Assignment for robot ${row.robotId}: no matching deployment ${row.deploymentId}.`);
      continue;
    }
    const robot = robotById.get(row.robotId);
    // Same double-booking guard as the manual "Assign a robot" action (regression bug #1) —
    // a CSV shouldn't be a way to bypass it.
    const validation = validateRobotAssignment(robot ?? null);
    if (!validation.ok) {
      errors.push(`Assignment for robot ${row.robotId}: ${validation.error}`);
      continue;
    }
    valid.push(row);
  }

  if (valid.length > 0) {
    for (const row of valid) {
      await db
        .update(robotAssignments)
        .set({ assignmentEnd: row.assignmentEnd ?? row.assignmentStart })
        .where(and(eq(robotAssignments.robotId, row.robotId), isNull(robotAssignments.assignmentEnd)));
      await db.insert(robotAssignments).values({ id: crypto.randomUUID(), ...row });
      if (!row.assignmentEnd) {
        await db.update(robots).set({ status: "operating", updatedAt: new Date().toISOString() }).where(eq(robots.id, row.robotId));
      }
    }
  }
  revalidatePath("/data-entry");
  revalidatePath("/deployments");
  revalidatePath("/robots");
  return { ok: errors.length === 0, inserted: valid.length, errors };
}

export async function importPaymentsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...FINANCE_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };

  const allInvoices = await db.select().from(invoices);
  const invoiceByNumber = new Map(allInvoices.map((inv) => [inv.invoiceNumber, inv]));
  const { toInsert, errors } = parseCsvRows(text, paymentCsvSchema);

  let inserted = 0;
  const affectedContractIds = new Set<string>();
  for (const row of toInsert) {
    const inv = invoiceByNumber.get(row.invoiceNumber);
    if (!inv) {
      errors.push(`Payment for invoice ${row.invoiceNumber}: no matching invoice found.`);
      continue;
    }
    // Same overpayment cap as the manual "Record payment" action (regression bug #4) — a CSV
    // shouldn't be a way to push amountPaid past the invoice's own amount either.
    const validation = validatePayment(inv, row.amountPaid);
    if (!validation.ok) {
      errors.push(`Payment for invoice ${row.invoiceNumber}: ${validation.error}`);
      continue;
    }
    // validation.ok guarantees these are populated (PaymentValidationResult just isn't a
    // discriminated union TS can narrow on), so the fallbacks below never actually trigger.
    const totalPaid = validation.totalPaid ?? inv.amountPaid;
    const status = validation.status ?? inv.status;
    await db
      .update(invoices)
      .set({ amountPaid: totalPaid, paidDate: row.paidDate, status, updatedAt: new Date().toISOString() })
      .where(eq(invoices.id, inv.id));
    // Keep the in-memory snapshot current so two payment rows for the same invoice in one
    // file are applied against each other correctly (the second row's overpayment check sees
    // the first row's result), not both checked against the same stale pre-import balance.
    invoiceByNumber.set(row.invoiceNumber, { ...inv, amountPaid: totalPaid, status });
    affectedContractIds.add(inv.contractId);
    inserted++;
  }

  revalidatePath("/data-entry");
  revalidatePath("/invoices");
  for (const contractId of affectedContractIds) revalidatePath(`/contracts/${contractId}`);
  return { ok: errors.length === 0, inserted, errors };
}

export async function importRobotsCsv(formData: FormData): Promise<ImportResult> {
  await requireWriteAccess([...OPS_ROLES]);
  const { text, error } = await readFileText(formData);
  if (error) return { ok: false, inserted: 0, errors: [error] };
  const { toInsert, errors } = parseCsvRows(text, robotCsvSchema);

  if (toInsert.length > 0) {
    await db.insert(robots).values(toInsert.map((row) => ({ id: crypto.randomUUID(), ...row, status: "available" as const, isDemo: false })));
  }
  revalidatePath("/data-entry");
  revalidatePath("/robots");
  return { ok: errors.length === 0, inserted: toInsert.length, errors };
}
