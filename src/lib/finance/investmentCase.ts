/**
 * Pre-deployment investment case (Gap C) — pure. Computes the *expected* P&L a deployment
 * would have if it performs to plan, using the same formulas calculations.ts already proved
 * out (contribution margin, payback, cost/revenue per unit) rather than inventing new math.
 * This is what a deployment's page should show before any actuals exist, instead of a
 * flat $0-vs-$0 budget table.
 */
import { contributionMargin, contributionMarginPct, costPerPound, revenuePerRobotHour, expectedPaybackPeriod, safeDiv } from "./calculations";

export interface InvestmentCaseAssumptions {
  contractTotalValue: number;
  contractStartDate: string;
  contractEndDate: string;
  plannedDirectCostTotal: number; // sum of the deployment's approved budget items
  plannedUpfrontCostTotal: number; // sum of budget items marked is_upfront
  expectedProductiveHours: number; // season total across all planned robots
  expectedPoundsHarvested: number;
  robotsPlanned: number;
  depositCollected: number; // expected up-front customer cash collection
  marginTargetPct: number;
  paybackTargetMonths: number;
}

export interface InvestmentCaseOutputs {
  expectedBookings: number;
  expectedMonthlyRevenue: number;
  expectedDirectCost: number;
  expectedGrossProfit: number;
  expectedContributionMargin: number;
  expectedContributionMarginPct: number | null;
  expectedCostPerPound: number | null;
  expectedRevenuePerRobotHour: number | null;
  expectedContributionMarginPerRobot: number | null;
  expectedUpfrontCashRequirement: number;
  expectedPaybackMonths: number | null;
  breakEvenPricePerPound: number | null;
  meetsMarginTarget: boolean;
  meetsPaybackTarget: boolean;
}

function monthsBetweenInclusive(startDate: string, endDate: string): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
  return Math.max(1, months);
}

export function computeInvestmentCase(a: InvestmentCaseAssumptions): InvestmentCaseOutputs {
  const months = monthsBetweenInclusive(a.contractStartDate, a.contractEndDate);
  const expectedMonthlyRevenue = a.contractTotalValue / months;
  const cm = contributionMargin(a.contractTotalValue, a.plannedDirectCostTotal);
  const cmPct = contributionMarginPct(cm, a.contractTotalValue);
  const monthlyCm = cm / months;

  // Net cash Synphony must front before the deposit arrives: planned upfront cost minus
  // whatever the customer's own deposit already covers, floored at 0 (a large deposit can
  // fully fund the upfront cost, meaning no net cash requirement).
  const expectedUpfrontCashRequirement = Math.max(0, a.plannedUpfrontCostTotal - a.depositCollected);
  const paybackMonths = expectedPaybackPeriod(expectedUpfrontCashRequirement, monthlyCm);

  return {
    expectedBookings: a.contractTotalValue,
    expectedMonthlyRevenue,
    expectedDirectCost: a.plannedDirectCostTotal,
    expectedGrossProfit: a.contractTotalValue - a.plannedDirectCostTotal,
    expectedContributionMargin: cm,
    expectedContributionMarginPct: cmPct,
    expectedCostPerPound: costPerPound(a.plannedDirectCostTotal, a.expectedPoundsHarvested),
    expectedRevenuePerRobotHour: revenuePerRobotHour(a.contractTotalValue, a.expectedProductiveHours),
    expectedContributionMarginPerRobot: a.robotsPlanned > 0 ? cm / a.robotsPlanned : 0,
    expectedUpfrontCashRequirement,
    expectedPaybackMonths: paybackMonths,
    breakEvenPricePerPound: safeDiv(a.plannedDirectCostTotal, a.expectedPoundsHarvested),
    meetsMarginTarget: cmPct !== null && cmPct >= a.marginTargetPct,
    meetsPaybackTarget: paybackMonths !== null && paybackMonths <= a.paybackTargetMonths,
  };
}

// ---------------------------------------------------------------------------
// Approval thresholds
// ---------------------------------------------------------------------------

export interface FinanceThresholds {
  minContributionMarginPct: number;
  maxPaybackMonths: number;
  maxUpfrontCashRequirement: number;
  minUptimePct: number;
  minUtilizationPct: number;
}

export const DEFAULT_FINANCE_THRESHOLDS: FinanceThresholds = {
  minContributionMarginPct: 20,
  maxPaybackMonths: 12,
  maxUpfrontCashRequirement: 100_000,
  minUptimePct: 80,
  minUtilizationPct: 60,
};

export interface ThresholdFailure {
  rule: string;
  detail: string;
}

export interface ThresholdCheckResult {
  passed: boolean;
  failures: ThresholdFailure[];
}

export function checkInvestmentCaseThresholds(
  outputs: InvestmentCaseOutputs,
  expectedUptimePct: number,
  expectedUtilizationPct: number,
  thresholds: FinanceThresholds = DEFAULT_FINANCE_THRESHOLDS
): ThresholdCheckResult {
  const failures: ThresholdFailure[] = [];

  if (outputs.expectedContributionMarginPct === null || outputs.expectedContributionMarginPct < thresholds.minContributionMarginPct) {
    failures.push({
      rule: "minContributionMarginPct",
      detail: `Expected contribution margin is ${outputs.expectedContributionMarginPct?.toFixed(1) ?? "N/A"}%, below the ${thresholds.minContributionMarginPct}% minimum.`,
    });
  }
  if (outputs.expectedPaybackMonths === null || outputs.expectedPaybackMonths > thresholds.maxPaybackMonths) {
    failures.push({
      rule: "maxPaybackMonths",
      detail: `Expected payback is ${outputs.expectedPaybackMonths?.toFixed(1) ?? "N/A (never, at this margin)"} months, exceeding the ${thresholds.maxPaybackMonths}-month maximum.`,
    });
  }
  if (outputs.expectedUpfrontCashRequirement > thresholds.maxUpfrontCashRequirement) {
    failures.push({
      rule: "maxUpfrontCashRequirement",
      detail: `Expected up-front cash requirement is $${outputs.expectedUpfrontCashRequirement.toLocaleString()}, exceeding the $${thresholds.maxUpfrontCashRequirement.toLocaleString()} maximum.`,
    });
  }
  if (expectedUptimePct < thresholds.minUptimePct) {
    failures.push({ rule: "minUptimePct", detail: `Expected uptime ${expectedUptimePct}% is below the ${thresholds.minUptimePct}% minimum.` });
  }
  if (expectedUtilizationPct < thresholds.minUtilizationPct) {
    failures.push({ rule: "minUtilizationPct", detail: `Expected utilization ${expectedUtilizationPct}% is below the ${thresholds.minUtilizationPct}% minimum.` });
  }

  return { passed: failures.length === 0, failures };
}
