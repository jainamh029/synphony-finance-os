"use client";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, deploymentStatusTone } from "@/components/ui/Badge";
import { fmtCurrency, fmtPct, fmtMonths } from "@/lib/finance/calculations";
import Link from "next/link";
import type { DeploymentRollup } from "@/lib/finance/aggregate";

export function DeploymentsTable({ rows }: { rows: DeploymentRollup[] }) {
  const columns: Column<DeploymentRollup>[] = [
    { key: "name", header: "Deployment", sortable: true, accessor: (r) => r.deploymentName, render: (r) => <Link href={`/deployments/${r.deploymentId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.deploymentName}</Link> },
    { key: "customer", header: "Customer", sortable: true, accessor: (r) => r.customerName },
    { key: "status", header: "Status", sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={deploymentStatusTone(r.status)}>{r.status.replace(/_/g, " ")}</Badge> },
    { key: "robots", header: "Robots", align: "right", sortable: true, accessor: (r) => r.robotsAssigned },
    { key: "revenue", header: "Recognized revenue", align: "right", sortable: true, accessor: (r) => r.recognizedRevenueToDate, render: (r) => fmtCurrency(r.recognizedRevenueToDate) },
    { key: "cm", header: "Contribution margin %", align: "right", sortable: true, accessor: (r) => r.contributionMarginPctActual, render: (r) => fmtPct(r.contributionMarginPctActual) },
    { key: "utilization", header: "Utilization", align: "right", sortable: true, accessor: (r) => r.utilizationActualPct, render: (r) => fmtPct(r.utilizationActualPct) },
    { key: "uptime", header: "Uptime", align: "right", sortable: true, accessor: (r) => r.uptimeActualPct, render: (r) => fmtPct(r.uptimeActualPct) },
    { key: "payback", header: "Payback", align: "right", sortable: true, accessor: (r) => r.expectedPaybackMonths, render: (r) => fmtMonths(r.expectedPaybackMonths) },
  ];
  return <DataTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.deploymentId }))} filterPlaceholder="Search deployments..." filterKeys={["deploymentName", "customerName"]} exportFilename="synphony_deployments" />;
}
