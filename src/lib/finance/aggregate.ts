import { db } from "@/db/client";
import {
  customers, contracts, deployments, deploymentBudgetItems, costs, laborLogs,
  robots, robotAssignments, robotMetrics, invoices,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  totalDirectCosts, contributionMargin, contributionMarginPct, expectedPaybackPeriod,
  fleetUtilization, uptime, costPerPound, revenuePerRobotHour, straightLineMonthlyRevenue,
  outstandingBalance, agingBucket, emptyFleetTotals, monthsBetween, type FleetMetricTotals,
} from "./calculations";

export interface DeploymentRollup {
  deploymentId: string;
  deploymentName: string;
  customerId: string;
  customerName: string;
  contractId: string;
  status: string;
  operationsOwner: string | null;
  robotsPlanned: number;
  robotsAssigned: number;
  expectedUptimePct: number;
  expectedUtilizationPct: number;
  plannedStartDate: string;
  plannedEndDate: string;

  plannedDirectCost: number;
  plannedUpfrontCost: number;
  actualDirectCost: number;
  costVariancePct: number | null;

  contractValue: number;
  recognizedRevenueToDate: number;
  monthlyRecognizedRevenue: number;
  cashCollected: number;
  invoicedAmount: number;
  outstandingAR: number;

  contributionMarginActual: number;
  contributionMarginPctActual: number | null;
  expectedPaybackMonths: number | null;

  fleet: FleetMetricTotals;
  utilizationActualPct: number | null;
  uptimeActualPct: number | null;
  costPerPoundActual: number | null;
  manualLaborCostPerLb: number | null;
}

/** Pull every deployment and compute its financial + operational rollup. */
export async function getDeploymentRollups(): Promise<DeploymentRollup[]> {
  const deploys = await db.select().from(deployments);
  const allCustomers = await db.select().from(customers);
  const allContracts = await db.select().from(contracts);
  const allCosts = await db.select().from(costs);
  const allBudgetItems = await db.select().from(deploymentBudgetItems);
  const allMetrics = await db.select().from(robotMetrics);
  const allInvoices = await db.select().from(invoices);
  const allAssignments = await db.select().from(robotAssignments);

  const custMap = new Map(allCustomers.map((c) => [c.id, c]));
  const contractMap = new Map(allContracts.map((c) => [c.id, c]));

  return deploys.map((dep) => {
    const customer = custMap.get(dep.customerId);
    const contract = contractMap.get(dep.contractId);

    const depCosts = allCosts.filter((c) => c.deploymentId === dep.id);
    const actualDirectCost = depCosts.reduce((sum, c) => sum + c.amount, 0);

    const budgetItems = allBudgetItems.filter((b) => b.deploymentId === dep.id);
    const plannedDirectCost = budgetItems.reduce((sum, b) => sum + b.plannedAmount, 0);
    const plannedUpfrontCost = budgetItems.filter((b) => b.isUpfront).reduce((sum, b) => sum + b.plannedAmount, 0);
    const costVariancePct = plannedDirectCost > 0 ? ((actualDirectCost - plannedDirectCost) / plannedDirectCost) * 100 : null;

    const depMetrics = allMetrics.filter((m) => m.deploymentId === dep.id);
    const fleet: FleetMetricTotals = depMetrics.reduce((acc, m) => {
      acc.availableHours += m.availableHours;
      acc.activeHours += m.activeHours;
      acc.productiveHours += m.productiveHours;
      acc.downtimeHours += m.downtimeHours;
      acc.interventionHours += m.interventionHours;
      acc.outputUnits += m.outputUnits;
      acc.poundsHarvested += m.poundsHarvested;
      acc.repairCost += m.repairCost;
      acc.sparePartsCost += m.sparePartsCost;
      acc.technicianLaborCost += m.technicianLaborCost;
      acc.maintenanceIncidents += m.maintenanceIncidents;
      return acc;
    }, emptyFleetTotals());

    const depInvoices = allInvoices.filter((i) => i.contractId === dep.contractId);
    const invoicedAmount = depInvoices.reduce((sum, i) => sum + i.amount, 0);
    const cashCollected = depInvoices.reduce((sum, i) => sum + i.amountPaid, 0);
    const outstandingAR = depInvoices.reduce((sum, i) => sum + outstandingBalance(i.amount, i.amountPaid), 0);

    const contractValue = contract?.totalContractValue ?? 0;
    const monthlyRecognizedRevenue = contract
      ? straightLineMonthlyRevenue(contractValue, contract.startDate, contract.endDate)
      : 0;
    // Recognized revenue to date: straight-line from actual deployment start (not contract
    // signing) up to today, capped at contract value. A deployment that hasn't actually
    // started yet (no actualStartDate) has recognized nothing, regardless of contract dates.
    const recognizedRevenueToDate = contract && dep.actualStartDate
      ? recognizedToDate(contract.startDate, contract.endDate, contractValue)
      : 0;

    const cm = contributionMargin(recognizedRevenueToDate, actualDirectCost);
    const cmPct = contributionMarginPct(cm, recognizedRevenueToDate);
    // Payback needs a *monthly* contribution margin, not the cumulative total-to-date —
    // annualize actual cost/revenue run rate using months elapsed since the deployment
    // actually started (never less than 1, so a same-month deployment doesn't divide by <1).
    const elapsedMonths = dep.actualStartDate ? Math.max(1, monthsBetween(dep.actualStartDate, new Date().toISOString().slice(0, 10))) : 1;
    const monthlyActualDirectCost = actualDirectCost / elapsedMonths;
    const monthlyContributionMargin = monthlyRecognizedRevenue - monthlyActualDirectCost;
    const payback = expectedPaybackPeriod(plannedUpfrontCost || plannedDirectCost, monthlyContributionMargin);

    const robotsAssigned = allAssignments.filter((a) => a.deploymentId === dep.id && !a.assignmentEnd).length;

    return {
      deploymentId: dep.id,
      deploymentName: dep.name,
      customerId: dep.customerId,
      customerName: customer?.farmName ?? "Unknown",
      contractId: dep.contractId,
      status: dep.status,
      operationsOwner: dep.operationsOwner,
      robotsPlanned: dep.robotsPlanned,
      robotsAssigned,
      expectedUptimePct: dep.expectedUptimePct ?? 90,
      expectedUtilizationPct: dep.expectedUtilizationPct ?? 70,
      plannedStartDate: dep.plannedStartDate,
      plannedEndDate: dep.plannedEndDate,

      plannedDirectCost,
      plannedUpfrontCost,
      actualDirectCost,
      costVariancePct,

      contractValue,
      recognizedRevenueToDate,
      monthlyRecognizedRevenue,
      cashCollected,
      invoicedAmount,
      outstandingAR,

      contributionMarginActual: cm,
      contributionMarginPctActual: cmPct,
      expectedPaybackMonths: payback,

      fleet,
      utilizationActualPct: fleetUtilization(fleet),
      uptimeActualPct: uptime(fleet),
      costPerPoundActual: costPerPound(actualDirectCost, fleet.poundsHarvested),
      manualLaborCostPerLb: customer?.manualLaborCostPerLb ?? null,
    };
  });
}

function recognizedToDate(startDate: string, endDate: string, totalValue: number): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return totalValue;
  const frac = (now - start) / (end - start);
  return totalValue * frac;
}

export interface RobotRollup {
  robotId: string;
  robotCode: string;
  model: string;
  status: string;
  currentDeploymentId: string | null;
  purchaseCost: number;
  monthlyLeaseCost: number;
  nextMaintenanceDate: string | null;
  fleet: FleetMetricTotals;
  utilizationPct: number | null;
  uptimePct: number | null;
  revenuePerHour: number | null;
  contributionMarginTotal: number;
  interventionHoursTotal: number;
}

/** Robot-level rollups, allocating deployment revenue/cost pro-rata by productive hours. */
export async function getRobotRollups(): Promise<RobotRollup[]> {
  const allRobots = await db.select().from(robots);
  const allMetrics = await db.select().from(robotMetrics);
  const allAssignments = await db.select().from(robotAssignments);
  const deploymentRollups = await getDeploymentRollups();
  const depMap = new Map(deploymentRollups.map((d) => [d.deploymentId, d]));

  return allRobots.map((robot) => {
    const metrics = allMetrics.filter((m) => m.robotId === robot.id);
    const fleet = metrics.reduce((acc, m) => {
      acc.availableHours += m.availableHours;
      acc.activeHours += m.activeHours;
      acc.productiveHours += m.productiveHours;
      acc.downtimeHours += m.downtimeHours;
      acc.interventionHours += m.interventionHours;
      acc.outputUnits += m.outputUnits;
      acc.poundsHarvested += m.poundsHarvested;
      acc.repairCost += m.repairCost;
      acc.sparePartsCost += m.sparePartsCost;
      acc.technicianLaborCost += m.technicianLaborCost;
      acc.maintenanceIncidents += m.maintenanceIncidents;
      return acc;
    }, emptyFleetTotals());

    const activeAssignment = allAssignments.find((a) => a.robotId === robot.id && !a.assignmentEnd);
    let revenueAllocated = 0;
    let costAllocated = fleet.repairCost + fleet.sparePartsCost + fleet.technicianLaborCost;

    if (activeAssignment) {
      const dep = depMap.get(activeAssignment.deploymentId);
      if (dep && dep.fleet.productiveHours > 0) {
        const share = fleet.productiveHours / dep.fleet.productiveHours;
        revenueAllocated = dep.recognizedRevenueToDate * share;
      }
    }

    return {
      robotId: robot.id,
      robotCode: robot.robotCode,
      model: robot.model,
      status: robot.status,
      currentDeploymentId: activeAssignment?.deploymentId ?? null,
      purchaseCost: robot.purchaseCost,
      monthlyLeaseCost: robot.monthlyLeaseCost ?? 0,
      nextMaintenanceDate: robot.nextMaintenanceDate,
      fleet,
      utilizationPct: fleetUtilization(fleet),
      uptimePct: uptime(fleet),
      revenuePerHour: revenuePerRobotHour(revenueAllocated, fleet.productiveHours),
      contributionMarginTotal: revenueAllocated - costAllocated,
      interventionHoursTotal: fleet.interventionHours,
    };
  });
}

export interface CostByCategory {
  category: string;
  planned: number;
  actual: number;
  variancePct: number | null;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  revenue: number;
  cost: number;
  contributionMargin: number;
  cashCollected: number;
}

export interface DeploymentDetail extends DeploymentRollup {
  costsByCategory: CostByCategory[];
  monthlyTrend: MonthlyPoint[];
  robots: RobotRollup[];
  invoices: (typeof invoices.$inferSelect)[];
}

/** Full drill-down for a single deployment: budget-vs-actual by category, a monthly
 *  trend, the robots currently/previously assigned, and its invoice history. */
export async function getDeploymentDetail(deploymentId: string): Promise<DeploymentDetail | null> {
  const rollups = await getDeploymentRollups();
  const rollup = rollups.find((d) => d.deploymentId === deploymentId);
  if (!rollup) return null;

  const budgetItems = await db.select().from(deploymentBudgetItems).where(eq(deploymentBudgetItems.deploymentId, deploymentId));
  const depCosts = await db.select().from(costs).where(eq(costs.deploymentId, deploymentId));
  const depInvoices = await db.select().from(invoices).where(eq(invoices.deploymentId, deploymentId));
  const assignments = await db.select().from(robotAssignments).where(eq(robotAssignments.deploymentId, deploymentId));
  const allRobotRollups = await getRobotRollups();
  const robots = allRobotRollups.filter((r) => assignments.some((a) => a.robotId === r.robotId));

  const plannedByCategory = new Map<string, number>();
  for (const b of budgetItems) plannedByCategory.set(b.category, (plannedByCategory.get(b.category) ?? 0) + b.plannedAmount);
  const actualByCategory = new Map<string, number>();
  for (const c of depCosts) actualByCategory.set(c.costType, (actualByCategory.get(c.costType) ?? 0) + c.amount);

  const allCategories = new Set([...plannedByCategory.keys(), ...actualByCategory.keys()]);
  const costsByCategory: CostByCategory[] = [...allCategories].map((category) => {
    const planned = plannedByCategory.get(category) ?? 0;
    const actual = actualByCategory.get(category) ?? 0;
    return { category, planned, actual, variancePct: planned > 0 ? ((actual - planned) / planned) * 100 : null };
  }).sort((a, b) => b.actual - a.actual);

  // Monthly trend: bucket cost ledger + invoice payments by month, and spread the
  // contract's straight-line monthly revenue across months the deployment was active.
  const monthKey = (d: string) => d.slice(0, 7);
  const months = new Set<string>();
  for (const c of depCosts) months.add(monthKey(c.date));
  for (const inv of depInvoices) if (inv.paidDate) months.add(monthKey(inv.paidDate));
  const sortedMonths = [...months].sort();

  const monthlyTrend: MonthlyPoint[] = sortedMonths.map((month) => {
    const cost = depCosts.filter((c) => monthKey(c.date) === month).reduce((s, c) => s + c.amount, 0);
    const cashCollected = depInvoices.filter((i) => i.paidDate && monthKey(i.paidDate) === month).reduce((s, i) => s + i.amountPaid, 0);
    const revenue = rollup.monthlyRecognizedRevenue;
    return { month, revenue, cost, contributionMargin: revenue - cost, cashCollected };
  });

  return { ...rollup, costsByCategory, monthlyTrend, robots, invoices: depInvoices };
}

export interface ArAgingRow {
  invoiceId: string;
  customerName: string;
  contractId: string;
  invoiceNumber: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  bucket: ReturnType<typeof agingBucket>;
  status: string;
}

export async function getArAging(): Promise<ArAgingRow[]> {
  const allInvoices = await db.select().from(invoices);
  const allContracts = await db.select().from(contracts);
  const allCustomers = await db.select().from(customers);
  const contractMap = new Map(allContracts.map((c) => [c.id, c]));
  const custMap = new Map(allCustomers.map((c) => [c.id, c]));

  return allInvoices
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .map((inv) => {
      const contract = contractMap.get(inv.contractId);
      const customer = contract ? custMap.get(contract.customerId) : undefined;
      const outstanding = outstandingBalance(inv.amount, inv.amountPaid);
      return {
        invoiceId: inv.id,
        customerName: customer?.farmName ?? "Unknown",
        contractId: inv.contractId,
        invoiceNumber: inv.invoiceNumber,
        dueDate: inv.dueDate,
        amount: inv.amount,
        amountPaid: inv.amountPaid,
        outstanding,
        bucket: agingBucket(inv.dueDate),
        status: inv.status,
      };
    })
    .filter((row) => row.outstanding > 0.01);
}
