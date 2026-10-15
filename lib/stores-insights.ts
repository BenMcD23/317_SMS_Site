/**
 * Types and wording for the uniform insights page (the API's GET /stores/insights).
 * The API does the counting; this file only says how a line reads, so the
 * table, the size bars and the CSV all use the same words for a status.
 */

export type InsightStatus = "short" | "out" | "low" | "rare" | "ok" | "unused";

export interface InsightLine {
  itemType: string;
  /** "" for one-size items (belt, brassard, tie). */
  size: string;
  requested: number;
  given: number;
  waiting: number;
  inStock: number;
  monthlyRate: number;
  toOrder: number;
  status: InsightStatus;
  lastRequested: string | null;
}

export interface InsightItem {
  itemType: string;
  requested: number;
  given: number;
  waiting: number;
  awaitingSizing: number;
  inStock: number;
  topSize: string | null;
  sizes: InsightLine[];
}

export interface StoresInsights {
  since: string;
  months: number;
  coverMonths: number;
  /** Item types the order list leaves out (kept topped up without a forecast).
   *  Optional so the page still renders against an API that predates it. */
  notOnOrderList?: string[];
  summary: {
    requested: number;
    given: number;
    waiting: number;
    awaitingSizing: number;
    inStock: number;
    linesToOrder: number;
    unitsToOrder: number;
    unusedLines: number;
    unusedUnits: number;
  };
  items: InsightItem[];
  toOrder: InsightLine[];
  unused: InsightLine[];
}

export const STATUS_LABELS: Record<InsightStatus, string> = {
  short: "Cadets waiting",
  out: "Out of stock",
  low: "Running low",
  // Asked for too seldom to keep one on the shelf.
  rare: "Order when needed",
  ok: "Enough",
  unused: "Not given out",
};

export const STATUS_TONES: Record<InsightStatus, string> = {
  short: "bg-destructive/15 text-destructive",
  out: "bg-destructive/15 text-destructive",
  low: "bg-warning/15 text-warning",
  rare: "bg-muted text-muted-foreground",
  ok: "bg-success/15 text-success",
  unused: "bg-muted text-muted-foreground",
};

/** "56", or "One size" for items that don't come in sizes. */
export function sizeLabel(size: string): string {
  return size === "" ? "One size" : size;
}

/** The window and cover the page offers, in months. */
export const WINDOW_OPTIONS = [6, 12, 24] as const;
export const COVER_OPTIONS = [1, 3, 6] as const;

export function monthsLabel(n: number): string {
  return n === 1 ? "1 month" : `${n} months`;
}

/** The order list as spreadsheet rows, ready to paste into a logs form request. */
export function orderCsvRows(lines: InsightLine[]): Record<string, unknown>[] {
  return lines.map((l) => ({
    Item: l.itemType,
    Size: sizeLabel(l.size),
    Order: l.toOrder,
    "On shelf": l.inStock,
    "Cadets waiting": l.waiting,
    "Asked for": l.requested,
    Why: STATUS_LABELS[l.status],
  }));
}

/** Names joined for a sentence: "A", "A and B", "A, B and C". */
export function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
