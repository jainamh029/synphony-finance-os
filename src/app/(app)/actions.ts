"use server";

import { destroySession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { syncAlerts } from "@/lib/finance/alerts-sync";
import { revalidatePath } from "next/cache";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function refreshAlertsAction() {
  await syncAlerts();
  revalidatePath("/", "layout");
}
