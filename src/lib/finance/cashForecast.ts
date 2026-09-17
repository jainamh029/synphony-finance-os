import { db } from "@/db/client";
import { forecastScenarios, contracts, invoices, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { closingCash, outstandingBalance, straightLineMonthlyRevenue } from "./calculations";

const WEEK_MS = 7 * 86400000;
const AVG_WEEKS_PER_MONTH = 4.345;

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface WeeklyForecastRow {
  weekStart: string;
  openingCash: number;
  collections: number;
  deposits: number;
  financingInflows: number;
  payroll: number;
  capex: number;
  opex: number;
  closingCash: number;
}

export interface MonthlyForecastRow {
  month: string;
  openingCash: number;
  collections: number;
  payroll: number;
  opex: number;
  capex: number;
  financingInflows: number;
  closingCash: number;
}

export interface ScenarioRow {
  id: string;
  name: string;
  scenarioType: "base" | "downside" | "growth";
  startingCash: number;
}

export async function listScenarios(): Promise<ScenarioRow[]> {
  const rows = await db.select().from(forecastScenarios);
  return rows.map((r) => ({ id: r.id, name: r.name, scenarioType: r.scenarioType, startingCash: r.startingCash }));
}

async function getCurrentCash(fallback: number): Promise<number> {
  const rows = await db.select().from(settings).where(eq(settings.key, "current_cash_balance"));
  return rows[0] ? Number(rows[0].value) : fallback;
}

const BASE_DSO_DAYS = 30; // standard payment-terms assumption layered under every scenario

/**
 * Weekly cash forecast for the given scenario. `scenario.collectionsDelayDays` is
 * modeled as *incremental slippage beyond contractual terms* (0 for Base, 45 for
 * the "45-day slower collections" Downside case) rather than an absolute DSO
 * recomputed from each invoice's origination date — anchoring on invoice date
 * would let a longer delay assumption drag already-overdue invoices *forward*
 * into the forecast window (since a shorter delay would have already placed
 * their expected collection before "today", making them invisible), which
 * perversely made the Downside case look better in the near term. Anchoring
 * every outstanding invoice at max(today, dueDate) + slip avoids that: more
 * slip can only push collections later, never pull invisible backlog forward.
 * Future recurring billings (not yet invoiced) use `BASE_DSO_DAYS + slip` as
 * their billing-to-cash lag. Capex and financing events land in the first
 * week of the month they're keyed to.
 */
export async function getWeeklyCashForecast(scenarioId: string, weeksCount = 13): Promise<WeeklyForecastRow[]> {
  const [scenario] = await db.select().from(forecastScenarios).where(eq(forecastScenarios.id, scenarioId));
  if (!scenario) return [];

  const currentCash = await getCurrentCash(scenario.startingCash);
  const monthlyFixedOpex =
    scenario.monthlyRnd + scenario.monthlyGna + scenario.monthlySalesMarketing + scenario.monthlyCloudData + scenario.monthlyInsurance + scenario.monthlyTravelOps;
  const weeklyPayroll = scenario.monthlyPayroll / AVG_WEEKS_PER_MONTH;
  const weeklyOpex = monthlyFixedOpex / AVG_WEEKS_PER_MONTH;

  const robotsPlan: Record<string, number> = JSON.parse(scenario.robotsPlannedPerMonthJson || "{}");
  const financingPlan: Record<string, number> = JSON.parse(scenario.financingInflowJson || "{}");

  const allInvoices = await db.select().from(invoices);
  const activeContracts = await db.select().from(contracts).where(eq(contracts.status, "active"));

  const today = startOfWeek(new Date());
  const weeks: Date[] = Array.from({ length: weeksCount }, (_, i) => addDays(today, i * 7));

  // Project a weekly recurring billing run-rate per active contract, adjusted by the
  // scenario's utilization headwind (lower utilization -> lower usage-based revenue).
  const utilizationFactor = 1 + scenario.utilizationAdjustmentPct / 100;
  const weeklyRecurringBilling = activeContracts.reduce((sum, c) => {
    const monthly = straightLineMonthlyRevenue(c.totalContractValue, c.startDate, c.endDate);
    return sum + (monthly / AVG_WEEKS_PER_MONTH) * utilizationFactor;
  }, 0);

  const rows: WeeklyForecastRow[] = [];
  let opening = currentCash;

  for (const weekStart of weeks) {
    const weekEnd = addDays(weekStart, 7);
    const monthKey = monthKeyOf(weekStart);
    const isFirstWeekOfMonth = weekStart.getDate() <= 7;

    // Collections: existing unpaid invoices, anchored at max(today, dueDate) + scenario slip —
    // never anchored to invoiceDate, so a longer slip can only push cash later, never
    // resurface backlog that an optimistic assumption would already consider collected.
    let collections = 0;
    for (const inv of allInvoices) {
      const outstanding = outstandingBalance(inv.amount, inv.amountPaid);
      if (outstanding <= 0) continue;
      const anchor = new Date(Math.max(new Date(inv.dueDate).getTime(), today.getTime()));
      const expectedCollection = addDays(anchor, scenario.collectionsDelayDays);
      if (expectedCollection >= weekStart && expectedCollection < weekEnd) collections += outstanding;
    }
    // ...plus a run-rate projection of future recurring billings not yet invoiced, lagged by
    // standard terms plus the scenario's incremental slip.
    const billingWeek = addDays(weekStart, -(BASE_DSO_DAYS + scenario.collectionsDelayDays));
    if (billingWeek >= today) collections += weeklyRecurringBilling;

    const capex = isFirstWeekOfMonth ? (robotsPlan[monthKey] ?? 0) * scenario.robotUnitCost : 0;
    const financingInflows = isFirstWeekOfMonth ? financingPlan[monthKey] ?? 0 : 0;

    const closing = closingCash({
      openingCash: opening,
      collections,
      deposits: 0,
      financingInflows,
      grantIncome: 0,
      payroll: weeklyPayroll,
      capex,
      opex: weeklyOpex,
      debtLeasePayments: 0,
    });

    rows.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      openingCash: opening,
      collections,
      deposits: 0,
      financingInflows,
      payroll: weeklyPayroll,
      capex,
      opex: weeklyOpex,
      closingCash: closing,
    });
    opening = closing;
  }

  return rows;
}

export async function getMonthlyOperatingModel(scenarioId: string, monthsCount = 24): Promise<MonthlyForecastRow[]> {
  const [scenario] = await db.select().from(forecastScenarios).where(eq(forecastScenarios.id, scenarioId));
  if (!scenario) return [];

  const currentCash = await getCurrentCash(scenario.startingCash);
  const monthlyFixedOpex =
    scenario.monthlyRnd + scenario.monthlyGna + scenario.monthlySalesMarketing + scenario.monthlyCloudData + scenario.monthlyInsurance + scenario.monthlyTravelOps;
  const robotsPlan: Record<string, number> = JSON.parse(scenario.robotsPlannedPerMonthJson || "{}");
  const financingPlan: Record<string, number> = JSON.parse(scenario.financingInflowJson || "{}");
  const activeContracts = await db.select().from(contracts).where(eq(contracts.status, "active"));
  const utilizationFactor = 1 + scenario.utilizationAdjustmentPct / 100;

  const monthlyRecurringBilling = activeContracts.reduce((sum, c) => {
    return sum + straightLineMonthlyRevenue(c.totalContractValue, c.startDate, c.endDate) * utilizationFactor;
  }, 0);

  const now = new Date();
  const rows: MonthlyForecastRow[] = [];
  let opening = currentCash;

  for (let i = 0; i < monthsCount; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthKey = monthKeyOf(monthDate);
    const capex = (robotsPlan[monthKey] ?? 0) * scenario.robotUnitCost;
    const financingInflows = financingPlan[monthKey] ?? 0;
    // Collections lag billing by the DSO assumption, approximated in whole months.
    const collections = i === 0 ? monthlyRecurringBilling * 0.5 : monthlyRecurringBilling;

    const closing = closingCash({
      openingCash: opening,
      collections,
      deposits: 0,
      financingInflows,
      grantIncome: 0,
      payroll: scenario.monthlyPayroll,
      capex,
      opex: monthlyFixedOpex,
      debtLeasePayments: 0,
    });

    rows.push({ month: monthKey, openingCash: opening, collections, payroll: scenario.monthlyPayroll, opex: monthlyFixedOpex, capex, financingInflows, closingCash: closing });
    opening = closing;
  }

  return rows;
}

/** "If we deploy N more robots, what capital is required and when do they pay back?" */
export function robotWaveCapexImpact(robotCount: number, robotUnitCost: number, avgMonthlyContributionMarginPerRobot: number) {
  const capitalRequired = robotCount * robotUnitCost;
  const combinedMonthlyMargin = robotCount * avgMonthlyContributionMarginPerRobot;
  const paybackMonths = combinedMonthlyMargin > 0 ? capitalRequired / combinedMonthlyMargin : null;
  return { capitalRequired, combinedMonthlyMargin, paybackMonths };
}
