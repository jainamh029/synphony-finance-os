import { db } from "@/db/client";
import { customers, contracts, robots, alerts, costs, invoices } from "@/db/schema";
import { getDeploymentRollups, getRobotRollups, getArAging, type DeploymentRollup } from "./aggregate";
import { getCompanyCashSnapshot, type CashSnapshot } from "./runway";
import { contributionMarginPct } from "./calculations";

export type DeploymentHealth = "green" | "yellow" | "red";

export function deploymentHealth(d: DeploymentRollup): DeploymentHealth {
  if (d.recognizedRevenueToDate <= 0) return "green"; // not yet started — nothing to flag
  if (d.contributionMarginActual < 0) return "red";
  if ((d.contributionMarginPctActual ?? 100) < 20) return "yellow";
  if (d.uptimeActualPct !== null && d.uptimeActualPct < d.expectedUptimePct - 10) return "yellow";
  if (d.costVariancePct !== null && d.costVariancePct > 10) return "yellow";
  return "green";
}

export interface ExecutiveSummary {
  cash: CashSnapshot;
  contractedBacklog: number;
  revenueRecognizedMTD: number;
  revenueRecognizedSTD: number;
  cashCollectedMTD: number;
  cashCollectedSTD: number;
  activeFarms: number;
  activeDeployments: number;
  robotsOwned: number;
  robotsDeployed: number;
  robotsActive: number;
  robotsIdle: number;
  robotsMaintenance: number;
  robotsRepair: number;
  fleetUtilizationPct: number | null;
  avgUptimePct: number | null;
  blendedContributionMarginPct: number | null;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  arOutstanding: number;
  overdueInvoiceCount: number;
  overdueAmount: number;
  next30DayObligation: number;
  next60DayObligation: number;
  next90DayObligation: number;
  topCustomersByValue: { customerName: string; contractValue: number; contributionMargin: number }[];
  deploymentRollups: DeploymentRollup[];
}

export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  const [deploymentRollups, robotRollups, arRows, cash, allContracts, allRobots] = await Promise.all([
    getDeploymentRollups(),
    getRobotRollups(),
    getArAging(),
    getCompanyCashSnapshot(),
    db.select().from(contracts),
    db.select().from(robots),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // "Season to date" approximated as calendar-year to date for this MVP (see README assumptions).
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const contractedBacklog = allContracts
    .filter((c) => c.status === "active")
    .reduce((sum, c, i) => {
      const dep = deploymentRollups.find((d) => d.contractId === c.id);
      const recognized = dep?.recognizedRevenueToDate ?? 0;
      return sum + Math.max(0, c.totalContractValue - recognized);
    }, 0);

  const allCosts = await db.select().from(costs);
  const allInvoices = await db.select().from(invoices);

  function revenueRecognizedInRange(start: Date, end: Date): number {
    let total = 0;
    for (const c of allContracts) {
      const dep = deploymentRollups.find((d) => d.contractId === c.id);
      if (!dep || !dep.recognizedRevenueToDate) continue;
      const cStart = new Date(c.startDate);
      const overlapStart = cStart > start ? cStart : start;
      const overlapEnd = end < now ? end : now;
      if (overlapStart >= overlapEnd) continue;
      const days = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000;
      total += dep.monthlyRecognizedRevenue * (days / 30.44);
    }
    return total;
  }

  function cashCollectedInRange(start: Date, end: Date): number {
    return allInvoices
      .filter((i) => i.paidDate && new Date(i.paidDate) >= start && new Date(i.paidDate) <= end)
      .reduce((sum, i) => sum + i.amountPaid, 0);
  }

  const activeCustomerIds = new Set(deploymentRollups.filter((d) => d.status !== "financial_review" && d.status !== "planned").map((d) => d.customerId));
  const activeDeployments = deploymentRollups.filter((d) => ["active", "at_risk", "deploying"].includes(d.status));

  const robotsDeployed = allRobots.filter((r) => ["operating", "assigned", "idle", "maintenance", "repair"].includes(r.status)).length;
  const robotsActive = allRobots.filter((r) => r.status === "operating").length;
  const robotsIdle = allRobots.filter((r) => r.status === "available" || r.status === "idle").length;
  const robotsMaintenance = allRobots.filter((r) => r.status === "maintenance").length;
  const robotsRepair = allRobots.filter((r) => r.status === "repair").length;

  const fleetTotals = robotRollups.reduce(
    (acc, r) => {
      acc.productive += r.fleet.productiveHours;
      acc.available += r.fleet.availableHours;
      acc.downtime += r.fleet.downtimeHours;
      return acc;
    },
    { productive: 0, available: 0, downtime: 0 }
  );
  const fleetUtilizationPct = fleetTotals.available > 0 ? (fleetTotals.productive / fleetTotals.available) * 100 : null;
  const avgUptimePct = fleetTotals.available > 0 ? ((fleetTotals.available - fleetTotals.downtime) / fleetTotals.available) * 100 : null;

  const revenueBearing = deploymentRollups.filter((d) => d.recognizedRevenueToDate > 0);
  const totalRevenue = revenueBearing.reduce((s, d) => s + d.recognizedRevenueToDate, 0);
  const totalCm = revenueBearing.reduce((s, d) => s + d.contributionMarginActual, 0);
  const blendedContributionMarginPct = contributionMarginPct(totalCm, totalRevenue);

  let redCount = 0, yellowCount = 0, greenCount = 0;
  for (const d of deploymentRollups) {
    const h = deploymentHealth(d);
    if (h === "red") redCount++;
    else if (h === "yellow") yellowCount++;
    else greenCount++;
  }

  const arOutstanding = arRows.reduce((s, r) => s + r.outstanding, 0);
  const overdueRows = arRows.filter((r) => r.bucket !== "current");
  const overdueAmount = overdueRows.reduce((s, r) => s + r.outstanding, 0);

  const dailyObligation = cash.monthlyFixedOpex / 30.44;

  const custMap = new Map((await db.select().from(customers)).map((c) => [c.id, c.farmName]));
  const topCustomersByValue = allContracts
    .filter((c) => c.status === "active")
    .map((c) => {
      const dep = deploymentRollups.find((d) => d.contractId === c.id);
      return {
        customerName: custMap.get(c.customerId) ?? "Unknown",
        contractValue: c.totalContractValue,
        contributionMargin: dep?.contributionMarginActual ?? 0,
      };
    })
    .sort((a, b) => b.contractValue - a.contractValue)
    .slice(0, 5);

  return {
    cash,
    contractedBacklog,
    revenueRecognizedMTD: revenueRecognizedInRange(monthStart, now),
    revenueRecognizedSTD: revenueRecognizedInRange(yearStart, now),
    cashCollectedMTD: cashCollectedInRange(monthStart, now),
    cashCollectedSTD: cashCollectedInRange(yearStart, now),
    activeFarms: activeCustomerIds.size,
    activeDeployments: activeDeployments.length,
    robotsOwned: allRobots.length,
    robotsDeployed,
    robotsActive,
    robotsIdle,
    robotsMaintenance,
    robotsRepair,
    fleetUtilizationPct,
    avgUptimePct,
    blendedContributionMarginPct,
    redCount,
    yellowCount,
    greenCount,
    arOutstanding,
    overdueInvoiceCount: overdueRows.length,
    overdueAmount,
    next30DayObligation: dailyObligation * 30,
    next60DayObligation: dailyObligation * 60,
    next90DayObligation: dailyObligation * 90,
    topCustomersByValue,
    deploymentRollups,
  };
}

export async function getOpenAlertCount(): Promise<number> {
  const rows = await db.select().from(alerts);
  return rows.filter((a) => ["open", "acknowledged", "in_progress"].includes(a.status)).length;
}
