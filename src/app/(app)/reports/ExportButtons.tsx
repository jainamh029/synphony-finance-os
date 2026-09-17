"use client";

import { getExportTable } from "@/lib/actions/exports";
import { downloadCsv } from "@/lib/csv/exportClient";

const TABLES: { key: Parameters<typeof getExportTable>[0]; label: string }[] = [
  { key: "customers", label: "Customers" },
  { key: "contracts", label: "Contracts" },
  { key: "invoices", label: "Invoices" },
  { key: "deployments", label: "Deployments" },
  { key: "robots", label: "Robots" },
  { key: "costs", label: "Costs" },
  { key: "laborLogs", label: "Labor logs" },
  { key: "robotMetrics", label: "Robot metrics" },
];

export function ExportButtons() {
  async function exportOne(key: Parameters<typeof getExportTable>[0], label: string) {
    const rows = await getExportTable(key);
    downloadCsv(`synphony_${key}`, rows as Record<string, unknown>[]);
  }

  async function exportAll() {
    for (const t of TABLES) {
      await exportOne(t.key, t.label);
      await new Promise((r) => setTimeout(r, 150)); // stagger downloads
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={exportAll} className="rounded-lg bg-[var(--color-navy-800)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-navy-900)]">
        Download all data (CSV bundle)
      </button>
      <div className="flex flex-wrap gap-2">
        {TABLES.map((t) => (
          <button
            key={t.key}
            onClick={() => exportOne(t.key, t.label)}
            className="rounded-lg border border-[var(--color-graphite-300)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
