/**
 * Types and helpers for the squadron assistant (/assistant): saved chats with
 * the API's /assistant endpoints, and the charts and tables its answers carry.
 * Kept out of the page so the reply check, the chart reshaping and the
 * personal-data columns are tested on their own.
 */

import { FLIGHT_ORDER } from "@/lib/cadet-format";
import { SERIES_COLOURS } from "@/lib/custom-dashboard";
import { flightColor } from "@/lib/stats";

export type AssistantCall = { tool: string; args: Record<string, unknown>; ok: boolean };

export type AssistantChart = {
  type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  unit: string;
};

export type AssistantTable = {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
};

export type UserMessage = { id: number; role: "user"; content: string; created_at: string };

export type AnswerMessage = {
  id: number;
  role: "assistant";
  content: string;
  created_at: string;
  charts: AssistantChart[];
  tables: AssistantTable[];
  follow_ups: string[];
  calls: AssistantCall[];
  model: string;
  model_label: string;
  fallback: boolean;
};

export type ChatMessage = UserMessage | AnswerMessage;

export type ChatSummary = { id: number; title: string; created_at: string; updated_at: string };

export type ChatDetail = ChatSummary & { messages: ChatMessage[] };

export type AskReply = { chat: ChatSummary; question: UserMessage; answer: AnswerMessage };

/** An error body or a misbehaving proxy can arrive as a 200; don't render half a reply. */
export function isAskReply(data: unknown): data is AskReply {
  const r = data as AskReply | null;
  return (
    typeof r?.chat?.id === "number" &&
    typeof r.answer?.content === "string" &&
    Array.isArray(r.answer.charts) &&
    Array.isArray(r.answer.tables)
  );
}

const TOOL_LABELS: Record<string, string> = {
  squadron_overview: "squadron numbers",
  find_cadets: "cadet search",
  cadet_record: "a cadet's record",
  expiring: "expiring qualifications",
  attendance: "attendance",
  badge_holders: "badges",
  stores_stock: "stores stock",
  open_orders: "open uniform orders",
  upcoming_events: "upcoming events",
  aggregate: "squadron figures",
};

/**
 * "Checked attendance and cadet search": what the answer was drawn from, so
 * staff can tell a looked-up answer from one the model wrote without data.
 * Failed calls and repeats are left out.
 */
export function sourcesLine(calls: AssistantCall[]): string | null {
  const labels = [...new Set(calls.filter((c) => c.ok).map((c) => TOOL_LABELS[c.tool] ?? c.tool))];
  if (!labels.length) return null;
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `Checked ${list}`;
}

/** A chart's values, shaped for Recharts: one row per label, a key per series. */
export function chartRows(chart: AssistantChart): Record<string, string | number | null>[] {
  return chart.labels.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    chart.series.forEach((s, j) => (row[`s${j}`] = s.values[i] ?? null));
    return row;
  });
}

const isFlights = (labels: string[]) => labels.length > 0 && labels.every((l) => FLIGHT_ORDER.includes(l));

/**
 * Colours for a chart's series, or a pie's slices. Fixed order, never cycled:
 * the API allows four of either, the most the palette tells apart. Flights
 * keep the colour they have on every other chart on the site.
 */
export function chartColours(chart: AssistantChart): string[] {
  if (chart.type === "pie") {
    return isFlights(chart.labels)
      ? chart.labels.map(flightColor)
      : chart.labels.map((_, i) => SERIES_COLOURS[i] ?? "var(--muted-foreground)");
  }
  const flights = chart.series.map((s) => s.name);
  return isFlights(flights)
    ? flights.map(flightColor)
    : chart.series.map((_, i) => SERIES_COLOURS[i] ?? "var(--muted-foreground)");
}

/**
 * A one-series bar chart of flights colours each bar as its flight, the same
 * as the stats page. Null for anything else: one colour per series then.
 */
export function flightBarColours(chart: AssistantChart): string[] | null {
  if (chart.type !== "bar" || chart.series.length !== 1 || !isFlights(chart.labels)) return null;
  return chart.labels.map(flightColor);
}

export function formatChartValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  const n = Number.isInteger(value) ? value.toLocaleString("en-GB") : value.toFixed(1);
  if (!unit) return n;
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}

// Column headings the assistant uses for personal data. A saved answer keeps
// them whatever the switch said when it was asked, so they're dropped on
// screen while "Hide personal data" is on.
const PERSONAL_COLUMN = /e-?mail|date of birth|\bdob\b|birthday|\bage\b/i;

export function isPersonalColumn(name: string): boolean {
  return PERSONAL_COLUMN.test(name.trim());
}

/** A table with its personal-data columns taken out, for "Hide personal data". */
export function withoutPersonalColumns(table: AssistantTable): AssistantTable {
  const keep = table.columns.map((c, i) => (isPersonalColumn(c) ? -1 : i)).filter((i) => i >= 0);
  if (keep.length === table.columns.length) return table;
  return {
    ...table,
    columns: keep.map((i) => table.columns[i]),
    rows: table.rows.map((r) => keep.map((i) => r[i] ?? null)),
  };
}

/** A table as CSV rows: one object per row, keyed by column heading. */
export function tableCsvRows(table: AssistantTable): Record<string, unknown>[] {
  return table.rows.map((r) => Object.fromEntries(table.columns.map((c, i) => [c, r[i] ?? ""])));
}

/** A file name from a title: "Cadets by flight" → "cadets-by-flight.csv". */
export function csvName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "table"}.csv`;
}
