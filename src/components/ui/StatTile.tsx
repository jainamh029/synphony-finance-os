import { Badge } from "./Badge";

type Tone = "good" | "warn" | "bad" | "neutral" | "info";

export function StatTile({
  label,
  value,
  helpText,
  tone,
  toneLabel,
  definition,
}: {
  label: string;
  value: string;
  helpText?: string;
  tone?: Tone;
  toneLabel?: string;
  definition?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-graphite-100)] bg-white p-4 shadow-sm" title={definition}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-graphite-500)]">{label}</p>
        {tone && toneLabel && <Badge tone={tone}>{toneLabel}</Badge>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--color-navy-900)]">{value}</p>
      {helpText && <p className="mt-1 text-xs text-[var(--color-graphite-500)]">{helpText}</p>}
    </div>
  );
}
