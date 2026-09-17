import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "synphony_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Demo-grade session: cookie holds the user id directly (no JWT/signing).
 *  Swap for Supabase Auth / Clerk / NextAuth in production — see README. */
export async function createSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function verifyLogin(email: string, password: string): Promise<SessionUser | null> {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

// Role capability helpers -----------------------------------------------------
export function canEditFinanceAssumptions(role: Role): boolean {
  return role === "admin" || role === "finance";
}
export function canEditOperations(role: Role): boolean {
  return role === "admin" || role === "operations" || role === "finance";
}
export function canEditSales(role: Role): boolean {
  return role === "admin" || role === "sales" || role === "finance";
}
export function isReadOnly(role: Role): boolean {
  return role === "viewer";
}

/**
 * Server-action guard: throws if the current session can't write at all (Viewer/Board),
 * or — when `roles` is given — isn't one of the roles allowed to perform this specific
 * mutation. Call this as the first line of every mutating "use server" function; render-time
 * button hiding is a UX nicety, not a security boundary (a viewer can still POST directly).
 */
export async function requireWriteAccess(roles?: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized: not signed in.");
  if (isReadOnly(session.role)) throw new Error("Forbidden: viewer accounts are read-only.");
  if (roles && !roles.includes(session.role)) throw new Error(`Forbidden: this action requires one of [${roles.join(", ")}].`);
  return session;
}
