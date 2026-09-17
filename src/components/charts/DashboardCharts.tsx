"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#1e3350";
const GOOD = "#0f7a4d";
const WARN = "#c58a00";
const BAD = "#b3261e";
const GRAPHITE = "#a7adb8";

export function MarginByCustomerChart({ data }: { data: { customerName: string; contractValue: number; contributionMargin: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" vertical={false} />
        <XAxis dataKey="customerName" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend />
        <Bar dataKey="contractValue" name="Contract value" fill={GRAPHITE} radius={[4, 4, 0, 0]} />
        <Bar dataKey="contributionMargin" name="Contribution margin" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.contributionMargin < 0 ? BAD : NAVY} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ArAgingChart({ data }: { data: { bucket: string; outstanding: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Bar dataKey="outstanding" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.bucket === "current" ? GOOD : d.bucket === "1-30" ? WARN : BAD} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FleetStatusChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const nonZero = data.filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={nonZero} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
          {nonZero.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, dataKey, xKey, color = NAVY, valuePrefix = "" }: { data: Record<string, unknown>[]; dataKey: string; xKey: string; color?: string; valuePrefix?: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => `${valuePrefix}${Number(v).toLocaleString()}`} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
