import type { IssuanceHistoryEntry } from "@/components/uniform-issuances-card";

/** A row of the stores-wide history (`/stores/issuances/recent`): one give, with who it was for. */
export type RecentIssuance = IssuanceHistoryEntry & {
  subjectName: string;
  subjectType: "cadet" | "user";
  cadetCin: number | null;
  userId: number | null;
};

export type IssuanceStatus = "current" | "undone" | "replaced";

/**
 * Where a give stands now. Shared by the history page's column and its sort,
 * so "Undone" never reads one way and sorts another.
 */
export function issuanceStatus(entry: Pick<IssuanceHistoryEntry, "current" | "undoneAt">): IssuanceStatus {
  if (entry.undoneAt) return "undone";
  return entry.current ? "current" : "replaced";
}

export const ISSUANCE_STATUS_LABELS: Record<IssuanceStatus, string> = {
  current: "On record",
  undone: "Undone",
  replaced: "Replaced",
};

/** Their record's uniform tab, where a give can be undone. Adults have no record page to link to. */
export function issuanceRecordHref(
  entry: Pick<RecentIssuance, "subjectType" | "cadetCin">
): string | undefined {
  return entry.subjectType === "cadet" && entry.cadetCin != null
    ? `/cadets/${entry.cadetCin}?tab=uniform`
    : undefined;
}
