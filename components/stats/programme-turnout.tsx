"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarRange } from "lucide-react";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { SectionHeading } from "@/components/section-heading";
import { CsvButton } from "@/components/stats/csv-button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatShortDate } from "@/lib/format";
import {
  kindsByTurnout,
  overallRate,
  sessionLines,
  type ProgrammeActivity,
  type ProgrammeNightTurnout,
  type ProgrammeStats,
} from "@/lib/programme";
import { rangeQuery, type TimeRange } from "@/lib/stats";
import { useApiQuery } from "@/lib/use-api-query";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const AXIS = { tickLine: false, axisLine: false, stroke: "var(--muted-foreground)", fontSize: 11 } as const;
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);

const col = dataTableColumns<ProgrammeActivity>();
const activityColumns = col.columns([
  col.accessor("name", {
    header: "Activity",
    sortFn: "text",
    // Table cells don't wrap by default; a long name would push Turnout off a phone.
    cell: ({ getValue }) => <span className="whitespace-normal">{getValue()}</span>,
  }),
  col.accessor("label", {
    header: "Kind",
    sortFn: "text",
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
  }),
  col.accessor("times", { header: "Nights", sortFn: "basic" }),
  col.accessor((a) => a.rate ?? -1, {
    id: "rate",
    header: "Turnout",
    sortFn: "basic",
    cell: ({ row }) => <span className="tabular-nums">{pct(row.original.rate)}</span>,
  }),
]);

/**
 * The stats page's programme section: turnout set against what the
 * programme said each flight was doing, from /programme/stats. Answers
 * "do cadets skip certain nights?" by kind of night, by activity, and night
 * by night. It follows the page's time range; the flight filter doesn't
 * apply, as each flight's turnout is already counted against its own
 * sessions.
 */
export function ProgrammeTurnout({ range }: { range: TimeRange }) {
  const query = rangeQuery(range, "days=1095");
  const { data, error, isLoading } = useApiQuery<ProgrammeStats>(
    ["programme", "stats", query],
    `/programme/stats?${query}`
  );

  return (
    <section className="flex flex-col gap-3" aria-label="Turnout by programme">
      <SectionHeading
        title="Turnout by programme"
        description="Who was there against what the programme said each flight was doing. A night where a flight was split between two activities counts towards the night but neither activity."
      />
      {error ? (
        <ErrorAlert title="Couldn't load the programme turnout" message={error.message} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : data.nights.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No programme for this period"
          description="Nights appear here once the month's programme is imported (on the Programme page, or each Sunday evening) and the register is in."
        />
      ) : (
        <ProgrammeCharts stats={data} />
      )}
    </section>
  );
}

function ProgrammeCharts({ stats }: { stats: ProgrammeStats }) {
  const kinds = kindsByTurnout(stats.categories);
  const overall = overallRate(stats.nights);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By kind of night</CardTitle>
            <CardDescription>
              Lowest first. The line is turnout across every night ({pct(overall)}).
            </CardDescription>
            <CardAction>
              <CsvButton
                filename="turnout-by-kind-of-night.csv"
                label="Download turnout by kind of night as CSV"
                rows={() =>
                  kinds.map((k) => ({
                    kind: k.label,
                    nights: k.nights,
                    "turnout %": k.rate,
                    "authorised absence %": k.authorised_rate,
                  }))
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(160, kinds.length * 34 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={kinds}
                  layout="vertical"
                  margin={{ top: 4, right: 40, bottom: 0, left: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS} />
                  <YAxis type="category" dataKey="label" width={150} {...AXIS} interval={0} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    formatter={(v, _n, item) => [
                      `${pct(typeof v === "number" ? v : null)} over ${item.payload.nights} night${
                        item.payload.nights === 1 ? "" : "s"
                      }`,
                      "Turnout",
                    ]}
                  />
                  {overall !== null && (
                    <ReferenceLine x={overall} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                  )}
                  <Bar
                    dataKey="rate"
                    name="Turnout"
                    fill="var(--chart-1)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="rate"
                      position="right"
                      formatter={(v: unknown) => pct(typeof v === "number" ? v : null)}
                      style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Night by night</CardTitle>
            <CardDescription>Turnout each parade night; hover or tap a point for what ran.</CardDescription>
            <CardAction>
              <CsvButton
                filename="turnout-by-night.csv"
                label="Download turnout by night as CSV"
                rows={() =>
                  stats.nights.map((n) => ({
                    date: n.date,
                    "turnout %": n.rate,
                    present: n.present,
                    registered: n.total,
                    programme: sessionLines(n.sessions).join("; "),
                  }))
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={stats.nights}
                  margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => formatShortDate(d)}
                    interval="preserveStartEnd"
                    minTickGap={16}
                    {...AXIS}
                  />
                  <YAxis domain={[0, 100]} unit="%" {...AXIS} />
                  <Tooltip content={<NightTooltip />} />
                  <Line
                    dataKey="rate"
                    name="Turnout"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }}
                    activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By activity</CardTitle>
          <CardDescription>Activities that ran on two or more nights, lowest turnout first.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.activities.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity ran more than once in this period.</p>
          ) : (
            <DataTable
              label="Turnout by activity"
              data={stats.activities}
              columns={activityColumns}
              rowKey={(a) => a.name}
              initialSort={{ id: "rate" }}
              columnClassName={{ label: "hidden sm:table-cell", times: "hidden sm:table-cell" }}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function NightTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ProgrammeNightTurnout }[];
}) {
  const night = active ? payload?.[0]?.payload : undefined;
  if (!night) return null;
  return (
    <div style={TOOLTIP_STYLE} className="max-w-72 px-3 py-2">
      <p className="font-medium">{formatDate(night.date)}</p>
      <p className="text-muted-foreground">
        {pct(night.rate)} ({night.present} of {night.total}){night.uniform ? ` · ${night.uniform}` : ""}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {sessionLines(night.sessions).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
