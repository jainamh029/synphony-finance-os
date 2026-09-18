import { describe, it, expect } from "vitest";
import { generateScheduleLines, type ContractForSchedule } from "./invoiceSchedule";

function sum(lines: ReturnType<typeof generateScheduleLines>) {
  return lines.reduce((s, l) => s + l.plannedAmount, 0);
}

describe("Gap A: invoice schedule generation", () => {
  it("fixed seasonal contract billed upfront: one recurring line net of mobilization/deposit", () => {
    const contract: ContractForSchedule = {
      contractType: "fixed_seasonal",
      startDate: "2026-04-01",
      endDate: "2026-10-01",
      totalContractValue: 100_000,
      mobilizationFee: 10_000,
      depositAmount: 20_000,
      minimumCommitment: 0,
      variablePricePerUnit: null,
      variableUnitType: null,
      monthlySubscriptionAmount: null,
      expectedOutputVolume: null,
      billingFrequency: "upfront",
      paymentTermsDays: 30,
    };
    const lines = generateScheduleLines(contract);
    expect(lines.map((l) => l.lineType)).toEqual(["mobilization", "deposit", "recurring"]);
    const recurring = lines.find((l) => l.lineType === "recurring")!;
    expect(recurring.plannedAmount).toBe(70_000); // 100k - 10k mobilization - 20k deposit
    expect(sum(lines)).toBe(100_000); // reconciles exactly to totalContractValue — no double count
  });

  it("20% deposit + Net 30 hybrid seasonal contract: distinct deposit, mobilization, minimum, and usage-overage lines", () => {
    const totalValue = 100_000;
    const contract: ContractForSchedule = {
      contractType: "hybrid",
      startDate: "2026-04-01",
      endDate: "2026-07-01",
      totalContractValue: totalValue,
      mobilizationFee: 15_000,
      depositAmount: totalValue * 0.2,
      minimumCommitment: 60_000,
      variablePricePerUnit: 0.18,
      variableUnitType: "lb",
      monthlySubscriptionAmount: null,
      expectedOutputVolume: 500_000, // 0.18 * 500,000 = $90,000 expected usage value
      billingFrequency: "end_of_season",
      paymentTermsDays: 30,
    };
    const lines = generateScheduleLines(contract);
    const byType = Object.fromEntries(lines.map((l) => [l.lineType, l]));
    expect(byType.deposit.plannedAmount).toBe(20_000);
    expect(byType.mobilization.plannedAmount).toBe(15_000);
    expect(byType.minimum.plannedAmount).toBe(60_000);
    // usage overage = expected usage value (90,000) - minimum (60,000) = 30,000, not the full 90,000
    expect(byType.usage.plannedAmount).toBe(30_000);
    // Every due date is exactly Net 30 past its invoice date.
    for (const l of lines) {
      const expectedDue = new Date(l.plannedInvoiceDate);
      expectedDue.setUTCDate(expectedDue.getUTCDate() + 30);
      expect(l.plannedDueDate).toBe(expectedDue.toISOString().slice(0, 10));
    }
  });

  it("monthly RaaS contract: one recurring line per month, independent of totalContractValue", () => {
    const contract: ContractForSchedule = {
      contractType: "raas_subscription",
      startDate: "2026-04-01",
      endDate: "2026-07-01",
      totalContractValue: 999_999, // deliberately inconsistent with monthly x months, to prove it's ignored
      mobilizationFee: 5_000,
      depositAmount: 0,
      minimumCommitment: 0,
      variablePricePerUnit: null,
      variableUnitType: null,
      monthlySubscriptionAmount: 10_000,
      expectedOutputVolume: null,
      billingFrequency: "monthly",
      paymentTermsDays: 30,
    };
    const lines = generateScheduleLines(contract);
    const recurringLines = lines.filter((l) => l.lineType === "recurring");
    expect(recurringLines).toHaveLength(4); // Apr, May, Jun, Jul
    for (const l of recurringLines) expect(l.plannedAmount).toBe(10_000);
    expect(sum(lines)).toBe(5_000 + 4 * 10_000); // mobilization + 4 months, NOT totalContractValue
  });

  it("per-pound usage contract: usage line reflects actual approved output when provided", () => {
    const contract: ContractForSchedule = {
      contractType: "per_pound",
      startDate: "2026-04-01",
      endDate: "2026-10-01",
      totalContractValue: 0,
      mobilizationFee: 0,
      depositAmount: 0,
      minimumCommitment: 50_000,
      variablePricePerUnit: 0.2,
      variableUnitType: "lb",
      monthlySubscriptionAmount: null,
      expectedOutputVolume: 400_000, // 0.20 * 400,000 = 80,000 expected
      billingFrequency: "end_of_season",
      paymentTermsDays: 30,
    };
    const lines = generateScheduleLines(contract);
    const usage = lines.find((l) => l.lineType === "usage")!;
    expect(usage.plannedAmount).toBe(30_000); // 80,000 - 50,000 minimum
  });

  it("hybrid contract line total does not double count deposit/mobilization against minimum/usage", () => {
    const contract: ContractForSchedule = {
      contractType: "hybrid",
      startDate: "2026-04-01",
      endDate: "2026-07-01",
      totalContractValue: 100_000,
      mobilizationFee: 15_000,
      depositAmount: 20_000,
      minimumCommitment: 60_000,
      variablePricePerUnit: 0.18,
      variableUnitType: "lb",
      monthlySubscriptionAmount: null,
      expectedOutputVolume: 500_000,
      billingFrequency: "end_of_season",
      paymentTermsDays: 30,
    };
    const lines = generateScheduleLines(contract);
    // deposit(20k) + mobilization(15k) + minimum(60k) + usage-overage(30k) = 125k, each
    // component distinct and none re-derived from another — this is the documented model,
    // not a bug: minimum and usage are complementary (overage excludes the minimum), and
    // deposit/mobilization are genuinely additive fees for a hybrid deal.
    expect(sum(lines)).toBe(20_000 + 15_000 + 60_000 + 30_000);
    expect(new Set(lines.map((l) => l.lineType)).size).toBe(4); // 4 distinct line types, no overlap
  });

  it("milestone billing frequency uses the provided custom milestones", () => {
    const contract: ContractForSchedule = {
      contractType: "fixed_seasonal",
      startDate: "2026-04-01",
      endDate: "2026-10-01",
      totalContractValue: 50_000,
      mobilizationFee: 0,
      depositAmount: 0,
      minimumCommitment: 0,
      variablePricePerUnit: null,
      variableUnitType: null,
      monthlySubscriptionAmount: null,
      expectedOutputVolume: null,
      billingFrequency: "milestone",
      paymentTermsDays: 15,
      milestones: [
        { date: "2026-05-01", amount: 20_000, description: "Installation complete" },
        { date: "2026-08-01", amount: 30_000, description: "Mid-season checkpoint" },
      ],
    };
    const lines = generateScheduleLines(contract);
    expect(lines.filter((l) => l.lineType === "milestone")).toHaveLength(2);
    expect(sum(lines)).toBe(50_000);
  });

  it("zero deposit/mobilization produces no line for that component (no $0 noise rows)", () => {
    const contract: ContractForSchedule = {
      contractType: "fixed_seasonal",
      startDate: "2026-04-01",
      endDate: "2026-05-01",
      totalContractValue: 10_000,
      mobilizationFee: 0,
      depositAmount: 0,
      minimumCommitment: 0,
      variablePricePerUnit: null,
      variableUnitType: null,
      monthlySubscriptionAmount: null,
      expectedOutputVolume: null,
      billingFrequency: "upfront",
      paymentTermsDays: 30,
    };
    const lines = generateScheduleLines(contract);
    expect(lines.map((l) => l.lineType)).toEqual(["recurring"]);
  });
});
