"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { contracts, CONTRACT_TYPES, CONTRACT_STATUSES, BILLING_FREQUENCIES, PAYMENT_TERMS } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";
import { syncCustomerLifecycle } from "@/lib/domain/customerLifecycleSync";
import { generateOrRegenerateSchedule, issueScheduledInvoice, voidScheduleLine } from "@/lib/domain/invoiceScheduleSync";

const SALES_ROLES = ["admin", "sales", "finance"] as const;
const FINANCE_ROLES = ["admin", "finance"] as const;

// Fields that change what a billing schedule generated from this contract would look like —
// editing any of these bumps contractVersion, which the UI uses to show "schedule may be out
// of date" until someone explicitly regenerates it.
const SCHEDULE_MATERIAL_FIELDS = [
  "totalContractValue", "mobilizationFee", "depositAmount", "minimumCommitment",
  "variablePricePerUnit", "monthlySubscriptionAmount", "startDate", "endDate",
  "billingFrequency", "paymentTerms",
] as const;

const contractSchema = z.object({
  customerId: z.string().min(1),
  contractType: z.enum(CONTRACT_TYPES),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  totalContractValue: z.coerce.number().nonnegative(),
  mobilizationFee: z.coerce.number().nonnegative().default(0),
  depositAmount: z.coerce.number().nonnegative().default(0),
  minimumCommitment: z.coerce.number().nonnegative().default(0),
  variablePricePerUnit: z.coerce.number().nonnegative().optional(),
  variableUnitType: z.string().optional(),
  monthlySubscriptionAmount: z.coerce.number().nonnegative().optional(),
  expectedOutputVolume: z.coerce.number().nonnegative().optional(),
  robotsCommitted: z.coerce.number().int().nonnegative().default(0),
  billingFrequency: z.enum(BILLING_FREQUENCIES).default("monthly"),
  paymentTerms: z.enum(PAYMENT_TERMS).default("net_30"),
  customerFundedHardware: z.coerce.number().nonnegative().default(0),
  slaUptimeTargetPct: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(CONTRACT_STATUSES),
  notes: z.string().optional(),
});

export async function createContract(formData: FormData) {
  const session = await requireWriteAccess([...SALES_ROLES]);
  const parsed = contractSchema.parse(Object.fromEntries(formData));
  const [row] = await db
    .insert(contracts)
    .values({ id: crypto.randomUUID(), ...parsed, paymentTermsDays: paymentTermsDaysFrom(parsed.paymentTerms), isDemo: false })
    .returning();

  // A signed contract should have a transparent billing schedule from day one — not
  // "generate it later if someone remembers." Draft/in_review contracts still get one so
  // it's visible and editable before the deal is actually signed.
  await generateOrRegenerateSchedule(row.id, session.email);
  await syncCustomerLifecycle(parsed.customerId, "contract", row.id, session.email);

  revalidatePath("/contracts");
  revalidatePath(`/customers/${parsed.customerId}`);
  redirect(`/contracts/${row.id}`);
}

export async function updateContract(contractId: string, formData: FormData) {
  const session = await requireWriteAccess([...SALES_ROLES]);
  const parsed = contractSchema.parse(Object.fromEntries(formData));
  const [current] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!current) throw new Error("Contract not found.");

  const materialChange = SCHEDULE_MATERIAL_FIELDS.some((f) => String(current[f as keyof typeof current] ?? "") !== String(parsed[f as keyof typeof parsed] ?? ""));
  const nextVersion = materialChange ? current.contractVersion + 1 : current.contractVersion;

  await db
    .update(contracts)
    .set({ ...parsed, paymentTermsDays: paymentTermsDaysFrom(parsed.paymentTerms), contractVersion: nextVersion, updatedAt: new Date().toISOString() })
    .where(eq(contracts.id, contractId));

  await syncCustomerLifecycle(parsed.customerId, "contract", contractId, session.email);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  redirect(`/contracts/${contractId}`);
}

export async function updateContractStatus(contractId: string, status: (typeof CONTRACT_STATUSES)[number]) {
  const session = await requireWriteAccess([...SALES_ROLES]);
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  await db.update(contracts).set({ status, updatedAt: new Date().toISOString() }).where(eq(contracts.id, contractId));
  if (contract) await syncCustomerLifecycle(contract.customerId, "contract", contractId, session.email);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
}

function paymentTermsDaysFrom(terms: (typeof PAYMENT_TERMS)[number]): number {
  switch (terms) {
    case "due_on_receipt": return 0;
    case "net_15": return 15;
    case "net_45": return 45;
    case "net_60": return 60;
    case "net_30":
    default: return 30;
  }
}

// ---------------------------------------------------------------------------
// Billing schedule (Gap A)
// ---------------------------------------------------------------------------

export async function regenerateContractSchedule(contractId: string) {
  const session = await requireWriteAccess([...FINANCE_ROLES]);
  await generateOrRegenerateSchedule(contractId, session.email);
  revalidatePath(`/contracts/${contractId}`);
}

export async function issueInvoiceFromSchedule(scheduleItemId: string, contractId: string) {
  const session = await requireWriteAccess([...FINANCE_ROLES]);
  await issueScheduledInvoice(scheduleItemId, session.email);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/invoices");
}

export async function voidContractScheduleLine(scheduleItemId: string, contractId: string) {
  await requireWriteAccess([...FINANCE_ROLES]);
  await voidScheduleLine(scheduleItemId);
  revalidatePath(`/contracts/${contractId}`);
}
