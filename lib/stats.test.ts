import { describe, expect, it } from "vitest";

import type { BadgeHistoryPoint } from "@/lib/badge-history";
import {
  addDays,
  badgeHistoryFor,
  describeTarget,
  dragRange,
  rangeBounds,
  shiftRange,
  type StatsTarget,
  targetOutlook,
  targetPct,
  targetSeries,
  zoomOutRange,
  cohortOf,
  flightColor,
  heldDelta,
  levelDeltas,
  levelShares,
  orderedFlights,
  isIsoDay,
  parseTimeRange,
  rangeIncludesToday,
  rangeLabel,
  rangePhrase,
  rangeQuery,
  sortBadges,
  type SquadronStats,
  type StatsPoint,
  strengthHistory,
  trendLevels,
} from "@/lib/stats";

const NOW = new Date(2026, 9, 7, 20, 0);

const stats = (over: Partial<SquadronStats> = {}): SquadronStats => ({
  total_cadets: 10,
  badges: { first_aid: { None: 6, Blue: 4 } },
  non_junior: { total_cadets: 4, badges: { first_aid: { None: 1, Blue: 3 } } },
  by_flight: { A: 6, B: 4 },
  by_age: {},
  by_rank: {},
  by_classification: {},
  flights: {
    A: {
      total_cadets: 6,
      badges: { first_aid: { None: 2, Blue: 4 } },
      non_junior: { total_cadets: 3, badges: { first_aid: { Blue: 3 } } },
    },
  },
  ...over,
});

const point = (
  date: string,
  badges: Record<string, Record<string, number>>,
  total = 10
): BadgeHistoryPoint => ({
  date,
  data: { total_cadets: total, badges },
});

describe("cohortOf", () => {
  it("picks the squadron, a flight, or either without juniors", () => {
    expect(cohortOf(stats(), null, false)?.total_cadets).toBe(10);
    expect(cohortOf(stats(), null, true)?.total_cadets).toBe(4);
    expect(cohortOf(stats(), "A", false)?.total_cadets).toBe(6);
    expect(cohortOf(stats(), "A", true)?.total_cadets).toBe(3);
  });

  it("is undefined for slices an older snapshot doesn't carry, so trends skip it", () => {
    expect(cohortOf(stats({ flights: undefined }), "A", false)).toBeUndefined();
    expect(cohortOf(stats({ non_junior: undefined }), null, true)).toBeUndefined();
    expect(cohortOf(stats(), "Z", false)).toBeUndefined();
    expect(cohortOf(null, null, false)).toBeUndefined();
  });
});

describe("badgeHistoryFor", () => {
  it("drops snapshots without the chosen flight and ends on today's live numbers", () => {
    const history: StatsPoint[] = [
      { date: "2026-08-01T19:00:00", data: stats({ flights: undefined }) },
      { date: "2026-09-01T19:00:00", data: stats() },
    ];
    const out = badgeHistoryFor(history, stats(), "A", false, NOW);
    expect(out.map((p) => p.date)).toEqual(["2026-09-01T19:00:00", "2026-10-07"]);
    expect(out[1].data.total_cadets).toBe(6);
  });

  it("is just today's point when there's no history", () => {
    expect(badgeHistoryFor([], stats(), null, false, NOW)).toHaveLength(1);
  });

  it("is empty when the live numbers haven't loaded either", () => {
    expect(badgeHistoryFor([], undefined, null, false, NOW)).toEqual([]);
  });
});

describe("levelDeltas / heldDelta", () => {
  const history = [
    point("2026-07-01", { first_aid: { None: 8, Blue: 2 } }),
    point("2026-08-01", { first_aid: { None: 1, Blue: 9 } }),
    point("2026-10-07", { first_aid: { None: 5, Blue: 3, Bronze: 2 } }),
  ];

  it("compares the first and last points, leaving out unmoved levels and None", () => {
    expect(levelDeltas(history, "first_aid")).toEqual({ Blue: 1, Bronze: 2 });
    expect(levelDeltas([history[0], history[0]], "first_aid")).toEqual({});
  });

  it("counts a level that disappeared as a loss", () => {
    expect(levelDeltas([history[2], history[0]], "first_aid")).toEqual({ Blue: -1, Bronze: -2 });
  });

  it("has nothing to compare with fewer than two points", () => {
    expect(levelDeltas(history.slice(0, 1), "first_aid")).toEqual({});
    expect(heldDelta([], "first_aid")).toBe(0);
  });

  it("tracks how many hold the badge at all", () => {
    expect(heldDelta(history, "first_aid")).toBe(3);
  });

  it("treats a badge missing from a snapshot as nobody holding it", () => {
    expect(heldDelta([point("2026-07-01", {}, 10), history[2]], "first_aid")).toBe(5);
  });
});

describe("levelShares", () => {
  it("gives each level's share in percent", () => {
    const rows = levelShares([point("d", { first_aid: { None: 2, Blue: 1 } }, 3)], "first_aid", [
      "None",
      "Blue",
    ]);
    expect(rows).toEqual([{ date: "d", None: 66.7, Blue: 33.3, "n:None": 2, "n:Blue": 1 }]);
  });

  it("is all zeros for an empty cohort rather than dividing by zero", () => {
    expect(levelShares([point("d", {}, 0)], "first_aid", ["None"])).toEqual([
      { date: "d", None: 0, "n:None": 0 },
    ]);
  });
});

describe("trendLevels", () => {
  it("stacks held levels lowest first with None on top, even when nobody is unbadged", () => {
    const h = [point("d", { road_marching: { Nijmegen: 1, Blue: 2 } })];
    expect(trendLevels(h, "road_marching")).toEqual(["Blue", "Nijmegen", "None"]);
  });

  it("keeps levels it doesn't know about, after the known ones", () => {
    expect(trendLevels([point("d", { x: { Platinum: 1, Gold: 1 } })], "x")).toEqual([
      "Gold",
      "Platinum",
      "None",
    ]);
  });
});

describe("sortBadges", () => {
  const cohort = {
    total_cadets: 10,
    badges: {
      first_aid: { None: 9, Blue: 1 },
      leadership: { None: 2, Blue: 8 },
      cyber: { None: 5, Bronze: 5 },
    },
  };

  it("orders by share held, keeping catalogue order for ties", () => {
    const most = sortBadges("most", cohort, []);
    expect(most.slice(0, 3)).toEqual(["leadership", "cyber", "first_aid"]);
    const least = sortBadges("least", cohort, []);
    // Every badge nobody holds ties at 0%, so they keep catalogue order ahead of first aid.
    expect(least.indexOf("first_aid")).toBeLessThan(least.indexOf("cyber"));
    expect(least.at(-1)).toBe("leadership");
  });

  it("puts the biggest gain over the range first", () => {
    const history = [
      point("a", { cyber: { None: 10 }, first_aid: { None: 9, Blue: 1 } }),
      point("b", { cyber: { None: 5, Bronze: 5 }, first_aid: { None: 9, Blue: 1 } }),
    ];
    expect(sortBadges("improved", cohort, history)[0]).toBe("cyber");
  });

  it("leaves the catalogue order alone by default", () => {
    expect(sortBadges("catalogue", cohort, [])[0]).toBe("duke_of_edinburgh");
  });

  it("copes with an empty squadron", () => {
    expect(sortBadges("most", { total_cadets: 0, badges: {} }, [])).toHaveLength(12);
  });
});

describe("strengthHistory", () => {
  it("flattens flight counts per point and adds today", () => {
    const out = strengthHistory(
      [{ date: "2026-09-01T19:00:00", data: stats({ by_flight: { A: 5 } }) }],
      stats(),
      NOW
    );
    expect(out).toEqual([
      { date: "2026-09-01T19:00:00", A: 5 },
      { date: "2026-10-07", A: 6, B: 4 },
    ]);
  });
});

describe("ranges and flights", () => {
  it("orders known flights first and keeps unknown ones", () => {
    expect(orderedFlights(["Unknown", "C", "A", "NCO", "D"])).toEqual(["NCO", "A", "C", "D", "Unknown"]);
    expect(orderedFlights([])).toEqual([]);
  });

  it("colours a flight by name, not by position, so filtering doesn't repaint it", () => {
    expect(flightColor("B")).toBe(flightColor("B"));
    expect(flightColor("A")).not.toBe(flightColor("B"));
    expect(flightColor("Unknown")).toBe("var(--muted-foreground)");
  });
});

const params = (q: string) => new URLSearchParams(q);

describe("time ranges", () => {
  it("defaults an unknown or missing range to six months", () => {
    expect(parseTimeRange(params(""))).toEqual({ kind: "quick", id: "6m" });
    expect(parseTimeRange(params("range=forever"))).toEqual({ kind: "quick", id: "6m" });
    expect(parseTimeRange(params("range=2w"))).toEqual({ kind: "quick", id: "2w" });
  });

  it("prefers a valid from/to over a preset", () => {
    expect(parseTimeRange(params("range=1y&from=2026-01-05&to=2026-03-03"))).toEqual({
      kind: "absolute",
      from: "2026-01-05",
      to: "2026-03-03",
    });
  });

  it.each([
    ["only one end", "from=2026-01-05"],
    ["backwards", "from=2026-03-03&to=2026-01-05"],
    ["not a real day", "from=2026-02-30&to=2026-03-03"],
    ["the wrong format", "from=05/01/2026&to=2026-03-03"],
  ])("falls back to the preset when from/to is %s", (_why, q) => {
    expect(parseTimeRange(params(`range=1m&${q}`))).toEqual({ kind: "quick", id: "1m" });
  });

  it("recognises real calendar days only", () => {
    expect(isIsoDay("2028-02-29")).toBe(true);
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2026-1-5")).toBe(false);
    expect(isIsoDay(null)).toBe(false);
  });

  it("builds the API query for each kind of range", () => {
    expect(rangeQuery({ kind: "quick", id: "2w" })).toBe("days=14");
    expect(rangeQuery({ kind: "quick", id: "1m" })).toBe("days=30");
    expect(rangeQuery({ kind: "quick", id: "all" })).toBe("");
    expect(rangeQuery({ kind: "quick", id: "all" }, "days=36500")).toBe("days=36500");
    expect(rangeQuery({ kind: "absolute", from: "2026-01-05", to: "2026-03-03" })).toBe(
      "start=2026-01-05&end=2026-03-03"
    );
  });

  it("labels and phrases a range for the button and for sentences", () => {
    const abs = { kind: "absolute", from: "2026-01-05", to: "2026-03-03" } as const;
    expect(rangeLabel({ kind: "quick", id: "1m" })).toBe("Last month");
    expect(rangeLabel(abs)).toBe("5 Jan 2026 – 3 Mar 2026");
    expect(rangeLabel({ kind: "absolute", from: "2026-01-05", to: "2026-01-05" })).toBe("5 Jan 2026");
    expect(rangePhrase({ kind: "quick", id: "2w" })).toBe("in the last 2 weeks");
    expect(rangePhrase({ kind: "quick", id: "all" })).toBe("in all recorded history");
    expect(rangePhrase(abs)).toBe("between 5 Jan 2026 and 3 Mar 2026");
  });

  it("only ends on today's live numbers when the range reaches today", () => {
    expect(rangeIncludesToday({ kind: "quick", id: "2w" }, NOW)).toBe(true);
    expect(rangeIncludesToday({ kind: "absolute", from: "2026-01-01", to: "2026-10-07" }, NOW)).toBe(true);
    expect(rangeIncludesToday({ kind: "absolute", from: "2026-01-01", to: "2026-10-06" }, NOW)).toBe(false);
  });
});

describe("addDays", () => {
  it("counts calendar days across month ends and clock changes", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    // The clocks go back on 25 Oct 2026; a 24-hour step would land on the same day.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("stepping and zooming the range", () => {
  const abs = (from: string, to: string) => ({ kind: "absolute", from, to }) as const;

  it("reads a preset as the days it covers, ending today", () => {
    expect(rangeBounds({ kind: "quick", id: "2w" }, NOW)).toEqual({ from: "2026-09-23", to: "2026-10-07" });
    expect(rangeBounds({ kind: "quick", id: "all" }, NOW)).toBeNull();
  });

  it("steps back by the range's own length", () => {
    expect(shiftRange(abs("2026-03-01", "2026-03-31"), -1, NOW)).toEqual(abs("2026-01-29", "2026-02-28"));
    // A preset steps back into a custom range of the same length.
    expect(shiftRange({ kind: "quick", id: "2w" }, -1, NOW)).toEqual(abs("2026-09-08", "2026-09-22"));
  });

  it("steps forward, stopping at today", () => {
    expect(shiftRange(abs("2026-03-01", "2026-03-31"), 1, NOW)).toEqual(abs("2026-04-01", "2026-05-01"));
    expect(shiftRange(abs("2026-09-20", "2026-09-30"), 1, NOW)).toEqual(abs("2026-09-27", "2026-10-07"));
  });

  it("can't step past today or move 'All time'", () => {
    expect(shiftRange({ kind: "quick", id: "1m" }, 1, NOW)).toBeNull();
    expect(shiftRange(abs("2026-09-01", "2026-10-07"), 1, NOW)).toBeNull();
    expect(shiftRange({ kind: "quick", id: "all" }, -1, NOW)).toBeNull();
  });

  it("zooms out to twice the length around the same middle", () => {
    expect(zoomOutRange(abs("2026-03-10", "2026-03-19"), NOW)).toEqual(abs("2026-03-05", "2026-03-24"));
  });

  it("zooming out near today pushes the extra days into the past", () => {
    expect(zoomOutRange(abs("2026-09-28", "2026-10-07"), NOW)).toEqual(abs("2026-09-18", "2026-10-07"));
    expect(zoomOutRange({ kind: "quick", id: "all" }, NOW)).toBeNull();
  });

  it("turns a drag either way into a range, and a click into nothing", () => {
    expect(dragRange("2026-05-01T19:00:00", "2026-03-01")).toEqual(abs("2026-03-01", "2026-05-01"));
    expect(dragRange("2026-05-01T19:00:00", "2026-05-01T21:00:00")).toBeNull();
  });
});

const target = (over: Partial<StatsTarget> = {}): StatsTarget => ({
  id: 1,
  badge: "first_aid",
  min_level: "Bronze",
  flight: null,
  exclude_juniors: false,
  target_pct: 50,
  due: "2027-01-01",
  levels: ["Bronze", "Silver", "Gold"],
  created_by: null,
  ...over,
});

describe("targets", () => {
  const cohort = { total_cadets: 10, badges: { first_aid: { None: 4, Blue: 2, Bronze: 3, Gold: 1 } } };

  it("counts only the levels that meet the target", () => {
    expect(targetPct(cohort, "first_aid", ["Bronze", "Silver", "Gold"])).toBe(40);
    expect(targetPct({ total_cadets: 0, badges: {} }, "first_aid", ["Gold"])).toBeNull();
    expect(targetPct(undefined, "first_aid", ["Gold"])).toBeNull();
  });

  it("follows the target's cohort through history, skipping snapshots without it", () => {
    const history: StatsPoint[] = [
      { date: "2026-08-01T19:00:00", data: stats({ flights: undefined }) },
      { date: "2026-09-01T19:00:00", data: stats() },
    ];
    const series = targetSeries(history, stats(), target({ flight: "A", levels: ["Blue"] }), NOW);
    expect(series).toEqual([
      { date: "2026-09-01", pct: 66.7 },
      { date: "2026-10-07", pct: 66.7 },
    ]);
  });

  const line = (...pcts: number[]) => pcts.map((pct, i) => ({ date: addDays("2026-01-01", i * 7), pct }));

  it("says a target is met once the latest point reaches it", () => {
    expect(targetOutlook(line(10, 50), target())).toEqual({ status: "met" });
  });

  it("won't project from less than a fortnight of history", () => {
    expect(targetOutlook(line(10), target())).toEqual({ status: "unknown" });
    expect(
      targetOutlook(
        [
          { date: "2026-01-01", pct: 10 },
          { date: "2026-01-05", pct: 20 },
        ],
        target()
      )
    ).toEqual({
      status: "unknown",
    });
  });

  it("projects when a steady rise reaches the goal", () => {
    // +5 points a week from 10%: 50% is 8 weeks in, five weeks after the last point.
    expect(targetOutlook(line(10, 15, 20, 25), target())).toEqual({
      status: "on-track",
      projectedDate: "2026-02-26",
    });
    expect(targetOutlook(line(10, 15, 20, 25), target({ due: "2026-02-01" }))).toEqual({
      status: "behind",
      projectedDate: "2026-02-26",
    });
  });

  it("is behind with no date when the trend is flat or falling", () => {
    expect(targetOutlook(line(30, 30, 30), target())).toEqual({ status: "behind", projectedDate: null });
    expect(targetOutlook(line(40, 30, 20), target())).toEqual({ status: "behind", projectedDate: null });
  });

  it("describes a target in words", () => {
    expect(describeTarget(target({ flight: "A", exclude_juniors: true, target_pct: 80 }))).toBe(
      "80% of non-juniors in A Flight with Bronze or better First Aid by 1 Jan 2027"
    );
    expect(describeTarget(target({ min_level: null }))).toBe("50% of cadets with First Aid by 1 Jan 2027");
  });
});
