/**
 * Contract-driven invoice schedule generation (Gap A) — pure. Produces a set of schedule
 * *lines* (not issued invoices) from a contract's commercial terms, with no double-counting
 * across deposit / mobilization / recurring-or-minimum / usage components.
 *
 * Non-double-counting design (documented here since it's a real modeling choice, not an
 * obvious given — see FINANCIAL_LOGIC.md for the full writeup):
 *  - fixed_seasonal / pilot: `totalContractValue` is treated as INCLUSIVE of mobilization fee
 *    and deposit. The remaining balance (total - mobilization - deposit) is what actually
 *    gets billed as the recurring/upfront line(s).
 *  - raas_subscription / software_subscription: the recurring line is `monthlySubscriptionAmount
 *    x months`, independent of `totalContractValue` (which for these types is informational,
 *    not itself billed) — mobilization/deposit are separate add-on lines on top.
 *  - per_pound / per_robot_hour / per_acre / hybrid: minimum-commitment and usage/overage are
 *    complementary by construction (overage = expected usage value minus the minimum, floored
 *    at 0), so they never overlap; mobilization/deposit are separate lines on top.
 */

export type ContractType =
  | "pilot" | "fixed_seasonal" | "per_robot_hour" | "per_pound" | "per_acre" | "raas_subscription" | "software_subscription" | "hybrid";
export type BillingFrequency = "upfront" | "monthly" | "quarterly" | "milestone" | "end_of_season" | "usage_based";
export type ScheduleLineType = "deposit" | "mobilization" | "recurring" | "minimum" | "usage" | "milestone" | "other";

export interface ContractForSchedule {
  contractType: ContractType;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  totalContractValue: number;
  mobilizationFee: number;
  depositAmount: number;
  minimumCommitment: number;
  variablePricePerUnit: number | null;
  variableUnitType: string | null;
  monthlySubscriptionAmount: number | null;
  expectedOutputVolume: number | null;
  billingFrequency: BillingFrequency;
  paymentTermsDays: number;
  /** Optional custom milestone dates/amounts, used when billingFrequency === "milestone". */
  milestones?: { date: string; amount: number; description: string }[];
}

export interface ScheduleLineDraft {
  lineType: ScheduleLineType;
  description: string;
  plannedAmount: number;
  plannedInvoiceDate: string;
  plannedDueDate: string;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dueDateFor(invoiceDate: string, paymentTermsDays: number): string {
  return addDays(invoiceDate, paymentTermsDays);
}

/** Inclusive month-start enumeration between two dates, e.g. 2026-04-01..2026-07-01 -> 4 entries. */
function monthStarts(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const out: string[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= endMonth) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return out.length > 0 ? out : [startDate];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function generateScheduleLines(contract: ContractForSchedule): ScheduleLineDraft[] {
  const lines: ScheduleLineDraft[] = [];
  const terms = contract.paymentTermsDays;

  const addLine = (lineType: ScheduleLineType, description: string, amount: number, invoiceDate: string) => {
    if (amount <= 0) return;
    lines.push({ lineType, description, plannedAmount: round2(amount), plannedInvoiceDate: invoiceDate, plannedDueDate: dueDateFor(invoiceDate, terms) });
  };

  addLine("mobilization", "Mobilization / implementation fee", contract.mobilizationFee, contract.startDate);
  addLine("deposit", "Deposit", contract.depositAmount, contract.startDate);

  if (contract.contractType === "pilot" || contract.contractType === "fixed_seasonal") {
    const remaining = Math.max(0, contract.totalContractValue - contract.mobilizationFee - contract.depositAmount);
    if (contract.billingFrequency === "monthly") {
      const months = monthStarts(contract.startDate, contract.endDate);
      const perMonth = remaining / months.length;
      months.forEach((m, i) => addLine("recurring", `Seasonal fee — month ${i + 1} of ${months.length}`, perMonth, m));
    } else if (contract.billingFrequency === "quarterly") {
      const months = monthStarts(contract.startDate, contract.endDate);
      const quarters = Math.max(1, Math.ceil(months.length / 3));
      const perQuarter = remaining / quarters;
      for (let q = 0; q < quarters; q++) addLine("recurring", `Seasonal fee — quarter ${q + 1} of ${quarters}`, perQuarter, months[q * 3] ?? contract.startDate);
    } else if (contract.billingFrequency === "end_of_season") {
      addLine("recurring", "Seasonal fee — end of season", remaining, contract.endDate);
    } else if (contract.billingFrequency === "milestone" && contract.milestones?.length) {
      for (const m of contract.milestones) addLine("milestone", m.description, m.amount, m.date);
    } else {
      addLine("recurring", "Seasonal fee — upfront", remaining, contract.startDate);
    }
  }

  if (contract.contractType === "raas_subscription" || contract.contractType === "software_subscription") {
    const monthly = contract.monthlySubscriptionAmount ?? 0;
    const months = monthStarts(contract.startDate, contract.endDate);
    months.forEach((m, i) => addLine("recurring", `Monthly subscription — month ${i + 1} of ${months.length}`, monthly, m));
  }

  if (["per_robot_hour", "per_pound", "per_acre", "hybrid"].includes(contract.contractType)) {
    if (contract.contractType === "hybrid" && (contract.monthlySubscriptionAmount ?? 0) > 0) {
      const monthly = contract.monthlySubscriptionAmount ?? 0;
      const months = monthStarts(contract.startDate, contract.endDate);
      months.forEach((m, i) => addLine("recurring", `Monthly fee — month ${i + 1} of ${months.length}`, monthly, m));
    } else if (contract.minimumCommitment > 0) {
      addLine("minimum", "Minimum seasonal commitment", contract.minimumCommitment, contract.endDate);
    }

    const price = contract.variablePricePerUnit ?? 0;
    const volume = contract.expectedOutputVolume ?? 0;
    if (price > 0 && volume > 0) {
      const expectedUsageValue = price * volume;
      const overage = Math.max(0, expectedUsageValue - contract.minimumCommitment);
      const unit = contract.variableUnitType === "lb" ? "pound" : contract.variableUnitType === "robot_hour" ? "robot-hour" : "acre/bed";
      addLine(
        "usage",
        `Estimated usage overage (${volume.toLocaleString()} ${unit}s @ $${price}) — recalculate from actual approved output at billing time`,
        overage,
        contract.endDate
      );
    }
  }

  return lines.sort((a, b) => (a.plannedInvoiceDate < b.plannedInvoiceDate ? -1 : 1));
}
