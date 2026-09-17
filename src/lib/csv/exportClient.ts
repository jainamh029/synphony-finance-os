"use client";

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    alert("No rows to export.");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
