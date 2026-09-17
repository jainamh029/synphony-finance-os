"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

const DEMO_ACCOUNTS = [
  { role: "Admin / CEO", email: "ceo@synphony.demo" },
  { role: "Finance", email: "finance@synphony.demo" },
  { role: "Operations", email: "ops@synphony.demo" },
  { role: "Sales", email: "sales@synphony.demo" },
  { role: "Viewer / Board", email: "board@synphony.demo" },
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-navy-950)] px-4 py-12">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-[var(--color-navy-700)] bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-[var(--color-navy-900)] p-8 text-white md:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-graphite-300)]">Synphony</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">Deployment Finance OS</h1>
            <p className="mt-3 text-sm text-[var(--color-graphite-300)]">
              Finance and operations decision system for profitable agricultural-robotics deployments.
            </p>
          </div>
          <ul className="space-y-2 text-xs text-[var(--color-graphite-300)]">
            <li>— Deployment contribution margin &amp; payback</li>
            <li>— Fleet utilization, uptime &amp; cost per pound</li>
            <li>— Customer ROI &amp; pricing scenarios</li>
            <li>— 13-week cash forecast &amp; runway</li>
          </ul>
        </div>

        <div className="p-8">
          <h2 className="text-lg font-semibold text-[var(--color-graphite-900)]">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">Demo environment — illustrative data only.</p>

          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">Email</label>
              <input
                name="email"
                type="email"
                required
                defaultValue="ceo@synphony.demo"
                className="block w-full rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-graphite-700)]">Password</label>
              <input
                name="password"
                type="password"
                required
                defaultValue="synphony2026"
                className="block w-full rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {state?.error && <p className="text-sm text-[var(--color-bad-text)]">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-[var(--color-navy-800)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-navy-900)] disabled:opacity-50"
            >
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-[var(--color-graphite-100)] bg-[var(--color-paper)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-graphite-500)]">Demo accounts (password: synphony2026)</p>
            <ul className="space-y-1 text-xs text-[var(--color-graphite-700)]">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex justify-between">
                  <span>{a.role}</span>
                  <span className="font-mono">{a.email}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
