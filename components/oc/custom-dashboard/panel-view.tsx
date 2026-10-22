"use client";

import { useSession } from "next-auth/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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

import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import {
  type Dataset,
  type QueryResult,
  type QuerySpec,
  type Viz,
  fieldOf,
  formatValue,
  keyLabel,
  toChartData,
} from "@/lib/custom-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const AXIS = { tickLine: false, axisLine: false, stroke: "var(--muted-foreground)", fontSize: 11 } as const;

/**
 * Runs one panel's query. Keyed on the spec and the dashboard's range, so two
 * panels asking the same question share one request, and editing a panel
 * back to what it was is instant.
 */
export function usePanelQuery(query: QuerySpec, rangeDays: number | null, enabled = true) {
  const { data: session } = useSession();
  const token = session?.id_token;
  return useQuery<QueryResult, Error>({
    queryKey: ["oc-custom-query", query, rangeDays],
    queryFn: () =>
      apiRequest<QueryResult>(
        token!,
        `${API_BASE}/oc/custom-dashboard/query`,
        { method: "POST", body: { query, range_days: rangeDays } },
        "Couldn't run this panel's query."
      ),
    enabled: !!token && enabled,
    // Keep the old numbers on screen while a changed range or edit loads.
    placeholderData: keepPreviousData,
    // A bad query (a field the API has since dropped) won't fix itself.
    retry: false,
  });
}

/**
 * What a panel shows: the chart, number or table for its query, with its own
 * loading, empty and error states so one broken panel never takes the
 * dashboard down. Used by the dashboard and by the editor's live preview.
 */
export function PanelView({
  query,
  viz,
  dataset,
  rangeDays,
}: {
  query: QuerySpec;
  viz: Viz;
  dataset: Dataset | undefined;
  rangeDays: number | null;
}) {
  const { data, error, isLoading } = usePanelQuery(query, rangeDays, !!dataset);

  if (!dataset)
    return (
      <PanelMessage>This panel&apos;s dataset is no longer available. Edit it to pick another.</PanelMessage>
    );
  if (error) return <PanelMessage tone="error">{error.message}</PanelMessage>;
  if (isLoading || !data) return <Skeleton className="h-full min-h-16 w-full" />;
  if (data.rows.length === 0) return <PanelMessage>No data for this range.</PanelMessage>;

  const note = data.truncated ? (
    <p className="text-muted-foreground pt-1 text-xs">
      Showing the first {data.rows.length}. Add a filter to narrow it.
    </p>
  ) : null;

  // A query with no grouping is one number, whatever chart was picked.
  if (query.group_by.length === 0) return <BigNumber>{formatValue(data.rows[0].value, data.unit)}</BigNumber>;

  if (viz === "stat") {
    // A grouped query shown as a number: the biggest group, named.
    const top = [...data.rows].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    const [g] = query.group_by;
    return (
      <div className="flex flex-col gap-1">
        <BigNumber>{formatValue(top.value, data.unit)}</BigNumber>
        <p className="text-muted-foreground text-sm">
          Highest: {keyLabel(top.keys[0] ?? null, fieldOf(dataset, g.field), g.grain)}
        </p>
      </div>
    );
  }

  if (viz === "table") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {query.group_by.map((g) => (
                  <TableHead key={g.field}>{fieldOf(dataset, g.field)?.label ?? g.field}</TableHead>
                ))}
                <TableHead className="text-right">
                  {dataset.measures.find((m) => m.key === query.measure)?.label ?? "Value"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={i}>
                  {query.group_by.map((g, j) => (
                    <TableCell key={g.field}>
                      {keyLabel(r.keys[j] ?? null, fieldOf(dataset, g.field), g.grain)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{formatValue(r.value, data.unit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {note}
      </div>
    );
  }

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

function BigNumber({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums sm:text-4xl">{children}</p>
  );
}

function PanelMessage({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <p
      className={tone === "error" ? "text-destructive text-sm" : "text-muted-foreground text-sm"}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}
