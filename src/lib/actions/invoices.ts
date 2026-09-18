"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { invoices, INVOICE_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";
import { validatePayment } from "@/lib/domain/payments";

const FINANCE_ROLES = ["admin", "finance"] as const;

const invoiceSchema = z.object({
  contractId: z.string().min(1),
  deploymentId: z.string().optional(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  amount: z.coerce.number().positive(),
  status: z.enum(INVOICE_STATUSES),
  notes: z.string().optional(),
});

export async function createInvoice(formData: FormData) {
  await requireWriteAccess([...FINANCE_ROLES]);
  const parsed = invoiceSchema.parse(Object.fromEntries(formData));
  await db.insert(invoices).values({
    id: crypto.randomUUID(),
    ...parsed,
    deploymentId: parsed.deploymentId || null,
    amountPaid: 0,
    isDemo: false,
  });
  revalidatePath("/invoices");
  revalidatePath(`/contracts/${parsed.contractId}`);
  redirect(`/contracts/${parsed.contractId}`);
}

const paymentSchema = z.object({
  amountPaid: z.coerce.number().nonnegative(),
  paidDate: z.string().min(1),
});

export async function recordPayment(invoiceId: string, formData: FormData) {
  await requireWriteAccess([...FINANCE_ROLES]);
  const parsed = paymentSchema.parse(Object.fromEntries(formData));
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new Error("Invoice not found");

  // No credit-note / overpayment-as-credit workflow exists yet, so a payment that would push
  // amountPaid past the invoice's own amount must be rejected outright rather than silently
  // capped (capping would discard the entered figure without telling the user why, which can
  // mask a genuine data-entry error) — see acceptance test 7's payment-cap requirement.
  const validation = validatePayment(inv, parsed.amountPaid);
  if (!validation.ok) throw new Error(validation.error);

  await db
    .update(invoices)
    .set({ amountPaid: validation.totalPaid, paidDate: parsed.paidDate, status: validation.status, updatedAt: new Date().toISOString() })
    .where(eq(invoices.id, invoiceId));

  revalidatePath("/invoices");
  revalidatePath(`/contracts/${inv.contractId}`);
}
