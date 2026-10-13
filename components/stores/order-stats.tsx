"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMonth } from "@/lib/format";
import { ORDER_STATS_WINDOWS, percent, type Counted, type MonthlyOrders } from "@/lib/order-stats";

/**
 * Building blocks shared by the uniform and badge order stats pages, so the two
 * read as one system: a look-back toggle, a ranked bar list and a monthly chart.
 */

export function WindowToggle({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Time range"
      value={value}
      // Radix sends "" when the pressed item is clicked again; keep the current range.
      onValueChange={(v) => v && onChange(v)}
    >
      {ORDER_STATS_WINDOWS.map((w) => (
        <ToggleGroupItem key={w.id} value={w.id} className="px-3">
          {w.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Horizontal bars scaled to the biggest row — a plain list reads better than a chart for names. */
export function RankedBars({
  rows,
  empty = "Nothing to show yet.",
}: {
  rows: (Counted & { hint?: string })[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {r.count} · {percent(r.count, total)}%
            </span>
          </div>
          <div
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`${r.label}: ${r.count}`}
          >
            <div className="bg-primary h-full rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          {r.hint && <p className="text-muted-foreground text-xs">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

export function MonthlyOrdersCard({ data }: { data: MonthlyOrders[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders per month</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                minTickGap={24}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={28} />
              <Tooltip
                labelFormatter={(m) => formatMonth(String(m))}
                formatter={(v) => [v, "Orders"]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="orders" fill="var(--primary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
