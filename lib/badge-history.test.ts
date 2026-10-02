import { describe, expect, it } from "vitest";

import { type BadgeHistoryPoint, withLivePoint } from "@/lib/badge-history";

const NOW = new Date(2026, 9, 2, 20, 30);
const live = { total_cadets: 12, badges: { first_aid: { None: 4, Heartstart: 8 } } };
const old = { total_cadets: 10, badges: { first_aid: { None: 6, Heartstart: 4 } } };

describe("withLivePoint", () => {
  it("adds today's live numbers after older snapshots", () => {
    const history: BadgeHistoryPoint[] = [{ date: "2026-09-25T19:00:00", data: old }];
    expect(withLivePoint(history, live, NOW)).toEqual([
      { date: "2026-09-25T19:00:00", data: old },
      { date: "2026-10-02", data: live },
    ]);
  });

  it("gives a single point when there's no history yet", () => {
    expect(withLivePoint([], live, NOW)).toEqual([{ date: "2026-10-02", data: live }]);
  });

  it("replaces a snapshot from earlier today rather than plotting the day twice", () => {
    const history: BadgeHistoryPoint[] = [
      { date: "2026-09-25T19:00:00", data: old },
      { date: "2026-10-02T18:00:00", data: old },
    ];
    expect(withLivePoint(history, live, NOW)).toEqual([
      { date: "2026-09-25T19:00:00", data: old },
      { date: "2026-10-02", data: live },
    ]);
  });

  it("uses the local date, so a snapshot just after midnight counts as today", () => {
    const justAfterMidnight = new Date(2026, 9, 3, 0, 15);
    const history: BadgeHistoryPoint[] = [{ date: "2026-10-03T00:05:00", data: old }];
    expect(withLivePoint(history, live, justAfterMidnight)).toEqual([{ date: "2026-10-03", data: live }]);
  });

  it("leaves history alone when the live stats haven't loaded or failed", () => {
    const history: BadgeHistoryPoint[] = [{ date: "2026-09-25T19:00:00", data: old }];
    expect(withLivePoint(history, null, NOW)).toBe(history);
    expect(withLivePoint(history, undefined, NOW)).toBe(history);
  });
});
