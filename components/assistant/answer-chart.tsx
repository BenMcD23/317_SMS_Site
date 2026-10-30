"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CsvButton } from "@/components/stats/csv-button";
import {
  chartColours,
  chartRows,
  csvName,
  flightBarColours,
  formatChartValue,
  type AssistantChart,
} from "@/lib/assistant";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const AXIS = { tickLine: false, axisLine: false, stroke: "var(--muted-foreground)", fontSize: 11 } as const;

/**
 * One chart from an assistant answer: bar, line or pie, styled like the OC
 * dashboard's panels. The numbers are also there as a CSV and as the chart's
 * own accessible table, so nothing depends on telling colours apart.
 */
export function AnswerChart({ chart }: { chart: AssistantChart }) {
  const data = chartRows(chart);
  const colours = chartColours(chart);
  const barColours = flightBarColours(chart);
  const many = chart.series.length > 1;
  const fmt = (v: unknown) => formatChartValue(typeof v === "number" ? v : null, chart.unit);
  const tooltip = (
    <Tooltip
      contentStyle={TOOLTIP_STYLE}
      cursor={chart.type === "bar" ? { fill: "var(--muted)", opacity: 0.4 } : { stroke: "var(--border)" }}
      formatter={(value, name) => [fmt(value), name]}
    />
  );
  const legend = <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />;
  const common = { data, margin: { top: 4, right: 8, bottom: 0, left: -12 }, accessibilityLayer: true };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={8} />
      <YAxis
        {...AXIS}
        unit={chart.unit === "%" ? "%" : undefined}
        domain={chart.unit === "%" ? [0, 100] : [0, "auto"]}
      />
    </>
  );

  return (
    <figure className="flex flex-col gap-2 rounded-lg border p-3 sm:p-4">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{chart.title}</span>
        <CsvButton
          filename={csvName(chart.title)}
          label={`Download ${chart.title} as CSV`}
          rows={() =>
            data.map((row) =>
              Object.fromEntries([
                ["Label", row.label],
                ...chart.series.map((s, i) => [s.name, row[`s${i}`] ?? ""]),
              ])
            )
          }
        />
      </figcaption>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie" ? (
            <PieChart accessibilityLayer>
              {tooltip}
              {legend}
              <Pie
                data={data}
                dataKey="s0"
                nameKey="label"
                name={chart.series[0].name}
                innerRadius="45%"
                outerRadius="80%"
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((row, i) => (
                  <Cell key={String(row.label)} fill={colours[i]} />
                ))}
              </Pie>
            </PieChart>
          ) : chart.type === "line" ? (
            <LineChart {...common}>
              {axes}
              {tooltip}
              {many && legend}
              {chart.series.map((s, i) => (
                <Line
                  key={i}
                  dataKey={`s${i}`}
                  name={s.name}
                  stroke={colours[i]}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: colours[i] }}
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
              {many && legend}
              {chart.series.map((s, i) => (
                <Bar
                  key={i}
                  dataKey={`s${i}`}
                  name={s.name}
                  fill={colours[i]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={false}
                >
                  {barColours?.map((fill, j) => (
                    <Cell key={j} fill={fill} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
