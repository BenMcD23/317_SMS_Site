/**
 * The progressive drill syllabus: types for the API's /drill endpoints, the
 * writes, and the small rules the Drill page shows. The API decides where a
 * cadet is (core/drill.py); these only read its answer, so the page and the
 * API can't disagree about who is ready for a test.
 */
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

export type DrillLesson = { id: number; name: string };
export type DrillStage = {
  id: number;
  name: string;
  test_name: string | null;
  max_score: number | null;
  pass_mark: number | null;
  lessons: DrillLesson[];
};
export type StageStatus = "not_started" | "in_progress" | "ready" | "complete";
export type LessonMark = { taught_at: string | null; passed_at: string | null; passed_by: string | null };
export type DrillAttempt = {
  id: number;
  stage_id: number;
  tested_on: string;
  score: number | null;
  passed: boolean;
  notes: string | null;
  tested_by: string;
};
export type DrillCadet = {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  lessons: Record<string, LessonMark>;
  tests: DrillAttempt[];
  stages: Record<string, StageStatus>;
  current: number | null;
  ready_for_test: number[];
};
export type DrillProgress = { stages: DrillStage[]; cadets: DrillCadet[] };

export const DRILL_KEYS = {
  syllabus: ["drill", "syllabus"],
  progress: ["drill", "progress"],
} as const;

/** Plain words for a stage's state, as a 12-year-old or a new NCO reads them. */
export const STATUS_LABEL: Record<StageStatus, string> = {
  not_started: "Not started",
  in_progress: "Learning",
  ready: "Ready for test",
  complete: "Passed",
};

export type LessonState = "none" | "taught" | "passed";

export function lessonState(cadet: DrillCadet, lessonId: number): LessonState {
  const mark = cadet.lessons[String(lessonId)];
  if (mark?.passed_at) return "passed";
  if (mark?.taught_at) return "taught";
  return "none";
}

/** "3 of 4 passed" for the stage a cadet is on. */
export function stageCount(cadet: DrillCadet, stage: DrillStage): { passed: number; total: number } {
  return {
    passed: stage.lessons.filter((l) => lessonState(cadet, l.id) === "passed").length,
    total: stage.lessons.length,
  };
}

/** Cadets ready for each stage's test, in syllabus order, leaving out stages nobody is ready for. */
export function readyByStage(
  progress: DrillProgress,
  cadets: DrillCadet[]
): { stage: DrillStage; cadets: DrillCadet[] }[] {
  return progress.stages
    .map((stage) => ({ stage, cadets: cadets.filter((c) => c.ready_for_test.includes(stage.id)) }))
    .filter((g) => g.cadets.length > 0);
}

/** How a test score reads: "18/25", "18", or nothing when only pass/fail was recorded. */
export function scoreLabel(attempt: DrillAttempt, stage: DrillStage | undefined): string | null {
  if (attempt.score === null) return null;
  return stage?.max_score ? `${attempt.score}/${stage.max_score}` : String(attempt.score);
}

// ── writes ────────────────────────────────────────────────────────────────────

const url = (path: string) => `${API_BASE}${path}`;

export function markLesson(token: string, cin: number, lessonId: number, state: LessonState) {
  return apiRequest<{ taught_at: string | null; passed_at: string | null }>(
    token,
    url(`/cadets/${cin}/drill/lessons/${lessonId}`),
    { method: "PUT", body: { taught: state !== "none", passed: state === "passed" } },
    "Couldn't save the lesson."
  );
}

export function markSquad(token: string, lessonId: number, cins: number[], passed: boolean) {
  return apiRequest<{ changed: number }>(
    token,
    url(`/drill/lessons/${lessonId}/mark`),
    { method: "POST", body: { cins, passed } },
    "Couldn't save the lesson."
  );
}

export type AttemptInput = {
  stage_id: number;
  tested_on: string;
  score?: number | null;
  passed?: boolean | null;
  notes?: string | null;
};

export function recordAttempt(token: string, cin: number, body: AttemptInput) {
  return apiRequest<DrillAttempt>(
    token,
    url(`/cadets/${cin}/drill/tests`),
    { method: "POST", body },
    "Couldn't save the test."
  );
}

export function deleteAttempt(token: string, id: number) {
  return apiRequest<null>(
    token,
    url(`/drill/tests/${id}`),
    { method: "DELETE" },
    "Couldn't delete the test."
  );
}

export type StageInput = {
  name: string;
  test_name: string | null;
  max_score: number | null;
  pass_mark: number | null;
};

export function saveStage(token: string, body: StageInput, id?: number) {
  return apiRequest<DrillStage>(
    token,
    url(id ? `/drill/stages/${id}` : "/drill/stages"),
    { method: id ? "PUT" : "POST", body },
    "Couldn't save the stage."
  );
}

export function deleteStage(token: string, id: number) {
  return apiRequest<null>(
    token,
    url(`/drill/stages/${id}`),
    { method: "DELETE" },
    "Couldn't delete the stage."
  );
}

export function orderStages(token: string, ids: number[]) {
  return apiRequest<DrillStage[]>(token, url("/drill/stages-order"), { method: "PUT", body: { ids } });
}

export function addLesson(token: string, stageId: number, name: string) {
  return apiRequest<DrillLesson>(
    token,
    url(`/drill/stages/${stageId}/lessons`),
    { method: "POST", body: { name } },
    "Couldn't add the lesson."
  );
}

export function renameLesson(token: string, id: number, name: string) {
  return apiRequest<DrillLesson>(
    token,
    url(`/drill/lessons/${id}`),
    { method: "PUT", body: { name } },
    "Couldn't rename the lesson."
  );
}

export function deleteLesson(token: string, id: number) {
  return apiRequest<null>(
    token,
    url(`/drill/lessons/${id}`),
    { method: "DELETE" },
    "Couldn't delete the lesson."
  );
}

export function orderLessons(token: string, stageId: number, ids: number[]) {
  return apiRequest<DrillStage>(token, url(`/drill/stages/${stageId}/lessons-order`), {
    method: "PUT",
    body: { ids },
  });
}

/** `ids` with the one at `index` moved one place up (-1) or down (+1). */
export function moved(ids: number[], index: number, by: -1 | 1): number[] {
  const to = index + by;
  if (to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
