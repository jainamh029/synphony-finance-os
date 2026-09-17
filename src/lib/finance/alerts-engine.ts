/**
 * Alert rule evaluators. Pure functions over rollup data so the trigger logic
 * is unit-testable independent of the database.
 */
import type { DeploymentRollup, RobotRollup, ArAgingRow } from "./aggregate";
import { fmtCurrency, fmtPct } from "./calculations";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface AlertCandidate {
  alertType: string;
  severity: AlertSeverity;
  module: string;
  customerId?: string;
  deploymentId?: string;
  robotId?: string;
  /**
   * Extra uniqueness for alert types where deploymentId+robotId alone aren't enough to tell
   * two candidates apart (e.g. one overdue-invoice alert per invoice, not per deployment —
   * an invoice alert has no deploymentId/robotId at all). When set, the sync's dedup key uses
   * this instead of deploymentId/robotId; omit it when alertType+deploymentId+robotId is
   * already unique on its own.
   */
  dedupKey?: string;
  title: string;
  description: string;
  recommendedAction: string;
  estimatedImpact?: number;
}

const MAINTENANCE_OVERDUE_DAYS = 0; // next_maintenance_date in the past
const PILOT_DAYS_BEFORE_END = 30;

export function evaluateDeploymentAlerts(d: DeploymentRollup): AlertCandidate[] {
  const out: AlertCandidate[] = [];

  if (d.recognizedRevenueToDate > 0 && d.contributionMarginActual < 0) {
    out.push({
      alertType: "negative_contribution_margin",
      severity: "critical",
      module: "deployment_pnl",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: deployment is currently loss-making`,
      description: `Contribution margin is ${fmtCurrency(d.contributionMarginActual)} (${fmtPct(d.contributionMarginPctActual)}) against ${fmtCurrency(d.recognizedRevenueToDate)} recognized revenue.`,
      recommendedAction: "Review pricing, technician hours, travel, and maintenance spend; reassess utilization.",
      estimatedImpact: Math.abs(d.contributionMarginActual),
    });
  } else if (d.recognizedRevenueToDate > 0 && (d.contributionMarginPctActual ?? 100) < 20) {
    out.push({
      alertType: "low_contribution_margin",
      severity: "medium",
      module: "deployment_pnl",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: contribution margin below 20% target`,
      description: `Contribution margin is ${(d.contributionMarginPctActual ?? 0).toFixed(1)}%, below the 20% target threshold.`,
      recommendedAction: "Review cost structure and confirm pricing supports target margins before scaling.",
    });
  }

  if (d.costVariancePct !== null && d.costVariancePct > 10) {
    out.push({
      alertType: "cost_overrun",
      severity: d.costVariancePct > 25 ? "high" : "medium",
      module: "deployment_pnl",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: actual direct cost ${d.costVariancePct.toFixed(0)}% above plan`,
      description: `Planned direct cost was ${fmtCurrency(d.plannedDirectCost)}; actual is ${fmtCurrency(d.actualDirectCost)}.`,
      recommendedAction: "Investigate cost driver (labor, travel, maintenance) and update forecast.",
      estimatedImpact: d.actualDirectCost - d.plannedDirectCost,
    });
  }

  if (d.uptimeActualPct !== null && d.uptimeActualPct < d.expectedUptimePct) {
    out.push({
      alertType: "fleet_reliability_risk",
      severity: d.uptimeActualPct < d.expectedUptimePct - 15 ? "high" : "medium",
      module: "fleet",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: fleet reliability risk`,
      description: `Uptime is ${d.uptimeActualPct.toFixed(1)}% vs ${d.expectedUptimePct.toFixed(0)}% target.`,
      recommendedAction: "Assign an operations/engineering owner and estimate the margin impact of continued downtime.",
    });
  }

  if (d.utilizationActualPct !== null && d.utilizationActualPct < d.expectedUtilizationPct) {
    out.push({
      alertType: "idle_capital",
      severity: d.utilizationActualPct < d.expectedUtilizationPct - 20 ? "high" : "medium",
      module: "fleet",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: idle capital deployed`,
      description: `Fleet utilization is ${d.utilizationActualPct.toFixed(1)}% vs ${d.expectedUtilizationPct.toFixed(0)}% target.`,
      recommendedAction: "Reassign fleet, fix scheduling workflow, or consolidate deployment footprint.",
    });
  }

  if (d.costPerPoundActual !== null && d.manualLaborCostPerLb !== null && d.costPerPoundActual > d.manualLaborCostPerLb) {
    out.push({
      alertType: "customer_roi_at_risk",
      severity: "high",
      module: "pricing",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: cost per pound above manual-labor benchmark`,
      description: `Cost per pound is $${d.costPerPoundActual.toFixed(2)} vs a $${d.manualLaborCostPerLb.toFixed(2)} manual-labor benchmark — the customer's core value proposition is at risk.`,
      recommendedAction: "Improve performance, modify pricing, or pause expansion until unit economics recover.",
    });
  }

  const plannedEnd = new Date(d.plannedEndDate).getTime();
  const daysToEnd = (plannedEnd - Date.now()) / (1000 * 60 * 60 * 24);
  if (d.status === "active" && daysToEnd > 0 && daysToEnd <= PILOT_DAYS_BEFORE_END) {
    out.push({
      alertType: "pilot_conversion_risk",
      severity: "medium",
      module: "contracts",
      customerId: d.customerId,
      deploymentId: d.deploymentId,
      title: `${d.customerName}: deployment ends in ${Math.ceil(daysToEnd)} days`,
      description: "No renewal/expansion contract has been confirmed before the current term ends.",
      recommendedAction: "Schedule a renewal decision and commercial review with the customer owner.",
    });
  }

  return out;
}

export function evaluateRobotAlerts(r: RobotRollup): AlertCandidate[] {
  const out: AlertCandidate[] = [];

  if (r.nextMaintenanceDate && new Date(r.nextMaintenanceDate).getTime() < Date.now() - MAINTENANCE_OVERDUE_DAYS) {
    out.push({
      alertType: "maintenance_overdue",
      severity: "high",
      module: "fleet",
      robotId: r.robotId,
      title: `Robot ${r.robotCode}: scheduled maintenance overdue`,
      description: `Next maintenance was due ${r.nextMaintenanceDate}.`,
      recommendedAction: "Schedule maintenance immediately; consider rotating the robot out of active deployment.",
    });
  }

  if (r.fleet.repairCost > 3000 || r.interventionHoursTotal > 40) {
    out.push({
      alertType: "high_repair_intervention",
      severity: "medium",
      module: "fleet",
      robotId: r.robotId,
      title: `Robot ${r.robotCode}: high repair cost / intervention time`,
      description: `Repair cost to date: ${fmtCurrency(r.fleet.repairCost)}. Technician intervention hours: ${r.interventionHoursTotal.toFixed(0)}.`,
      recommendedAction: "Investigate root cause of repeated failures; evaluate replacement vs. continued repair.",
    });
  }

  return out;
}

export function evaluateArAlerts(rows: ArAgingRow[]): AlertCandidate[] {
  return rows
    .filter((row) => row.bucket !== "current")
    .map((row) => ({
      alertType: "collections_overdue",
      severity: (row.bucket === "90+" ? "critical" : row.bucket === "61-90" ? "high" : "medium") as AlertSeverity,
      module: "billing",
      deploymentId: undefined,
      dedupKey: row.invoiceId,
      title: `${row.customerName}: invoice ${row.invoiceNumber} overdue (${row.bucket} days)`,
      description: `${fmtCurrency(row.outstanding)} outstanding on invoice ${row.invoiceNumber}, due ${row.dueDate}.`,
      recommendedAction: "Send invoice follow-up and escalate to the contract owner.",
      estimatedImpact: row.outstanding,
    }));
}

export function evaluateCapacityAlert(committedRobots: number, availableFleet: number): AlertCandidate | null {
  if (committedRobots > availableFleet) {
    return {
      alertType: "capacity_constraint",
      severity: "high",
      module: "fleet",
      title: "Contracted demand exceeds fleet availability",
      description: `${committedRobots} robots committed across active contracts vs ${availableFleet} available in fleet.`,
      recommendedAction: "Finance the next fleet purchase/lease decision or delay new deployments.",
    };
  }
  return null;
}

export function evaluateRunwayAlert(runwayMonthsValue: number | null): AlertCandidate | null {
  if (runwayMonthsValue === null) return null;
  if (runwayMonthsValue < 3) {
    return {
      alertType: "capital_risk_critical",
      severity: "critical",
      module: "cash",
      title: `Runway below 3 months (${runwayMonthsValue.toFixed(1)} mo)`,
      description: "Cash runway has fallen below the critical 3-month threshold.",
      recommendedAction: "Freeze all discretionary spend immediately and finalize financing or emergency collections.",
    };
  }
  if (runwayMonthsValue < 6) {
    return {
      alertType: "capital_risk_warning",
      severity: "high",
      module: "cash",
      title: `Runway below 6 months (${runwayMonthsValue.toFixed(1)} mo)`,
      description: "Cash runway has fallen below 6 months.",
      recommendedAction: "Freeze discretionary hiring/capex, accelerate collections, and prepare financing options.",
    };
  }
  if (runwayMonthsValue < 9) {
    return {
      alertType: "capital_risk_watch",
      severity: "medium",
      module: "cash",
      title: `Runway below 9 months (${runwayMonthsValue.toFixed(1)} mo)`,
      description: "Cash runway has fallen below 9 months.",
      recommendedAction: "Begin financing conversations and review discretionary spend commitments.",
    };
  }
  return null;
}
