import { db } from "@/db/client";
import { robots, deployments, DEPLOYMENT_STATUSES, alerts as alertsTable } from "@/db/schema";
import { getDeploymentDetail } from "@/lib/finance/aggregate";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, deploymentStatusTone, severityTone, robotStatusTone, invoiceStatusTone } from "@/components/ui/Badge";
import { Select, Input, TextArea, Button } from "@/components/ui/form";
import { fmtCurrency, fmtPct, fmtMonths, fmtNumber } from "@/lib/finance/calculations";
import { updateDeploymentStatus, updateDeploymentNotes, assignRobot, unassignRobot } from "@/lib/actions/deployments";
import { CostBreakdownChart, MonthlyTrendChart } from "@/components/charts/DeploymentCharts";
import { PrintButton } from "@/components/ui/PrintButton";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function DeploymentDetailPage({ params }: PageProps<"/deployments/[id]">) {
  const { id } = await params;
  const detail = await getDeploymentDetail(id);
  if (!detail) notFound();

  const [depRow] = await db.select().from(deployments).where(eq(deployments.id, id));
  const allRobots = await db.select().from(robots);
  const assignedIds = new Set(detail.robots.map((r) => r.robotId));
  const availableRobots = allRobots.filter((r) => !assignedIds.has(r.id) && (r.status === "available" || r.status === "idle"));
  const deploymentAlerts = await db.select().from(alertsTable).where(eq(alertsTable.deploymentId, id));

  async function changeStatus(formData: FormData) {
    "use server";
    await updateDeploymentStatus(id, formData);
  }
  async function saveNotes(formData: FormData) {
    "use server";
    await updateDeploymentNotes(id, formData);
  }
  async function assign(formData: FormData) {
    "use server";
    await assignRobot(id, formData);
  }

  const totalActualCost = detail.costsByCategory.reduce((s, c) => s + c.actual, 0);
  const totalPlannedCost = detail.costsByCategory.reduce((s, c) => s + c.planned, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">{detail.deploymentName}</h1>
            <Badge tone={deploymentStatusTone(detail.status)}>{detail.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">
            <Link href={`/customers/${detail.customerId}`} className="hover:underline">{detail.customerName}</Link> · {detail.plannedStartDate} → {detail.plannedEndDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={changeStatus} className="flex items-center gap-2 print:hidden">
            <Select name="status" defaultValue={detail.status} className="text-xs">
              {DEPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
            <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Update</button>
          </form>
          <PrintButton label="Print P&L" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Recognized revenue</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(detail.recognizedRevenueToDate)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Contribution margin</p><p className={`mt-1 text-lg font-semibold ${detail.contributionMarginActual < 0 ? "text-[var(--color-bad-text)]" : ""}`}>{fmtCurrency(detail.contributionMarginActual)} ({fmtPct(detail.contributionMarginPctActual)})</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Cash collected</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(detail.cashCollected)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Expected payback</p><p className="mt-1 text-lg font-semibold">{fmtMonths(detail.expectedPaybackMonths)}</p></CardBody></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Utilization (actual / target)</p><p className="mt-1 text-lg font-semibold">{fmtPct(detail.utilizationActualPct)} <span className="text-xs font-normal text-[var(--color-graphite-500)]">/ {detail.expectedUtilizationPct}%</span></p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Uptime (actual / target)</p><p className="mt-1 text-lg font-semibold">{fmtPct(detail.uptimeActualPct)} <span className="text-xs font-normal text-[var(--color-graphite-500)]">/ {detail.expectedUptimePct}%</span></p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Cost per pound</p><p className="mt-1 text-lg font-semibold">{detail.costPerPoundActual !== null ? `$${detail.costPerPoundActual.toFixed(2)}` : "N/A"} <span className="text-xs font-normal text-[var(--color-graphite-500)]">/ ${detail.manualLaborCostPerLb?.toFixed(2) ?? "—"} benchmark</span></p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Robots assigned</p><p className="mt-1 text-lg font-semibold">{detail.robotsAssigned} / {detail.robotsPlanned} planned</p></CardBody></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Budget vs. actual direct cost" subtitle={`Total: ${fmtCurrency(totalActualCost)} actual vs. ${fmtCurrency(totalPlannedCost)} planned`} />
          <CardBody>
            {detail.costsByCategory.length > 0 ? <CostBreakdownChart data={detail.costsByCategory} /> : <p className="text-sm text-[var(--color-graphite-500)]">No cost data recorded yet.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Revenue, cost & contribution margin by month" />
          <CardBody>
            {detail.monthlyTrend.length > 0 ? <MonthlyTrendChart data={detail.monthlyTrend} /> : <p className="text-sm text-[var(--color-graphite-500)]">No monthly activity recorded yet.</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Robot roster" action={
          <form action={assign} className="flex items-center gap-2">
            <Select name="robotId" required className="text-xs">
              <option value="">Assign a robot...</option>
              {availableRobots.map((r) => <option key={r.id} value={r.id}>{r.robotCode} ({r.model})</option>)}
            </Select>
            <Input name="assignmentStart" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-36 text-xs" />
            <button type="submit" className="rounded-lg bg-[var(--color-navy-800)] px-3 py-2 text-xs font-medium text-white">Assign</button>
          </form>
        } />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Robot</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Utilization</th>
                  <th className="px-4 py-2 text-right">Uptime</th>
                  <th className="px-4 py-2 text-right">Contribution margin</th>
                  <th className="px-4 py-2 text-right">Intervention hrs</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {detail.robots.map((r) => (
                  <tr key={r.robotId} className="border-b border-[var(--color-graphite-100)] last:border-0">
                    <td className="px-4 py-2.5"><Link href={`/robots/${r.robotId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.robotCode}</Link></td>
                    <td className="px-4 py-2.5"><Badge tone={robotStatusTone(r.status)}>{r.status}</Badge></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(r.utilizationPct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(r.uptimePct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(r.contributionMarginTotal)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNumber(r.interventionHoursTotal, 1)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={async () => { "use server"; await unassignRobot(id, r.robotId); }}>
                        <button type="submit" className="text-xs text-[var(--color-graphite-500)] hover:text-[var(--color-bad-text)]">Unassign</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {detail.robots.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No robots assigned yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoices" />
          <CardBody className="p-0">
            <div className="table-scroll">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(inv.amount)}</td>
                      <td className="px-4 py-2.5"><Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge></td>
                    </tr>
                  ))}
                  {detail.invoices.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No invoices tied directly to this deployment.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Related alerts" />
          <CardBody className="space-y-2">
            {deploymentAlerts.length === 0 && <p className="text-sm text-[var(--color-graphite-500)]">No alerts for this deployment.</p>}
            {deploymentAlerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-[var(--color-graphite-100)] p-3">
                <div className="flex items-center gap-2">
                  <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>
                  <p className="text-sm font-medium">{a.title}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--color-graphite-500)]">{a.recommendedAction}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Notes & next action" subtitle="Assigned operations owner and running notes for this deployment." />
        <CardBody>
          <form action={saveNotes} className="space-y-3">
            <Input name="operationsOwner" defaultValue={detail.operationsOwner ?? ""} placeholder="Operations owner" />
            <TextArea name="notes" rows={3} defaultValue={depRow?.notes ?? ""} placeholder="Notes..." />
            <Button type="submit" variant="secondary">Save notes</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
