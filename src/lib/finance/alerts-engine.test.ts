import { describe, it, expect } from "vitest";
import { evaluateDeploymentAlerts, evaluateCapacityAlert, evaluateRunwayAlert, evaluateArAlerts } from "./alerts-engine";
import { emptyFleetTotals } from "./calculations";
import type { DeploymentRollup, ArAgingRow } from "./aggregate";

function baseDeployment(overrides: Partial<DeploymentRollup> = {}): DeploymentRollup {
  return {
    deploymentId: "dep-1",
    deploymentName: "Test Deployment",
    customerId: "cust-1",
    customerName: "Valley Crest Farms",
    contractId: "contract-1",
    status: "active",
    operationsOwner: "Jane",
    robotsPlanned: 4,
    robotsAssigned: 4,
    expectedUptimePct: 90,
    expectedUtilizationPct: 70,
    plannedStartDate: "2026-01-01",
    plannedEndDate: "2026-12-01",
    plannedDirectCost: 100000,
    plannedUpfrontCost: 40000,
    actualDirectCost: 100000,
    costVariancePct: 0,
    contractValue: 200000,
    recognizedRevenueToDate: 100000,
    monthlyRecognizedRevenue: 16666,
    cashCollected: 80000,
    invoicedAmount: 100000,
    outstandingAR: 20000,
    contributionMarginActual: 0,
    contributionMarginPctActual: 0,
    expectedPaybackMonths: 6,
    fleet: emptyFleetTotals(),
    utilizationActualPct: 70,
    uptimeActualPct: 90,
    costPerPoundActual: null,
    manualLaborCostPerLb: null,
    ...overrides,
  };
}

describe("deployment alert rules", () => {
  it("flags negative contribution margin as critical", () => {
    const d = baseDeployment({ contributionMarginActual: -5000, contributionMarginPctActual: -10 });
    const alerts = evaluateDeploymentAlerts(d);
    expect(alerts.some((a) => a.alertType === "negative_contribution_margin" && a.severity === "critical")).toBe(true);
  });

  it("does not flag margin issues when revenue is zero (pre-launch deployment)", () => {
    const d = baseDeployment({ recognizedRevenueToDate: 0, contributionMarginActual: 0 });
    const alerts = evaluateDeploymentAlerts(d);
    expect(alerts.some((a) => a.alertType.includes("contribution_margin"))).toBe(false);
  });

  it("flags cost overrun above 10%", () => {
    const d = baseDeployment({ plannedDirectCost: 100000, actualDirectCost: 115000, costVariancePct: 15 });
    const alerts = evaluateDeploymentAlerts(d);
    expect(alerts.some((a) => a.alertType === "cost_overrun")).toBe(true);
  });

  it("flags fleet reliability risk when uptime below target", () => {
    const d = baseDeployment({ uptimeActualPct: 60, expectedUptimePct: 90 });
    const alerts = evaluateDeploymentAlerts(d);
    const alert = alerts.find((a) => a.alertType === "fleet_reliability_risk");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("high"); // 30-point gap exceeds the 15-point high-severity threshold
  });

  it("flags customer ROI at risk when cost per pound exceeds manual-labor benchmark", () => {
    const d = baseDeployment({ costPerPoundActual: 3.5, manualLaborCostPerLb: 2.0 });
    const alerts = evaluateDeploymentAlerts(d);
    expect(alerts.some((a) => a.alertType === "customer_roi_at_risk")).toBe(true);
  });
});

describe("capacity and runway alerts", () => {
  it("flags capacity constraint when committed exceeds available", () => {
    expect(evaluateCapacityAlert(20, 15)).not.toBeNull();
    expect(evaluateCapacityAlert(10, 15)).toBeNull();
  });

  it("runway alert escalates severity as months shrink", () => {
    expect(evaluateRunwayAlert(12)).toBeNull();
    expect(evaluateRunwayAlert(8)?.severity).toBe("medium");
    expect(evaluateRunwayAlert(5)?.severity).toBe("high");
    expect(evaluateRunwayAlert(2)?.severity).toBe("critical");
    expect(evaluateRunwayAlert(null)).toBeNull(); // cash-flow positive
  });
});

describe("AR aging alerts", () => {
  it("only alerts on overdue buckets, severity scales with age", () => {
    const rows: ArAgingRow[] = [
      { invoiceId: "1", customerName: "A", contractId: "c1", invoiceNumber: "INV-1", dueDate: "2026-01-01", amount: 100, amountPaid: 0, outstanding: 100, bucket: "current", status: "sent" },
      { invoiceId: "2", customerName: "B", contractId: "c2", invoiceNumber: "INV-2", dueDate: "2026-01-01", amount: 100, amountPaid: 0, outstanding: 100, bucket: "90+", status: "overdue" },
    ];
    const alerts = evaluateArAlerts(rows);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
  });
});
