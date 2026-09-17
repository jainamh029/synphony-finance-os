"use client";

import { useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, invoiceStatusTone } from "@/components/ui/Badge";
import { fmtCurrency } from "@/lib/finance/calculations";
import { recordPayment } from "@/lib/actions/invoices";
import Link from "next/link";

export interface InvoiceRow {
  id: string;
  customerName: string;
  contractId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  status: string;
  agingBucket: string;
}

function RecordPaymentButton({ invoiceId, outstanding }: { invoiceId: string; outstanding: number }) {
  const [open, setOpen] = useState(false);
  if (outstanding <= 0) return <span className="text-xs text-[var(--color-graphite-500)]">—</span>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--color-accent)] hover:underline">
        Record payment
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        await recordPayment(invoiceId, fd);
        setOpen(false);
      }}
      className="flex items-center gap-1"
    >
      <input name="paidDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-32 rounded border border-[var(--color-graphite-300)] px-1.5 py-1 text-xs" />
      <input name="amountPaid" type="number" step="0.01" required defaultValue={outstanding} className="w-24 rounded border border-[var(--color-graphite-300)] px-1.5 py-1 text-xs" />
      <button type="submit" className="rounded bg-[var(--color-navy-800)] px-2 py-1 text-xs font-medium text-white">Save</button>
    </form>
  );
}

export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const columns: Column<InvoiceRow>[] = [
    { key: "customerName", header: "Customer", sortable: true, accessor: (r) => r.customerName, render: (r) => <Link href={`/contracts/${r.contractId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.customerName}</Link> },
    { key: "invoiceNumber", header: "Invoice #", accessor: (r) => r.invoiceNumber },
    { key: "invoiceDate", header: "Invoice date", sortable: true, accessor: (r) => r.invoiceDate },
    { key: "dueDate", header: "Due date", sortable: true, accessor: (r) => r.dueDate },
    { key: "amount", header: "Amount", align: "right", sortable: true, accessor: (r) => r.amount, render: (r) => fmtCurrency(r.amount) },
    { key: "outstanding", header: "Outstanding", align: "right", sortable: true, accessor: (r) => r.amount - r.amountPaid, render: (r) => fmtCurrency(Math.max(0, r.amount - r.amountPaid)) },
    { key: "aging", header: "Aging", accessor: (r) => r.agingBucket, render: (r) => (r.status === "paid" || r.status === "void" ? <span className="text-xs text-[var(--color-graphite-500)]">—</span> : <Badge tone={r.agingBucket === "current" ? "good" : r.agingBucket === "1-30" ? "warn" : "bad"}>{r.agingBucket}</Badge>) },
    { key: "status", header: "Status", sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={invoiceStatusTone(r.status)}>{r.status}</Badge> },
    { key: "action", header: "", render: (r) => <RecordPaymentButton invoiceId={r.id} outstanding={Math.max(0, r.amount - r.amountPaid)} /> },
  ];
  return <DataTable columns={columns} rows={rows} filterPlaceholder="Search invoices..." filterKeys={["customerName", "invoiceNumber"]} exportFilename="synphony_invoices" />;
}
