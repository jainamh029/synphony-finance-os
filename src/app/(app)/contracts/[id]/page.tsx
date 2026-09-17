import { db } from "@/db/client";
import { contracts, customers, invoices, deployments, CONTRACT_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, invoiceStatusTone } from "@/components/ui/Badge";
import { LinkButton, Select } from "@/components/ui/form";
import { fmtCurrency, straightLineMonthlyRevenue, outstandingBalance } from "@/lib/finance/calculations";
import { updateContractStatus } from "@/lib/actions/contracts";
import Link from "next/link";

export default async function ContractDetailPage({ params }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!contract) notFound();
  const [customer] = await db.select().from(customers).where(eq(customers.id, contract.customerId));
  const contractInvoices = await db.select().from(invoices).where(eq(invoices.contractId, id));
  const linkedDeployments = await db.select().from(deployments).where(eq(deployments.contractId, id));

  const invoicedAmount = contractInvoices.reduce((s, i) => s + i.amount, 0);
  const cashCollected = contractInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const outstanding = contractInvoices.reduce((s, i) => s + outstandingBalance(i.amount, i.amountPaid), 0);
  const monthlyRevenue = straightLineMonthlyRevenue(contract.totalContractValue, contract.startDate, contract.endDate);

  async function changeStatus(formData: FormData) {
    "use server";
    const status = String(formData.get("status")) as (typeof CONTRACT_STATUSES)[number];
    await updateContractStatus(id, status);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-graphite-500)]">{contract.contractType.replace(/_/g, " ")}</p>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">
            <Link href={`/customers/${contract.customerId}`} className="hover:underline">{customer?.farmName}</Link>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">{contract.startDate} → {contract.endDate}</p>
        </div>
        <form action={changeStatus} className="flex items-center gap-2">
          <Select name="status" defaultValue={contract.status} className="text-xs">
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Update status</button>
        </form>
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
            <div><dt className="text-xs text-[var(--color-graphite-500)]">Payment terms</dt><dd>Net {contract.paymentTermsDays}</dd></div>
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
        <CardHeader title="Invoices" action={<LinkButton href={`/invoices/new?contractId=${id}`} variant="secondary">+ New invoice</LinkButton>} />
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
