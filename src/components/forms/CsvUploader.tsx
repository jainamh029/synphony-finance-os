"use client";

import { useState } from "react";
import type { ImportResult } from "@/lib/actions/dataEntry";

export function CsvUploader({ action, templateHref, label }: { action: (formData: FormData) => Promise<ImportResult>; templateHref: string; label: string }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-dashed border-[var(--color-graphite-300)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--color-graphite-900)]">{label}</p>
        <a href={templateHref} download className="text-xs font-medium text-[var(--color-accent)] hover:underline">Download CSV template</a>
      </div>
      <form
        action={async (fd) => {
          setBusy(true);
          const r = await action(fd);
          setResult(r);
          setBusy(false);
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input type="file" name="file" accept=".csv" required className="text-xs" />
        <button type="submit" disabled={busy} className="rounded-lg bg-[var(--color-navy-800)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {busy ? "Uploading..." : "Upload CSV"}
        </button>
      </form>
      {result && (
        <div className={`mt-3 rounded-lg p-3 text-xs ${result.errors.length > 0 ? "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)]" : "bg-[var(--color-good-bg)] text-[var(--color-good-text)]"}`}>
          <p className="font-medium">{result.inserted} row(s) imported{result.errors.length > 0 ? `, ${result.errors.length} error(s)` : ""}.</p>
          {result.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
    </div>
  );
}
