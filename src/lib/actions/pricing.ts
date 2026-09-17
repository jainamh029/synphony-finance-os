"use server";

import { db } from "@/db/client";
import { pricingScenarios } from "@/db/schema";
import { revalidatePath } from "next/cache";
import type { RoiInputs, RoiOutputs } from "@/lib/finance/calculations";
import { requireWriteAccess } from "@/lib/auth/session";

const SALES_ROLES = ["admin", "sales", "finance"] as const;

export async function savePricingScenario(input: {
  name: string;
  customerId: string | null;
  scenarioCase: "conservative" | "base" | "aggressive";
  inputs: RoiInputs;
  outputs: RoiOutputs;
}) {
  await requireWriteAccess([...SALES_ROLES]);
  await db.insert(pricingScenarios).values({
    id: crypto.randomUUID(),
    name: input.name,
    customerId: input.customerId,
    scenarioCase: input.scenarioCase,
    inputsJson: JSON.stringify(input.inputs),
    outputsJson: JSON.stringify(input.outputs),
  });
  revalidatePath("/pricing-lab");
}
