import { FLIGHT_ORDER } from "@/lib/cadet-format";
import { formatDate, formatMonth, formatShortDate } from "@/lib/format";
import { badgeLabel, flightColor, flightLabel } from "@/lib/stats";

/**
 * The OC's custom dashboard: panels the OC builds from a query and arranges
 * on a 12-column grid. The query shapes match core/dashboard_query.py in the
 * API, which owns the allowlist of datasets, fields and measures; the site
 * reads that list from /oc/custom-dashboard/datasets rather than copying it,
 * so a field added there shows up here without a deploy.
 */

export type FieldKind = "text" | "date" | "number";
export type Grain = "day" | "week" | "month" | "year";
export type Viz = "bar" | "line" | "stat" | "table";
export type SortOrder = "label" | "value_desc" | "value_asc";
export type FilterOp = "eq" | "neq" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte" | "empty" | "not_empty";

export interface DatasetField {
  key: string;
  label: string;
  kind: FieldKind;
}

export interface DatasetMeasure {
  key: string;
  label: string;
  unit: string;
}

export interface Dataset {
  key: string;
  label: string;
  description: string;
  time_field: string | null;
  fields: DatasetField[];
  measures: DatasetMeasure[];
}

export interface GroupBy {
  field: string;
  grain?: Grain;
}

export interface Filter {
  field: string;
  op: FilterOp;
  value?: string | number | (string | number)[] | null;
}

export interface QuerySpec {
  dataset: string;
  measure: string;
  group_by: GroupBy[];
  filters: Filter[];
  sort: SortOrder;
  limit: number;
}

export interface Panel {
  id: string;
  title: string;
  viz: Viz;
  query: QuerySpec;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What GET/PUT /oc/custom-dashboard answer with. */
export interface CustomDashboard {
  range_days: number | null;
  panels: Panel[];
  customised: boolean;
}

export interface QueryRow {
  keys: (string | number | null)[];
  value: number | null;
}

/** What POST /oc/custom-dashboard/query answers with. */
export interface QueryResult {
  rows: QueryRow[];
  truncated: boolean;
  unit: string;
}

export const GRID_COLS = 12;

/** The dashboard-wide look-back, applied to each dataset's own date. */
export const RANGE_OPTIONS: { days: number | null; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
  { days: null, label: "All time" },
];

export const VIZ_OPTIONS: { value: Viz; label: string }[] = [
  { value: "bar", label: "Bar chart" },
  { value: "line", label: "Line chart" },
  { value: "stat", label: "Single number" },
  { value: "table", label: "Table" },
];

export const GRAIN_OPTIONS: { value: Grain; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "label", label: "In order" },
  { value: "value_desc", label: "Largest first" },
  { value: "value_asc", label: "Smallest first" },
];

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "empty", label: "is blank" },
  { value: "not_empty", label: "is not blank" },
];
const ORDERED_OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "gte", label: "on or after" },
  { value: "lte", label: "on or before" },
  { value: "empty", label: "is blank" },
  { value: "not_empty", label: "is not blank" },
];
const NUMBER_OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "gte", label: "at least" },
  { value: "lte", label: "at most" },
  { value: "empty", label: "is blank" },
  { value: "not_empty", label: "is not blank" },
];

/** The comparisons that make sense for a field: text is matched, dates and numbers compared. */
export function filterOps(kind: FieldKind) {
  return kind === "text" ? TEXT_OPS : kind === "date" ? ORDERED_OPS : NUMBER_OPS;
}

/** Ops that need no value typed in. */
export const opTakesValue = (op: FilterOp) => op !== "empty" && op !== "not_empty";

export function fieldOf(dataset: Dataset | undefined, key: string | undefined) {
  return dataset?.fields.find((f) => f.key === key);
}

export function measureOf(dataset: Dataset | undefined, key: string | undefined) {
  return dataset?.measures.find((m) => m.key === key);
}

/**
 * One group's key as a person would say it: "Sept 2026" rather than
 * "2026-09-01", "First Aid" rather than "first_aid", "Not set" for a blank.
 */
export function keyLabel(
  value: string | number | null,
  field: DatasetField | undefined,
  grain?: Grain
): string {
  if (value === null || value === "") return "Not set";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  if (field?.kind === "date") {
    switch (grain ?? "month") {
      case "day":
        return formatDate(value);
      case "week":
        return `w/c ${formatShortDate(value)}`;
      case "month":
        return formatMonth(value.slice(0, 7));
      case "year":
        return value.slice(0, 4);
    }
  }
  if (field?.key === "qual_type") return badgeLabel(value);
  if (field?.key === "flight") return flightLabel(value);
  // Attendance states and qualification levels come back lower-case.
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A value with its measure's unit: "66.7%", "45 min", "12". */
export function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  const n = value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  if (unit === "%") return `${n}%`;
  return unit ? `${n} ${unit}` : n;
}

/** "Turnout by Date (month), split by Flight" — the panel's subtitle. */
export function describeQuery(spec: QuerySpec, dataset: Dataset | undefined): string {
  if (!dataset) return "Dataset no longer available";
  const measure = measureOf(dataset, spec.measure)?.label ?? spec.measure;
  const groupLabel = (g: GroupBy) => {
    const f = fieldOf(dataset, g.field);
    const label = f?.label ?? g.field;
    return f?.kind === "date" ? `${label.toLowerCase()} (${g.grain ?? "month"})` : label.toLowerCase();
  };
  const [first, second] = spec.group_by;
  let text = `${measure}${first ? ` by ${groupLabel(first)}` : ""}${second ? `, split by ${groupLabel(second)}` : ""}`;
  if (spec.filters.length) text += ` · ${spec.filters.length} filter${spec.filters.length === 1 ? "" : "s"}`;
  return `${dataset.label}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

// The chart hues in the order that survives colour-vision checks in both
// themes (the same order as flight colours). Four, and no more: a fifth
// series is left to the table rather than given a hue that can't be told apart.
const SERIES_COLOURS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)"];
export const MAX_SERIES = SERIES_COLOURS.length;

export interface ChartData {
  /** One entry per x value, with a numeric property per series id. */
  data: Record<string, string | number | null>[];
  series: { id: string; label: string; colour: string }[];
  /** Series dropped to keep within MAX_SERIES; the table view still has them. */
  hidden: number;
}

/**
 * Rows from the API reshaped for Recharts: the first grouping is the x axis,
 * the second (if any) a series per value. Series are the largest few by total,
 * coloured in label order rather than size order, so one growing past another
 * doesn't swap their colours. Flights use their own colours, the same as
 * every other chart on the site.
 */
export function toChartData(rows: QueryRow[], spec: QuerySpec, dataset: Dataset | undefined): ChartData {
  const [xGroup, seriesGroup] = spec.group_by;
  const xField = fieldOf(dataset, xGroup?.field);
  const sField = fieldOf(dataset, seriesGroup?.field);
  const xLabel = (k: string | number | null) => (xGroup ? keyLabel(k, xField, xGroup.grain) : "All");

  if (!seriesGroup) {
    const measure = measureOf(dataset, spec.measure)?.label ?? "Value";
    return {
      data: rows.map((r) => ({ x: xLabel(r.keys[0] ?? null), value: r.value })),
      series: [{ id: "value", label: measure, colour: SERIES_COLOURS[0] }],
      hidden: 0,
    };
  }

  const totals = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.keys[1] ?? "");
    totals.set(id, (totals.get(id) ?? 0) + Math.abs(r.value ?? 0));
  }
  const kept = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SERIES)
    .map(([id]) => id);
  const flights = sField?.key === "flight";
  const ordered = flights
    ? [...kept].sort((a, b) => flightRank(a) - flightRank(b) || a.localeCompare(b))
    : [...kept].sort((a, b) => a.localeCompare(b));

  const byX = new Map<string, Record<string, string | number | null>>();
  for (const r of rows) {
    const id = String(r.keys[1] ?? "");
    if (!kept.includes(id)) continue;
    const x = xLabel(r.keys[0] ?? null);
    const entry = byX.get(x) ?? { x };
    entry[`s:${id}`] = r.value;
    byX.set(x, entry);
  }

  return {
    data: [...byX.values()],
    series: ordered.map((id, i) => ({
      id: `s:${id}`,
      label: keyLabel(id === "" ? null : id, sField, seriesGroup.grain),
      colour: flights && flightRank(id) < FLIGHT_ORDER.length ? flightColor(id) : SERIES_COLOURS[i],
    })),
    hidden: totals.size - kept.length,
  };
}

function flightRank(flight: string) {
  const i = FLIGHT_ORDER.indexOf(flight);
  return i < 0 ? FLIGHT_ORDER.length : i;
}

/** A fresh panel id: short, and safe for the API's `[A-Za-z0-9_-]` rule. */
export function newPanelId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Default size for a new panel of each kind, in grid units. */
export function defaultSize(viz: Viz): { w: number; h: number } {
  return viz === "stat" ? { w: 3, h: 2 } : { w: 6, h: 5 };
}

/** Under everything already on the dashboard, flush left. */
export function nextPosition(panels: Panel[]): { x: number; y: number } {
  return { x: 0, y: panels.reduce((max, p) => Math.max(max, p.y + p.h), 0) };
}

/** Top to bottom, then left to right: the order the panels stack on a phone. */
export function readingOrder(panels: Panel[]): Panel[] {
  return [...panels].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The panels with the grid's new positions applied. The grid only knows
 * ids and boxes; anything it doesn't mention keeps where it was.
 */
export function applyLayout(
  panels: Panel[],
  layout: readonly { i: string; x: number; y: number; w: number; h: number }[]
) {
  const boxes = new Map(layout.map((l) => [l.i, l]));
  return panels.map((p) => {
    const b = boxes.get(p.id);
    return b ? { ...p, x: b.x, y: b.y, w: Math.min(b.w, GRID_COLS - b.x), h: b.h } : p;
  });
}

/** True when the grid moved or resized something, so a no-op drop isn't saved. */
export function layoutChanged(before: Panel[], after: Panel[]): boolean {
  return before.some((p, i) => {
    const q = after[i];
    return !q || p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h;
  });
}

export const emptyQuery = (dataset: string): QuerySpec => ({
  dataset,
  measure: "count",
  group_by: [],
  filters: [],
  sort: "label",
  limit: 100,
});

/**
 * The panels "Add examples" puts on an empty dashboard: one of each kind of
 * question, so the OC can see what's possible and edit from there.
 */
export function starterPanels(): Panel[] {
  const q = (dataset: string, rest: Partial<QuerySpec>): QuerySpec => ({ ...emptyQuery(dataset), ...rest });
  return [
    {
      id: newPanelId(),
      title: "Cadets",
      viz: "stat",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      query: q("cadets", {}),
    },
    {
      id: newPanelId(),
      title: "Parade night turnout",
      viz: "stat",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      query: q("cadet_attendance", {
        measure: "turnout",
        filters: [{ field: "register_type", op: "eq", value: "Parade Night" }],
      }),
    },
    {
      id: newPanelId(),
      title: "Cadets by flight",
      viz: "bar",
      x: 6,
      y: 0,
      w: 6,
      h: 5,
      query: q("cadets", { group_by: [{ field: "flight" }] }),
    },
    {
      id: newPanelId(),
      title: "Turnout by month",
      viz: "line",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      query: q("cadet_attendance", {
        measure: "turnout",
        group_by: [{ field: "date", grain: "month" }],
        filters: [{ field: "register_type", op: "eq", value: "Parade Night" }],
      }),
    },
    {
      id: newPanelId(),
      title: "Qualifications held",
      viz: "table",
      x: 6,
      y: 5,
      w: 6,
      h: 5,
      query: q("qualifications", { group_by: [{ field: "qual_type" }], sort: "value_desc" }),
    },
  ];
}
