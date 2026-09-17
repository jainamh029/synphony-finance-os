"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { robots, ROBOT_STATUSES, ACQUISITION_TYPES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriteAccess } from "@/lib/auth/session";

const OPS_ROLES = ["admin", "operations", "finance"] as const;

export async function updateRobotStatus(robotId: string, formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const status = String(formData.get("status")) as (typeof ROBOT_STATUSES)[number];
  await db.update(robots).set({ status, updatedAt: new Date().toISOString() }).where(eq(robots.id, robotId));
  revalidatePath(`/robots/${robotId}`);
  revalidatePath("/robots");
}

const robotSchema = z.object({
  robotCode: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().optional(),
  acquisitionType: z.enum(ACQUISITION_TYPES),
  acquisitionDate: z.string().min(1),
  purchaseCost: z.coerce.number().nonnegative(),
  usefulLifeMonths: z.coerce.number().int().positive().default(48),
  monthlyLeaseCost: z.coerce.number().nonnegative().default(0),
  warrantyExpiry: z.string().optional(),
  notes: z.string().optional(),
});

export async function createRobot(formData: FormData) {
  await requireWriteAccess([...OPS_ROLES]);
  const parsed = robotSchema.parse(Object.fromEntries(formData));
  const [row] = await db
    .insert(robots)
    .values({ id: crypto.randomUUID(), ...parsed, status: "available", isDemo: false })
    .returning();
  revalidatePath("/robots");
  redirect(`/robots/${row.id}`);
}
