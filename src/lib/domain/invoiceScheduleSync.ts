import { db } from "@/db/client";
import { contracts, invoiceScheduleItems, invoices } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { generateScheduleLines, type ContractForSchedule } from "./invoiceSchedule";

const REGENERATABLE_STATUSES = ["scheduled", "draft"] as const;

/**
 * (Re)generates a contract's forward-looking billing schedule. Never touches schedule items
 * already `issued`/`paid`/`void`/`cancelled` — those are historical fact once a real invoice
 * exists (or the line was explicitly cancelled), and are preserved untouched. Only
 * `scheduled`/`draft` lines are eligible to be replaced, and replacing means marking them
 * `superseded` (kept for audit, not deleted) rather than removed.
 */
export async function generateOrRegenerateSchedule(contractId: string, actor: string): Promise<{ created: number; superseded: number }> {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw new Error("Contract not found.");

  const existing = await db.select().from(invoiceScheduleItems).where(eq(invoiceScheduleItems.contractId, contractId));
  const toSupersede = existing.filter((i) => (REGENERATABLE_STATUSES as readonly string[]).includes(i.status));

  if (toSupersede.length > 0) {
    await db
      .update(invoiceScheduleItems)
      .set({ status: "superseded", updatedAt: new Date().toISOString() })
      .where(inArray(invoiceScheduleItems.id, toSupersede.map((i) => i.id)));
  }

  const nextVersion = existing.length > 0 ? Math.max(...existing.map((i) => i.scheduleVersion)) + 1 : 1;

  const contractForSchedule: ContractForSchedule = {
    contractType: contract.contractType,
    startDate: contract.startDate,
    endDate: contract.endDate,
    totalContractValue: contract.totalContractValue,
    mobilizationFee: contract.mobilizationFee,
    depositAmount: contract.depositAmount,
    minimumCommitment: contract.minimumCommitment,
    variablePricePerUnit: contract.variablePricePerUnit,
    variableUnitType: contract.variableUnitType,
    monthlySubscriptionAmount: contract.monthlySubscriptionAmount,
    expectedOutputVolume: contract.expectedOutputVolume,
    billingFrequency: contract.billingFrequency,
    paymentTermsDays: contract.paymentTermsDays,
  };

  const lines = generateScheduleLines(contractForSchedule);

  if (lines.length > 0) {
    await db.insert(invoiceScheduleItems).values(
      lines.map((l) => ({
        id: crypto.randomUUID(),
        contractId,
        lineType: l.lineType,
        description: l.description,
        plannedAmount: l.plannedAmount,
        plannedInvoiceDate: l.plannedInvoiceDate,
        plannedDueDate: l.plannedDueDate,
        status: "scheduled" as const,
        scheduleVersion: nextVersion,
        sourceContractVersion: contract.contractVersion,
        generatedBy: actor,
      }))
    );
  }

  return { created: lines.length, superseded: toSupersede.length };
}

/**
 * Converts one scheduled/draft line into a real, issued invoice. This is the only path that
 * creates an actual `invoices` row from a schedule item — a schedule existing is never, on
 * its own, treated as invoiced revenue or cash collected (see aggregate.ts, which only ever
 * reads from `invoices`, and has no knowledge of this table at all).
 */
export async function issueScheduledInvoice(scheduleItemId: string, actor: string): Promise<string> {
  const [item] = await db.select().from(invoiceScheduleItems).where(eq(invoiceScheduleItems.id, scheduleItemId));
  if (!item) throw new Error("Schedule item not found.");
  if (item.status !== "scheduled" && item.status !== "draft") {
    throw new Error(`Cannot issue this line: it is already "${item.status}".`);
  }

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, item.contractId));
  if (!contract) throw new Error("Contract not found.");

  const invoiceNumber = `INV-SCH-${item.id.slice(0, 8).toUpperCase()}`;
  const invoiceId = crypto.randomUUID();

  await db.insert(invoices).values({
    id: invoiceId,
    contractId: item.contractId,
    deploymentId: null,
    invoiceNumber,
    invoiceDate: item.plannedInvoiceDate,
    dueDate: item.plannedDueDate,
    amount: item.plannedAmount,
    status: "sent",
    amountPaid: 0,
    isDemo: false,
    notes: `Issued from billing schedule line: ${item.description} (by ${actor})`,
  });

  await db
    .update(invoiceScheduleItems)
    .set({ status: "issued", issuedInvoiceId: invoiceId, updatedAt: new Date().toISOString() })
    .where(eq(invoiceScheduleItems.id, scheduleItemId));

  return invoiceId;
}

export async function voidScheduleLine(scheduleItemId: string): Promise<void> {
  const [item] = await db.select().from(invoiceScheduleItems).where(eq(invoiceScheduleItems.id, scheduleItemId));
  if (!item) throw new Error("Schedule item not found.");
  if (item.status === "issued" || item.status === "paid") {
    throw new Error("Cannot void a line that has already been issued or paid — void/adjust the linked invoice instead.");
  }
  await db.update(invoiceScheduleItems).set({ status: "void", updatedAt: new Date().toISOString() }).where(eq(invoiceScheduleItems.id, scheduleItemId));
}
