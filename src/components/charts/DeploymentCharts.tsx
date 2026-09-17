"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#1e3350";
const GRAPHITE = "#a7adb8";
const BAD = "#b3261e";
const GOOD = "#0f7a4d";

export function CostBreakdownChart({ data }: { data: { category: string; planned: number; actual: number }[] }) {
  const labeled = data.map((d) => ({ ...d, categoryLabel: d.category.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, labeled.length * 32)}>
      <BarChart data={labeled} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="categoryLabel" tick={{ fontSize: 11 }} width={140} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend />
        <Bar dataKey="planned" name="Planned" fill={GRAPHITE} radius={[0, 4, 4, 0]} />
        <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]}>
          {labeled.map((d, i) => (
            <Cell key={i} fill={d.actual > d.planned && d.planned > 0 ? BAD : NAVY} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyTrendChart({ data }: { data: { month: string; revenue: number; cost: number; contributionMargin: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend />
        <Bar dataKey="revenue" name="Revenue" fill={GRAPHITE} radius={[4, 4, 0, 0]} />
        <Bar dataKey="cost" name="Direct cost" fill={NAVY} radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="contributionMargin" name="Contribution margin" stroke={GOOD} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
