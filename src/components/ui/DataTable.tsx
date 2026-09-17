"use client";

import { useMemo, useState } from "react";
import { Input } from "./form";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => string | number | null;
  align?: "left" | "right";
  sortable?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  filterPlaceholder = "Filter...",
  filterKeys,
  exportFilename,
  emptyMessage = "No records yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  filterPlaceholder?: string;
  filterKeys?: (keyof T)[];
  exportFilename?: string;
  emptyMessage?: string;
}) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) => {
      const haystack = filterKeys && filterKeys.length > 0
        ? filterKeys.map((k) => String(row[k] ?? "")).join(" ")
        : Object.values(row as Record<string, unknown>).map((v) => String(v ?? "")).join(" ");
      return haystack.toLowerCase().includes(q);
    });
  }, [rows, filter, filterKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.accessor) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(col: Column<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  function exportCsv() {
    const headers = columns.map((c) => c.header);
    const lines = [headers.join(",")];
    for (const row of sorted) {
      const cells = columns.map((c) => {
        const raw = c.accessor ? c.accessor(row) : "";
        const s = raw === null || raw === undefined ? "" : String(raw);
        return `"${s.replace(/"/g, '""')}"`;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="w-64">
          <Input placeholder={filterPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {exportFilename && (
          <button
            onClick={exportCsv}
            className="rounded-lg border border-[var(--color-graphite-300)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
          >
            Export CSV
          </button>
        )}
      </div>
      <div className="table-scroll rounded-lg border border-[var(--color-graphite-100)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col)}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-graphite-500)] ${col.align === "right" ? "text-right" : "text-left"} ${col.sortable ? "cursor-pointer select-none hover:text-[var(--color-graphite-900)]" : ""}`}
                >
                  {col.header}
                  {sortKey === col.key && (sortDir === "asc" ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-[var(--color-graphite-500)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-graphite-100)] last:border-0 hover:bg-[var(--color-paper)]">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-3 py-2.5 text-[var(--color-graphite-900)] ${col.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                      {col.render ? col.render(row) : String(col.accessor?.(row) ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
