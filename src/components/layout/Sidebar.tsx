"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_SECTIONS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Executive Command Center" }],
  },
  {
    label: "Commercial",
    items: [
      { href: "/customers", label: "Customers & Farms" },
      { href: "/contracts", label: "Contracts" },
      { href: "/invoices", label: "Billing & Collections" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/deployments", label: "Deployments (P&L)" },
      { href: "/robots", label: "Fleet Economics" },
      { href: "/data-entry", label: "Weekly Data Entry" },
    ],
  },
  {
    label: "Decisions",
    items: [
      { href: "/pricing-lab", label: "Pricing & ROI Lab" },
      { href: "/cash-forecast", label: "Cash & Capex Planner" },
      { href: "/alerts", label: "Alerts & Actions" },
    ],
  },
  {
    label: "Reporting",
    items: [{ href: "/reports", label: "Reports & Exports" }],
  },
];

export function Sidebar({ openAlertCount }: { openAlertCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col bg-[var(--color-navy-950)] text-white print:hidden">
      <div className="px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-graphite-300)]">Synphony</p>
        <p className="text-sm font-semibold text-white">Deployment Finance OS</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-graphite-300)]/70">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                        active ? "bg-[var(--color-navy-700)] text-white font-medium" : "text-[var(--color-graphite-300)] hover:bg-[var(--color-navy-800)] hover:text-white"
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.href === "/alerts" && openAlertCount > 0 && (
                        <span className="rounded-full bg-[var(--color-bad-text)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {openAlertCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--color-navy-700)] px-4 py-3">
        <p className="text-[10px] leading-snug text-[var(--color-graphite-300)]/70">
          All customer, contract, and cost data in this environment is DEMO / ILLUSTRATIVE. Replace via CSV import — see Reports.
        </p>
      </div>
    </nav>
  );
}
