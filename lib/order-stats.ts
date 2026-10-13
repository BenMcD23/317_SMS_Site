/** Shapes and helpers for the uniform / badge order stats pages. */

export type OrderStatsWindow = { id: string; label: string; days: number | null };

/** Look-back choices; orders are kept indefinitely, so "All time" is real history. */
export const ORDER_STATS_WINDOWS: OrderStatsWindow[] = [
  { id: "3m", label: "3 months", days: 91 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "all", label: "All time", days: null },
];
export const DEFAULT_ORDER_STATS_WINDOW = "1y";

export type Counted = { label: string; count: number };
export type MonthlyOrders = { month: string; orders: number };

export type UniformItemStats = {
  item_type: string;
  count: number;
  orders: number;
  given: number;
  top_size: string | null;
  sizes: Counted[];
};

export type UniformOrderStats = {
  days: number | null;
  total_orders: number;
  completed_orders: number;
  kitting_orders: number;
  total_items: number;
  items: UniformItemStats[];
  monthly: MonthlyOrders[];
};

export type BadgeStats = {
  badge_name: string;
  count: number;
  orders: number;
  replacements: number;
  given: number;
};

export type BadgeOrderStats = {
  days: number | null;
  total_orders: number;
  completed_orders: number;
  total_items: number;
  replacements: number;
  badges: BadgeStats[];
  gained_where: Counted[];
  monthly: MonthlyOrders[];
};

/** API path for a window, e.g. `/stores/orders/stats?days=365`. */
export function orderStatsPath(base: string, windowId: string): string {
  const days = ORDER_STATS_WINDOWS.find((w) => w.id === windowId)?.days ?? null;
  return days ? `${base}?days=${days}` : base;
}

/** A share as a whole percentage; 0 when there is nothing to divide by. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
