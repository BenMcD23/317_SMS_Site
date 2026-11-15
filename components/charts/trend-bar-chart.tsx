"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * One series of bars over time: turnout per month, nights attended per year.
 * The attendance page, a cadet's or staff member's attendance card and the OC
 * dashboard each had their own copy of this chart; they share it so they keep
 * looking alike. Import it through `@/components/charts/lazy`, which keeps
 * Recharts out of the page's first download.
 *
 * One series means no legend: the heading above the chart names it.
 */
export type TrendBarChartProps<Row extends { label: string }> = {
  data: Row[];
  /** The numeric field each bar shows. */
  dataKey: keyof Row & string;
  /** What the tooltip calls the value ("Turnout", "Attended"). */
  name: string;
  /** The tooltip's text for one bar, e.g. "84% — 21 of 25". */
  describe: (row: Row) => string;
  height: number;
  /** A 0–100% axis, so charts of rates compare by eye. */
  percent?: boolean;
  barSize?: number;
  minTickGap?: number;
  /** Pulls the axis in on a phone; the tick labels are short. */
  marginLeft?: number;
};

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "13px",
};

export function TrendBarChart<Row extends { label: string }>({
  data,
  dataKey,
  name,
  describe,
  height,
  percent = false,
  barSize,
  minTickGap = 16,
  marginLeft = -16,
}: TrendBarChartProps<Row>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={barSize} margin={{ top: 4, right: 4, bottom: 0, left: marginLeft }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          interval="preserveStartEnd"
          minTickGap={minTickGap}
        />
        {percent ? (
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        ) : (
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        )}
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(_value, _name, item) => [describe(item?.payload as Row), name]}
        />
        <Bar dataKey={dataKey as string} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
