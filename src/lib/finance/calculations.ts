/**
 * Synphony Deployment Finance OS — core calculation service.
 *
 * All financial and operational formulas live here (not in UI components) so
 * they are unit-testable and reused consistently across dashboards, reports,
 * and exports. Every ratio guards against divide-by-zero and returns `null`
 * ("N/A" in the UI) rather than Infinity/NaN.
 */

export function safeDiv(numerator: number, denominator: number): number | null {
  if (!denominator || Number.isNaN(denominator) || Number.isNaN(numerator)) return null;
  return numerator / denominator;
}

export function pct(numerator: number, denominator: number): number | null {
  const r = safeDiv(numerator, denominator);
  return r === null ? null : r * 100;
}

// ---------------------------------------------------------------------------
// Fleet economics (Module D)
// ---------------------------------------------------------------------------

export interface FleetMetricTotals {
  availableHours: number;
  activeHours: number;
  productiveHours: number;
  downtimeHours: number;
  interventionHours: number;
  outputUnits: number;
  poundsHarvested: number;
  repairCost: number;
  sparePartsCost: number;
  technicianLaborCost: number;
  maintenanceIncidents: number;
}

export function emptyFleetTotals(): FleetMetricTotals {
  return {
    availableHours: 0,
    activeHours: 0,
    productiveHours: 0,
    downtimeHours: 0,
    interventionHours: 0,
    outputUnits: 0,
    poundsHarvested: 0,
    repairCost: 0,
    sparePartsCost: 0,
    technicianLaborCost: 0,
    maintenanceIncidents: 0,
  };
}

/** Fleet Utilization = Productive Hours / Available Hours */
export function fleetUtilization(t: Pick<FleetMetricTotals, "productiveHours" | "availableHours">): number | null {
  return pct(t.productiveHours, t.availableHours);
}

/** Uptime = (Available Hours - Downtime Hours) / Available Hours */
export function uptime(t: Pick<FleetMetricTotals, "availableHours" | "downtimeHours">): number | null {
  return pct(t.availableHours - t.downtimeHours, t.availableHours);
}

/** Revenue per Robot-Hour = Deployment Revenue / Productive Robot Hours */
export function revenuePerRobotHour(revenue: number, productiveHours: number): number | null {
  return safeDiv(revenue, productiveHours);
}

/** Cost per Robot-Hour = Robot-Allocated Direct Costs / Productive Robot Hours */
export function costPerRobotHour(directCosts: number, productiveHours: number): number | null {
  return safeDiv(directCosts, productiveHours);
}

/** Cost per Pound Harvested = Direct Deployment Cost / Pounds Harvested */
export function costPerPound(directCosts: number, poundsHarvested: number): number | null {
  return safeDiv(directCosts, poundsHarvested);
}

/** Contribution Margin per Robot = Revenue Attributable to Robot - Direct Cost Attributable to Robot */
export function contributionMarginPerRobot(revenue: number, directCosts: number): number {
  return revenue - directCosts;
}

/** Robot Payback Period (months) = Up-front Investment / Monthly Contribution Margin */
export function paybackPeriodMonths(upfrontInvestment: number, monthlyContributionMargin: number): number | null {
  if (monthlyContributionMargin <= 0) return null;
  return upfrontInvestment / monthlyContributionMargin;
}

// ---------------------------------------------------------------------------
// Deployment P&L (Module C)
// ---------------------------------------------------------------------------

export interface DeploymentFinancials {
  recognizedRevenue: number;
  cashCollected: number;
  contractedRevenue: number;
  directCosts: {
    fieldLabor: number;
    maintenance: number;
    spareParts: number;
    repairs: number;
    travel: number;
    lodging: number;
    cloudCompute: number;
    dataCosts: number;
    insurance: number;
    robotDepreciation: number;
    other: number;
  };
}

export function totalDirectCosts(d: DeploymentFinancials["directCosts"]): number {
  return Object.values(d).reduce((a, b) => a + b, 0);
}

/** Gross Profit = Recognized Revenue - Direct COGS (here treated equal to direct costs) */
export function grossProfit(recognizedRevenue: number, directCogs: number): number {
  return recognizedRevenue - directCogs;
}

/** Contribution Margin = Recognized Revenue - All direct variable deployment costs */
export function contributionMargin(recognizedRevenue: number, directCosts: number): number {
  return recognizedRevenue - directCosts;
}

/** Contribution Margin % = Contribution Margin / Recognized Revenue */
export function contributionMarginPct(cm: number, recognizedRevenue: number): number | null {
  return pct(cm, recognizedRevenue);
}

/** Expected Payback Period (months) = Up-front Deployment Investment / Monthly Contribution Margin */
export function expectedPaybackPeriod(upfrontInvestment: number, monthlyContributionMargin: number): number | null {
  return paybackPeriodMonths(upfrontInvestment, monthlyContributionMargin);
}

/** Straight-line revenue recognition for a recurring contract over its term. */
export function straightLineMonthlyRevenue(totalContractValue: number, startDate: string, endDate: string): number {
  const months = monthsBetween(startDate, endDate);
  return safeDiv(totalContractValue, months) ?? 0;
}

export function monthsBetween(startDate: string, endDate: string): number {
  // Date-only strings ("YYYY-MM-DD") parse as UTC midnight; read back with the
  // UTC getters so this is stable regardless of the server's local timezone.
  const s = new Date(startDate);
  const e = new Date(endDate);
  const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
  return Math.max(1, months);
}

// ---------------------------------------------------------------------------
// Accounts receivable & collections (Module B)
// ---------------------------------------------------------------------------

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export function agingBucket(dueDate: string, asOf: Date = new Date()): AgingBucket {
  const due = new Date(dueDate);
  const daysOverdue = Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export function outstandingBalance(amount: number, amountPaid: number): number {
  return Math.max(0, amount - amountPaid);
}

/** Weighted Pipeline = Opportunity Value x Win Probability */
export function weightedPipeline(value: number, winProbabilityPct: number): number {
  return value * (winProbabilityPct / 100);
}

// ---------------------------------------------------------------------------
// Cash & runway (Module F)
// ---------------------------------------------------------------------------

/** Monthly Net Burn = Cash Operating Outflows - Operating Cash Inflows */
export function monthlyNetBurn(outflows: number, inflows: number): number {
  return outflows - inflows;
}

/** Runway (months) = Current Cash / Average Forward Monthly Net Burn. Null (cash-flow positive) if burn <= 0. */
export function runwayMonths(currentCash: number, avgMonthlyNetBurn: number): number | null {
  if (avgMonthlyNetBurn <= 0) return null;
  return currentCash / avgMonthlyNetBurn;
}

export interface CashPeriodInputs {
  openingCash: number;
  collections: number;
  deposits: number;
  financingInflows: number;
  grantIncome: number;
  payroll: number;
  capex: number;
  opex: number;
  debtLeasePayments: number;
}

/** Closing Cash = Opening + Collections + Deposits + Financing + Grants - Payroll - Capex - Opex - Debt */
export function closingCash(p: CashPeriodInputs): number {
  return (
    p.openingCash +
    p.collections +
    p.deposits +
    p.financingInflows +
    p.grantIncome -
    p.payroll -
    p.capex -
    p.opex -
    p.debtLeasePayments
  );
}

// ---------------------------------------------------------------------------
// Pricing & Customer ROI Lab (Module E)
// ---------------------------------------------------------------------------

export interface RoiInputs {
  customerLaborCostPerHour: number;
  laborHoursReplacedPerSeason: number;
  laborBurdenPct: number; // benefits/burden loaded on top of wage
  expectedYieldQualityBenefit: number; // $ value of incremental yield/quality
  numberOfRobots: number;
  expectedOutputPerProductiveHour: number; // units/hr
  expectedProductiveHoursPerRobot: number; // per season
  expectedUptimePct: number;
  expectedUtilizationPct: number;
  contractPrice: number; // total contract value proposed
  synphonyDirectCosts: number; // total deployment direct cost estimate
  depositAmount: number;
  customerUpfrontCost: number; // e.g. mobilization/deposit borne by customer
  deploymentMonths: number;
}

export interface RoiOutputs {
  avoidedLaborCost: number;
  customerGrossBenefit: number;
  synphonyFeesToCustomer: number;
  customerNetSavings: number;
  customerRoiPct: number | null;
  customerMonthlyNetBenefit: number;
  customerPaybackMonths: number | null;
  synphonyRevenue: number;
  synphonyContributionMargin: number;
  synphonyContributionMarginPct: number | null;
  synphonyPaybackMonths: number | null;
  breakEvenPricePerPound: number | null;
  breakEvenPricePerRobotHour: number | null;
  totalExpectedOutputUnits: number;
  totalProductiveHours: number;
}

export function calculateRoi(inputs: RoiInputs): RoiOutputs {
  const avoidedLaborCost = inputs.customerLaborCostPerHour * (1 + inputs.laborBurdenPct / 100) * inputs.laborHoursReplacedPerSeason;
  const customerGrossBenefit = avoidedLaborCost + inputs.expectedYieldQualityBenefit;
  const synphonyFeesToCustomer = inputs.contractPrice;
  const customerNetSavings = customerGrossBenefit - synphonyFeesToCustomer;
  const customerRoiPct = pct(customerNetSavings, synphonyFeesToCustomer);
  const customerMonthlyNetBenefit = safeDiv(customerNetSavings, inputs.deploymentMonths) ?? 0;
  const customerPaybackMonths = paybackPeriodMonths(inputs.customerUpfrontCost, customerMonthlyNetBenefit);

  const synphonyRevenue = inputs.contractPrice;
  const synphonyContributionMargin = synphonyRevenue - inputs.synphonyDirectCosts;
  const synphonyContributionMarginPct = pct(synphonyContributionMargin, synphonyRevenue);
  const monthlyCm = safeDiv(synphonyContributionMargin, inputs.deploymentMonths) ?? 0;
  const synphonyPaybackMonths = paybackPeriodMonths(inputs.depositAmount > 0 ? inputs.synphonyDirectCosts - inputs.depositAmount : inputs.synphonyDirectCosts, monthlyCm);

  // Three-tier chain mirroring the Fleet Economics model: seasonal available hours are
  // first reduced by downtime (uptime%), then by non-harvesting active time (utilization%).
  // Both levers must multiply into productive hours — an uptime input that never touched
  // any output would be a dead control on the form.
  const totalAvailableHours = inputs.numberOfRobots * inputs.expectedProductiveHoursPerRobot;
  const totalActiveHours = totalAvailableHours * (inputs.expectedUptimePct / 100);
  const totalProductiveHours = totalActiveHours * (inputs.expectedUtilizationPct / 100);
  const totalExpectedOutputUnits = totalProductiveHours * inputs.expectedOutputPerProductiveHour;

  const breakEvenPricePerPound = safeDiv(inputs.synphonyDirectCosts, totalExpectedOutputUnits);
  const breakEvenPricePerRobotHour = safeDiv(inputs.synphonyDirectCosts, totalProductiveHours);

  return {
    avoidedLaborCost,
    customerGrossBenefit,
    synphonyFeesToCustomer,
    customerNetSavings,
    customerRoiPct,
    customerMonthlyNetBenefit,
    customerPaybackMonths,
    synphonyRevenue,
    synphonyContributionMargin,
    synphonyContributionMarginPct,
    synphonyPaybackMonths,
    breakEvenPricePerPound,
    breakEvenPricePerRobotHour,
    totalExpectedOutputUnits,
    totalProductiveHours,
  };
}

export type RoiSensitivityLever = "uptime" | "utilization" | "output" | "laborCost" | "price" | "technicianHours" | "maintenanceCost";

export function roiSensitivity(base: RoiInputs, lever: RoiSensitivityLever, deltaPct: number): RoiOutputs {
  const adjusted: RoiInputs = { ...base };
  const factor = 1 + deltaPct / 100;
  switch (lever) {
    case "uptime":
      adjusted.expectedUptimePct = base.expectedUptimePct * factor;
      break;
    case "utilization":
      adjusted.expectedUtilizationPct = base.expectedUtilizationPct * factor;
      break;
    case "output":
      adjusted.expectedOutputPerProductiveHour = base.expectedOutputPerProductiveHour * factor;
      break;
    case "laborCost":
      adjusted.customerLaborCostPerHour = base.customerLaborCostPerHour * factor;
      break;
    case "price":
      adjusted.contractPrice = base.contractPrice * factor;
      break;
    case "technicianHours":
    case "maintenanceCost":
      adjusted.synphonyDirectCosts = base.synphonyDirectCosts * factor;
      break;
  }
  return calculateRoi(adjusted);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function fmtCurrency(v: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  const decimals = opts.decimals ?? 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  return `${v.toFixed(decimals)}%`;
}

export function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtMonths(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  return `${v.toFixed(1)} mo`;
}
