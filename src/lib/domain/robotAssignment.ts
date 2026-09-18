/**
 * Pure robot-assignment validation — no DB, no auth, no Next.js request context.
 * Extracted from src/lib/actions/deployments.ts so the "cannot double-book, cannot
 * assign a robot that isn't available" rule is unit-testable without a live database.
 */

export type RobotAssignabilityStatus = "available" | "assigned" | "operating" | "idle" | "maintenance" | "repair" | "retired";

const ASSIGNABLE_STATUSES: RobotAssignabilityStatus[] = ["available", "idle"];

export interface AssignmentValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * A robot can only be assigned from `available` or `idle`. Any other status — including
 * `operating` (already on another deployment, which is exactly how double-booking is
 * prevented: the robot's own status is the single source of truth) — is rejected. This
 * function makes no database calls, so a caller must have already looked up the robot's
 * current status from the database (never trust a status passed in from the client).
 */
export function validateRobotAssignment(robot: { robotCode: string; status: string } | null): AssignmentValidationResult {
  if (!robot) {
    return { ok: false, error: "Robot not found." };
  }
  if (!ASSIGNABLE_STATUSES.includes(robot.status as RobotAssignabilityStatus)) {
    return {
      ok: false,
      error:
        `Cannot assign ${robot.robotCode}: it is currently "${robot.status}", not available. ` +
        `Unassign it from its current deployment first if this reassignment is intentional.`,
    };
  }
  return { ok: true };
}
