"use client";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, lifecycleTone } from "@/components/ui/Badge";
import Link from "next/link";
import type { customers } from "@/db/schema";

type Customer = typeof customers.$inferSelect;

export function CustomersTable({ rows }: { rows: Customer[] }) {
  const columns: Column<Customer>[] = [
    { key: "farmName", header: "Farm", sortable: true, accessor: (r) => r.farmName, render: (r) => <Link href={`/customers/${r.id}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.farmName}</Link> },
    { key: "location", header: "Location", sortable: true, accessor: (r) => r.location },
    { key: "cropType", header: "Crop", accessor: (r) => r.cropType },
    { key: "acres", header: "Acres", align: "right", sortable: true, accessor: (r) => r.acres },
    { key: "owner", header: "Owner", accessor: (r) => r.customerOwner },
    { key: "stage", header: "Lifecycle", sortable: true, accessor: (r) => r.lifecycleStage, render: (r) => <Badge tone={lifecycleTone(r.lifecycleStage)}>{r.lifecycleStage.replace(/_/g, " ")}</Badge> },
  ];

  return <DataTable columns={columns} rows={rows} filterPlaceholder="Search farms..." filterKeys={["farmName", "location", "customerOwner"]} exportFilename="synphony_customers" />;
}
