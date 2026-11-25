import { describe, expect, it } from "vitest";

import {
  bankPayload,
  bankFormFrom,
  categoryColour,
  cellId,
  columnRuns,
  fromTokens,
  initials,
  insertMention,
  issueCounts,
  layoutRow,
  matchPeople,
  mentionQuery,
  movedTo,
  nightLabel,
  parseCellId,
  sameSpot,
  slotFormFrom,
  slotPayload,
  slotSchema,
  splitBody,
  toTokens,
  whoLabel,
  type Issue,
  type Slot,
} from "@/lib/programme-builder";

const ALL = ["C", "A", "B"];

function slot(id: number, flights: string[], period: 1 | 2 | null = 1, extra: Partial<Slot> = {}): Slot {
  return {
    id,
    night_id: 1,
    period,
    flights,
    title: `S${id}`,
    category: "drill",
    bank_item_id: null,
    room_id: null,
    instructor: null,
    people: [],
    subject_key: null,
    part: null,
    notes: null,
    headcount: 0,
    open_comments: 0,
    ...extra,
  };
}

describe("labels", () => {
  it("names who a session is for", () => {
    expect(whoLabel([], ALL)).toBe("All");
    expect(whoLabel(["B", "C", "A"], ALL)).toBe("All");
    expect(whoLabel(["A"], ALL)).toBe("A Flight");
    expect(whoLabel(["B", "A"], ALL)).toBe("A and B Flights");
  });

  it("reads a night's date without the time zone moving it", () => {
    expect(nightLabel("2026-12-07")).toBe("Mon 7 Dec");
  });

  it("colours a kind with a chart hue and never a status colour", () => {
    expect(categoryColour("drill")).toBe("var(--chart-1)");
    expect(categoryColour("admin")).toBe("var(--muted-foreground)");
    expect(categoryColour("something new")).not.toMatch(/destructive|warning|success/);
  });

  it("takes initials from a rank and name", () => {
    expect(initials("Sgt Sarah Hughes")).toBe("SH");
    expect(initials("Zoë")).toBe("Z");
    expect(initials("")).toBe("?");
  });
});

describe("mentions", () => {
  it("splits a body into text and mention chips", () => {
    expect(splitBody("Hi @[Sgt Sarah Hughes](staff:3001), see @[Nina](cadet:1)")).toEqual([
      { text: "Hi " },
      { mention: { name: "Sgt Sarah Hughes", key: "staff:3001" } },
      { text: ", see " },
      { mention: { name: "Nina", key: "cadet:1" } },
    ]);
    expect(splitBody("no one")).toEqual([{ text: "no one" }]);
    // A look-alike that isn't a real token stays text.
    expect(splitBody("@[x](user:1)")).toEqual([{ text: "@[x](user:1)" }]);
  });

  it("knows when the caret is in an @ being typed", () => {
    expect(mentionQuery("Hello @sa")).toBe("sa");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("@Sarah Hu")).toBe("Sarah Hu");
    expect(mentionQuery("email me@example")).toBeNull();
    expect(mentionQuery("@Sarah said this is fine")).toBeNull();
    expect(mentionQuery("no at here")).toBeNull();
  });

  it("puts a picked name in place of what was typed", () => {
    expect(insertMention("Ask @sa about it", 7, "Sgt Sarah Hughes")).toEqual({
      text: "Ask @Sgt Sarah Hughes  about it",
      caret: 22,
    });
  });

  it("turns picks into tokens and back, dropping picks that were deleted", () => {
    const picked = [
      { key: "staff:1", name: "Sam" },
      { key: "staff:2", name: "Sam Staff" },
      { key: "cadet:3", name: "Gone" },
    ];
    const body = toTokens("@Sam Staff and @Sam, thanks", picked);
    expect(body).toBe("@[Sam Staff](staff:2) and @[Sam](staff:1), thanks");
    expect(fromTokens(body)).toEqual({
      text: "@Sam Staff and @Sam, thanks",
      picked: [
        { key: "staff:2", name: "Sam Staff" },
        { key: "staff:1", name: "Sam" },
      ],
    });
  });

  it("matches people by the start of a word first", () => {
    const people = [{ name: "CI Sam Staff" }, { name: "Sgt Sarah Hughes" }, { name: "Cpl Isa Samson" }];
    expect(matchPeople(people, "sa").map((p) => p.name)).toEqual([
      "CI Sam Staff",
      "Sgt Sarah Hughes",
      "Cpl Isa Samson",
    ]);
    expect(matchPeople(people, "hug").map((p) => p.name)).toEqual(["Sgt Sarah Hughes"]);
    expect(matchPeople(people, "", 2)).toHaveLength(2);
  });
});

describe("the grid", () => {
  it("finds runs of neighbouring columns", () => {
    expect(columnRuns([], ALL)).toEqual([[0, 3]]);
    expect(columnRuns(["A", "B"], ALL)).toEqual([[1, 2]]);
    expect(columnRuns(["C", "B"], ALL)).toEqual([
      [0, 1],
      [2, 1],
    ]);
    expect(columnRuns(["Z"], ALL)).toEqual([]);
  });

  it("stacks sessions that share a column and keeps rows apart", () => {
    const slots = [slot(1, []), slot(2, ["A"]), slot(3, ["B"]), slot(4, ["C"], 2), slot(5, ["A"], null)];
    const first = layoutRow(slots, 1, ALL);
    expect(first.lanes).toBe(2);
    expect(first.placed.map((p) => [p.slot.id, p.start, p.span, p.lane])).toEqual([
      [1, 0, 3, 0],
      [2, 1, 1, 1],
      [3, 2, 1, 1],
    ]);
    expect(layoutRow(slots, 2, ALL).placed.map((p) => p.slot.id)).toEqual([4]);
    expect(layoutRow(slots, "all", ALL).placed.map((p) => p.slot.id)).toEqual([5]);
    expect(layoutRow([], 1, ALL)).toEqual({ placed: [], lanes: 0 });
  });

  it("draws a session for flights that aren't neighbours once per run", () => {
    const { placed } = layoutRow([slot(1, ["C", "B"])], 1, ALL);
    expect(placed.map((p) => [p.start, p.span, p.lane])).toEqual([
      [0, 1, 0],
      [2, 1, 0],
    ]);
  });

  it("round-trips a drop target's id", () => {
    expect(parseCellId(cellId(12, 1, "A"))).toEqual({ nightId: 12, row: 1, flight: "A" });
    expect(parseCellId(cellId(3, "all", "C"))).toEqual({ nightId: 3, row: "all", flight: "C" });
    expect(parseCellId("bank:4")).toBeNull();
  });

  it("moves a session the way people expect when it's dropped", () => {
    const single = slot(1, ["A"]);
    expect(movedTo(single, { nightId: 2, row: 2, flight: "B" })).toEqual({
      night_id: 2,
      period: 2,
      flights: ["B"],
    });
    const shared = slot(2, ["A", "B"]);
    expect(movedTo(shared, { nightId: 1, row: 2, flight: "B" }).flights).toEqual(["A", "B"]);
    expect(movedTo(shared, { nightId: 1, row: 1, flight: "C" }).flights).toEqual(["A", "B"]);
    const everyone = slot(3, []);
    expect(movedTo(everyone, { nightId: 1, row: "all", flight: "C" })).toEqual({
      night_id: 1,
      period: null,
      flights: [],
    });
    expect(sameSpot(single, movedTo(single, { nightId: 1, row: 1, flight: "A" }))).toBe(true);
    expect(sameSpot(single, movedTo(single, { nightId: 1, row: 2, flight: "A" }))).toBe(false);
  });
});

describe("forms", () => {
  it("rejects a session without a name and says what to do", () => {
    const result = slotSchema.safeParse(slotFormFrom(null, { nightId: 1 }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Give the session a name");
  });

  it("sends a whole-night session for everyone with blanks as null", () => {
    const form = slotFormFrom(null, { nightId: 4, title: " Quiz ", period: "all", lesson: "acp_32_2:2" });
    expect(slotPayload(form)).toEqual({
      night_id: 4,
      title: "Quiz",
      category: "other",
      period: null,
      flights: [],
      room_id: null,
      instructor: null,
      people: [],
      subject_key: "acp_32_2",
      part: 2,
      notes: null,
    });
  });

  it("fills the form from a session and back without losing anything", () => {
    const s = slot(9, ["A"], 2, {
      title: "Map Reading 2",
      category: "lessons",
      room_id: 3,
      instructor: "Sgt H",
      people: [{ key: "cadet:1", name: "Nina" }],
      subject_key: "acp_32_2",
      part: 2,
      notes: "Bring maps",
    });
    expect(slotPayload(slotFormFrom(s))).toEqual({
      night_id: 1,
      title: "Map Reading 2",
      category: "lessons",
      period: 2,
      flights: ["A"],
      room_id: 3,
      instructor: "Sgt H",
      people: ["cadet:1"],
      subject_key: "acp_32_2",
      part: 2,
      notes: "Bring maps",
    });
  });

  it("leaves a bank lesson out when it has no number", () => {
    expect(bankPayload({ ...bankFormFrom(null), title: "X", lesson: "acp_32_2" })).toMatchObject({
      subject_key: null,
      part: null,
    });
  });
});

it("counts issues by kind", () => {
  const issue = (severity: Issue["severity"]): Issue => ({
    severity,
    code: "x",
    message: "x",
    night_id: null,
    slot_ids: [],
    fix: null,
  });
  expect(issueCounts([issue("clash"), issue("info"), issue("info")])).toEqual({
    clash: 1,
    warning: 0,
    info: 2,
  });
});
