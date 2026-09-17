import { db } from "@/db/client";
import { robots } from "@/db/schema";
import { getRobotRollups } from "@/lib/finance/aggregate";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/form";
import { fmtCurrency, fmtPct } from "@/lib/finance/calculations";
import { RobotsTable } from "./RobotsTable";
import Link from "next/link";

export default async function RobotsPage() {
  const [allRobots, rollups] = await Promise.all([db.select().from(robots), getRobotRollups()]);

  const statusCounts = {
    available: allRobots.filter((r) => r.status === "available").length,
    assigned: allRobots.filter((r) => r.status === "assigned").length,
    operating: allRobots.filter((r) => r.status === "operating").length,
    idle: allRobots.filter((r) => r.status === "idle").length,
    maintenance: allRobots.filter((r) => r.status === "maintenance").length,
    repair: allRobots.filter((r) => r.status === "repair").length,
    retired: allRobots.filter((r) => r.status === "retired").length,
  };

  const withUtilization = rollups.filter((r) => r.utilizationPct !== null);
  const ranked = [...withUtilization].sort((a, b) => (b.contributionMarginTotal) - (a.contributionMarginTotal));
  const best = ranked.slice(0, 3);
  const worst = ranked.slice(-3).reverse();

  const today = new Date();
  const overdueMaintenance = allRobots.filter((r) => r.nextMaintenanceDate && new Date(r.nextMaintenanceDate) < today);
  const idleReallocatable = allRobots.filter((r) => r.status === "available" || r.status === "idle");

  const totalProductive = rollups.reduce((s, r) => s + r.fleet.productiveHours, 0);
  const totalAvailable = rollups.reduce((s, r) => s + r.fleet.availableHours, 0);
  const totalDowntime = rollups.reduce((s, r) => s + r.fleet.downtimeHours, 0);
  const fleetUtilization = totalAvailable > 0 ? (totalProductive / totalAvailable) * 100 : null;
  const fleetUptime = totalAvailable > 0 ? ((totalAvailable - totalDowntime) / totalAvailable) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Fleet Economics</h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Are deployed robots productive and profitable?</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/robots/new" variant="secondary">+ Add robot</LinkButton>
          <LinkButton href="/data-entry">+ Log weekly metrics</LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Available" value={String(statusCounts.available)} />
        <StatTile label="Operating" value={String(statusCounts.operating)} tone="good" />
        <StatTile label="Assigned" value={String(statusCounts.assigned)} />
        <StatTile label="Idle" value={String(statusCounts.idle)} />
        <StatTile label="Maintenance" value={String(statusCounts.maintenance)} tone="warn" />
        <StatTile label="Repair" value={String(statusCounts.repair)} tone="bad" />
        <StatTile label="Retired" value={String(statusCounts.retired)} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Fleet utilization" value={fmtPct(fleetUtilization)} />
        <StatTile label="Fleet uptime" value={fmtPct(fleetUptime)} />
        <StatTile label="Past scheduled maintenance" value={String(overdueMaintenance.length)} tone={overdueMaintenance.length > 0 ? "bad" : "good"} />
        <StatTile label="Idle / reallocatable" value={String(idleReallocatable.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Best-performing robots" subtitle="Ranked by contribution margin" />
          <CardBody className="space-y-2">
            {best.map((r) => (
              <div key={r.robotId} className="flex items-center justify-between rounded-lg border border-[var(--color-graphite-100)] px-3 py-2">
                <Link href={`/robots/${r.robotId}`} className="text-sm font-medium text-[var(--color-navy-800)] hover:underline">{r.robotCode}</Link>
                <span className="text-sm font-semibold text-[var(--color-good-text)]">{fmtCurrency(r.contributionMarginTotal)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Worst-performing robots" subtitle="Ranked by contribution margin" />
          <CardBody className="space-y-2">
            {worst.map((r) => (
              <div key={r.robotId} className="flex items-center justify-between rounded-lg border border-[var(--color-graphite-100)] px-3 py-2">
                <Link href={`/robots/${r.robotId}`} className="text-sm font-medium text-[var(--color-navy-800)] hover:underline">{r.robotCode}</Link>
                <span className={`text-sm font-semibold ${r.contributionMarginTotal < 0 ? "text-[var(--color-bad-text)]" : ""}`}>{fmtCurrency(r.contributionMarginTotal)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <RobotsTable rows={rollups} />
    </div>
  );
}
