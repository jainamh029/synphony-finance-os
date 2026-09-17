import { getExecutiveSummary, deploymentHealth } from "@/lib/finance/dashboard";
import { db } from "@/db/client";
import { alerts as alertsTable, customers } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { fmtCurrency, fmtPct, fmtNumber, fmtMonths } from "@/lib/finance/calculations";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, severityTone } from "@/components/ui/Badge";
import { MarginByCustomerChart, ArAgingChart, FleetStatusChart } from "@/components/charts/DashboardCharts";
import { getArAging } from "@/lib/finance/aggregate";
import Link from "next/link";

export default async function DashboardPage() {
  const [summary, arRows, openAlerts] = await Promise.all([
    getExecutiveSummary(),
    getArAging(),
    db.select().from(alertsTable).where(inArray(alertsTable.status, ["open", "acknowledged", "in_progress"])),
  ]);

  const custMap = new Map((await db.select().from(customers)).map((c) => [c.id, c.farmName]));

  const sortedAlerts = [...openAlerts].sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0);
  });

  const arByBucket = ["current", "1-30", "31-60", "61-90", "90+"].map((bucket) => ({
    bucket,
    outstanding: arRows.filter((r) => r.bucket === bucket).reduce((s, r) => s + r.outstanding, 0),
  }));

  const fleetStatusData = [
    { name: "Active", value: summary.robotsActive, color: "#0f7a4d" },
    { name: "Idle", value: summary.robotsIdle, color: "#a7adb8" },
    { name: "Maintenance", value: summary.robotsMaintenance, color: "#c58a00" },
    { name: "Repair", value: summary.robotsRepair, color: "#b3261e" },
  ];

  const runwayLabel = summary.cash.runwayMonths === null ? "Cash-flow positive" : fmtMonths(summary.cash.runwayMonths);
  const runwayTone = summary.cash.runwayMonths === null ? "good" : summary.cash.runwayMonths < 6 ? "bad" : summary.cash.runwayMonths < 9 ? "warn" : "good";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Executive Command Center</h1>
        <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Which farm needs attention today?</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Cash balance" value={fmtCurrency(summary.cash.currentCash)} definition="Current company cash balance from settings / base forecast scenario." />
        <StatTile
          label="Monthly net burn"
          value={summary.cash.avgMonthlyNetBurn <= 0 ? "Cash-flow positive" : fmtCurrency(summary.cash.avgMonthlyNetBurn)}
          helpText="Fixed opex minus trailing 3-mo. avg. collections"
        />
        <StatTile label="Runway" value={runwayLabel} tone={runwayTone as "good" | "warn" | "bad"} toneLabel={runwayTone === "bad" ? "Watch" : undefined} />
        <StatTile label="Contracted backlog" value={fmtCurrency(summary.contractedBacklog)} helpText="Remaining unrecognized value on active contracts" />

        <StatTile label="Revenue recognized (MTD)" value={fmtCurrency(summary.revenueRecognizedMTD)} />
        <StatTile label="Revenue recognized (STD)" value={fmtCurrency(summary.revenueRecognizedSTD)} helpText="Season/year-to-date" />
        <StatTile label="Cash collected (MTD)" value={fmtCurrency(summary.cashCollectedMTD)} />
        <StatTile label="Cash collected (STD)" value={fmtCurrency(summary.cashCollectedSTD)} />

        <StatTile label="Active farms" value={fmtNumber(summary.activeFarms)} />
        <StatTile label="Active deployments" value={fmtNumber(summary.activeDeployments)} />
        <StatTile label="Robots deployed / owned" value={`${summary.robotsDeployed} / ${summary.robotsOwned}`} />
        <StatTile label="Fleet utilization" value={fmtPct(summary.fleetUtilizationPct)} helpText={`Avg. uptime ${fmtPct(summary.avgUptimePct)}`} />

        <StatTile label="Blended contribution margin" value={fmtPct(summary.blendedContributionMarginPct)} />
        <StatTile
          label="Deployments needing action"
          value={fmtNumber(summary.redCount + summary.yellowCount)}
          tone={summary.redCount > 0 ? "bad" : summary.yellowCount > 0 ? "warn" : "good"}
          toneLabel={`${summary.redCount} red / ${summary.yellowCount} yellow`}
        />
        <StatTile label="AR outstanding" value={fmtCurrency(summary.arOutstanding)} tone={summary.overdueAmount > 0 ? "warn" : "good"} toneLabel={`${summary.overdueInvoiceCount} overdue`} />
        <StatTile label="Next 30 / 60 / 90-day obligations" value={`${fmtCurrency(summary.next30DayObligation, { decimals: 0 })}`} helpText={`60d: ${fmtCurrency(summary.next60DayObligation)} · 90d: ${fmtCurrency(summary.next90DayObligation)}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Deployments needing action" subtitle="Ranked by severity, then estimated financial impact" action={<Link href="/alerts" className="text-xs font-medium text-[var(--color-accent)]">View all →</Link>} />
          <CardBody className="p-0">
            <ul className="divide-y divide-[var(--color-graphite-100)]">
              {sortedAlerts.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>
                      <p className="truncate text-sm font-medium text-[var(--color-graphite-900)]">{a.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-graphite-500)]">{a.recommendedAction}</p>
                  </div>
                  {a.estimatedImpact ? (
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-graphite-900)]">{fmtCurrency(a.estimatedImpact)}</p>
                  ) : null}
                </li>
              ))}
              {sortedAlerts.length === 0 && <li className="px-5 py-8 text-center text-sm text-[var(--color-graphite-500)]">No open alerts. Everything is within target.</li>}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Fleet status" subtitle={`${summary.robotsOwned} robots owned`} />
          <CardBody>
            <FleetStatusChart data={fleetStatusData} />
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Top 5 customers — contract value vs. contribution margin" />
          <CardBody>
            <MarginByCustomerChart data={summary.topCustomersByValue} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Accounts receivable aging" />
          <CardBody>
            <ArAgingChart data={arByBucket} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Deployment risk heatmap" subtitle="Contribution margin health across every deployment" />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Deployment</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-right">Recognized revenue</th>
                  <th className="px-4 py-2 text-right">Contribution margin</th>
                  <th className="px-4 py-2 text-right">Utilization</th>
                  <th className="px-4 py-2 text-right">Uptime</th>
                  <th className="px-4 py-2 text-center">Health</th>
                </tr>
              </thead>
              <tbody>
                {summary.deploymentRollups.map((d) => {
                  const health = deploymentHealth(d);
                  const tone = health === "red" ? "bad" : health === "yellow" ? "warn" : "good";
                  return (
                    <tr key={d.deploymentId} className="border-b border-[var(--color-graphite-100)] last:border-0 hover:bg-[var(--color-paper)]">
                      <td className="px-4 py-2.5">
                        <Link href={`/deployments/${d.deploymentId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">
                          {d.deploymentName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{custMap.get(d.customerId)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(d.recognizedRevenueToDate)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(d.contributionMarginPctActual)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(d.utilizationActualPct)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(d.uptimeActualPct)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={tone}>{health}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
