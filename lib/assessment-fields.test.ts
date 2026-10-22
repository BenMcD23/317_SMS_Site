import { describe, expect, it } from "vitest";

import {
  DEBRIEF_MAX,
  isoDateForInput,
  LEADERSHIP_QUESTIONS,
  leadershipPassed,
  MOI_ALL_QUESTIONS,
  MOI_MAX_SCORE,
  MOI_PASS_SCORE,
  MOI_SECTIONS,
  MOI_SUMMARY_MAX,
  moiPassed,
  normaliseScores,
  RADIO_COMMENTS_MAX,
  RADIO_CRITERIA,
  radioPassed,
  SPACE_CHECKLIST,
  SPACE_EXPERIMENTS_MAX,
  spacePassed,
  type ScoreMap,
} from "@/lib/assessment-fields";

const all = (n: number, score: number): ScoreMap =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, score]));

// The pass rules and limits are enforced again by the API
// (assessment_builders/*.py, routers/assessments.py). These pin the numbers the
// two sides must agree on, so a change to one fails here until the other follows.
describe("contract with the API", () => {
  it("has the question counts the API's pass rules expect", () => {
    expect(LEADERSHIP_QUESTIONS).toHaveLength(10);
    expect(MOI_ALL_QUESTIONS).toHaveLength(13);
    expect(MOI_PASS_SCORE).toBe(35);
    expect(MOI_MAX_SCORE).toBe(65);
  });

  it("uses the API's text limits", () => {
    expect(RADIO_COMMENTS_MAX).toBe(140);
    expect(SPACE_EXPERIMENTS_MAX).toBe(500);
    expect(MOI_SUMMARY_MAX).toBe(1150);
    expect(Object.fromEntries(MOI_SECTIONS.map((s) => [s.id, s.commentLimit]))).toEqual({
      identifying: 670,
      planning: 900,
      resources: 900,
      delivery: 500,
      assessment: 900,
      evaluation: 900,
    });
    expect(DEBRIEF_MAX).toBeGreaterThan(0);
  });

  it("uses the radio and space keys the API's PDF builders know", () => {
    expect(RADIO_CRITERIA.map((c) => c.id)).toEqual([
      "callsigns",
      "auth_1a",
      "auth_1b",
      "radio_2a",
      "radio_2b",
      "tactical_3",
      "say_again_4",
      "say_again_5",
      "prowords",
      "verbal_understanding",
      "verbal_security",
    ]);
    expect(SPACE_CHECKLIST.map((c) => c.id)).toEqual([
      "pts",
      "section_1a",
      "section_1b",
      "section_2",
      "section_3",
      "section_4",
      "section_5",
      "practical",
    ]);
  });

  it("has unique question ids", () => {
    const ids = MOI_ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("leadershipPassed", () => {
  it.each([
    ["exactly 30, all answered", all(10, 3), true],
    ["29", { ...all(10, 3), 10: 2 }, false],
    ["one unanswered", { ...all(10, 4), 10: null }, false],
    ["a single 1 fails outright", { ...all(10, 5), 1: 1 }, false],
    ["nothing answered", {}, false],
  ])("%s", (_, scores, passed) => {
    expect(leadershipPassed(scores as ScoreMap)).toBe(passed);
  });
});

describe("moiPassed", () => {
  it.each([
    ["39 over 13", all(13, 3), true],
    ["exactly 35", { ...all(13, 3), 1: 2, 2: 2, 3: 2, 4: 2 }, true],
    ["34", { ...all(13, 3), 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 }, false],
    ["12 answered", { ...all(13, 5), 13: null }, false],
    ["a 1", { ...all(13, 5), 7: 1 }, false],
  ])("%s", (_, scores, passed) => {
    expect(moiPassed(scores as ScoreMap)).toBe(passed);
  });
});

describe("radioPassed / spacePassed", () => {
  it("needs every box ticked", () => {
    const radio = Object.fromEntries(RADIO_CRITERIA.map((c) => [c.id, true]));
    expect(radioPassed(radio)).toBe(true);
    expect(radioPassed({ ...radio, verbal_security: false })).toBe(false);
    expect(radioPassed({})).toBe(false);

    const space = Object.fromEntries(SPACE_CHECKLIST.map((c) => [c.id, true]));
    expect(spacePassed(space)).toBe(true);
    expect(spacePassed({ ...space, pts: false })).toBe(false);
  });
});

describe("normaliseScores", () => {
  it("fills every expected id, keeping only numbers", () => {
    expect(normaliseScores({ "1": 4, "2": null, "9": 5 }, [1, 2, 3])).toEqual({ 1: 4, 2: null, 3: null });
    expect(normaliseScores(undefined, [1])).toEqual({ 1: null });
    expect(normaliseScores({ "1": "4" as unknown as number }, [1])).toEqual({ 1: null });
  });
});

describe("isoDateForInput", () => {
  it.each([
    ["2026-03-04", undefined, "2026-03-04"],
    [undefined, "04/03/26", "2026-03-04"],
    ["", "04/03/26", "2026-03-04"],
    ["04/03/2026", undefined, ""],
    [undefined, "4/3/26", ""],
    [undefined, undefined, ""],
  ])("(%s, %s) -> %s", (iso, display, expected) => {
    expect(isoDateForInput(iso, display)).toBe(expected);
  });
});
