"use client";

import { useMemo, useState } from "react";
import { Badge, severityTone } from "@/components/ui/Badge";
import { fmtCurrency } from "@/lib/finance/calculations";
import { updateAlertStatus } from "@/lib/actions/alerts";
import Link from "next/link";

export interface AlertRow {
  id: string;
  alertType: string;
  severity: "critical" | "high" | "medium" | "low";
  module: string;
  title: string;
  description: string;
  recommendedAction: string;
  estimatedImpact: number | null;
  owner: string | null;
  status: string;
  triggeredAt: string;
  deploymentId: string | null;
  customerId: string | null;
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function AlertCard({ alert }: { alert: AlertRow }) {
  const [expanded, setExpanded] = useState(false);
  const isOpenState = ["open", "acknowledged", "in_progress"].includes(alert.status);

  return (
    <div className={`rounded-xl border p-4 ${isOpenState ? "border-[var(--color-graphite-100)] bg-white" : "border-[var(--color-graphite-100)] bg-[var(--color-paper)] opacity-70"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
            <Badge tone="neutral" withDot={false}>{alert.module}</Badge>
            <p className="text-sm font-semibold text-[var(--color-graphite-900)]">{alert.title}</p>
          </div>
          <p className="mt-1.5 text-sm text-[var(--color-graphite-700)]">{alert.description}</p>
          <p className="mt-1 text-xs font-medium text-[var(--color-navy-800)]">→ {alert.recommendedAction}</p>
          {alert.deploymentId && (
            <Link href={`/deployments/${alert.deploymentId}`} className="mt-1 inline-block text-xs text-[var(--color-accent)] hover:underline">
              View deployment
            </Link>
          )}
        </div>
        <div className="shrink-0 text-right">
          {alert.estimatedImpact ? <p className="text-sm font-semibold tabular-nums">{fmtCurrency(alert.estimatedImpact)}</p> : null}
          <p className="mt-1 text-xs text-[var(--color-graphite-500)]">{alert.owner ?? "Unassigned"}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-graphite-100)] pt-3">
        <button onClick={() => setExpanded(!expanded)} className="text-xs font-medium text-[var(--color-graphite-500)] hover:text-[var(--color-navy-800)]">
          {expanded ? "Hide actions" : "Manage"}
        </button>
        <span className="text-xs text-[var(--color-graphite-300)]">·</span>
        <span className="text-xs capitalize text-[var(--color-graphite-500)]">{alert.status.replace(/_/g, " ")}</span>
      </div>

      {expanded && (
        <form
          action={async (fd) => { await updateAlertStatus(alert.id, fd); }}
          className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-[var(--color-paper)] p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input name="owner" placeholder="Assign owner" defaultValue={alert.owner ?? ""} className="rounded border border-[var(--color-graphite-300)] px-2 py-1.5 text-xs" />
          <select name="status" defaultValue={alert.status} className="rounded border border-[var(--color-graphite-300)] px-2 py-1.5 text-xs">
            {["open", "acknowledged", "in_progress", "resolved", "dismissed"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button type="submit" className="rounded bg-[var(--color-navy-800)] px-3 py-1.5 text-xs font-medium text-white">Save</button>
          <textarea name="resolutionNote" placeholder="Resolution note (optional)" defaultValue="" rows={2} className="sm:col-span-3 rounded border border-[var(--color-graphite-300)] px-2 py-1.5 text-xs" />
        </form>
      )}
    </div>
  );
}

export function AlertsQueue({ alerts }: { alerts: AlertRow[] }) {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const filtered = useMemo(() => {
    return alerts
      .filter((a) => severityFilter === "all" || a.severity === severityFilter)
      .filter((a) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "open") return ["open", "acknowledged", "in_progress"].includes(a.status);
        return a.status === statusFilter;
      })
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0);
      });
  }, [alerts, severityFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-lg border border-[var(--color-graphite-300)] px-2.5 py-1.5 text-xs">
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-[var(--color-graphite-300)] px-2.5 py-1.5 text-xs">
          <option value="open">Open (incl. acknowledged / in progress)</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
        <span className="text-xs text-[var(--color-graphite-500)]">{filtered.length} alerts</span>
      </div>
      <div className="space-y-3">
        {filtered.map((a) => <AlertCard key={a.id} alert={a} />)}
        {filtered.length === 0 && <p className="rounded-xl border border-[var(--color-graphite-100)] bg-white p-8 text-center text-sm text-[var(--color-graphite-500)]">No alerts match this filter.</p>}
      </div>
    </div>
  );
}
