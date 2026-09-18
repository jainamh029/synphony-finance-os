/**
 * Pricing-method-aware revenue engine (Gap E) — pure. Computes a contract's revenue
 * differently depending on the selected pricing model, instead of treating every model as
 * one flat "contract price" input. Feeds into the existing, already-tested `calculateRoi()`
 * as its `contractPrice`, so margin/ROI/payback math downstream is unchanged.
 *
 * Mirrors invoiceSchedule.ts's non-double-counting model for hybrid: mobilization is
 * additive, and minimum-commitment / usage-overage are complementary (overage excludes the
 * minimum, never both counted in full). Deposit is deliberately NOT added into "revenue"
 * here — it's a cash-timing concept (an early collection against revenue already counted
 * elsewhere), not incremental revenue of its own; it still flows into the ROI calculator's
 * `depositAmount` input separately for up-front cash requirement purposes.
 */

export type PricingMethod =
  | "fixed_seasonal" | "per_pound" | "per_robot_hour" | "per_acre" | "raas_subscription" | "software_subscription" | "hybrid";

export interface PricingMethodInputs {
  method: PricingMethod;
  fixedPrice?: number; // fixed_seasonal
  pricePerUnit?: number; // per_pound / per_robot_hour / per_acre
  expectedUnits?: number; // pounds / robot-hours / acres-beds
  minimumCommitment?: number; // floor for usage-based & hybrid
  monthlySubscriptionAmount?: number; // raas / software / hybrid recurring
  billableMonths?: number;
  mobilizationFee?: number;
  implementationFee?: number; // software_subscription's one-time setup fee
}

export interface PricingBreakdownLine {
  label: string;
  amount: number;
}

export interface PricingMethodResult {
  revenue: number;
  breakdownLines: PricingBreakdownLine[];
  /** Present for usage-based/hybrid methods: the raw usage value before any minimum floor/overage logic. */
  rawUsageValue?: number;
  minimumFloorApplied?: boolean;
}

function line(label: string, amount: number): PricingBreakdownLine[] {
  return amount > 0 ? [{ label, amount }] : [];
}

export function calculatePricingByMethod(inputs: PricingMethodInputs): PricingMethodResult {
  const mobilization = inputs.mobilizationFee ?? 0;

  switch (inputs.method) {
    case "fixed_seasonal": {
      const price = inputs.fixedPrice ?? 0;
      return { revenue: price, breakdownLines: line("Fixed seasonal price", price) };
    }

    case "per_pound":
    case "per_robot_hour":
    case "per_acre": {
      const unitLabel = inputs.method === "per_pound" ? "pound" : inputs.method === "per_robot_hour" ? "robot-hour" : "acre/bed";
      const rawUsageValue = (inputs.pricePerUnit ?? 0) * (inputs.expectedUnits ?? 0);
      const minimum = inputs.minimumCommitment ?? 0;
      const revenue = Math.max(rawUsageValue, minimum);
      const minimumFloorApplied = minimum > rawUsageValue;
      return {
        revenue,
        rawUsageValue,
        minimumFloorApplied,
        breakdownLines: minimumFloorApplied
          ? [{ label: `Minimum seasonal commitment (usage-based estimate of $${rawUsageValue.toFixed(0)} across ${(inputs.expectedUnits ?? 0).toLocaleString()} ${unitLabel}s was below the floor)`, amount: minimum }]
          : line(`Usage-based revenue (${(inputs.expectedUnits ?? 0).toLocaleString()} ${unitLabel}s @ $${inputs.pricePerUnit ?? 0})`, rawUsageValue),
      };
    }

    case "raas_subscription": {
      const recurring = (inputs.monthlySubscriptionAmount ?? 0) * (inputs.billableMonths ?? 0);
      return {
        revenue: recurring + mobilization,
        breakdownLines: [...line("Mobilization / implementation fee", mobilization), ...line(`Monthly RaaS subscription x ${inputs.billableMonths ?? 0} months`, recurring)],
      };
    }

    case "software_subscription": {
      const recurring = (inputs.monthlySubscriptionAmount ?? 0) * (inputs.billableMonths ?? 0);
      const implementation = inputs.implementationFee ?? 0;
      return {
        revenue: recurring + implementation,
        breakdownLines: [...line("Implementation fee", implementation), ...line(`Monthly platform fee x ${inputs.billableMonths ?? 0} months`, recurring)],
      };
    }

    case "hybrid": {
      const rawUsageValue = (inputs.pricePerUnit ?? 0) * (inputs.expectedUnits ?? 0);
      const minimum = inputs.minimumCommitment ?? 0;
      const recurring = (inputs.monthlySubscriptionAmount ?? 0) * (inputs.billableMonths ?? 0);
      // If a recurring monthly fee is present, it substitutes for a flat minimum (matches
      // invoiceSchedule.ts's hybrid branch: recurring OR minimum, never both).
      const baseComponent = recurring > 0 ? recurring : minimum;
      const overage = Math.max(0, rawUsageValue - minimum);
      const revenue = mobilization + baseComponent + overage;
      return {
        revenue,
        rawUsageValue,
        breakdownLines: [
          ...line("Mobilization fee", mobilization),
          ...line(recurring > 0 ? `Monthly fee x ${inputs.billableMonths ?? 0} months` : "Minimum seasonal commitment", baseComponent),
          ...line("Usage overage (beyond minimum)", overage),
        ],
      };
    }
  }
}
