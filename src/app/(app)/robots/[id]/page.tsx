import { db } from "@/db/client";
import { robots, robotAssignments, robotMetrics, deployments, ROBOT_STATUSES } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, robotStatusTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/form";
import { fmtCurrency, fmtPct, fmtNumber } from "@/lib/finance/calculations";
import { getRobotRollups } from "@/lib/finance/aggregate";
import { updateRobotStatus } from "@/lib/actions/robots";
import { SimpleBarChart } from "@/components/charts/DashboardCharts";
import Link from "next/link";

export default async function RobotDetailPage({ params }: PageProps<"/robots/[id]">) {
  const { id } = await params;
  const [robot] = await db.select().from(robots).where(eq(robots.id, id));
  if (!robot) notFound();

  const rollups = await getRobotRollups();
  const rollup = rollups.find((r) => r.robotId === id);
  const assignments = await db.select().from(robotAssignments).where(eq(robotAssignments.robotId, id));
  const allDeployments = await db.select().from(deployments);
  const depMap = new Map(allDeployments.map((d) => [d.id, d.name]));
  const metrics = await db.select().from(robotMetrics).where(eq(robotMetrics.robotId, id)).orderBy(robotMetrics.date);

  const weeklyOutput = metrics.map((m) => ({ week: m.date.slice(5), output: Math.round(m.outputUnits) }));

  async function changeStatus(formData: FormData) {
    "use server";
    await updateRobotStatus(id, formData);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">{robot.robotCode}</h1>
            <Badge tone={robotStatusTone(robot.status)}>{robot.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">{robot.model} · Serial {robot.serialNumber} · Acquired {robot.acquisitionDate}</p>
        </div>
        <form action={changeStatus} className="flex items-center gap-2">
          <Select name="status" defaultValue={robot.status} className="text-xs">
            {ROBOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Update</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Utilization</p><p className="mt-1 text-lg font-semibold">{fmtPct(rollup?.utilizationPct ?? null)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Uptime</p><p className="mt-1 text-lg font-semibold">{fmtPct(rollup?.uptimePct ?? null)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Contribution margin</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(rollup?.contributionMarginTotal ?? 0)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Intervention hours</p><p className="mt-1 text-lg font-semibold">{fmtNumber(rollup?.interventionHoursTotal ?? 0, 1)}</p></CardBody></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Purchase cost</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(robot.purchaseCost)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Useful life</p><p className="mt-1 text-lg font-semibold">{robot.usefulLifeMonths} mo</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Last maintenance</p><p className="mt-1 text-lg font-semibold">{robot.lastMaintenanceDate ?? "—"}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Next maintenance</p><p className={`mt-1 text-lg font-semibold ${robot.nextMaintenanceDate && new Date(robot.nextMaintenanceDate) < new Date() ? "text-[var(--color-bad-text)]" : ""}`}>{robot.nextMaintenanceDate ?? "—"}</p></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Weekly output" subtitle="Output units logged per week" />
        <CardBody>{weeklyOutput.length > 0 ? <SimpleBarChart data={weeklyOutput} dataKey="output" xKey="week" /> : <p className="text-sm text-[var(--color-graphite-500)]">No metrics logged yet.</p>}</CardBody>
      </Card>

      <Card>
        <CardHeader title="Assignment history" />
        <CardBody className="p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                <th className="px-4 py-2 text-left">Deployment</th>
                <th className="px-4 py-2 text-left">Start</th>
                <th className="px-4 py-2 text-left">End</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                  <td className="px-4 py-2.5"><Link href={`/deployments/${a.deploymentId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{depMap.get(a.deploymentId)}</Link></td>
                  <td className="px-4 py-2.5">{a.assignmentStart}</td>
                  <td className="px-4 py-2.5">{a.assignmentEnd ?? "Current"}</td>
                </tr>
              ))}
              {assignments.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No assignment history.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
