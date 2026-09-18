/**
 * Pure alert deduplication — extracted from src/lib/finance/alerts-sync.ts so "distinct
 * conditions get distinct alerts, the same unresolved condition doesn't get re-created on
 * every sync, and a resolved alert only reopens if its condition recurs" is unit-testable
 * without a database.
 */

export const OPEN_STATUSES = ["open", "acknowledged", "in_progress"] as const;

export interface AlertKeyable {
  alertType: string;
  deploymentId?: string | null;
  robotId?: string | null;
  dedupKey?: string | null;
}

/**
 * When a candidate supplies `dedupKey` (e.g. an invoice id, for alert types that recur
 * per-record rather than per-deployment/per-robot), that's the sole uniqueness driver —
 * deploymentId/robotId are irrelevant for that alert type. Without one, alertType +
 * deploymentId + robotId is assumed to already be unique (true for deployment- and
 * robot-scoped alerts, where at most one instance of a given alertType applies at a time).
 */
export function alertKeyOf(a: AlertKeyable): string {
  if (a.dedupKey) return `${a.alertType}::dedup:${a.dedupKey}`;
  return `${a.alertType}::${a.deploymentId ?? ""}::${a.robotId ?? ""}`;
}

export interface ExistingAlertRow extends AlertKeyable {
  status: string;
}

/**
 * Given freshly-evaluated candidates and the alerts already in the database, returns only
 * the candidates that should actually be inserted: those whose key doesn't match any
 * currently-open (open/acknowledged/in_progress) alert. A candidate whose only matching
 * alert is resolved/dismissed IS returned — that's the "reopens if the condition recurs"
 * rule — and a repeat sync with nothing changed returns an empty array.
 */
export function selectNewAlertCandidates<T extends AlertKeyable>(candidates: T[], existing: ExistingAlertRow[]): T[] {
  const existingOpenKeys = new Set(
    existing.filter((a) => (OPEN_STATUSES as readonly string[]).includes(a.status)).map(alertKeyOf)
  );
  const seenThisRun = new Set<string>();
  const toInsert: T[] = [];
  for (const c of candidates) {
    const key = alertKeyOf(c);
    if (existingOpenKeys.has(key) || seenThisRun.has(key)) continue;
    seenThisRun.add(key);
    toInsert.push(c);
  }
  return toInsert;
}
