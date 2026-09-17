"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Select } from "@/components/ui/form";
import { fmtCurrency, fmtMonths, runwayMonths } from "@/lib/finance/calculations";
import { WeeklyCashChart, MonthlyCashFlowChart } from "@/components/charts/CashCharts";
import type { WeeklyForecastRow, MonthlyForecastRow, ScenarioRow } from "@/lib/finance/cashForecast";

export interface ScenarioBundle {
  scenario: ScenarioRow;
  weekly: WeeklyForecastRow[];
  monthly: MonthlyForecastRow[];
  robotUnitCost: number;
  avgMonthlyContributionMarginPerRobot: number;
}

export function CashForecastView({ bundles }: { bundles: ScenarioBundle[] }) {
  const [scenarioId, setScenarioId] = useState(bundles[0]?.scenario.id ?? "");
  const [waveSize, setWaveSize] = useState(10);

  const active = bundles.find((b) => b.scenario.id === scenarioId) ?? bundles[0];

  const currentCash = active?.weekly[0]?.openingCash ?? 0;
  const minClosing = active ? Math.min(...active.weekly.map((w) => w.closingCash)) : 0;
  const goesNegative = minClosing < 0;

  const avgWeeklyBurn = active
    ? active.weekly.reduce((s, w) => s + (w.payroll + w.opex + w.capex - w.collections - w.financingInflows), 0) / active.weekly.length
    : 0;
  const monthlyBurn = avgWeeklyBurn * 4.345;
  const runway = runwayMonths(currentCash, monthlyBurn);

  const waveImpact = useMemo(() => {
    if (!active) return null;
    const capitalRequired = waveSize * active.robotUnitCost;
    const combinedMonthlyMargin = waveSize * active.avgMonthlyContributionMarginPerRobot;
    const paybackMonths = combinedMonthlyMargin > 0 ? capitalRequired / combinedMonthlyMargin : null;
    return { capitalRequired, combinedMonthlyMargin, paybackMonths };
  }, [active, waveSize]);

  if (!active) return <p className="text-sm text-[var(--color-graphite-500)]">No forecast scenarios configured.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} className="w-72">
          {bundles.map((b) => <option key={b.scenario.id} value={b.scenario.id}>{b.scenario.name}</option>)}
        </Select>
        {goesNegative && <span className="rounded-full bg-[var(--color-bad-bg)] px-3 py-1 text-xs font-medium text-[var(--color-bad-text)]">Forecast cash goes negative in this scenario</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Current cash" value={fmtCurrency(currentCash)} />
        <StatTile label="Avg. monthly burn (13-wk)" value={monthlyBurn <= 0 ? "Cash-flow positive" : fmtCurrency(monthlyBurn)} />
        <StatTile label="Runway" value={runway === null ? "Cash-flow positive" : fmtMonths(runway)} tone={runway !== null && runway < 6 ? "bad" : "good"} />
        <StatTile label="Lowest 13-wk balance" value={fmtCurrency(minClosing)} tone={goesNegative ? "bad" : "good"} />
      </div>

      <Card>
        <CardHeader title="13-week cash forecast" subtitle={active.scenario.name} />
        <CardBody><WeeklyCashChart data={active.weekly} /></CardBody>
      </Card>

      <Card>
        <CardHeader title="24-month operating model" />
        <CardBody><MonthlyCashFlowChart data={active.monthly} /></CardBody>
      </Card>

      <Card>
        <CardHeader title="Fleet expansion capital planner" subtitle="If Synphony deploys N more robots, what capital is required and when do they become cash-generative?" />
        <CardBody className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">Additional robots</label>
            <div className="flex gap-2">
              {[5, 10, 25].map((n) => (
                <button
                  key={n}
                  onClick={() => setWaveSize(n)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${waveSize === n ? "border-[var(--color-navy-800)] bg-[var(--color-navy-800)] text-white" : "border-[var(--color-graphite-300)] text-[var(--color-graphite-700)]"}`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                value={waveSize}
                onChange={(e) => setWaveSize(Number(e.target.value))}
                className="w-24 rounded-lg border border-[var(--color-graphite-300)] px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-[var(--color-graphite-500)]">Capital required</span><span className="font-semibold">{fmtCurrency(waveImpact?.capitalRequired ?? 0)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[var(--color-graphite-500)]">Combined monthly contribution margin</span><span className="font-semibold">{fmtCurrency(waveImpact?.combinedMonthlyMargin ?? 0)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[var(--color-graphite-500)]">Payback period</span><span className="font-semibold">{waveImpact?.paybackMonths ? fmtMonths(waveImpact.paybackMonths) : "N/A — needs positive margin/robot"}</span></div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
