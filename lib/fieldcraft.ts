/**
 * Fieldcraft lessons from the Volunteer Portal (GET /cadets/fieldcraft). Bader
 * only records the finished badge; the portal records each lesson, so this is
 * where "who still needs Lesson 9" comes from. Read-only: lessons are recorded
 * on the portal and arrive with the next 317 Sync.
 */

export type FieldcraftLesson = { lesson_id: number; level: string; reference: string | null; title: string };
export type FieldcraftLevel = { level: string; lessons: FieldcraftLesson[] };
export type FieldcraftCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  classification: string | null;
  /** False when the sync has no fieldcraft record for them: unknown, not "nothing done". */
  synced: boolean;
  /** lessonId → the date it was done (null when the portal has no date). */
  done: Record<string, string | null>;
};
export type FieldcraftGrid = {
  synced_at: string | null;
  levels: FieldcraftLevel[];
  cadets: FieldcraftCadet[];
};

/** One cadet's lessons, as GET /cadets/{cin} carries them. */
export type CadetFieldcraftLevel = {
  level: string;
  lessons: (FieldcraftLesson & { done: boolean; completed_on: string | null; delivered_by: string | null })[];
};

export const FIELDCRAFT_KEY = ["cadets", "fieldcraft"] as const;

export const hasDone = (c: FieldcraftCadet, lesson: FieldcraftLesson) => String(lesson.lesson_id) in c.done;
const doneAll = (c: FieldcraftCadet, level: FieldcraftLevel) => level.lessons.every((l) => hasDone(c, l));

/**
 * Whether a cadet is working on `levels[i]`: not finished it, and either it's
 * the first level, they've started it, or they've finished the one before. So
 * Bronze's to-do list isn't everyone still on Blue.
 */
export function workingOn(c: FieldcraftCadet, levels: FieldcraftLevel[], i: number): boolean {
  const level = levels[i];
  if (!c.synced || !level || doneAll(c, level)) return false;
  return i === 0 || level.lessons.some((l) => hasDone(c, l)) || doneAll(c, levels[i - 1]);
}
