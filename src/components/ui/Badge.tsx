type Tone = "good" | "warn" | "bad" | "neutral" | "info";

const toneClasses: Record<Tone, string> = {
  good: "bg-[var(--color-good-bg)] text-[var(--color-good-text)] border-[var(--color-good-border)]",
  warn: "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[var(--color-warn-border)]",
  bad: "bg-[var(--color-bad-bg)] text-[var(--color-bad-text)] border-[var(--color-bad-border)]",
  neutral: "bg-[var(--color-graphite-100)] text-[var(--color-graphite-700)] border-[var(--color-graphite-300)]",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

const dotClasses: Record<Tone, string> = {
  good: "bg-[var(--color-good-text)]",
  warn: "bg-[var(--color-warn-text)]",
  bad: "bg-[var(--color-bad-text)]",
  neutral: "bg-[var(--color-graphite-500)]",
  info: "bg-blue-600",
};

export function Badge({ tone = "neutral", children, withDot = true }: { tone?: Tone; children: React.ReactNode; withDot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
      {withDot && <span className={`status-dot ${dotClasses[tone]}`} />}
      {children}
    </span>
  );
}

export function severityTone(severity: string): Tone {
  if (severity === "critical") return "bad";
  if (severity === "high") return "bad";
  if (severity === "medium") return "warn";
  return "neutral";
}

export function lifecycleTone(stage: string): Tone {
  if (["active", "renewal"].includes(stage)) return "good";
  if (["paused", "churned"].includes(stage)) return "bad";
  if (["contracted", "deploying", "pilot"].includes(stage)) return "info";
  return "neutral";
}

export function deploymentStatusTone(status: string): Tone {
  if (status === "active") return "good";
  if (status === "at_risk" || status === "paused") return "bad";
  if (["planned", "financial_review", "approved", "deploying"].includes(status)) return "info";
  return "neutral";
}

export function invoiceStatusTone(status: string): Tone {
  if (status === "paid") return "good";
  if (status === "overdue") return "bad";
  if (status === "partial") return "warn";
  return "neutral";
}

export function robotStatusTone(status: string): Tone {
  if (["operating", "available"].includes(status)) return "good";
  if (["repair", "retired"].includes(status)) return "bad";
  if (status === "maintenance") return "warn";
  return "neutral";
}
