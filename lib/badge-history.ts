import { todayLocal } from "@/lib/format";

/** Per-badge level counts over a cohort of cadets — all cadets, or just those past Junior. */
export interface BadgeBreakdown {
  total_cadets: number;
  badges: Record<string, Record<string, number>>;
}

/** One point on a badge card's trend chart, whichever cohort. */
export interface BadgeHistoryPoint {
  date: string;
  data: BadgeBreakdown;
}

/**
 * Snapshot history plus today's live numbers, so the badge trend always shows
 * where the squadron stands now. Snapshots are only taken periodically (and the
 * non-junior cohort only exists in newer ones), so without this a freshly
 * scraped squadron shows no trend at all until the next snapshot lands.
 *
 * The live point replaces any snapshot from today rather than sitting beside it:
 * two points on one date would draw a vertical jump, and the live numbers are
 * at least as fresh as anything captured earlier today.
 */
export function withLivePoint<D = BadgeBreakdown>(
  history: { date: string; data: D }[],
  live: D | null | undefined,
  now: Date = new Date()
): { date: string; data: D }[] {
  if (!live) return history;
  const today = todayLocal(now);
  return [...history.filter((h) => h.date.slice(0, 10) !== today), { date: today, data: live }];
}
