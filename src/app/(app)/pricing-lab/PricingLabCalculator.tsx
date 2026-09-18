"use client";

import { useMemo, useState } from "react";
import {
  calculateRoi, roiSensitivity, fmtCurrency, fmtPct, fmtMonths,
  type RoiInputs, type RoiSensitivityLever,
} from "@/lib/finance/calculations";
import { calculatePricingByMethod, type PricingMethod, type PricingMethodInputs } from "@/lib/finance/pricingEngine";
import { savePricingScenario } from "@/lib/actions/pricing";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, Button } from "@/components/ui/form";
import { Badge } from "@/components/ui/Badge";

const DEFAULT_INPUTS: RoiInputs = {
  customerLaborCostPerHour: 19,
  laborHoursReplacedPerSeason: 4000,
  laborBurdenPct: 25,
  expectedYieldQualityBenefit: 8000,
  numberOfRobots: 3,
  expectedOutputPerProductiveHour: 45,
  expectedProductiveHoursPerRobot: 750,
  expectedUptimePct: 90,
  expectedUtilizationPct: 70,
  contractPrice: 0, // derived from the selected pricing method below, not entered directly
  synphonyDirectCosts: 140000,
  depositAmount: 25000,
  customerUpfrontCost: 15000,
  deploymentMonths: 7,
};

const PRICING_METHODS: { value: PricingMethod; label: string }[] = [
  { value: "fixed_seasonal", label: "Fixed seasonal price" },
  { value: "per_pound", label: "Per pound harvested" },
  { value: "per_robot_hour", label: "Per robot-hour" },
  { value: "per_acre", label: "Per acre / bed" },
  { value: "raas_subscription", label: "Monthly RaaS subscription" },
  { value: "software_subscription", label: "Software subscription" },
  { value: "hybrid", label: "Hybrid (minimum + usage overage)" },
];

const DEFAULT_METHOD_INPUTS: Record<PricingMethod, PricingMethodInputs> = {
  fixed_seasonal: { method: "fixed_seasonal", fixedPrice: 220000 },
  per_pound: { method: "per_pound", pricePerUnit: 0.65, expectedUnits: 340000, minimumCommitment: 180000 },
  per_robot_hour: { method: "per_robot_hour", pricePerUnit: 95, expectedUnits: 2250, minimumCommitment: 150000 },
  per_acre: { method: "per_acre", pricePerUnit: 2800, expectedUnits: 85, minimumCommitment: 180000 },
  raas_subscription: { method: "raas_subscription", monthlySubscriptionAmount: 28000, billableMonths: 7, mobilizationFee: 15000 },
  software_subscription: { method: "software_subscription", monthlySubscriptionAmount: 4500, billableMonths: 12, implementationFee: 8000 },
  hybrid: { method: "hybrid", pricePerUnit: 0.5, expectedUnits: 300000, minimumCommitment: 120000, monthlySubscriptionAmount: 0, mobilizationFee: 10000 },
};

function unitLabel(method: PricingMethod): string {
  if (method === "per_pound") return "pound";
  if (method === "per_robot_hour") return "robot-hour";
  return "acre/bed";
}

type SensitivityMetric = "cm" | "breakeven" | "customerSavings";

// Each lever reports whichever output it actually moves: price/cost levers hit Synphony's
// contribution margin directly, but uptime/utilization/output are operational assumptions
// that only flow into break-even pricing here (contract price and direct cost are entered
// as independent top-line assumptions in this model) — showing contribution margin for
// those would just print the same flat number three times across the board.
const SENSITIVITY_LEVERS: { key: RoiSensitivityLever; label: string; metric: SensitivityMetric }[] = [
  { key: "uptime", label: "Uptime", metric: "breakeven" },
  { key: "utilization", label: "Utilization", metric: "breakeven" },
  { key: "output", label: "Output / hour", metric: "breakeven" },
  { key: "laborCost", label: "Customer labor cost", metric: "customerSavings" },
  { key: "price", label: "Contract price", metric: "cm" },
  { key: "technicianHours", label: "Technician hours (cost)", metric: "cm" },
  { key: "maintenanceCost", label: "Maintenance cost", metric: "cm" },
];

function metricValue(o: ReturnType<typeof calculateRoi>, metric: SensitivityMetric): string {
  if (metric === "cm") return fmtCurrency(o.synphonyContributionMargin);
  if (metric === "customerSavings") return fmtCurrency(o.customerNetSavings);
  return o.breakEvenPricePerPound !== null ? `$${o.breakEvenPricePerPound.toFixed(2)}/lb` : "N/A";
}

const SCENARIO_MULTIPLIERS: Record<string, number> = { conservative: -10, base: 0, aggressive: 10 };

export function PricingLabCalculator({ customers }: { customers: { id: string; farmName: string }[] }) {
  const [inputs, setInputs] = useState<RoiInputs>(DEFAULT_INPUTS);
  const [pricingMethod, setPricingMethod] = useState<PricingMethod>("fixed_seasonal");
  const [methodInputs, setMethodInputs] = useState<PricingMethodInputs>(DEFAULT_METHOD_INPUTS.fixed_seasonal);
  const [scenarioCase, setScenarioCase] = useState<"conservative" | "base" | "aggressive">("base");
  const [customerId, setCustomerId] = useState<string>("");
  const [scenarioName, setScenarioName] = useState("New pricing scenario");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function selectMethod(m: PricingMethod) {
    setPricingMethod(m);
    setMethodInputs(DEFAULT_METHOD_INPUTS[m]);
    setSaved(false);
  }
  function setMethodField<K extends keyof PricingMethodInputs>(key: K, value: PricingMethodInputs[K]) {
    setMethodInputs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  // A conservative/aggressive case should move usage-based revenue the same direction as
  // uptime/utilization (less uptime -> less output -> less usage-based revenue) — it would
  // be inconsistent to discount performance but leave a per-pound/per-robot-hour/per-acre
  // revenue estimate untouched. Flat methods (fixed/RaaS/software) are unaffected, matching
  // how a subscription doesn't fluctuate with output.
  const effectivePricingInputs = useMemo<PricingMethodInputs>(() => {
    const factor = 1 + SCENARIO_MULTIPLIERS[scenarioCase] / 100;
    return {
      ...methodInputs,
      expectedUnits: methodInputs.expectedUnits !== undefined ? methodInputs.expectedUnits * factor : undefined,
    };
  }, [methodInputs, scenarioCase]);

  const pricingResult = useMemo(() => calculatePricingByMethod(effectivePricingInputs), [effectivePricingInputs]);

  const effectiveInputs = useMemo<RoiInputs>(() => {
    const factor = 1 + SCENARIO_MULTIPLIERS[scenarioCase] / 100;
    return {
      ...inputs,
      expectedUptimePct: inputs.expectedUptimePct * factor,
      expectedUtilizationPct: inputs.expectedUtilizationPct * factor,
      contractPrice: pricingResult.revenue,
    };
  }, [inputs, scenarioCase, pricingResult.revenue]);

  const outputs = useMemo(() => calculateRoi(effectiveInputs), [effectiveInputs]);

  const sensitivityRows = useMemo(
    () =>
      SENSITIVITY_LEVERS.map((lever) => {
        const down = roiSensitivity(effectiveInputs, lever.key, -20);
        const up = roiSensitivity(effectiveInputs, lever.key, 20);
        return { ...lever, down, up };
      }),
    [effectiveInputs]
  );

  function set<K extends keyof RoiInputs>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    await savePricingScenario({
      name: scenarioName,
      customerId: customerId || null,
      scenarioCase,
      inputs: effectiveInputs,
      pricingMethodInputs: effectivePricingInputs,
      outputs,
    });
    setSaving(false);
    setSaved(true);
  }

  const customerLosesMoney = outputs.customerNetSavings < 0;
  const synphonyBelowTarget = (outputs.synphonyContributionMarginPct ?? 0) < 20;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3 print:hidden">
        <Card>
          <CardHeader title="Scenario" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Scenario name" htmlFor="scenarioName">
              <Input id="scenarioName" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
            </Field>
            <Field label="Customer / opportunity" htmlFor="customerId">
              <Select id="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Unassigned</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.farmName}</option>)}
              </Select>
            </Field>
            <Field label="Case" htmlFor="scenarioCase">
              <Select id="scenarioCase" value={scenarioCase} onChange={(e) => setScenarioCase(e.target.value as typeof scenarioCase)}>
                <option value="conservative">Conservative (-10% uptime/util./usage)</option>
                <option value="base">Base</option>
                <option value="aggressive">Aggressive (+10% uptime/util./usage)</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pricing method" subtitle="Revenue is computed from the method's own formula, not one flat number." />
          <CardBody className="space-y-4">
            <Field label="Pricing method" htmlFor="pricingMethod">
              <Select id="pricingMethod" value={pricingMethod} onChange={(e) => selectMethod(e.target.value as PricingMethod)}>
                {PRICING_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {pricingMethod === "fixed_seasonal" && (
                <Field label="Fixed seasonal price ($)" htmlFor="fixedPrice">
                  <Input id="fixedPrice" type="number" step="1000" value={methodInputs.fixedPrice ?? 0} onChange={(e) => setMethodField("fixedPrice", Number(e.target.value))} />
                </Field>
              )}

              {(pricingMethod === "per_pound" || pricingMethod === "per_robot_hour" || pricingMethod === "per_acre") && (
                <>
                  <Field label={`Price per ${unitLabel(pricingMethod)} ($)`} htmlFor="pricePerUnit">
                    <Input id="pricePerUnit" type="number" step="0.01" value={methodInputs.pricePerUnit ?? 0} onChange={(e) => setMethodField("pricePerUnit", Number(e.target.value))} />
                  </Field>
                  <Field label={`Expected ${unitLabel(pricingMethod)}s (season)`} htmlFor="expectedUnits">
                    <Input id="expectedUnits" type="number" step="1" value={methodInputs.expectedUnits ?? 0} onChange={(e) => setMethodField("expectedUnits", Number(e.target.value))} />
                  </Field>
                  <Field label="Minimum seasonal commitment ($)" htmlFor="minimumCommitment">
                    <Input id="minimumCommitment" type="number" step="1000" value={methodInputs.minimumCommitment ?? 0} onChange={(e) => setMethodField("minimumCommitment", Number(e.target.value))} />
                  </Field>
                </>
              )}

              {(pricingMethod === "raas_subscription" || pricingMethod === "software_subscription") && (
                <>
                  <Field label="Monthly subscription amount ($)" htmlFor="monthlySubscriptionAmount">
                    <Input id="monthlySubscriptionAmount" type="number" step="100" value={methodInputs.monthlySubscriptionAmount ?? 0} onChange={(e) => setMethodField("monthlySubscriptionAmount", Number(e.target.value))} />
                  </Field>
                  <Field label="Billable months" htmlFor="billableMonths">
                    <Input id="billableMonths" type="number" step="1" value={methodInputs.billableMonths ?? 0} onChange={(e) => setMethodField("billableMonths", Number(e.target.value))} />
                  </Field>
                  {pricingMethod === "raas_subscription" ? (
                    <Field label="Mobilization / implementation fee ($)" htmlFor="mobilizationFee">
                      <Input id="mobilizationFee" type="number" step="500" value={methodInputs.mobilizationFee ?? 0} onChange={(e) => setMethodField("mobilizationFee", Number(e.target.value))} />
                    </Field>
                  ) : (
                    <Field label="Implementation / setup fee ($)" htmlFor="implementationFee">
                      <Input id="implementationFee" type="number" step="500" value={methodInputs.implementationFee ?? 0} onChange={(e) => setMethodField("implementationFee", Number(e.target.value))} />
                    </Field>
                  )}
                </>
              )}

              {pricingMethod === "hybrid" && (
                <>
                  <Field label="Price per unit ($)" htmlFor="pricePerUnit">
                    <Input id="pricePerUnit" type="number" step="0.01" value={methodInputs.pricePerUnit ?? 0} onChange={(e) => setMethodField("pricePerUnit", Number(e.target.value))} />
                  </Field>
                  <Field label="Expected units (season)" htmlFor="expectedUnits">
                    <Input id="expectedUnits" type="number" step="1" value={methodInputs.expectedUnits ?? 0} onChange={(e) => setMethodField("expectedUnits", Number(e.target.value))} />
                  </Field>
                  <Field label="Minimum commitment ($ — used only if no monthly fee)" htmlFor="minimumCommitment">
                    <Input id="minimumCommitment" type="number" step="1000" value={methodInputs.minimumCommitment ?? 0} onChange={(e) => setMethodField("minimumCommitment", Number(e.target.value))} />
                  </Field>
                  <Field label="Monthly fee ($ — optional, replaces the minimum)" htmlFor="monthlySubscriptionAmount">
                    <Input id="monthlySubscriptionAmount" type="number" step="100" value={methodInputs.monthlySubscriptionAmount ?? 0} onChange={(e) => setMethodField("monthlySubscriptionAmount", Number(e.target.value))} />
                  </Field>
                  <Field label="Billable months" htmlFor="billableMonths">
                    <Input id="billableMonths" type="number" step="1" value={methodInputs.billableMonths ?? 0} onChange={(e) => setMethodField("billableMonths", Number(e.target.value))} />
                  </Field>
                  <Field label="Mobilization fee ($)" htmlFor="mobilizationFee">
                    <Input id="mobilizationFee" type="number" step="500" value={methodInputs.mobilizationFee ?? 0} onChange={(e) => setMethodField("mobilizationFee", Number(e.target.value))} />
                  </Field>
                </>
              )}
            </div>

            <div className="space-y-1 rounded-lg border border-[var(--color-graphite-100)] bg-[var(--color-paper)] p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Computed revenue breakdown ({scenarioCase} case)</p>
              {pricingResult.breakdownLines.map((l) => <Row key={l.label} label={l.label} value={fmtCurrency(l.amount)} />)}
              <div className="mt-1 border-t border-[var(--color-graphite-200)] pt-1">
                <Row label="Total contract revenue" value={fmtCurrency(pricingResult.revenue)} />
              </div>
              {pricingResult.minimumFloorApplied && <Badge tone="warn">Minimum commitment floor applied — usage estimate was below the floor</Badge>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Customer economics" subtitle="What the grower currently spends on manual labor" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Manual labor cost / hour ($)" htmlFor="laborCost"><Input id="laborCost" type="number" step="0.5" value={inputs.customerLaborCostPerHour} onChange={(e) => set("customerLaborCostPerHour", Number(e.target.value))} /></Field>
            <Field label="Labor burden / benefits (%)" htmlFor="burden"><Input id="burden" type="number" step="1" value={inputs.laborBurdenPct} onChange={(e) => set("laborBurdenPct", Number(e.target.value))} /></Field>
            <Field label="Labor hours replaced / season" htmlFor="hoursReplaced"><Input id="hoursReplaced" type="number" step="100" value={inputs.laborHoursReplacedPerSeason} onChange={(e) => set("laborHoursReplacedPerSeason", Number(e.target.value))} /></Field>
            <Field label="Expected yield/quality benefit ($)" htmlFor="yieldBenefit"><Input id="yieldBenefit" type="number" step="500" value={inputs.expectedYieldQualityBenefit} onChange={(e) => set("expectedYieldQualityBenefit", Number(e.target.value))} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Robot performance" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Number of robots" htmlFor="robots"><Input id="robots" type="number" step="1" value={inputs.numberOfRobots} onChange={(e) => set("numberOfRobots", Number(e.target.value))} /></Field>
            <Field label="Deployment duration (months)" htmlFor="months"><Input id="months" type="number" step="1" value={inputs.deploymentMonths} onChange={(e) => set("deploymentMonths", Number(e.target.value))} /></Field>
            <Field label="Output / productive hour (units)" htmlFor="output"><Input id="output" type="number" step="1" value={inputs.expectedOutputPerProductiveHour} onChange={(e) => set("expectedOutputPerProductiveHour", Number(e.target.value))} /></Field>
            <Field label="Productive hours / robot (season)" htmlFor="hours"><Input id="hours" type="number" step="10" value={inputs.expectedProductiveHoursPerRobot} onChange={(e) => set("expectedProductiveHoursPerRobot", Number(e.target.value))} /></Field>
            <Field label="Expected uptime (%)" htmlFor="uptime"><Input id="uptime" type="number" step="1" value={inputs.expectedUptimePct} onChange={(e) => set("expectedUptimePct", Number(e.target.value))} /></Field>
            <Field label="Expected utilization (%)" htmlFor="utilization"><Input id="utilization" type="number" step="1" value={inputs.expectedUtilizationPct} onChange={(e) => set("expectedUtilizationPct", Number(e.target.value))} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Synphony cost & cash terms" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Deposit amount ($)" htmlFor="deposit"><Input id="deposit" type="number" step="500" value={inputs.depositAmount} onChange={(e) => set("depositAmount", Number(e.target.value))} /></Field>
            <Field label="Synphony direct deployment cost ($)" htmlFor="cost"><Input id="cost" type="number" step="1000" value={inputs.synphonyDirectCosts} onChange={(e) => set("synphonyDirectCosts", Number(e.target.value))} /></Field>
            <Field label="Customer up-front cost ($)" htmlFor="customerUpfront"><Input id="customerUpfront" type="number" step="500" value={inputs.customerUpfrontCost} onChange={(e) => set("customerUpfrontCost", Number(e.target.value))} /></Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Customer ROI" subtitle="What the grower gets" />
          <CardBody className="space-y-2">
            <Row label="Avoided labor cost" value={fmtCurrency(outputs.avoidedLaborCost)} />
            <Row label="Gross benefit (labor + yield)" value={fmtCurrency(outputs.customerGrossBenefit)} />
            <Row label="Synphony fees" value={fmtCurrency(outputs.synphonyFeesToCustomer)} />
            <Row label="Net savings" value={fmtCurrency(outputs.customerNetSavings)} emphasis={customerLosesMoney ? "bad" : "good"} />
            <Row label="ROI %" value={fmtPct(outputs.customerRoiPct)} />
            <Row label="Payback" value={fmtMonths(outputs.customerPaybackMonths)} />
            {customerLosesMoney && <Badge tone="bad">Customer does not save money at this price</Badge>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Synphony economics" subtitle="What Synphony earns" />
          <CardBody className="space-y-2">
            <Row label="Revenue" value={fmtCurrency(outputs.synphonyRevenue)} />
            <Row label="Direct cost" value={fmtCurrency(effectiveInputs.synphonyDirectCosts)} />
            <Row label="Contribution margin" value={fmtCurrency(outputs.synphonyContributionMargin)} emphasis={outputs.synphonyContributionMargin < 0 ? "bad" : "good"} />
            <Row label="Contribution margin %" value={fmtPct(outputs.synphonyContributionMarginPct)} />
            <Row label="Payback" value={fmtMonths(outputs.synphonyPaybackMonths)} />
            <Row label="Break-even $/lb" value={outputs.breakEvenPricePerPound !== null ? `$${outputs.breakEvenPricePerPound.toFixed(2)}` : "N/A"} />
            <Row label="Break-even $/robot-hr" value={outputs.breakEvenPricePerRobotHour !== null ? `$${outputs.breakEvenPricePerRobotHour.toFixed(2)}` : "N/A"} />
            {synphonyBelowTarget && <Badge tone="warn">Below 20% target contribution margin</Badge>}
          </CardBody>
        </Card>

        <Card className="print:hidden">
          <CardHeader title="Sensitivity analysis" subtitle="±20% swing per lever, on the metric it actually moves" />
          <CardBody className="p-0">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-[10px] uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-3 py-2 text-left">Lever</th>
                  <th className="px-3 py-2 text-left">Metric</th>
                  <th className="px-3 py-2 text-right">-20%</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">+20%</th>
                </tr>
              </thead>
              <tbody>
                {sensitivityRows.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--color-graphite-100)] last:border-0">
                    <td className="px-3 py-1.5">{row.label}</td>
                    <td className="px-3 py-1.5 text-[var(--color-graphite-500)]">{row.metric === "cm" ? "Synphony CM" : row.metric === "customerSavings" ? "Customer net savings" : "Break-even price"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{metricValue(row.down, row.metric)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{metricValue(outputs, row.metric)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{metricValue(row.up, row.metric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <div className="flex gap-2 print:hidden">
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : saved ? "Saved ✓" : "Save scenario"}</Button>
          <Button variant="secondary" onClick={() => window.print()}>Print proposal</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: "good" | "bad" }) {
  const color = emphasis === "bad" ? "text-[var(--color-bad-text)]" : emphasis === "good" ? "text-[var(--color-good-text)]" : "text-[var(--color-graphite-900)]";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-graphite-500)]">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
