import { db } from "@/db/client";
import { alerts } from "@/db/schema";
import { StatTile } from "@/components/ui/StatTile";
import { fmtCurrency } from "@/lib/finance/calculations";
import { AlertsQueue } from "./AlertsQueue";

export default async function AlertsPage() {
  const rows = await db.select().from(alerts).orderBy(alerts.triggeredAt);
  const open = rows.filter((a) => ["open", "acknowledged", "in_progress"].includes(a.status));
  const critical = open.filter((a) => a.severity === "critical").length;
  const high = open.filter((a) => a.severity === "high").length;
  const totalImpact = open.reduce((s, a) => s + (a.estimatedImpact ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Alerts &amp; Actions</h1>
        <p className="mt-1 text-sm text-[var(--color-graphite-500)]">The needs-attention work queue — sorted by severity, then estimated financial impact.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Open alerts" value={String(open.length)} />
        <StatTile label="Critical" value={String(critical)} tone={critical > 0 ? "bad" : "good"} />
        <StatTile label="High" value={String(high)} tone={high > 0 ? "warn" : "good"} />
        <StatTile label="Estimated impact (open)" value={fmtCurrency(totalImpact)} />
      </div>

      <AlertsQueue alerts={rows} />
    </div>
  );
}
