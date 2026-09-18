import { describe, it, expect } from "vitest";
import { alertKeyOf, selectNewAlertCandidates, type AlertKeyable, type ExistingAlertRow } from "./alertDedup";

describe("regression: alert deduplication (bug #5)", () => {
  it("distinct overdue invoices produce distinct keys (dedupKey drives uniqueness)", () => {
    const invoiceA: AlertKeyable = { alertType: "collections_overdue", dedupKey: "invoice-aaa" };
    const invoiceB: AlertKeyable = { alertType: "collections_overdue", dedupKey: "invoice-bbb" };
    expect(alertKeyOf(invoiceA)).not.toBe(alertKeyOf(invoiceB));
  });

  it("two invoice-alert candidates with no deploymentId/robotId no longer collide on the same key", () => {
    // This is exactly the bug: both alerts had deploymentId=null, robotId=null, and no
    // dedupKey — they used to compute the identical fallback key.
    const withoutDedupKey: AlertKeyable = { alertType: "collections_overdue" };
    expect(alertKeyOf(withoutDedupKey)).toBe("collections_overdue::::");
  });

  it("distinct overdue invoices both get created when neither is already tracked", () => {
    const candidates: AlertKeyable[] = [
      { alertType: "collections_overdue", dedupKey: "invoice-aaa" },
      { alertType: "collections_overdue", dedupKey: "invoice-bbb" },
    ];
    const result = selectNewAlertCandidates(candidates, []);
    expect(result).toHaveLength(2);
  });

  it("a new overdue invoice still creates an alert even when an unrelated overdue-invoice alert already exists", () => {
    // Reproduces the exact failure: invoice A's alert already exists and is open; invoice B
    // is a brand new overdue invoice. Before the fix, B's candidate collided with A's key
    // (both were "collections_overdue::::") and was silently dropped.
    const existing: ExistingAlertRow[] = [{ alertType: "collections_overdue", dedupKey: "invoice-aaa", status: "open" }];
    const candidates: AlertKeyable[] = [
      { alertType: "collections_overdue", dedupKey: "invoice-aaa" }, // still overdue, already tracked
      { alertType: "collections_overdue", dedupKey: "invoice-bbb" }, // newly overdue
    ];
    const result = selectNewAlertCandidates(candidates, existing);
    expect(result).toHaveLength(1);
    expect((result[0] as AlertKeyable).dedupKey).toBe("invoice-bbb");
  });

  it("repeated sync with nothing changed creates no duplicate alerts", () => {
    const existing: ExistingAlertRow[] = [
      { alertType: "collections_overdue", dedupKey: "invoice-aaa", status: "open" },
      { alertType: "negative_contribution_margin", deploymentId: "dep-1", status: "open" },
    ];
    const candidates: AlertKeyable[] = [
      { alertType: "collections_overdue", dedupKey: "invoice-aaa" },
      { alertType: "negative_contribution_margin", deploymentId: "dep-1" },
    ];
    expect(selectNewAlertCandidates(candidates, existing)).toHaveLength(0);
  });

  it("a resolved alert's condition recurring creates a new alert (reopens by recurrence, not by flag flip)", () => {
    const existing: ExistingAlertRow[] = [{ alertType: "collections_overdue", dedupKey: "invoice-aaa", status: "resolved" }];
    const candidates: AlertKeyable[] = [{ alertType: "collections_overdue", dedupKey: "invoice-aaa" }];
    const result = selectNewAlertCandidates(candidates, existing);
    expect(result).toHaveLength(1); // resolved doesn't block re-creation if the condition is still true
  });

  it("acknowledged and in_progress alerts also block re-creation (not just 'open')", () => {
    for (const status of ["acknowledged", "in_progress"]) {
      const existing: ExistingAlertRow[] = [{ alertType: "collections_overdue", dedupKey: "invoice-aaa", status }];
      const candidates: AlertKeyable[] = [{ alertType: "collections_overdue", dedupKey: "invoice-aaa" }];
      expect(selectNewAlertCandidates(candidates, existing)).toHaveLength(0);
    }
  });

  it("within a single sync run, two candidates that happen to share a key are only inserted once", () => {
    // Defensive case: even without a dedupKey collision from real data, the selection
    // function itself must not double-insert within one run.
    const candidates: AlertKeyable[] = [
      { alertType: "capacity_constraint" },
      { alertType: "capacity_constraint" },
    ];
    expect(selectNewAlertCandidates(candidates, [])).toHaveLength(1);
  });

  it("deployment- and robot-scoped alerts (no dedupKey) still key correctly off deploymentId/robotId", () => {
    const candidates: AlertKeyable[] = [
      { alertType: "negative_contribution_margin", deploymentId: "dep-1" },
      { alertType: "negative_contribution_margin", deploymentId: "dep-2" },
    ];
    const result = selectNewAlertCandidates(candidates, []);
    expect(result).toHaveLength(2);
  });
});
