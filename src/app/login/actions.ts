"use server";

import { verifyLogin, createSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export async function loginAction(_prevState: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both an email and password." };
  }

  const user = await verifyLogin(email, password);
  if (!user) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}
