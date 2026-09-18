import { describe, it, expect } from "vitest";
import { canEditFinanceAssumptions, canEditOperations, canEditSales, isReadOnly } from "./permissions";
import { ROLES, type Role } from "@/db/schema";

// requireWriteAccess() itself needs a real request context (next/headers' cookies()) and a
// database session lookup, so it isn't unit-testable directly — but every mutating server
// action's authorization decision reduces to these pure role-capability checks, which are.
// This is the permission matrix every "use server" action in the app is gated by; a change
// here is a change to who can do what, everywhere.

describe("security: role capability matrix", () => {
  const allRoles = ROLES as readonly Role[];

  it("only viewer is read-only", () => {
    for (const role of allRoles) {
      expect(isReadOnly(role)).toBe(role === "viewer");
    }
  });

  it("finance assumptions (investment case decisions, budget approval) are admin/finance only", () => {
    const expected: Record<Role, boolean> = { admin: true, finance: true, operations: false, sales: false, viewer: false };
    for (const role of allRoles) expect(canEditFinanceAssumptions(role)).toBe(expected[role]);
  });

  it("operations actions (robot assignment, deployment status, budget drafts) exclude sales and viewer", () => {
    const expected: Record<Role, boolean> = { admin: true, finance: true, operations: true, sales: false, viewer: false };
    for (const role of allRoles) expect(canEditOperations(role)).toBe(expected[role]);
  });

  it("sales actions (customers, contracts, pricing scenarios) exclude operations and viewer", () => {
    const expected: Record<Role, boolean> = { admin: true, finance: true, operations: false, sales: true, viewer: false };
    for (const role of allRoles) expect(canEditSales(role)).toBe(expected[role]);
  });

  it("admin can do everything a role-scoped write action requires", () => {
    expect(canEditFinanceAssumptions("admin")).toBe(true);
    expect(canEditOperations("admin")).toBe(true);
    expect(canEditSales("admin")).toBe(true);
    expect(isReadOnly("admin")).toBe(false);
  });

  it("viewer can do nothing that requires a write capability", () => {
    expect(canEditFinanceAssumptions("viewer")).toBe(false);
    expect(canEditOperations("viewer")).toBe(false);
    expect(canEditSales("viewer")).toBe(false);
    expect(isReadOnly("viewer")).toBe(true);
  });
});
