/** A row of `/stores/badges/history`: one badge given out, or a give taken back. */
export type BadgeHistoryRow = {
  id: string;
  orderId: string;
  itemId: string;
  badgeName: string;
  cadetName: string;
  cadetCin: number | null;
  action: "given" | "undone";
  timestamp: string;
  by: string | null;
  /** The give the badge is still out on (not undone since). */
  current: boolean;
};

/** "Given", "Undone", or "Given, since undone" for a give that was later taken back. */
export function badgeHistoryStatus(row: Pick<BadgeHistoryRow, "action" | "current">): string {
  if (row.action === "undone") return "Undone";
  return row.current ? "Given" : "Given, since undone";
}
