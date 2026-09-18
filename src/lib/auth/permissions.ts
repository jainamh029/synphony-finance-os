/**
 * Pure role-capability checks — the permission matrix every mutating server action's
 * requireWriteAccess() call ultimately reduces to. Split out from session.ts (which imports
 * `db` and `next/headers` at module scope, and so can't be imported from vitest without a
 * live DATABASE_URL / request context) so this matrix is directly unit-testable.
 */
import type { Role } from "@/db/schema";

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
