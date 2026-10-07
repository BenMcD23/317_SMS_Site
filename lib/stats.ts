import { type BadgeBreakdown, type BadgeHistoryPoint, withLivePoint } from "@/lib/badge-history";
import { FLIGHT_ORDER } from "@/lib/cadet-format";
import { formatDate, todayLocal } from "@/lib/format";

/**
 * Shapes and helpers for the squadron stats views (the /stats page and the
 * dashboard's summary). The API's /stats/current and every snapshot share one
 * shape, so the same selectors work on live numbers and on history.
 */

/** A badge breakdown that also carries the same counts without juniors. */
export interface Cohort extends BadgeBreakdown {
  // Optional: snapshots from before the breakdown existed don't carry it.
  non_junior?: BadgeBreakdown;
}

export interface SquadronStats extends Cohort {
  by_flight: Record<string, number>;
  by_age: Record<string, number>;
  by_rank: Record<string, number>;
  by_classification: Record<string, number>;
  // Optional: only in snapshots taken since the per-flight breakdown existed.
  flights?: Record<string, Cohort>;
}

export interface StatsPoint {
  date: string;
  data: SquadronStats;
}

/** A badge gained recently, from /stats/awards. */
export interface Award {
  cin: number;
  name: string;
  flight: string;
  junior: boolean;
  badge: string;
  level: string;
  date: string;
}

/** A qualification lapsing in the next three months, from /stats/expiring. */
export interface ExpiringQual {
  cin: number;
  name: string;
  flight: string;
  junior: boolean;
  qual_type: string;
  date_expires: string;
  days_left: number;
}

export const BADGE_LABELS: Record<string, string> = {
  duke_of_edinburgh: "Duke of Edinburgh",
  first_aid: "First Aid",
  leadership: "Leadership",
  cyber: "Cyber",
  radio: "Radio",
  road_marching: "Road Marching",
  space: "Space",
  music: "Music",
  flying_badge: "Flying Badge",
  fieldcraft: "Fieldcraft",
  shooting: "Shooting",
  swimming_proficiency: "Swimming",
};

// Badge level colours are domain colours (bronze/silver/gold), not theme colours.
const LEVEL_COLOURS: Record<string, string> = {
  None: "var(--muted-foreground)",
  Blue: "#3b82f6",
  Bronze: "#b45309",
  Silver: "#6b7280",
  Gold: "#ca8a04",
  Basic: "#6ee7b7",
  Intermediate: "#34d399",
  Advanced: "#059669",
  Nijmegen: "#7c3aed",
};

/** Lowest to highest, so stacks build upward from "not started". */
export const LEVEL_ORDER = [
  "None",
  "Blue",
  "Bronze",
  "Silver",
  "Gold",
  "Nijmegen",
  "Basic",
  "Intermediate",
  "Advanced",
];

export function levelColor(level: string): string {
  return LEVEL_COLOURS[level] ?? "#9ca3af";
}

// Flight colours: chart tokens in the order that best survives colour-vision
// checks in both themes (dataviz validator). Unknown is neutral, not a 5th hue.
const FLIGHT_COLOURS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)"];

export function flightColor(flight: string): string {
  const i = FLIGHT_ORDER.indexOf(flight);
  return i >= 0 ? FLIGHT_COLOURS[i] : "var(--muted-foreground)";
}

/** "A Flight", "NCO", or "No flight" for cadets without one. */
export function flightLabel(flight: string): string {
  if (flight === "Unknown") return "No flight";
  return flight === "NCO" ? "NCO" : `${flight} Flight`;
}

/** Known flights in their usual order, then anything else the data holds. */
export function orderedFlights(flights: Iterable<string>): string[] {
  const all = new Set(flights);
  return [
    ...FLIGHT_ORDER.filter((f) => all.has(f)),
    ...[...all].filter((f) => !FLIGHT_ORDER.includes(f)).sort(),
  ];
}

/** Preset look-back windows, shortest first: the toggles and the picker's list. */
export const QUICK_RANGES = [
  { id: "2w", short: "2W", label: "Last 2 weeks", days: 14 },
  { id: "1m", short: "1M", label: "Last month", days: 30 },
  { id: "3m", short: "3M", label: "Last 3 months", days: 91 },
  { id: "6m", short: "6M", label: "Last 6 months", days: 182 },
  { id: "1y", short: "1Y", label: "Last year", days: 365 },
  { id: "all", short: "All", label: "All time", days: null },
] as const;

export type QuickRangeId = (typeof QUICK_RANGES)[number]["id"];
export const DEFAULT_RANGE: QuickRangeId = "6m";

/** A preset ending today, or a custom pair of days (both inclusive, YYYY-MM-DD). */
export type TimeRange = { kind: "quick"; id: QuickRangeId } | { kind: "absolute"; from: string; to: string };

/** True for a real calendar day written YYYY-MM-DD ("2026-02-30" is not). */
export function isIsoDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * The range a URL asks for: ?from=&to= when both are valid days in order,
 * else ?range=, else the default. A hand-edited or half-typed URL falls back
 * rather than breaking the page.
 */
export function parseTimeRange(params: { get(key: string): string | null }): TimeRange {
  const from = params.get("from");
  const to = params.get("to");
  if (isIsoDay(from) && isIsoDay(to) && from <= to) return { kind: "absolute", from, to };
  const id = QUICK_RANGES.find((r) => r.id === params.get("range"))?.id ?? DEFAULT_RANGE;
  return { kind: "quick", id };
}

function quick(id: QuickRangeId) {
  return QUICK_RANGES.find((r) => r.id === id)!;
}

/**
 * The API query for a range. `unbounded` is what "All time" sends where the
 * endpoint has its own default for no window (the awards feed means 30 days).
 */
export function rangeQuery(range: TimeRange, unbounded = ""): string {
  if (range.kind === "absolute") return `start=${range.from}&end=${range.to}`;
  const days = quick(range.id).days;
  return days === null ? unbounded : `days=${days}`;
}

/** "Last 6 months", "All time" or "5 Jan 2026 – 3 Mar 2026": the picker's button. */
export function rangeLabel(range: TimeRange): string {
  if (range.kind === "quick") return quick(range.id).label;
  return range.from === range.to
    ? formatDate(range.from)
    : `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

/** The range as it reads in a sentence: "in the last month", "between 5 Jan 2026 and 3 Mar 2026". */
export function rangePhrase(range: TimeRange): string {
  if (range.kind === "absolute") {
    return range.from === range.to
      ? `on ${formatDate(range.from)}`
      : `between ${formatDate(range.from)} and ${formatDate(range.to)}`;
  }
  return range.id === "all" ? "in all recorded history" : `in the ${quick(range.id).label.toLowerCase()}`;
}

/** Whether today's live numbers belong at the end of this range's trend. */
export function rangeIncludesToday(range: TimeRange, now: Date = new Date()): boolean {
  return range.kind === "quick" || range.to >= todayLocal(now);
}

/**
 * The badge breakdown for one flight (or the whole squadron) and cohort.
 * Undefined when that slice isn't in this data — an old snapshot without the
 * flight or non-junior breakdown — so a trend skips it rather than plotting zeros.
 */
export function cohortOf(
  stats: SquadronStats | null | undefined,
  flight: string | null,
  excludeJuniors: boolean
): BadgeBreakdown | undefined {
  const base = flight ? stats?.flights?.[flight] : stats;
  return (excludeJuniors ? base?.non_junior : base) ?? undefined;
}

/** Snapshots for the chosen slice, ending with today's live numbers. */
export function badgeHistoryFor(
  history: StatsPoint[],
  live: SquadronStats | null | undefined,
  flight: string | null,
  excludeJuniors: boolean,
  now: Date = new Date()
): BadgeHistoryPoint[] {
  const points = history.flatMap((h) => {
    const data = cohortOf(h.data, flight, excludeJuniors);
    return data ? [{ date: h.date, data }] : [];
  });
  return withLivePoint(points, cohortOf(live, flight, excludeJuniors), now);
}

/** Cadets holding a badge at any level. Summed from the held levels rather
 *  than total minus "None", so a badge missing from an older snapshot reads as
 *  nobody holding it, not everybody. */
export function heldCount(levels: Record<string, number>): number {
  return Object.entries(levels).reduce((sum, [l, n]) => (l === "None" ? sum : sum + n), 0);
}

/**
 * Change per level between the first and last points of a trend, leaving out
 * levels that didn't move. Empty with fewer than two points — there's nothing
 * to compare against yet.
 */
export function levelDeltas(history: BadgeHistoryPoint[], badgeKey: string): Record<string, number> {
  if (history.length < 2) return {};
  const first = history[0].data.badges[badgeKey] ?? {};
  const last = history[history.length - 1].data.badges[badgeKey] ?? {};
  const out: Record<string, number> = {};
  for (const level of new Set([...Object.keys(first), ...Object.keys(last)])) {
    if (level === "None") continue;
    const d = (last[level] ?? 0) - (first[level] ?? 0);
    if (d !== 0) out[level] = d;
  }
  return out;
}

/** Change in how many cadets hold the badge at all over the trend. */
export function heldDelta(history: BadgeHistoryPoint[], badgeKey: string): number {
  if (history.length < 2) return 0;
  const held = (p: BadgeHistoryPoint) => heldCount(p.data.badges[badgeKey] ?? {});
  return held(history[history.length - 1]) - held(history[0]);
}

export const BADGE_SORTS = [
  { id: "catalogue", label: "Default order" },
  { id: "most", label: "Most held" },
  { id: "least", label: "Least held" },
  { id: "improved", label: "Most improved" },
] as const;

export type BadgeSort = (typeof BADGE_SORTS)[number]["id"];

/** Badge keys in the chosen order. Ties keep the catalogue order so cards don't shuffle. */
export function sortBadges(sort: BadgeSort, cohort: BadgeBreakdown, history: BadgeHistoryPoint[]): string[] {
  const keys = Object.keys(BADGE_LABELS);
  const share = (k: string) =>
    cohort.total_cadets > 0 ? heldCount(cohort.badges[k] ?? {}) / cohort.total_cadets : 0;
  const score: Record<BadgeSort, (k: string) => number> = {
    catalogue: () => 0,
    most: (k) => -share(k),
    least: (k) => share(k),
    improved: (k) => -heldDelta(history, k),
  };
  return keys
    .map((k, i) => ({ k, i, s: score[sort](k) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map(({ k }) => k);
}

/** Key under which levelShares keeps a level's cadet count beside its share. */
export const countKey = (level: string) => `n:${level}`;

/**
 * One row per point for a 100%-stacked chart: each level's share of the cohort
 * in percent. Shares rather than counts so cadets joining or leaving don't read
 * as badges being gained or lost. The counts ride along under `countKey` for
 * the tooltip, which shows both.
 */
export function levelShares(history: BadgeHistoryPoint[], badgeKey: string, levels: string[]) {
  return history.map((h) => {
    const counts = h.data.badges[badgeKey] ?? {};
    const total = h.data.total_cadets;
    const row: Record<string, string | number> = { date: h.date };
    for (const l of levels) {
      row[l] = total > 0 ? Math.round(((counts[l] ?? 0) / total) * 1000) / 10 : 0;
      row[countKey(l)] = counts[l] ?? 0;
    }
    return row;
  });
}

/**
 * Levels a badge's trend should stack, bottom first: held levels lowest to
 * highest, then "None" on top, so the coloured area grows as badges are gained.
 */
export function trendLevels(history: BadgeHistoryPoint[], badgeKey: string): string[] {
  const seen = new Set(history.flatMap((h) => Object.keys(h.data.badges[badgeKey] ?? {})));
  seen.delete("None");
  return [
    ...LEVEL_ORDER.filter((l) => seen.has(l)),
    ...[...seen].filter((l) => !LEVEL_ORDER.includes(l)),
    "None",
  ];
}

/** Strength per flight over time, ending with today's live numbers. */
export function strengthHistory(
  history: StatsPoint[],
  live: SquadronStats | null | undefined,
  now = new Date()
) {
  return withLivePoint(history, live, now).map((h) => ({ date: h.date, ...h.data.by_flight }));
}
