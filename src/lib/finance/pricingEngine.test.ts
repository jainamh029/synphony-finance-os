import { describe, it, expect } from "vitest";
import { calculatePricingByMethod, type PricingMethodInputs } from "./pricingEngine";

describe("Gap E: pricing-method-specific revenue calculation", () => {
  it("fixed price: revenue equals the flat seasonal price", () => {
    const result = calculatePricingByMethod({ method: "fixed_seasonal", fixedPrice: 220_000 });
    expect(result.revenue).toBe(220_000);
  });

  it("per pound: revenue = expected output x price per pound", () => {
    const result = calculatePricingByMethod({ method: "per_pound", pricePerUnit: 0.19, expectedUnits: 2_200_000 });
    expect(result.revenue).toBeCloseTo(2_200_000 * 0.19, 5);
    expect(result.minimumFloorApplied).toBe(false);
  });

  it("per robot-hour: revenue = billable hours x price per hour", () => {
    const result = calculatePricingByMethod({ method: "per_robot_hour", pricePerUnit: 42, expectedUnits: 3500 });
    expect(result.revenue).toBe(42 * 3500);
  });

  it("per acre/bed: revenue = acres serviced x price per acre", () => {
    const result = calculatePricingByMethod({ method: "per_acre", pricePerUnit: 800, expectedUnits: 140 });
    expect(result.revenue).toBe(800 * 140);
  });

  it("monthly RaaS: revenue = monthly subscription x billable months + mobilization", () => {
    const result = calculatePricingByMethod({
      method: "raas_subscription", monthlySubscriptionAmount: 32_500, billableMonths: 7, mobilizationFee: 20_000,
    });
    expect(result.revenue).toBe(32_500 * 7 + 20_000);
  });

  it("software subscription: revenue = monthly fee x months + implementation fee", () => {
    const result = calculatePricingByMethod({
      method: "software_subscription", monthlySubscriptionAmount: 1_500, billableMonths: 12, implementationFee: 3_000,
    });
    expect(result.revenue).toBe(1_500 * 12 + 3_000);
  });

  it("minimum commitment and overage logic: usage below minimum is floored to the minimum", () => {
    const result = calculatePricingByMethod({ method: "per_pound", pricePerUnit: 0.1, expectedUnits: 100_000, minimumCommitment: 50_000 });
    // raw usage value = 0.10 * 100,000 = 10,000, below the 50,000 floor
    expect(result.rawUsageValue).toBe(10_000);
    expect(result.revenue).toBe(50_000);
    expect(result.minimumFloorApplied).toBe(true);
  });

  it("minimum commitment and overage logic: usage above minimum uses the usage value, not the floor", () => {
    const result = calculatePricingByMethod({ method: "per_pound", pricePerUnit: 0.19, expectedUnits: 2_200_000, minimumCommitment: 300_000 });
    expect(result.revenue).toBeCloseTo(2_200_000 * 0.19, 5); // 418,000 > 300,000 minimum
    expect(result.minimumFloorApplied).toBe(false);
  });

  describe("hybrid — does not double count deposit/mobilization/minimum/usage", () => {
    it("hybrid with minimum + usage overage (no recurring monthly fee)", () => {
      const result = calculatePricingByMethod({
        method: "hybrid", mobilizationFee: 15_000, minimumCommitment: 60_000, pricePerUnit: 0.18, expectedUnits: 500_000,
      });
      // raw usage value = 0.18 * 500,000 = 90,000; overage = 90,000 - 60,000 = 30,000
      expect(result.revenue).toBe(15_000 + 60_000 + 30_000);
    });

    it("hybrid with a recurring monthly fee instead of a flat minimum", () => {
      const result = calculatePricingByMethod({
        method: "hybrid", mobilizationFee: 10_000, monthlySubscriptionAmount: 8_000, billableMonths: 6, pricePerUnit: 0.1, expectedUnits: 200_000,
      });
      // recurring = 48,000 substitutes for a flat minimum; overage measured against minimumCommitment (0 here) = full usage value 20,000
      expect(result.revenue).toBe(10_000 + 48_000 + 20_000);
    });

    it("hybrid with no usage component at all is just mobilization + minimum", () => {
      const result = calculatePricingByMethod({ method: "hybrid", mobilizationFee: 5_000, minimumCommitment: 40_000 });
      expect(result.revenue).toBe(45_000);
    });
  });

  it("price changes recalculate revenue proportionally", () => {
    const base = calculatePricingByMethod({ method: "per_pound", pricePerUnit: 0.19, expectedUnits: 1_000_000 });
    const higherPrice = calculatePricingByMethod({ method: "per_pound", pricePerUnit: 0.19 * 1.2, expectedUnits: 1_000_000 });
    expect(higherPrice.revenue).toBeCloseTo(base.revenue * 1.2, 5);
  });

  it("zero inputs never produce NaN or negative revenue", () => {
    const methods: PricingMethodInputs["method"][] = ["fixed_seasonal", "per_pound", "per_robot_hour", "per_acre", "raas_subscription", "software_subscription", "hybrid"];
    for (const method of methods) {
      const result = calculatePricingByMethod({ method });
      expect(result.revenue).toBe(0);
      expect(Number.isNaN(result.revenue)).toBe(false);
    }
  });
});
