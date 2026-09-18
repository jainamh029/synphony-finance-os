import { describe, it, expect } from "vitest";
import { computeLifecycleStage, detectLifecycleContradiction } from "./customerLifecycle";

const today = new Date("2026-09-17");

describe("Gap B: customer lifecycle automation", () => {
  it("a signed non-pilot contract with no live deployment updates to Contracted", () => {
    const stage = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-03-01" }],
      deployments: [],
      today,
    });
    expect(stage).toBe("contracted");
    // Also true when a deployment exists but hasn't progressed past planning.
    const stage2 = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-03-01" }],
      deployments: [{ status: "planned" }],
      today,
    });
    expect(stage2).toBe("contracted");
  });

  it("an active pilot contract updates to Pilot", () => {
    const stage = computeLifecycleStage({
      contracts: [{ contractType: "pilot", status: "active", endDate: "2026-12-01" }],
      deployments: [],
      today,
    });
    expect(stage).toBe("pilot");
  });

  it("a deployment in approved/deploying status updates to Deploying", () => {
    const stage = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-03-01" }],
      deployments: [{ status: "deploying" }],
      today,
    });
    expect(stage).toBe("deploying");
  });

  it("a live deployment updates to Active", () => {
    const stage = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-03-01" }],
      deployments: [{ status: "active" }],
      today,
    });
    expect(stage).toBe("active");
  });

  it("an at_risk deployment still counts as Active (it's live, just flagged)", () => {
    const stage = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-03-01" }],
      deployments: [{ status: "at_risk" }],
      today,
    });
    expect(stage).toBe("active");
  });

  it("a contract nearing expiry within the renewal window, with no later replacement, updates to Renewal only under that condition", () => {
    const nearExpiry = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2026-09-30" }], // 13 days out
      deployments: [{ status: "active" }],
      today,
    });
    expect(nearExpiry).toBe("renewal");

    // Same deployment, but a later-dated contract already signed -> stays Active, not Renewal.
    const withReplacement = computeLifecycleStage({
      contracts: [
        { contractType: "fixed_seasonal", status: "active", endDate: "2026-09-30" },
        { contractType: "fixed_seasonal", status: "active", endDate: "2027-09-30" },
      ],
      deployments: [{ status: "active" }],
      today,
    });
    expect(withReplacement).toBe("active");

    // Far from expiry -> stays Active.
    const farFromExpiry = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-06-30" }],
      deployments: [{ status: "active" }],
      today,
    });
    expect(farFromExpiry).toBe("active");
  });

  it("a cancelled final contract with no active records and all-paused deployments updates to Paused, not Churned", () => {
    // Churn is explicit-only (markCustomerChurned) — the automatic engine must never set it.
    const stage = computeLifecycleStage({
      contracts: [{ contractType: "fixed_seasonal", status: "cancelled", endDate: "2026-06-01" }],
      deployments: [{ status: "paused" }],
      today,
    });
    expect(stage).toBe("paused");
    expect(stage).not.toBe("churned");
  });

  it("no contracts or deployments at all resolves to null (leave Lead/Qualified alone)", () => {
    expect(computeLifecycleStage({ contracts: [], deployments: [], today })).toBeNull();
  });

  it("is deterministic / idempotent: computing twice from the same inputs gives the same answer (no oscillation)", () => {
    const input = {
      contracts: [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-03-01" }],
      deployments: [{ status: "active" }],
      today,
    };
    expect(computeLifecycleStage(input)).toBe(computeLifecycleStage(input));
  });
});

describe("Gap B: lifecycle contradiction warnings", () => {
  it("flags Churned with an active contract on file", () => {
    const warning = detectLifecycleContradiction(
      { lifecycleStage: "churned" },
      [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-01-01" }]
    );
    expect(warning).toMatch(/Churned/);
  });

  it("flags Lead with a signed active contract on file", () => {
    const warning = detectLifecycleContradiction(
      { lifecycleStage: "lead" },
      [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-01-01" }]
    );
    expect(warning).toMatch(/Lead/);
  });

  it("no warning for a consistent state", () => {
    const warning = detectLifecycleContradiction(
      { lifecycleStage: "active" },
      [{ contractType: "fixed_seasonal", status: "active", endDate: "2027-01-01" }]
    );
    expect(warning).toBeNull();
  });
});
