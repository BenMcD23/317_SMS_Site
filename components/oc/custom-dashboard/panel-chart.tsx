"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  type Dataset,
  type QueryResult,
  type QuerySpec,
  type Viz,
  formatValue,
  toChartData,
} from "@/lib/custom-dashboard";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const AXIS = { tickLine: false, axisLine: false, stroke: "var(--muted-foreground)", fontSize: 11 } as const;

/**
 * A custom dashboard panel drawn as a line or bar chart. Split from
 * `PanelView` (which also draws numbers and tables) so Recharts loads only
 * when a panel is a chart; import it through `@/components/charts/lazy`.
 */
export function PanelChart({
  data,
  query,
  viz,
  dataset,
  note,
}: {
  data: QueryResult;
  query: QuerySpec;
  viz: Viz;
  dataset: Dataset;
  note: React.ReactNode;
}) {
  const chart = toChartData(data.rows, query, dataset);
  const many = chart.series.length > 1;
  const yUnit = data.unit === "%" ? "%" : undefined;
  const tooltip = (
    <Tooltip
      contentStyle={TOOLTIP_STYLE}
      cursor={viz === "bar" ? { fill: "var(--muted)", opacity: 0.4 } : { stroke: "var(--border)" }}
      formatter={(value, name) => [formatValue(typeof value === "number" ? value : null, data.unit), name]}
    />
  );
  const common = {
    data: chart.data,
    margin: { top: 4, right: 8, bottom: 0, left: -12 },
    accessibilityLayer: true,
  };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis dataKey="x" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
      <YAxis {...AXIS} unit={yUnit} domain={yUnit ? [0, 100] : [0, "auto"]} allowDecimals={false} />
    </>
  );
  // A legend only when there's more than one series: one series is named by the panel title.
  const legend = many ? <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} /> : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-32 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {viz === "line" ? (
            <LineChart {...common}>
              {axes}
              {tooltip}
              {legend}
              {chart.series.map((s) => (
                <Line
                  key={s.id}
                  dataKey={s.id}
                  name={s.label}
                  stroke={s.colour}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: s.colour }}
                  activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart {...common} barGap={2}>
              {axes}
              {tooltip}
              {legend}
              {chart.series.map((s) => (
                <Bar
                  key={s.id}
                  dataKey={s.id}
                  name={s.label}
                  fill={s.colour}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {chart.hidden > 0 && (
        <p className="text-muted-foreground pt-1 text-xs">
          {chart.hidden} more not shown. Switch to a table to see them all.
        </p>
      )}
      {note}
    </div>
  );
}
