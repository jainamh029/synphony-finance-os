"use client";

import { useMemo, useState } from "react";
import {
  calculateRoi, roiSensitivity, fmtCurrency, fmtPct, fmtMonths, fmtNumber,
  type RoiInputs, type RoiSensitivityLever,
} from "@/lib/finance/calculations";
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
  contractPrice: 220000,
  synphonyDirectCosts: 140000,
  depositAmount: 25000,
  customerUpfrontCost: 15000,
  deploymentMonths: 7,
};

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
  const [scenarioCase, setScenarioCase] = useState<"conservative" | "base" | "aggressive">("base");
  const [customerId, setCustomerId] = useState<string>("");
  const [scenarioName, setScenarioName] = useState("New pricing scenario");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const effectiveInputs = useMemo<RoiInputs>(() => {
    const factor = 1 + SCENARIO_MULTIPLIERS[scenarioCase] / 100;
    return {
      ...inputs,
      expectedUptimePct: inputs.expectedUptimePct * factor,
      expectedUtilizationPct: inputs.expectedUtilizationPct * factor,
    };
  }, [inputs, scenarioCase]);

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
                <option value="conservative">Conservative (-10% uptime/util.)</option>
                <option value="base">Base</option>
                <option value="aggressive">Aggressive (+10% uptime/util.)</option>
              </Select>
            </Field>
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
          <CardHeader title="Pricing & Synphony cost" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Proposed contract price ($)" htmlFor="price"><Input id="price" type="number" step="1000" value={inputs.contractPrice} onChange={(e) => set("contractPrice", Number(e.target.value))} /></Field>
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
