import { describe, expect, it } from "vitest";

import {
  buildGroups,
  countFlagged,
  parseSlotId,
  planToTsv,
  slotId,
  suggestedSlot,
  type PlannedCadet,
  type Subject,
} from "@/lib/classification-day";

const SUBJECTS: Subject[] = [
  { key: "nav", name: "Basic Navigation", category: "Leading" },
  { key: "pof", name: "Principles of Flight", category: "Leading" },
  { key: "jep", name: "Jet Engine Propulsion", category: "Senior/Master" },
];

function cadet(cin: number, over: Partial<PlannedCadet> = {}): PlannedCadet {
  return {
    cin,
    first_name: `First${cin}`,
    last_name: `Last${cin}`,
    rank: null,
    flight: "A",
    classification: "First Class Cadet",
    kind: "lesson",
    lesson_key: "nav",
    lesson_name: "Basic Navigation",
    ready_exams: [],
    awaiting: null,
    attendance: {
      nights: 10,
      present: 10,
      weekday_nights: 5,
      weekday_present: 5,
      last_present: "2026-10-07",
      likelihood: 1,
      flags: [],
    },
    ...over,
  };
}

describe("slots", () => {
  it("round-trip through their select value", () => {
    for (const slot of [
      { kind: "exam", key: "nav" },
      { kind: "lesson", key: "jep" },
      { kind: "float" },
    ] as const) {
      expect(parseSlotId(slotId(slot))).toEqual(slot);
    }
  });

  it("a lesson or exam value with no subject takes the cadet off the list", () => {
    expect(parseSlotId("lesson:")).toEqual({ kind: "none" });
    expect(parseSlotId("exam")).toEqual({ kind: "none" });
  });

  it("the suggestion follows the API, and a lesson with no subject is taken off the list", () => {
    expect(suggestedSlot(cadet(1, { kind: "exam", lesson_key: "pof" }))).toEqual({
      kind: "exam",
      key: "pof",
    });
    expect(suggestedSlot(cadet(1, { kind: "not_offered" }))).toEqual({ kind: "not_offered" });
    expect(suggestedSlot(cadet(1, { kind: "lesson", lesson_key: null }))).toEqual({ kind: "none" });
  });
});

describe("buildGroups", () => {
  it("puts exams first, then lessons in syllabus order, then everyone else, leaving out empty groups", () => {
    const groups = buildGroups(
      [
        cadet(1, { kind: "lesson", lesson_key: "jep" }),
        cadet(2, { kind: "first_class", lesson_key: null }),
        cadet(3, { kind: "exam", lesson_key: "pof" }),
        cadet(4, { kind: "lesson", lesson_key: "nav" }),
        cadet(5, { kind: "exam", lesson_key: "nav" }),
      ],
      SUBJECTS,
      {}
    );
    expect(groups.map((g) => g.id)).toEqual(["exam", "lesson:nav", "lesson:jep", "first_class"]);
    // Exams in syllabus order too.
    expect(groups[0].cadets.map((p) => p.cadet.cin)).toEqual([5, 3]);
  });

  it("a move overrides the suggestion", () => {
    const groups = buildGroups([cadet(1), cadet(2)], SUBJECTS, { 2: { kind: "float" } });
    expect(groups.map((g) => [g.id, g.cadets.length])).toEqual([
      ["lesson:nav", 1],
      ["float", 1],
    ]);
  });

  it("an empty plan has no groups", () => {
    expect(buildGroups([], SUBJECTS, {})).toEqual([]);
  });

  it("a lesson the catalogue no longer lists still sorts, after the known ones", () => {
    const groups = buildGroups(
      [cadet(1, { kind: "exam", lesson_key: "gone" }), cadet(2, { kind: "exam", lesson_key: "nav" })],
      SUBJECTS,
      {}
    );
    expect(groups[0].cadets.map((p) => p.cadet.cin)).toEqual([2, 1]);
  });
});

describe("planToTsv", () => {
  it("writes one block per group with a row per cadet, their job and flags, skipping cadets taken off", () => {
    const flagged = cadet(2, {
      kind: "exam",
      lesson_key: "pof",
      attendance: {
        ...cadet(2).attendance,
        flags: [
          { code: "weekday", message: "Rarely in on Wednesdays: 1 of 8 (13%)" },
          { code: "absence_booked", message: "Absence\tbooked" },
        ],
      },
    });
    const groups = buildGroups([cadet(1), flagged, cadet(3)], SUBJECTS, { 3: { kind: "none" } });
    expect(planToTsv(groups, SUBJECTS)).toBe(
      [
        "Exams",
        "Last2, First2\tPrinciples of Flight exam\tRarely in on Wednesdays: 1 of 8 (13%); Absence booked",
        "",
        "Basic Navigation",
        "Last1, First1\tBasic Navigation\t",
      ].join("\n")
    );
  });
});

it("countFlagged counts cadets with any attendance flag", () => {
  const flag = { code: "no_history" as const, message: "x" };
  expect(countFlagged([cadet(1), cadet(2, { attendance: { ...cadet(2).attendance, flags: [flag] } })])).toBe(
    1
  );
});
