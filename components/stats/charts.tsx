"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BadgeHistoryPoint } from "@/lib/badge-history";
import { formatShortDate } from "@/lib/format";
import {
  BADGE_LABELS,
  countKey,
  flightColor,
  flightLabel,
  heldCount,
  LEVEL_ORDER,
  levelColor,
  levelDeltas,
  levelShares,
  trendLevels,
} from "@/lib/stats";

/**
 * The stats page's charts. Shared tooltip/axis styling lives here so every
 * chart on the page reads as one system.
 */

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};
const AXIS = { tickLine: false, axisLine: false } as const;

type TooltipEntry = { name?: unknown; dataKey?: unknown; value?: unknown; payload?: Record<string, unknown> };

/**
 * Tooltip for the stacked charts. Recharts' default colours each row with the
 * series stroke, which here is the card colour that separates the bands, so its
 * rows came out invisible. Text stays in text colours; a dot carries identity.
 * Rows run top to bottom in the order the bands are stacked on screen.
 */
export function StackTooltip({
  active,
  payload,
  label,
  colorFor,
  nameFor = (key) => key,
  valueFor = (entry) => String(entry.value),
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
  colorFor: (key: string) => string;
  nameFor?: (key: string) => string;
  valueFor?: (entry: TooltipEntry, key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md"
      role="tooltip"
    >
      <p className="mb-1 font-medium">{formatShortDate(String(label))}</p>
      <ul className="flex flex-col gap-0.5">
        {[...payload].reverse().map((entry) => {
          const key = String(entry.dataKey);
          return (
            <li key={key} className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full" style={{ background: colorFor(key) }} />
              <span className="flex-1">{nameFor(key)}</span>
              <span className="text-muted-foreground pl-3 tabular-nums">{valueFor(entry, key)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "12% (6)" — a level's share and the cadets behind it. */
export function shareValue(entry: TooltipEntry, key: string): string {
  return `${entry.value}% (${entry.payload?.[countKey(key)] ?? 0})`;
}

function EmptyChart({ height, children }: { height: number; children: React.ReactNode }) {
  // Same height as the chart it replaces, so cards don't jump.
  return (
    <div className="text-muted-foreground flex items-center justify-center text-xs" style={{ height }}>
      {children}
    </div>
  );
}

/** Cadets on strength over time, stacked by flight so the top edge is the total. */
export function StrengthChart({
  data,
  flights,
}: {
  data: Record<string, string | number>[];
  flights: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Strength over time{flights.length === 1 && ` · ${flightLabel(flights[0])}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length < 2 || flights.length === 0 ? (
          <EmptyChart height={220}>Not enough history in this range to chart a trend yet</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatShortDate(d)}
                tick={{ fontSize: 12 }}
                minTickGap={24}
                {...AXIS}
              />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={28} {...AXIS} />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={<StackTooltip colorFor={flightColor} nameFor={flightLabel} />}
              />
              {flights.map((f) => (
                <Area
                  key={f}
                  type="monotone"
                  dataKey={f}
                  name={flightLabel(f)}
                  stackId="strength"
                  stroke="var(--card)"
                  strokeWidth={2}
                  fill={flightColor(f)}
                  fillOpacity={0.85}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
        {/* An HTML legend: Recharts colours an Area's key from its stroke, which
            here is the card colour that separates the bands. */}
        {data.length >= 2 && flights.length > 1 && (
          <div className="text-muted-foreground mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            {flights.map((f) => (
              <span key={f} className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: flightColor(f) }} />
                {flightLabel(f)}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CountBarChart({
  title,
  data,
  fill,
  barSize,
}: {
  title: string;
  data: { name: string; count: number }[];
  fill: string;
  barSize: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyChart height={180}>No cadets to show</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} barSize={barSize}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} {...AXIS} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={24} {...AXIS} />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={TOOLTIP_STYLE} />
              <Bar
                dataKey="count"
                name="Cadets"
                fill={fill}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function AgeChart({ byAge }: { byAge: Record<string, number> }) {
  const data = Object.entries(byAge)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([name, count]) => ({ name, count }));
  return <CountBarChart title="Age distribution" data={data} fill="var(--chart-1)" barSize={22} />;
}

const CLASSIFICATION_ORDER = [
  "Junior Cadet",
  "First Class Cadet",
  "Leading Cadet",
  "Senior Cadet",
  "Master Air Cadet",
];

export function ClassificationChart({ byClassification }: { byClassification: Record<string, number> }) {
  const data = [
    ...CLASSIFICATION_ORDER,
    ...Object.keys(byClassification).filter((k) => !CLASSIFICATION_ORDER.includes(k)),
  ]
    .filter((name) => (byClassification[name] ?? 0) > 0)
    .map((name) => ({
      // Short labels so they fit on the x-axis.
      name: name.replace(" Cadet", "").replace("Master Air", "Master"),
      count: byClassification[name] ?? 0,
    }));
  return <CountBarChart title="Classification" data={data} fill="var(--chart-2)" barSize={36} />;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * One badge: who holds which level now, how that moved over the range, and the
 * trend as each level's share of the cohort (100% stacked, held levels rising
 * from the baseline under a quiet "None" band).
 */
export function BadgeTrendCard({
  badgeKey,
  levels,
  total,
  history,
}: {
  badgeKey: string;
  levels: Record<string, number>;
  total: number;
  history: BadgeHistoryPoint[];
}) {
  const label = BADGE_LABELS[badgeKey] ?? badgeKey;
  const held = heldCount(levels);
  const pct = total > 0 ? Math.round((held / total) * 100) : 0;
  const deltas = levelDeltas(history, badgeKey);
  const stack = trendLevels(history, badgeKey);
  const data = levelShares(history, badgeKey, stack);

  const nowLevels = LEVEL_ORDER.filter((l) => l === "None" || (levels[l] ?? 0) > 0)
    .concat(Object.keys(levels).filter((l) => !LEVEL_ORDER.includes(l)))
    .map((l) => ({ level: l, count: levels[l] ?? 0 }));

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{label}</CardTitle>
          <Badge variant={pct > 0 ? "secondary" : "outline"} className="tabular-nums">
            {held}/{total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">{pct}%</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {nowLevels.map(({ level, count }) => (
            <div key={level} className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ background: levelColor(level) }} />
              <span className="text-xs font-medium">{level}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
              {deltas[level] !== undefined && (
                <span
                  className={
                    deltas[level] > 0
                      ? "text-success text-xs tabular-nums"
                      : "text-muted-foreground text-xs tabular-nums"
                  }
                  // Spelled out for hover and screen readers; the key under the
                  // section heading explains it once for everyone else.
                  title={`${signed(deltas[level])} cadets at ${level} since ${formatShortDate(history[0].date)}`}
                  aria-label={`${signed(deltas[level])} cadets at ${level} since ${formatShortDate(history[0].date)}`}
                >
                  {signed(deltas[level])}
                </span>
              )}
            </div>
          ))}
        </div>

        {data.length < 2 ? (
          <EmptyChart height={90}>Not enough history to chart a trend yet</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={data} stackOffset="expand" margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatShortDate(d)}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={24}
                tickMargin={6}
                {...AXIS}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                // Above the neighbouring cards, which it overhangs on a small chart.
                wrapperStyle={{ zIndex: 20 }}
                content={<StackTooltip colorFor={levelColor} valueFor={shareValue} />}
              />
              {stack.map((l) => (
                <Area
                  key={l}
                  type="monotone"
                  dataKey={l}
                  stackId="levels"
                  stroke="var(--card)"
                  strokeWidth={1}
                  fill={levelColor(l)}
                  // "Not started" is context, not the story; keep it quiet.
                  fillOpacity={l === "None" ? 0.15 : 0.85}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
