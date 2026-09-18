import { describe, it, expect } from "vitest";
import { computeBudgetVariance } from "./budgetRevision";

describe("Gap D: budget material-change detection (>10% threshold)", () => {
  it("a change under 10% is not material", () => {
    const result = computeBudgetVariance(100_000, 105_000); // +5%
    expect(result.isMaterial).toBe(false);
  });

  it("a change over 10% is material", () => {
    const result = computeBudgetVariance(100_000, 115_000); // +15%
    expect(result.isMaterial).toBe(true);
    expect(result.variancePct).toBeCloseTo(15, 5);
  });

  it("a decrease over 10% is also material (uses absolute value)", () => {
    const result = computeBudgetVariance(100_000, 85_000); // -15%
    expect(result.isMaterial).toBe(true);
  });

  it("exactly 10% is not material (threshold is exclusive)", () => {
    const result = computeBudgetVariance(100_000, 110_000);
    expect(result.isMaterial).toBe(false);
  });

  it("a brand-new budget (no prior total) is never flagged material", () => {
    const result = computeBudgetVariance(0, 50_000);
    expect(result.isMaterial).toBe(false);
    expect(result.variancePct).toBeNull();
  });
});
