import { db } from "@/db/client";
import { invoices, contracts, customers } from "@/db/schema";
import { StatTile } from "@/components/ui/StatTile";
import { LinkButton } from "@/components/ui/form";
import { fmtCurrency } from "@/lib/finance/calculations";
import { getArAging } from "@/lib/finance/aggregate";
import { InvoicesTable, type InvoiceRow } from "./InvoicesTable";

export default async function InvoicesPage() {
  const [allInvoices, allContracts, allCustomers, arRows] = await Promise.all([
    db.select().from(invoices),
    db.select().from(contracts),
    db.select().from(customers),
    getArAging(),
  ]);

  const contractMap = new Map(allContracts.map((c) => [c.id, c]));
  const custMap = new Map(allCustomers.map((c) => [c.id, c.farmName]));
  const arByInvoiceId = new Map(arRows.map((r) => [r.invoiceId, r.bucket]));

  const rows: InvoiceRow[] = allInvoices
    .map((inv) => {
      const contract = contractMap.get(inv.contractId);
      return {
        id: inv.id,
        customerName: contract ? custMap.get(contract.customerId) ?? "Unknown" : "Unknown",
        contractId: inv.contractId,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        amount: inv.amount,
        amountPaid: inv.amountPaid,
        status: inv.status,
        agingBucket: arByInvoiceId.get(inv.id) ?? "current",
      };
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));

  const totalOutstanding = arRows.reduce((s, r) => s + r.outstanding, 0);
  const overdue = arRows.filter((r) => r.bucket !== "current");
  const totalPaid = allInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalInvoiced = allInvoices.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Billing &amp; Collections</h1>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Are we being paid correctly and on time?</p>
        </div>
        <LinkButton href="/invoices/new">+ New invoice</LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total invoiced" value={fmtCurrency(totalInvoiced)} />
        <StatTile label="Total collected" value={fmtCurrency(totalPaid)} />
        <StatTile label="Outstanding (AR)" value={fmtCurrency(totalOutstanding)} />
        <StatTile label="Overdue invoices" value={String(overdue.length)} tone={overdue.length > 0 ? "bad" : "good"} toneLabel={overdue.length > 0 ? fmtCurrency(overdue.reduce((s, r) => s + r.outstanding, 0)) : undefined} />
      </div>

      <InvoicesTable rows={rows} />
    </div>
  );
}
