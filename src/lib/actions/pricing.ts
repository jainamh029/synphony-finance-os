"use server";

import { db } from "@/db/client";
import { pricingScenarios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { RoiInputs, RoiOutputs } from "@/lib/finance/calculations";
import type { PricingMethodInputs } from "@/lib/finance/pricingEngine";
import { requireWriteAccess } from "@/lib/auth/session";
import { createContract } from "@/lib/actions/contracts";

const SALES_ROLES = ["admin", "sales", "finance"] as const;

const VARIABLE_UNIT_TYPE_BY_METHOD: Partial<Record<PricingMethodInputs["method"], string>> = {
  per_pound: "lb",
  per_robot_hour: "robot_hour",
  per_acre: "acre",
};

export async function savePricingScenario(input: {
  name: string;
  customerId: string | null;
  scenarioCase: "conservative" | "base" | "aggressive";
  inputs: RoiInputs;
  pricingMethodInputs: PricingMethodInputs;
  outputs: RoiOutputs;
}) {
  await requireWriteAccess([...SALES_ROLES]);
  await db.insert(pricingScenarios).values({
    id: crypto.randomUUID(),
    name: input.name,
    customerId: input.customerId,
    scenarioCase: input.scenarioCase,
    // pricingMethodInputs rides along inside inputsJson rather than a new column — it's a
    // superset extension of the same "assumptions" blob, and older saved scenarios (without
    // it) still parse fine since every reader treats it as optional.
    inputsJson: JSON.stringify({ ...input.inputs, pricingMethodInputs: input.pricingMethodInputs }),
    outputsJson: JSON.stringify(input.outputs),
  });
  revalidatePath("/pricing-lab");
}

/**
 * Turns a saved pricing scenario into a real draft contract, carrying over the pricing
 * method's own fields (not just the flat computed total) so the contract's billing schedule
 * generates correctly. Lands as a draft — sales/finance still review dates, billing
 * frequency, and payment terms before signing.
 */
export async function convertPricingScenarioToContract(scenarioId: string) {
  await requireWriteAccess([...SALES_ROLES]);
  const [scenario] = await db.select().from(pricingScenarios).where(eq(pricingScenarios.id, scenarioId));
  if (!scenario) throw new Error("Pricing scenario not found.");
  if (!scenario.customerId) throw new Error("Assign a customer to this scenario before converting it to a contract.");

  const inputs = JSON.parse(scenario.inputsJson) as RoiInputs & { pricingMethodInputs?: PricingMethodInputs };
  const outputs = JSON.parse(scenario.outputsJson) as RoiOutputs;
  const pmi = inputs.pricingMethodInputs;

  // For raas_subscription/software_subscription/hybrid-with-monthly-fee, the pricing engine's
  // revenue total is monthlySubscriptionAmount x billableMonths — a specific *count* of
  // months, not a duration in days. invoiceSchedule.ts's generator independently counts
  // inclusive calendar months between startDate/endDate, and naive "+N*30 days" arithmetic
  // drifts to a different month count than N (e.g. 7*30=210 days from Sep 18 lands in April,
  // an 8-calendar-month span), silently generating a schedule that no longer matches what was
  // priced. Building endDate as the last day of the (months-1)th month after startDate's
  // month guarantees the generator counts exactly `months` months.
  const months = pmi?.billableMonths ?? inputs.deploymentMonths ?? 6;
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, 0)).toISOString().slice(0, 10);

  const formData = new FormData();
  formData.set("customerId", scenario.customerId);
  formData.set("contractType", pmi?.method ?? "fixed_seasonal");
  formData.set("startDate", startDate);
  formData.set("endDate", endDate);
  formData.set("totalContractValue", String(outputs.synphonyRevenue));
  formData.set("mobilizationFee", String(pmi?.mobilizationFee ?? pmi?.implementationFee ?? 0));
  formData.set("depositAmount", String(inputs.depositAmount ?? 0));
  formData.set("minimumCommitment", String(pmi?.minimumCommitment ?? 0));
  if (pmi?.pricePerUnit !== undefined) formData.set("variablePricePerUnit", String(pmi.pricePerUnit));
  if (pmi?.method && VARIABLE_UNIT_TYPE_BY_METHOD[pmi.method]) formData.set("variableUnitType", VARIABLE_UNIT_TYPE_BY_METHOD[pmi.method]!);
  if (pmi?.monthlySubscriptionAmount !== undefined) formData.set("monthlySubscriptionAmount", String(pmi.monthlySubscriptionAmount));
  if (pmi?.expectedUnits !== undefined) formData.set("expectedOutputVolume", String(pmi.expectedUnits));
  formData.set("robotsCommitted", String(inputs.numberOfRobots ?? 0));
  formData.set("billingFrequency", "monthly");
  formData.set("paymentTerms", "net_30");
  formData.set("customerFundedHardware", "0");
  formData.set("status", "draft");
  formData.set("notes", `Converted from pricing scenario "${scenario.name}".`);

  await createContract(formData);
}
