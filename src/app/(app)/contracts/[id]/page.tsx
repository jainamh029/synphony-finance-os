import { db } from "@/db/client";
import { contracts, customers, invoices, deployments, invoiceScheduleItems, CONTRACT_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, invoiceStatusTone } from "@/components/ui/Badge";
import { LinkButton, Select } from "@/components/ui/form";
import { ConfirmSubmitButton } from "@/components/forms/ConfirmSubmitButton";
import { fmtCurrency, straightLineMonthlyRevenue, outstandingBalance } from "@/lib/finance/calculations";
import { updateContractStatus, regenerateContractSchedule, issueInvoiceFromSchedule, voidContractScheduleLine } from "@/lib/actions/contracts";
import Link from "next/link";

const SCHEDULE_STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "info"> = {
  scheduled: "neutral",
  draft: "neutral",
  issued: "info",
  paid: "good",
  void: "bad",
  cancelled: "bad",
  superseded: "neutral",
};

export default async function ContractDetailPage({ params }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!contract) notFound();
  const [customer] = await db.select().from(customers).where(eq(customers.id, contract.customerId));
  const contractInvoices = await db.select().from(invoices).where(eq(invoices.contractId, id));
  const linkedDeployments = await db.select().from(deployments).where(eq(deployments.contractId, id));
  const allScheduleItems = await db.select().from(invoiceScheduleItems).where(eq(invoiceScheduleItems.contractId, id));

  const invoicedAmount = contractInvoices.reduce((s, i) => s + i.amount, 0);
  const cashCollected = contractInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const outstanding = contractInvoices.reduce((s, i) => s + outstandingBalance(i.amount, i.amountPaid), 0);
  const monthlyRevenue = straightLineMonthlyRevenue(contract.totalContractValue, contract.startDate, contract.endDate);

  const latestScheduleVersion = allScheduleItems.length > 0 ? Math.max(...allScheduleItems.map((s) => s.scheduleVersion)) : 0;
  const currentScheduleItems = allScheduleItems
    .filter((s) => s.scheduleVersion === latestScheduleVersion)
    .sort((a, b) => (a.plannedInvoiceDate < b.plannedInvoiceDate ? -1 : 1));
  const scheduleIsStale = currentScheduleItems.some((s) => s.sourceContractVersion !== contract.contractVersion) && currentScheduleItems.length > 0;

  const totalScheduled = currentScheduleItems.filter((s) => s.status === "scheduled" || s.status === "draft").reduce((s, i) => s + i.plannedAmount, 0);
  const totalIssuedFromSchedule = currentScheduleItems.filter((s) => s.status === "issued" || s.status === "paid").reduce((s, i) => s + i.plannedAmount, 0);
  const remainingUnbilled = Math.max(0, contract.totalContractValue - invoicedAmount);

  async function changeStatus(formData: FormData) {
    "use server";
    const status = String(formData.get("status")) as (typeof CONTRACT_STATUSES)[number];
    await updateContractStatus(id, status);
  }
  async function regenerate() {
    "use server";
    await regenerateContractSchedule(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-graphite-500)]">{contract.contractType.replace(/_/g, " ")} · v{contract.contractVersion}</p>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">
            <Link href={`/customers/${contract.customerId}`} className="hover:underline">{customer?.farmName}</Link>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">{contract.startDate} → {contract.endDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href={`/contracts/${id}/edit`} variant="secondary">Edit terms</LinkButton>
          <form action={changeStatus} className="flex items-center gap-2">
            <Select name="status" defaultValue={contract.status} className="text-xs">
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </Select>
            <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Update status</button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Contract value</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(contract.totalContractValue)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Invoiced to date</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(invoicedAmount)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Cash collected</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(cashCollected)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Outstanding balance</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(outstanding)}</p></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Terms" />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Mobilization fee</dt><dd>{fmtCurrency(contract.mobilizationFee)}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Deposit</dt><dd>{fmtCurrency(contract.depositAmount)}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Minimum commitment</dt><dd>{fmtCurrency(contract.minimumCommitment)}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Variable price</dt><dd>{contract.variablePricePerUnit ? `$${contract.variablePricePerUnit} / ${contract.variableUnitType}` : "N/A"}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Monthly subscription</dt><dd>{contract.monthlySubscriptionAmount ? fmtCurrency(contract.monthlySubscriptionAmount) : "N/A"}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Straight-line monthly revenue</dt><dd>{fmtCurrency(monthlyRevenue)}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Robots committed</dt><dd>{contract.robotsCommitted}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Billing frequency</dt><dd className="capitalize">{contract.billingFrequency.replace(/_/g, " ")}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Payment terms</dt><dd className="capitalize">{contract.paymentTerms.replace(/_/g, " ")}</dd></div>
            <div><dt className="text-xs text-[var(--color-graphite-500)]">SLA uptime target</dt><dd>{contract.slaUptimeTargetPct ?? "—"}%</dd></div>
          </dl>
        </CardBody>
      </Card>

      {linkedDeployments.length > 0 && (
        <Card>
          <CardHeader title="Linked deployment" />
          <CardBody className="flex flex-wrap gap-3">
            {linkedDeployments.map((d) => (
              <LinkButton key={d.id} href={`/deployments/${d.id}`} variant="secondary">{d.name} →</LinkButton>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Billing Schedule"
          subtitle={scheduleIsStale ? "⚠ Contract terms changed since this schedule was generated — future lines may be out of date." : `Version ${latestScheduleVersion || "—"}`}
          action={
            <form action={regenerate}>
              <ConfirmSubmitButton
                variant={scheduleIsStale ? "primary" : "secondary"}
                confirmMessage="Regenerate the billing schedule? Any scheduled/draft lines not yet issued will be superseded — issued and paid invoices are never affected."
              >
                Regenerate Future Schedule
              </ConfirmSubmitButton>
            </form>
          }
        />
        <CardBody>
          <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-xs text-[var(--color-graphite-500)]">Total scheduled (not yet issued)</p><p className="font-semibold">{fmtCurrency(totalScheduled)}</p></div>
            <div><p className="text-xs text-[var(--color-graphite-500)]">Total invoiced from schedule</p><p className="font-semibold">{fmtCurrency(totalIssuedFromSchedule)}</p></div>
            <div><p className="text-xs text-[var(--color-graphite-500)]">Remaining unbilled contract value</p><p className="font-semibold">{fmtCurrency(remainingUnbilled)}</p></div>
          </div>
          <div className="table-scroll rounded-lg border border-[var(--color-graphite-100)]">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Due date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {currentScheduleItems.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                    <td className="px-3 py-2">{item.plannedInvoiceDate}</td>
                    <td className="px-3 py-2 capitalize">{item.lineType}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-graphite-700)]">{item.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(item.plannedAmount)}</td>
                    <td className="px-3 py-2">{item.plannedDueDate}</td>
                    <td className="px-3 py-2"><Badge tone={SCHEDULE_STATUS_TONE[item.status] ?? "neutral"}>{item.status}</Badge></td>
                    <td className="px-3 py-2 text-right">
                      {(item.status === "scheduled" || item.status === "draft") && (
                        <div className="flex justify-end gap-2">
                          <form action={async () => { "use server"; await issueInvoiceFromSchedule(item.id, id); }}>
                            <ConfirmSubmitButton variant="primary" confirmMessage={`Issue a real invoice for ${fmtCurrency(item.plannedAmount)}? This creates an actual invoice record and cannot be undone by regenerating the schedule.`}>
                              Issue Invoice
                            </ConfirmSubmitButton>
                          </form>
                          <form action={async () => { "use server"; await voidContractScheduleLine(item.id, id); }}>
                            <button type="submit" className="text-xs text-[var(--color-graphite-500)] hover:text-[var(--color-bad-text)]">Void</button>
                          </form>
                        </div>
                      )}
                      {item.status === "issued" && item.issuedInvoiceId && (
                        <Link href="/invoices" className="text-xs text-[var(--color-accent)] hover:underline">View invoice →</Link>
                      )}
                    </td>
                  </tr>
                ))}
                {currentScheduleItems.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--color-graphite-500)]">No billing schedule generated yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Issued Invoices" action={<LinkButton href={`/invoices/new?contractId=${id}`} variant="secondary">+ New invoice</LinkButton>} />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Invoice #</th>
                  <th className="px-4 py-2 text-left">Invoice date</th>
                  <th className="px-4 py-2 text-left">Due date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {contractInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2.5">{inv.invoiceDate}</td>
                    <td className="px-4 py-2.5">{inv.dueDate}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(inv.amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(inv.amountPaid)}</td>
                    <td className="px-4 py-2.5"><Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge></td>
                  </tr>
                ))}
                {contractInvoices.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No invoices yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
