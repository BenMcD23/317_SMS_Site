/** One change to a stock count, from the API's `/stores/stock/changes` (newest first). */
export type StockChange = {
  id: number;
  kind: "uniform" | "badge";
  stockItemId: number | null;
  itemName: string;
  size: string | null;
  location: string | null;
  action: StockAction;
  change: number;
  /** What the line held afterwards; null once the line itself was deleted. */
  quantityAfter: number | null;
  note: string | null;
  orderId: number | null;
  changedAt: string;
  changedBy: string | null;
};

/** Mirrors ACTIONS in the API's core/stock_changes.py. */
export type StockAction =
  "added" | "topped_up" | "counted" | "moved" | "renamed" | "merged" | "deleted" | "taken" | "returned";

export const STOCK_ACTION_LABELS: Record<StockAction, string> = {
  added: "Added",
  topped_up: "Topped up",
  counted: "Count changed",
  moved: "Moved",
  renamed: "Renamed",
  merged: "Merged",
  deleted: "Deleted",
  taken: "Taken for an order",
  returned: "Put back from an order",
};

/** The label for an action, falling back to the raw value for one the site doesn't know yet. */
export function stockActionLabel(action: string): string {
  return STOCK_ACTION_LABELS[action as StockAction] ?? action;
}

/** "+3", "−2" (a real minus sign), or "" for a change that moved nothing. */
export function signedChange(change: number): string {
  if (change > 0) return `+${change}`;
  if (change < 0) return `−${Math.abs(change)}`;
  return "";
}
