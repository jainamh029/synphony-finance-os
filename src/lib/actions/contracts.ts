"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { contracts, CONTRACT_TYPES, CONTRACT_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";

const SALES_ROLES = ["admin", "sales", "finance"] as const;

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
  paymentTermsDays: z.coerce.number().int().positive().default(30),
  customerFundedHardware: z.coerce.number().nonnegative().default(0),
  slaUptimeTargetPct: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(CONTRACT_STATUSES),
  notes: z.string().optional(),
});

export async function createContract(formData: FormData) {
  await requireWriteAccess([...SALES_ROLES]);
  const parsed = contractSchema.parse(Object.fromEntries(formData));
  const [row] = await db
    .insert(contracts)
    .values({ id: crypto.randomUUID(), ...parsed, isDemo: false })
    .returning();
  revalidatePath("/contracts");
  revalidatePath(`/customers/${parsed.customerId}`);
  redirect(`/contracts/${row.id}`);
}

export async function updateContractStatus(contractId: string, status: (typeof CONTRACT_STATUSES)[number]) {
  await requireWriteAccess([...SALES_ROLES]);
  await db.update(contracts).set({ status, updatedAt: new Date().toISOString() }).where(eq(contracts.id, contractId));
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
}
