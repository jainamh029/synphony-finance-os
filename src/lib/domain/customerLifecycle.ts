/**
 * Customer lifecycle automation (Gap B) — pure rules only. No database, no Next.js request
 * context, so this is safely importable from unit tests. The DB-touching wrapper
 * (fetch records, apply the computed stage, write history) lives in
 * `customerLifecycleSync.ts`, which imports from here.
 *
 * No `opportunities` table exists in this schema, so "Qualified" (at least one qualified
 * opportunity) and the initial "Lead" default are intentionally left manual-only — automatic
 * computation starts at Pilot, where a concrete contract record exists to key off.
 */

export type LifecycleStage =
  | "lead" | "qualified" | "pilot" | "contracted" | "deploying" | "active" | "renewal" | "paused" | "churned" | "archived";

const RENEWAL_WINDOW_DAYS = 30;

const ACTIVE_CONTRACT_STATUSES = new Set(["active", "renewed"]);
const LIVE_DEPLOYMENT_STATUSES = new Set(["active", "at_risk"]);
const DEPLOYING_STATUSES = new Set(["approved", "deploying"]);

export interface LifecycleContractSummary {
  contractType: string;
  status: string;
  endDate: string; // YYYY-MM-DD
}

export interface LifecycleDeploymentSummary {
  status: string;
}

export interface LifecycleComputationInput {
  contracts: LifecycleContractSummary[];
  deployments: LifecycleDeploymentSummary[];
  today?: Date; // injectable for tests; defaults to now
}

/**
 * Precedence (highest wins): Active/Renewal > Deploying > Pilot > Contracted > Paused.
 *
 * The spec's own definitions of "Contracted" ("signed non-pilot contract, no live
 * deployment yet") and "Active" ("...or an active revenue-generating contract exists") are
 * in tension as written — a signed contract alone would satisfy both simultaneously, making
 * "Contracted" unreachable if "any active contract" were enough to jump straight to Active.
 * Resolved here by keying "Active" strictly off deployment status (matching the explicit
 * Contracted -> Deploying -> Active progression the stage list itself implies): only a
 * deployment that's genuinely live (active/at_risk) counts as Active. A signed contract with
 * no deployment that's progressed past planning is Contracted, not Active.
 *
 * Returns null when no automatic rule matches — callers should leave the stage as whatever
 * it already is (this function never invents a downgrade to Lead/Qualified, and never sets
 * Churned/Archived, which require an explicit action).
 */
export function computeLifecycleStage(input: LifecycleComputationInput): LifecycleStage | null {
  const today = input.today ?? new Date();
  const activeContracts = input.contracts.filter((c) => ACTIVE_CONTRACT_STATUSES.has(c.status));

  const hasLiveDeployment = input.deployments.some((d) => LIVE_DEPLOYMENT_STATUSES.has(d.status));
  const hasDeployingDeployment = input.deployments.some((d) => DEPLOYING_STATUSES.has(d.status));
  const nonPilotActiveContracts = activeContracts.filter((c) => c.contractType !== "pilot");
  const hasPilot = activeContracts.some((c) => c.contractType === "pilot");

  if (hasLiveDeployment) {
    // ...unless the contract funding that live deployment is also nearing expiry with
    // nothing later-dated already signed to replace it.
    const soonestEndingActive = nonPilotActiveContracts
      .map((c) => ({ c, daysLeft: daysUntil(c.endDate, today) }))
      .filter((x) => x.daysLeft >= 0 && x.daysLeft <= RENEWAL_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)[0];

    if (soonestEndingActive) {
      const hasLaterReplacement = nonPilotActiveContracts.some(
        (c) => c !== soonestEndingActive.c && daysUntil(c.endDate, today) > soonestEndingActive.daysLeft
      );
      if (!hasLaterReplacement) return "renewal";
    }
    return "active";
  }

  if (hasDeployingDeployment) return "deploying";
  if (hasPilot) return "pilot";
  if (nonPilotActiveContracts.length > 0) return "contracted";

  // No active contract of any kind: if every deployment that exists is paused, reflect that;
  // otherwise there's nothing automatic to conclude (leave the stage — e.g. Lead — alone).
  if (input.deployments.length > 0 && input.deployments.every((d) => d.status === "paused")) {
    return "paused";
  }

  return null;
}

function daysUntil(dateStr: string, today: Date): number {
  const target = new Date(dateStr).getTime();
  return Math.floor((target - today.getTime()) / 86400000);
}

/**
 * Render-time contradiction checks — not stored, just surfaced as a warning banner. A
 * contradiction doesn't block anything; it flags that the customer's stage (very possibly
 * manually overridden) doesn't match what their records would imply.
 */
export function detectLifecycleContradiction(customer: { lifecycleStage: string }, contracts: LifecycleContractSummary[]): string | null {
  const hasActiveContract = contracts.some((c) => ACTIVE_CONTRACT_STATUSES.has(c.status));
  if (customer.lifecycleStage === "churned" && hasActiveContract) {
    return "This customer is marked Churned but has an active contract on file.";
  }
  if (customer.lifecycleStage === "lead" && hasActiveContract) {
    return "This customer is marked Lead but has a signed active contract on file.";
  }
  return null;
}
