import { db } from "@/db/client";
import { alerts as alertsTable } from "@/db/schema";
import { getDeploymentRollups, getRobotRollups, getArAging } from "./aggregate";
import { evaluateDeploymentAlerts, evaluateRobotAlerts, evaluateArAlerts, evaluateCapacityAlert, evaluateRunwayAlert, type AlertCandidate } from "./alerts-engine";
import { getCompanyCashSnapshot } from "./runway";
import { selectNewAlertCandidates, OPEN_STATUSES } from "@/lib/domain/alertDedup";

/**
 * Recomputes every alert rule against current data and inserts any newly-triggered
 * condition that isn't already tracked by an open alert. Existing open/acknowledged/
 * in-progress alerts are left untouched (so owner assignment and comments survive);
 * resolved/dismissed alerts are only re-created if the underlying condition recurs.
 * The actual "which candidates are new" decision lives in the pure, unit-tested
 * selectNewAlertCandidates() — this function is just the DB-touching wrapper around it.
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
  const toInsert = selectNewAlertCandidates(candidates, existing);

  for (const c of toInsert) {
    await db.insert(alertsTable).values({
      id: crypto.randomUUID(),
      alertType: c.alertType,
      severity: c.severity,
      module: c.module,
      customerId: c.customerId ?? null,
      deploymentId: c.deploymentId ?? null,
      robotId: c.robotId ?? null,
      dedupKey: c.dedupKey ?? null,
      title: c.title,
      description: c.description,
      recommendedAction: c.recommendedAction,
      estimatedImpact: c.estimatedImpact ?? null,
      owner: null,
      status: "open",
    });
  }

  const totalOpen = existing.filter((a) => (OPEN_STATUSES as readonly string[]).includes(a.status)).length + toInsert.length;
  return { created: toInsert.length, totalOpen };
}
