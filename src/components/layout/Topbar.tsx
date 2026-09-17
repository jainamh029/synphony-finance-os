import type { SessionUser } from "@/lib/auth/session";
import { logoutAction, refreshAlertsAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/Badge";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin / CEO",
  finance: "Finance",
  operations: "Operations",
  sales: "Sales",
  viewer: "Viewer / Board",
};

export function Topbar({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-graphite-100)] bg-white px-6 print:hidden">
      <div className="flex items-center gap-2">
        <Badge tone="warn" withDot={false}>DEMO DATA</Badge>
        <span className="text-xs text-[var(--color-graphite-500)]">Illustrative sample data — not real Synphony operating figures.</span>
      </div>
      <div className="flex items-center gap-4">
        <form action={refreshAlertsAction}>
          <button type="submit" className="text-xs font-medium text-[var(--color-graphite-500)] hover:text-[var(--color-navy-800)]">
            Refresh alerts
          </button>
        </form>
        <div className="text-right">
          <p className="text-sm font-medium text-[var(--color-graphite-900)]">{user.name}</p>
          <p className="text-xs text-[var(--color-graphite-500)]">{ROLE_LABEL[user.role]}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-1.5 text-xs font-medium text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
