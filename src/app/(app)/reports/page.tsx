import { db } from "@/db/client";
import { deployments, customers } from "@/db/schema";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/form";
import { ExportButtons } from "./ExportButtons";
import Link from "next/link";

export default async function ReportsPage() {
  const allDeployments = await db.select().from(deployments);
  const allCustomers = await db.select().from(customers);
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Reports &amp; Exports</h1>
        <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Print-friendly reports and raw CSV data exports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Executive monthly operating report" subtitle="Cash, revenue, margin, fleet, and risk — the Executive Command Center view." />
          <CardBody><LinkButton href="/dashboard" variant="secondary">Open &amp; print →</LinkButton></CardBody>
        </Card>
        <Card>
          <CardHeader title="Board / investor KPI pack" subtitle="A single-page summary formatted for board decks and investor updates." />
          <CardBody><LinkButton href="/reports/board-kpi" variant="secondary">Open &amp; print →</LinkButton></CardBody>
        </Card>
        <Card>
          <CardHeader title="Fleet economics report" subtitle="Utilization, uptime, revenue and contribution margin per robot." />
          <CardBody><LinkButton href="/robots" variant="secondary">Open &amp; print →</LinkButton></CardBody>
        </Card>
        <Card>
          <CardHeader title="Accounts receivable aging report" subtitle="Current, 1-30, 31-60, 61-90, 90+ day buckets." />
          <CardBody><LinkButton href="/invoices" variant="secondary">Open &amp; print →</LinkButton></CardBody>
        </Card>
        <Card>
          <CardHeader title="13-week cash forecast" subtitle="Weekly cash position across Base, Downside, and Growth scenarios." />
          <CardBody><LinkButton href="/cash-forecast" variant="secondary">Open &amp; print →</LinkButton></CardBody>
        </Card>
        <Card>
          <CardHeader title="Customer / deployment P&L" subtitle="Pick a deployment for its full planned-vs-actual P&L." />
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {allDeployments.map((d) => (
                <li key={d.id}>
                  <Link href={`/deployments/${d.id}`} className="text-[var(--color-accent)] hover:underline">
                    {custMap.get(d.customerId)} — {d.name} →
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Raw data export (CSV)" subtitle="Underlying tables for spreadsheet analysis, backup, or migration to another system." />
        <CardBody>
          <ExportButtons />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="CSV import templates" subtitle="Pre-formatted templates for replacing demo data with real Synphony data." />
        <CardBody className="flex flex-wrap gap-2 text-sm">
          {[
            ["Customers", "customers_template.csv"],
            ["Contracts", "contracts_template.csv"],
            ["Robots", "robots_template.csv"],
            ["Costs", "costs_template.csv"],
            ["Labor logs", "labor_logs_template.csv"],
            ["Robot metrics", "robot_metrics_template.csv"],
            ["Invoices", "invoices_template.csv"],
          ].map(([label, file]) => (
            <a key={file} href={`/templates/${file}`} download className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-1.5 text-xs font-medium text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]">
              {label} template
            </a>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
