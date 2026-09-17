import { getExecutiveSummary } from "@/lib/finance/dashboard";
import { getArAging, getRobotRollups } from "@/lib/finance/aggregate";
import { db } from "@/db/client";
import { alerts, contracts, customers } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { fmtCurrency, fmtPct, fmtMonths } from "@/lib/finance/calculations";
import { Badge, severityTone } from "@/components/ui/Badge";
import { PrintButton } from "@/components/ui/PrintButton";

export default async function BoardKpiReportPage() {
  const [summary, arRows, robotRollups, riskAlerts, allContracts, allCustomers] = await Promise.all([
    getExecutiveSummary(),
    getArAging(),
    getRobotRollups(),
    db.select().from(alerts).where(inArray(alerts.severity, ["critical", "high"])),
    db.select().from(contracts),
    db.select().from(customers),
  ]);

  const openRisks = riskAlerts.filter((a) => ["open", "acknowledged", "in_progress"].includes(a.status));
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  const revenueByType = new Map<string, number>();
  for (const c of allContracts.filter((c) => c.status === "active")) {
    revenueByType.set(c.contractType, (revenueByType.get(c.contractType) ?? 0) + c.totalContractValue);
  }
  const totalActiveValue = [...revenueByType.values()].reduce((a, b) => a + b, 0);

  const withOutput = robotRollups.filter((r) => r.revenuePerHour !== null);
  const avgRevenuePerRobotHour = withOutput.length > 0 ? withOutput.reduce((s, r) => s + (r.revenuePerHour ?? 0), 0) / withOutput.length : null;
  const avgCmPerRobot = robotRollups.length > 0 ? robotRollups.reduce((s, r) => s + r.contributionMarginTotal, 0) / robotRollups.length : 0;

  const pipelineStages = allCustomers.filter((c) => ["lead", "qualified", "pilot"].includes(c.lifecycleStage));

  return (
    <div className="mx-auto max-w-4xl space-y-6 bg-white p-6 print:p-0">
      <PrintButton />

      <div className="border-b border-[var(--color-graphite-900)] pb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-graphite-500)]">Synphony — DEMO DATA</p>
        <h1 className="text-2xl font-bold text-[var(--color-navy-900)]">Board &amp; Investor KPI Pack</h1>
        <p className="text-sm text-[var(--color-graphite-500)]">Generated {new Date().toLocaleDateString()} · Illustrative sample data</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Cash, Burn & Runway</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <Kpi label="Cash balance" value={fmtCurrency(summary.cash.currentCash)} />
          <Kpi label="Monthly net burn" value={summary.cash.avgMonthlyNetBurn <= 0 ? "Cash-flow positive" : fmtCurrency(summary.cash.avgMonthlyNetBurn)} />
          <Kpi label="Runway" value={summary.cash.runwayMonths === null ? "Cash-flow positive" : fmtMonths(summary.cash.runwayMonths)} />
          <Kpi label="Contracted backlog" value={fmtCurrency(summary.contractedBacklog)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Revenue & Collections</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <Kpi label="Revenue recognized (STD)" value={fmtCurrency(summary.revenueRecognizedSTD)} />
          <Kpi label="Cash collected (STD)" value={fmtCurrency(summary.cashCollectedSTD)} />
          <Kpi label="Blended contribution margin" value={fmtPct(summary.blendedContributionMarginPct)} />
          <Kpi label="Qualified pipeline (accounts)" value={String(pipelineStages.length)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Revenue by contract type (active)</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {[...revenueByType.entries()].sort((a, b) => b[1] - a[1]).map(([type, value]) => (
              <tr key={type} className="border-b border-[var(--color-graphite-100)]">
                <td className="py-1.5 capitalize">{type.replace(/_/g, " ")}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtCurrency(value)}</td>
                <td className="py-1.5 w-24 text-right tabular-nums text-[var(--color-graphite-500)]">{fmtPct((value / totalActiveValue) * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Customer concentration (top 5 by contract value)</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {summary.topCustomersByValue.map((c) => (
              <tr key={c.customerName} className="border-b border-[var(--color-graphite-100)]">
                <td className="py-1.5">{c.customerName}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtCurrency(c.contractValue)}</td>
                <td className={`py-1.5 w-32 text-right tabular-nums ${c.contributionMargin < 0 ? "text-[var(--color-bad-text)]" : ""}`}>{fmtCurrency(c.contributionMargin)} CM</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Fleet & Operations</h2>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <Kpi label="Active deployments" value={String(summary.activeDeployments)} />
          <Kpi label="Robots deployed / owned" value={`${summary.robotsDeployed} / ${summary.robotsOwned}`} />
          <Kpi label="Fleet utilization" value={fmtPct(summary.fleetUtilizationPct)} />
          <Kpi label="Avg. uptime" value={fmtPct(summary.avgUptimePct)} />
          <Kpi label="Avg. revenue / robot-hr" value={avgRevenuePerRobotHour !== null ? `$${avgRevenuePerRobotHour.toFixed(2)}` : "N/A"} />
          <Kpi label="Avg. contribution margin / robot" value={fmtCurrency(avgCmPerRobot)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Accounts receivable aging</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-graphite-300)] text-xs uppercase text-[var(--color-graphite-500)]">
              <th className="py-1.5 text-left">Bucket</th>
              <th className="py-1.5 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {["current", "1-30", "31-60", "61-90", "90+"].map((bucket) => (
              <tr key={bucket} className="border-b border-[var(--color-graphite-100)]">
                <td className="py-1.5">{bucket}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtCurrency(arRows.filter((r) => r.bucket === bucket).reduce((s, r) => s + r.outstanding, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Major risks & open actions</h2>
        <ul className="space-y-1.5 text-sm">
          {openRisks.slice(0, 10).map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>
              <span>{a.title}</span>
            </li>
          ))}
          {openRisks.length === 0 && <li className="text-[var(--color-graphite-500)]">No critical/high risks open.</li>}
        </ul>
      </section>

      <section className="text-xs text-[var(--color-graphite-500)]">
        <p><strong>Use of proceeds / expansion scenario:</strong> See Cash &amp; Capex Planner → Growth scenario for the modeled 10-robot expansion wave, its capital requirement, and expected payback.</p>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--color-graphite-100)] p-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-graphite-500)]">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
