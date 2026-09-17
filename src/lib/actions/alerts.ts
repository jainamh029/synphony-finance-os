"use server";

import { db } from "@/db/client";
import { alerts, ALERT_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWriteAccess } from "@/lib/auth/session";

export async function updateAlertStatus(alertId: string, formData: FormData) {
  await requireWriteAccess();
  const status = String(formData.get("status")) as (typeof ALERT_STATUSES)[number];
  const owner = formData.get("owner") ? String(formData.get("owner")) : undefined;
  const resolutionNote = formData.get("resolutionNote") ? String(formData.get("resolutionNote")) : undefined;

  const patch: Partial<typeof alerts.$inferInsert> = { status };
  if (owner !== undefined) patch.owner = owner;
  if (resolutionNote !== undefined) patch.resolutionNote = resolutionNote;
  if (status === "resolved" || status === "dismissed") patch.resolutionDate = new Date().toISOString().slice(0, 10);

  await db.update(alerts).set(patch).where(eq(alerts.id, alertId));
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
