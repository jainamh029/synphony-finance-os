"use client";

import { useActionState, useState } from "react";
import { Select, TextArea, Input } from "@/components/ui/form";

export interface InvestmentCaseDecisionState {
  error?: string;
}

const DECISIONS = [
  { value: "approved", label: "Approve" },
  { value: "needs_repricing", label: "Needs repricing" },
  { value: "needs_revision", label: "Needs revision" },
  { value: "deferred", label: "Defer" },
  { value: "rejected", label: "Reject" },
] as const;

export function InvestmentCaseDecisionForm({
  action,
}: {
  action: (prevState: InvestmentCaseDecisionState | null, formData: FormData) => Promise<InvestmentCaseDecisionState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  // Controlled, not uncontrolled defaultValue: React resets uncontrolled fields after any
  // action call that resolves without throwing, and decideCase() below deliberately catches
  // errors (e.g. "override reason required") into a returned {error} instead of throwing —
  // an uncontrolled form would wipe the decision note right when the user needs to fix one
  // field and resubmit, not retype everything.
  const [decision, setDecision] = useState<string>("approved");
  const [overrideReason, setOverrideReason] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-[var(--color-graphite-200)] bg-[var(--color-paper)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Finance decision</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">Decision</label>
          <Select name="decision" required value={decision} onChange={(e) => setDecision(e.target.value)}>
            {DECISIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">Override reason</label>
          <Input name="overrideReason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Required only to approve despite a failed threshold" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">Decision note</label>
        <TextArea name="decisionNote" rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Context for this decision (kept in version history)" />
      </div>
      {state?.error && <p className="text-sm text-[var(--color-bad-text)]">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm("Record this finance decision? Approving freezes this investment case version permanently — a new deployment budget or repricing creates a new version instead.")) {
            e.preventDefault();
          }
        }}
        className="rounded-lg bg-[var(--color-navy-800)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-navy-900)] disabled:opacity-50"
      >
        {pending ? "Saving..." : "Record decision"}
      </button>
    </form>
  );
}
