"use client";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <div className="print:hidden">
      <button onClick={() => window.print()} className="rounded-lg bg-[var(--color-navy-800)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-navy-900)]">
        {label}
      </button>
    </div>
  );
}
