import { describe, it, expect } from "vitest";
import { validateRobotAssignment } from "./robotAssignment";

describe("regression: robot double-booking prevention (bug #1)", () => {
  it("rejects assigning a robot that is currently operating on another deployment", () => {
    const result = validateRobotAssignment({ robotCode: "SYN-R001", status: "operating" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/SYN-R001/);
    expect(result.error).toMatch(/operating/);
  });

  it("rejects assigning a robot with status 'assigned'", () => {
    const result = validateRobotAssignment({ robotCode: "SYN-R002", status: "assigned" });
    expect(result.ok).toBe(false);
  });
});

describe("regression: repair/maintenance robot assignment prevention (bug #2)", () => {
  it("rejects a robot in repair status", () => {
    const result = validateRobotAssignment({ robotCode: "SYN-R013", status: "repair" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/repair/);
  });

  it("rejects a robot in maintenance status", () => {
    const result = validateRobotAssignment({ robotCode: "SYN-R011", status: "maintenance" });
    expect(result.ok).toBe(false);
  });

  it("rejects a retired robot", () => {
    const result = validateRobotAssignment({ robotCode: "SYN-R099", status: "retired" });
    expect(result.ok).toBe(false);
  });

  it("rejects when the robot doesn't exist", () => {
    const result = validateRobotAssignment(null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

describe("robot assignment: allowed cases", () => {
  it("allows a robot with status 'available'", () => {
    expect(validateRobotAssignment({ robotCode: "SYN-R015", status: "available" }).ok).toBe(true);
  });

  it("allows a robot with status 'idle'", () => {
    expect(validateRobotAssignment({ robotCode: "SYN-R015", status: "idle" }).ok).toBe(true);
  });
});
