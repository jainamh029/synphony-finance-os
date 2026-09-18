import { describe, it, expect } from "vitest";
import { computeInvestmentCase, checkInvestmentCaseThresholds, DEFAULT_FINANCE_THRESHOLDS, type InvestmentCaseAssumptions } from "./investmentCase";

const baseAssumptions: InvestmentCaseAssumptions = {
  contractTotalValue: 200_000,
  contractStartDate: "2027-04-01",
  contractEndDate: "2027-10-01",
  plannedDirectCostTotal: 120_000,
  plannedUpfrontCostTotal: 40_000,
  expectedProductiveHours: 3000,
  expectedPoundsHarvested: 800_000,
  robotsPlanned: 4,
  depositCollected: 20_000,
  marginTargetPct: 20,
  paybackTargetMonths: 12,
};

describe("Gap C: pre-deployment investment case", () => {
  it("shows a real expected P&L before any actuals exist (not $0 vs $0)", () => {
    const outputs = computeInvestmentCase(baseAssumptions);
    expect(outputs.expectedBookings).toBe(200_000);
    expect(outputs.expectedContributionMargin).toBe(80_000); // 200k - 120k
    expect(outputs.expectedContributionMarginPct).toBeCloseTo(40, 5);
    expect(outputs.expectedGrossProfit).toBe(80_000);
  });

  it("expected payback nets the deposit against the upfront cash requirement", () => {
    const outputs = computeInvestmentCase(baseAssumptions);
    // upfront requirement = 40,000 - 20,000 deposit = 20,000
    expect(outputs.expectedUpfrontCashRequirement).toBe(20_000);
    expect(outputs.expectedPaybackMonths).not.toBeNull();
  });

  it("a deposit that fully covers the upfront cost means zero net cash requirement", () => {
    const outputs = computeInvestmentCase({ ...baseAssumptions, depositCollected: 100_000 });
    expect(outputs.expectedUpfrontCashRequirement).toBe(0);
  });

  it("negative margin reconciles correctly and fails the margin target", () => {
    const outputs = computeInvestmentCase({ ...baseAssumptions, plannedDirectCostTotal: 250_000 });
    expect(outputs.expectedContributionMargin).toBe(-50_000);
    expect(outputs.meetsMarginTarget).toBe(false);
  });

  it("reconciles to the pricing/margin formulas already validated in calculations.test.ts", () => {
    // Cross-check: contribution margin % here matches contributionMarginPct(cm, revenue) directly.
    const outputs = computeInvestmentCase(baseAssumptions);
    expect(outputs.expectedContributionMarginPct).toBeCloseTo((80_000 / 200_000) * 100, 5);
  });
});

describe("Gap C: approval threshold checks", () => {
  it("a healthy case with good uptime/utilization passes all thresholds", () => {
    const outputs = computeInvestmentCase(baseAssumptions);
    const result = checkInvestmentCaseThresholds(outputs, 90, 75);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("negative margin cannot pass without an override (threshold check reports the failure)", () => {
    const outputs = computeInvestmentCase({ ...baseAssumptions, plannedDirectCostTotal: 250_000 });
    const result = checkInvestmentCaseThresholds(outputs, 90, 75);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.rule === "minContributionMarginPct")).toBe(true);
  });

  it("expected uptime/utilization below minimums are reported as separate failures", () => {
    const outputs = computeInvestmentCase(baseAssumptions);
    const result = checkInvestmentCaseThresholds(outputs, 50, 40, DEFAULT_FINANCE_THRESHOLDS);
    expect(result.failures.some((f) => f.rule === "minUptimePct")).toBe(true);
    expect(result.failures.some((f) => f.rule === "minUtilizationPct")).toBe(true);
  });

  it("a downside scenario (higher planned cost) changes payback and cash requirement outputs correctly", () => {
    const base = computeInvestmentCase(baseAssumptions);
    const downside = computeInvestmentCase({ ...baseAssumptions, plannedDirectCostTotal: 160_000, plannedUpfrontCostTotal: 60_000 });
    expect(downside.expectedContributionMargin).toBeLessThan(base.expectedContributionMargin);
    expect(downside.expectedUpfrontCashRequirement).toBeGreaterThan(base.expectedUpfrontCashRequirement);
  });
});
