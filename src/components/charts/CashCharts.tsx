"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

const NAVY = "#1e3350";
const GOOD = "#0f7a4d";
const BAD = "#b3261e";
const GRAPHITE = "#a7adb8";

export function WeeklyCashChart({ data }: { data: { weekStart: string; closingCash: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={NAVY} stopOpacity={0.35} />
            <stop offset="95%" stopColor={NAVY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" vertical={false} />
        <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} labelFormatter={(l) => `Week of ${l}`} />
        <ReferenceLine y={0} stroke={BAD} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="closingCash" name="Closing cash" stroke={NAVY} fill="url(#cashGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MonthlyCashFlowChart({ data }: { data: { month: string; collections: number; payroll: number; opex: number; capex: number; closingCash: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e9ee" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={1} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend />
        <Bar yAxisId="left" dataKey="collections" name="Collections" fill={GRAPHITE} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="left" dataKey="payroll" name="Payroll" fill={NAVY} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="left" dataKey="capex" name="Capex" fill={BAD} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="closingCash" name="Closing cash" stroke={GOOD} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
