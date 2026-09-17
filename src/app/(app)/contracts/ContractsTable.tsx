"use client";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { fmtCurrency } from "@/lib/finance/calculations";
import Link from "next/link";

export interface ContractRow {
  id: string;
  customerName: string;
  contractType: string;
  startDate: string;
  endDate: string;
  totalContractValue: number;
  robotsCommitted: number;
  status: string;
}

export function ContractsTable({ rows }: { rows: ContractRow[] }) {
  const columns: Column<ContractRow>[] = [
    { key: "customerName", header: "Customer", sortable: true, accessor: (r) => r.customerName, render: (r) => <Link href={`/contracts/${r.id}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.customerName}</Link> },
    { key: "contractType", header: "Type", sortable: true, accessor: (r) => r.contractType, render: (r) => r.contractType.replace(/_/g, " ") },
    { key: "term", header: "Term", accessor: (r) => `${r.startDate} → ${r.endDate}` },
    { key: "value", header: "Value", align: "right", sortable: true, accessor: (r) => r.totalContractValue, render: (r) => fmtCurrency(r.totalContractValue) },
    { key: "robots", header: "Robots", align: "right", sortable: true, accessor: (r) => r.robotsCommitted },
    { key: "status", header: "Status", sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={r.status === "active" ? "good" : r.status === "terminated" ? "bad" : r.status === "renewed" ? "info" : "neutral"}>{r.status}</Badge> },
  ];
  return <DataTable columns={columns} rows={rows} filterPlaceholder="Search contracts..." filterKeys={["customerName", "contractType"]} exportFilename="synphony_contracts" />;
}
