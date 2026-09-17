"use client";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, robotStatusTone } from "@/components/ui/Badge";
import { fmtCurrency, fmtPct, fmtNumber } from "@/lib/finance/calculations";
import Link from "next/link";
import type { RobotRollup } from "@/lib/finance/aggregate";

export function RobotsTable({ rows }: { rows: RobotRollup[] }) {
  const columns: Column<RobotRollup>[] = [
    { key: "code", header: "Robot", sortable: true, accessor: (r) => r.robotCode, render: (r) => <Link href={`/robots/${r.robotId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.robotCode}</Link> },
    { key: "model", header: "Model", accessor: (r) => r.model },
    { key: "status", header: "Status", sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={robotStatusTone(r.status)}>{r.status}</Badge> },
    { key: "utilization", header: "Utilization", align: "right", sortable: true, accessor: (r) => r.utilizationPct, render: (r) => fmtPct(r.utilizationPct) },
    { key: "uptime", header: "Uptime", align: "right", sortable: true, accessor: (r) => r.uptimePct, render: (r) => fmtPct(r.uptimePct) },
    { key: "revenuePerHour", header: "Revenue / hr", align: "right", sortable: true, accessor: (r) => r.revenuePerHour, render: (r) => (r.revenuePerHour !== null ? fmtCurrency(r.revenuePerHour, { decimals: 2 }) : "N/A") },
    { key: "cm", header: "Contribution margin", align: "right", sortable: true, accessor: (r) => r.contributionMarginTotal, render: (r) => fmtCurrency(r.contributionMarginTotal) },
    { key: "maintenance", header: "Maintenance/repair cost", align: "right", sortable: true, accessor: (r) => r.fleet.repairCost + r.fleet.sparePartsCost, render: (r) => fmtCurrency(r.fleet.repairCost + r.fleet.sparePartsCost) },
    { key: "intervention", header: "Intervention hrs", align: "right", sortable: true, accessor: (r) => r.interventionHoursTotal, render: (r) => fmtNumber(r.interventionHoursTotal, 1) },
  ];
  return <DataTable columns={columns} rows={rows.map((r) => ({ ...r, id: r.robotId }))} filterPlaceholder="Search robots..." filterKeys={["robotCode", "model", "status"]} exportFilename="synphony_fleet" />;
}
