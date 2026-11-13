import { describe, expect, it } from "vitest";

import {
  lessonState,
  moved,
  readyByStage,
  scoreLabel,
  stageCount,
  type DrillAttempt,
  type DrillCadet,
  type DrillProgress,
  type DrillStage,
} from "@/lib/drill";

const STAGE: DrillStage = {
  id: 1,
  name: "Stage 1",
  test_name: "5x5 drill test",
  max_score: 25,
  pass_mark: 15,
  lessons: [
    { id: 11, name: "Turns" },
    { id: 12, name: "Saluting" },
  ],
};
const UNTESTED: DrillStage = {
  ...STAGE,
  id: 2,
  name: "Stage 2",
  test_name: null,
  max_score: null,
  lessons: [],
};

function cadet(over: Partial<DrillCadet> = {}): DrillCadet {
  return {
    cin: 1,
    name: "Siân Ó Briain",
    rank: null,
    flight: "A",
    lessons: {},
    tests: [],
    stages: {},
    current: 1,
    ready_for_test: [],
    ...over,
  };
}

describe("lessonState", () => {
  it("reads passed over taught, and nothing as none", () => {
    const c = cadet({
      lessons: {
        "11": { taught_at: "2026-01-01", passed_at: "2026-01-08", passed_by: "x" },
        "12": { taught_at: "2026-01-01", passed_at: null, passed_by: null },
      },
    });
    expect([lessonState(c, 11), lessonState(c, 12), lessonState(c, 99)]).toEqual([
      "passed",
      "taught",
      "none",
    ]);
  });
});

describe("stageCount", () => {
  it("counts passed lessons out of the stage's", () => {
    const c = cadet({ lessons: { "11": { taught_at: "x", passed_at: "y", passed_by: null } } });
    expect(stageCount(c, STAGE)).toEqual({ passed: 1, total: 2 });
    expect(stageCount(c, UNTESTED)).toEqual({ passed: 0, total: 0 });
  });
});

describe("readyByStage", () => {
  it("groups the cadets ready for each stage's test, in syllabus order, leaving empty stages out", () => {
    const progress: DrillProgress = { stages: [STAGE, UNTESTED], cadets: [] };
    const a = cadet({ cin: 1, ready_for_test: [1] });
    const b = cadet({ cin: 2, ready_for_test: [] });
    expect(readyByStage(progress, [a, b])).toEqual([{ stage: STAGE, cadets: [a] }]);
    expect(readyByStage(progress, [])).toEqual([]);
  });
});

describe("scoreLabel", () => {
  const attempt = (score: number | null): DrillAttempt => ({
    id: 1,
    stage_id: 1,
    tested_on: "2026-01-01",
    score,
    passed: true,
    notes: null,
    tested_by: "x",
  });
  it("shows the score out of the stage's maximum, or alone, or nothing", () => {
    expect(scoreLabel(attempt(18), STAGE)).toBe("18/25");
    expect(scoreLabel(attempt(18), UNTESTED)).toBe("18");
    expect(scoreLabel(attempt(0), STAGE)).toBe("0/25"); // zero is a score, not "no score"
    expect(scoreLabel(attempt(null), STAGE)).toBeNull();
  });
});

describe("moved", () => {
  it("swaps one place up or down and leaves the ends alone", () => {
    expect(moved([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moved([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
