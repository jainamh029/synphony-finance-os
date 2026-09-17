import { db } from "@/db/client";
import { alerts as alertsTable } from "@/db/schema";
import { getDeploymentRollups, getRobotRollups, getArAging } from "./aggregate";
import { evaluateDeploymentAlerts, evaluateRobotAlerts, evaluateArAlerts, evaluateCapacityAlert, evaluateRunwayAlert, type AlertCandidate } from "./alerts-engine";
import { getCompanyCashSnapshot } from "./runway";

const OPEN_STATUSES = ["open", "acknowledged", "in_progress"];

function keyOf(a: { alertType: string; deploymentId?: string | null; robotId?: string | null }) {
  return `${a.alertType}::${a.deploymentId ?? ""}::${a.robotId ?? ""}`;
}

/**
 * Recomputes every alert rule against current data and inserts any newly-triggered
 * condition that isn't already tracked by an open alert. Existing open/acknowledged/
 * in-progress alerts are left untouched (so owner assignment and comments survive);
 * resolved/dismissed alerts are only re-created if the underlying condition recurs.
 */
export async function syncAlerts(): Promise<{ created: number; totalOpen: number }> {
  const [deploymentRollups, robotRollups, arRows, cash] = await Promise.all([
    getDeploymentRollups(),
    getRobotRollups(),
    getArAging(),
    getCompanyCashSnapshot(),
  ]);

  const candidates: AlertCandidate[] = [];
  for (const d of deploymentRollups) candidates.push(...evaluateDeploymentAlerts(d));
  for (const r of robotRollups) candidates.push(...evaluateRobotAlerts(r));
  candidates.push(...evaluateArAlerts(arRows));

  const committedRobots = deploymentRollups.reduce((sum, d) => sum + d.robotsPlanned, 0);
  const totalFleet = robotRollups.length;
  const capacityAlert = evaluateCapacityAlert(committedRobots, totalFleet);
  if (capacityAlert) candidates.push(capacityAlert);

  const runwayAlert = evaluateRunwayAlert(cash.runwayMonths);
  if (runwayAlert) candidates.push(runwayAlert);

  const existing = await db.select().from(alertsTable);
  const existingOpenKeys = new Set(existing.filter((a) => OPEN_STATUSES.includes(a.status)).map(keyOf));

  let created = 0;
  for (const c of candidates) {
    if (existingOpenKeys.has(keyOf(c))) continue;
    await db.insert(alertsTable).values({
      id: crypto.randomUUID(),
      alertType: c.alertType,
      severity: c.severity,
      module: c.module,
      customerId: c.customerId ?? null,
      deploymentId: c.deploymentId ?? null,
      robotId: c.robotId ?? null,
      title: c.title,
      description: c.description,
      recommendedAction: c.recommendedAction,
      estimatedImpact: c.estimatedImpact ?? null,
      owner: null,
      status: "open",
    });
    created++;
  }

  const totalOpen = existing.filter((a) => OPEN_STATUSES.includes(a.status)).length + created;
  return { created, totalOpen };
}
