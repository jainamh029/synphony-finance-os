"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { customers, LIFECYCLE_STAGES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";
import { setCustomerLifecycleManual, returnToAutomaticLifecycle, markCustomerChurned } from "@/lib/domain/customerLifecycleSync";

const SALES_ROLES = ["admin", "sales", "finance"] as const;

const customerSchema = z.object({
  farmName: z.string().min(1, "Farm name is required"),
  parentOrg: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  cropType: z.string().min(1),
  acres: z.coerce.number().nonnegative().optional(),
  seasonStart: z.string().optional(),
  seasonEnd: z.string().optional(),
  expectedVolumeLbs: z.coerce.number().nonnegative().optional(),
  manualLaborCostPerHour: z.coerce.number().nonnegative().optional(),
  manualLaborCostPerLb: z.coerce.number().nonnegative().optional(),
  customerOwner: z.string().optional(),
  lifecycleStage: z.enum(LIFECYCLE_STAGES),
  notes: z.string().optional(),
});

export async function createCustomer(formData: FormData) {
  await requireWriteAccess([...SALES_ROLES]);
  const parsed = customerSchema.parse(Object.fromEntries(formData));
  const [row] = await db
    .insert(customers)
    .values({ id: crypto.randomUUID(), ...parsed, isDemo: false })
    .returning();
  revalidatePath("/customers");
  redirect(`/customers/${row.id}`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const session = await requireWriteAccess([...SALES_ROLES]);
  const parsed = customerSchema.parse(Object.fromEntries(formData));
  const { lifecycleStage, ...rest } = parsed;

  const [current] = await db.select().from(customers).where(eq(customers.id, customerId));
  await db.update(customers).set({ ...rest, updatedAt: new Date().toISOString() }).where(eq(customers.id, customerId));

  // Changing the stage through the edit form is a deliberate manual override — it's recorded
  // as such (source="manual", with history) rather than silently overwriting the value the
  // automatic engine may have set. Leaving the dropdown unchanged does not touch lifecycleSource.
  if (current && lifecycleStage !== current.lifecycleStage) {
    await setCustomerLifecycleManual(customerId, lifecycleStage, session.email);
  }

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

export async function returnCustomerToAutomaticLifecycle(customerId: string) {
  const session = await requireWriteAccess([...SALES_ROLES]);
  await returnToAutomaticLifecycle(customerId, session.email);
  revalidatePath(`/customers/${customerId}`);
}

export async function churnCustomer(customerId: string, formData: FormData) {
  const session = await requireWriteAccess([...SALES_ROLES]);
  const reason = String(formData.get("reason") ?? "");
  await markCustomerChurned(customerId, session.email, reason);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
