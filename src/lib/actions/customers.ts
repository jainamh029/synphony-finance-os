"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { customers, LIFECYCLE_STAGES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";

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
  await requireWriteAccess([...SALES_ROLES]);
  const parsed = customerSchema.parse(Object.fromEntries(formData));
  await db
    .update(customers)
    .set({ ...parsed, updatedAt: new Date().toISOString() })
    .where(eq(customers.id, customerId));
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
