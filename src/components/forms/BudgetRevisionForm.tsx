"use client";

import { useActionState, useState } from "react";
import { TextArea } from "@/components/ui/form";

export interface BudgetRevisionFormState {
  ok: boolean;
  error?: string;
  version?: number;
  variancePct?: number | null;
}

export function BudgetRevisionForm({
  action,
  categories,
  current,
}: {
  action: (prevState: BudgetRevisionFormState | null, formData: FormData) => Promise<BudgetRevisionFormState>;
  categories: readonly string[];
  current: Record<string, { amount: number; upfront: boolean }>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  // React resets uncontrolled form fields after ANY action call that resolves without
  // throwing — including our validation-failure case below, which returns {ok:false} rather
  // than throwing (that's what lets us show the error inline instead of an error boundary).
  // From React's point of view that's still a "successful" submission, so an uncontrolled
  // form would silently wipe the amount the user just typed right when they need it most:
  // right after being told to add a change reason and resubmit. Controlled state avoids that.
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c, current[c]?.amount ? String(current[c].amount) : ""]))
  );
  const [upfront, setUpfront] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.map((c) => [c, current[c]?.upfront ?? false]))
  );
  const [changeReason, setChangeReason] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <div className="table-scroll">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-graphite-100)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right">Amount ($)</th>
              <th className="px-3 py-2 text-center">Upfront</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat} className="border-b border-[var(--color-graphite-100)] last:border-0">
                <td className="px-3 py-2 capitalize">{cat.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`budget_${cat}`}
                    value={amounts[cat] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [cat]: e.target.value }))}
                    className="w-32 rounded-lg border border-[var(--color-graphite-300)] px-2 py-1 text-right text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    name={`upfront_${cat}`}
                    checked={upfront[cat] ?? false}
                    onChange={(e) => setUpfront((u) => ({ ...u, [cat]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">
          Change reason <span className="font-normal text-[var(--color-graphite-500)]">(required if the new total differs from the current approved total by more than 10%)</span>
        </label>
        <TextArea name="changeReason" rows={2} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Why is this budget changing?" />
      </div>
      {state?.error && <p className="text-sm text-[var(--color-bad-text)]">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-[var(--color-good-text)]">
          Saved as draft budget version {state.version}. It won&apos;t affect the P&amp;L until approved below.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--color-navy-800)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-navy-900)] disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save as new draft version"}
      </button>
    </form>
  );
}
