import { describe, it, expect } from "vitest";
import {
  safeDiv,
  pct,
  fleetUtilization,
  uptime,
  revenuePerRobotHour,
  costPerPound,
  contributionMargin,
  contributionMarginPct,
  expectedPaybackPeriod,
  monthsBetween,
  straightLineMonthlyRevenue,
  agingBucket,
  outstandingBalance,
  weightedPipeline,
  monthlyNetBurn,
  runwayMonths,
  closingCash,
  calculateRoi,
  roiSensitivity,
  type RoiInputs,
} from "./calculations";

describe("safeDiv / pct", () => {
  it("returns null on divide by zero", () => {
    expect(safeDiv(10, 0)).toBeNull();
    expect(pct(10, 0)).toBeNull();
  });
  it("computes correctly otherwise", () => {
    expect(safeDiv(10, 4)).toBe(2.5);
    expect(pct(1, 4)).toBe(25);
  });
});

describe("fleet economics", () => {
  it("fleet utilization = productive/available", () => {
    expect(fleetUtilization({ productiveHours: 60, availableHours: 100 })).toBe(60);
  });
  it("uptime = (available-downtime)/available", () => {
    expect(uptime({ availableHours: 100, downtimeHours: 15 })).toBe(85);
  });
  it("uptime N/A when no available hours", () => {
    expect(uptime({ availableHours: 0, downtimeHours: 0 })).toBeNull();
  });
  it("revenue per robot hour", () => {
    expect(revenuePerRobotHour(1000, 50)).toBe(20);
  });
  it("cost per pound N/A with zero pounds", () => {
    expect(costPerPound(500, 0)).toBeNull();
  });
});

describe("deployment P&L", () => {
  it("contribution margin and %", () => {
    const cm = contributionMargin(10000, 6000);
    expect(cm).toBe(4000);
    expect(contributionMarginPct(cm, 10000)).toBe(40);
  });
  it("contribution margin can be negative (loss-making deployment)", () => {
    const cm = contributionMargin(5000, 8000);
    expect(cm).toBe(-3000);
    expect(contributionMarginPct(cm, 5000)).toBe(-60);
  });
  it("payback period null when margin is zero or negative", () => {
    expect(expectedPaybackPeriod(50000, 0)).toBeNull();
    expect(expectedPaybackPeriod(50000, -100)).toBeNull();
  });
  it("payback period computed for positive margin", () => {
    expect(expectedPaybackPeriod(50000, 5000)).toBe(10);
  });
  it("monthsBetween is inclusive and at least 1", () => {
    expect(monthsBetween("2026-01-01", "2026-01-15")).toBe(1);
    expect(monthsBetween("2026-01-01", "2026-06-01")).toBe(6);
  });
  it("straight-line monthly revenue divides evenly across months", () => {
    expect(straightLineMonthlyRevenue(60000, "2026-01-01", "2026-06-01")).toBe(10000);
  });
});

describe("accounts receivable", () => {
  it("aging buckets by days overdue", () => {
    const asOf = new Date("2026-06-30");
    expect(agingBucket("2026-07-05", asOf)).toBe("current");
    expect(agingBucket("2026-06-20", asOf)).toBe("1-30");
    expect(agingBucket("2026-05-01", asOf)).toBe("31-60");
    expect(agingBucket("2026-03-01", asOf)).toBe("90+");
  });
  it("outstanding balance floors at zero", () => {
    expect(outstandingBalance(1000, 1000)).toBe(0);
    expect(outstandingBalance(1000, 1200)).toBe(0);
    expect(outstandingBalance(1000, 400)).toBe(600);
  });
  it("weighted pipeline", () => {
    expect(weightedPipeline(100000, 25)).toBe(25000);
  });
});

describe("cash & runway", () => {
  it("net burn", () => {
    expect(monthlyNetBurn(100000, 40000)).toBe(60000);
  });
  it("runway is null (cash-flow positive) when burn <= 0", () => {
    expect(runwayMonths(500000, 0)).toBeNull();
    expect(runwayMonths(500000, -1000)).toBeNull();
  });
  it("runway divides cash by burn", () => {
    expect(runwayMonths(600000, 60000)).toBe(10);
  });
  it("closing cash formula", () => {
    const close = closingCash({
      openingCash: 100000,
      collections: 20000,
      deposits: 5000,
      financingInflows: 0,
      grantIncome: 0,
      payroll: 40000,
      capex: 10000,
      opex: 15000,
      debtLeasePayments: 0,
    });
    expect(close).toBe(60000);
  });
});

describe("pricing & ROI lab", () => {
  const base: RoiInputs = {
    customerLaborCostPerHour: 20,
    laborHoursReplacedPerSeason: 5000,
    laborBurdenPct: 25,
    expectedYieldQualityBenefit: 10000,
    numberOfRobots: 4,
    expectedOutputPerProductiveHour: 40,
    expectedProductiveHoursPerRobot: 800,
    expectedUptimePct: 90,
    expectedUtilizationPct: 70,
    contractPrice: 120000,
    synphonyDirectCosts: 80000,
    depositAmount: 20000,
    customerUpfrontCost: 15000,
    deploymentMonths: 6,
  };

  it("computes avoided labor cost with burden loaded", () => {
    const out = calculateRoi(base);
    expect(out.avoidedLaborCost).toBeCloseTo(20 * 1.25 * 5000, 5);
  });

  it("customer net savings = gross benefit - fees", () => {
    const out = calculateRoi(base);
    expect(out.customerNetSavings).toBeCloseTo(out.customerGrossBenefit - base.contractPrice, 5);
  });

  it("flags negative synphony contribution margin", () => {
    const lossy: RoiInputs = { ...base, contractPrice: 50000 };
    const out = calculateRoi(lossy);
    expect(out.synphonyContributionMargin).toBeLessThan(0);
    expect(out.synphonyContributionMarginPct).toBeLessThan(0);
  });

  it("sensitivity: lower uptime does not change revenue but higher price increases customer cost", () => {
    const base_ = calculateRoi(base);
    const higherPrice = roiSensitivity(base, "price", 20);
    expect(higherPrice.synphonyRevenue).toBeGreaterThan(base_.synphonyRevenue);
    expect(higherPrice.customerNetSavings).toBeLessThan(base_.customerNetSavings);
  });

  it("total productive hours scale with robot count, uptime, and utilization", () => {
    const out = calculateRoi(base);
    expect(out.totalProductiveHours).toBeCloseTo(4 * 800 * 0.9 * 0.7, 5);
  });

  it("uptime is not a dead input: lower uptime raises break-even price", () => {
    const lowerUptime = roiSensitivity(base, "uptime", -20);
    const higherUptime = roiSensitivity(base, "uptime", 20);
    const baseOut = calculateRoi(base);
    expect(lowerUptime.breakEvenPricePerPound).toBeGreaterThan(baseOut.breakEvenPricePerPound ?? 0);
    expect(higherUptime.breakEvenPricePerPound).toBeLessThan(baseOut.breakEvenPricePerPound ?? 0);
  });
});
