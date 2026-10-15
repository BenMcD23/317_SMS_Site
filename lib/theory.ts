/**
 * Theory lessons on the Classifications page — the shapes /cadets/theory/*
 * sends, and the rules for who still has a subject to do and where a lesson's
 * QR code points. Kept out of the page so they're tested on their own.
 */

import { apiRequest } from "@/lib/api-fetch";
import { API_BASE, PORTAL_URL } from "@/lib/config";

/** A subject and how many lessons it's taught over (3 for classification, 1 for badge theory). */
export type TheorySubject = { key: string; name: string; category: string; parts: number };

export type SubjectProgress = {
  /** Lesson numbers had, ascending. */
  lessons: number[];
  /** Every lesson in, so it's ready for its exam. */
  taught: boolean;
  /** The exam passed on the portal, a classification that covers it, or the badge held. */
  passed: boolean;
};

export type CadetProgress = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  classification: string | null;
  /** Only subjects with something to show; a missing one is not started. */
  subjects: Record<string, SubjectProgress>;
};

export type LessonCode = TheorySubject & { part: number; code: string };

export const NOT_STARTED: SubjectProgress = { lessons: [], taught: false, passed: false };

export function progressOf(cadet: CadetProgress, key: string): SubjectProgress {
  return cadet.subjects[key] ?? NOT_STARTED;
}

/**
 * Categories for the page's tabs and lists: the classification subjects first,
 * as they're what the page is mostly for, then badge theory. Otherwise in the
 * API's order.
 */
export function categoriesOf(subjects: Pick<TheorySubject, "category">[]): string[] {
  const all = [...new Set(subjects.map((s) => s.category))];
  return [...all.filter((c) => c !== "Badges"), ...all.filter((c) => c === "Badges")];
}

// Classification ladder, lowest first; mirrors CLASSIFICATION_ORDER in the API's
// core/theory_lessons.py. A cadet below a category's start isn't working on it yet.
const LADDER = [
  "Second Class Cadet",
  "First Class Cadet",
  "Leading Cadet",
  "Senior Cadet",
  "Master Air Cadet",
];
const STARTS_AT: Record<string, string> = {
  Leading: "First Class Cadet",
  "Senior/Master": "Leading Cadet",
};

function rank(classification: string | null): number {
  return LADDER.indexOf(classification ?? "");
}

/**
 * Whether the cadet still has something to do in this category: they're at
 * the classification that works on it (or have made a start anyway), and they
 * haven't passed every subject in it. Badge theory is open to everyone.
 */
export function stillToDo(cadet: CadetProgress, subjects: TheorySubject[]): boolean {
  if (subjects.every((s) => progressOf(cadet, s.key).passed)) return false;
  const start = STARTS_AT[subjects[0]?.category ?? ""];
  if (!start || rank(cadet.classification) >= rank(start)) return true;
  return subjects.some((s) => progressOf(cadet, s.key).lessons.length > 0);
}

/** "2 of 3 lessons", "Taught", "Passed" — what a progress cell says to a screen reader and on hover. */
export function progressLabel(progress: SubjectProgress, parts: number): string {
  if (progress.passed) return "Passed";
  if (progress.taught) return "Taught, exam to sit";
  if (!progress.lessons.length) return "Not started";
  return parts === 1 ? "Done" : `Lessons ${progress.lessons.join(", ")} of ${parts}`;
}

/** "Lesson 2" for a three-lesson subject; badge theory is one session, so just its name. */
export function lessonLabel(subject: Pick<TheorySubject, "parts">, part: number): string {
  return subject.parts === 1 ? "Theory" : `Lesson ${part}`;
}

/**
 * The portal page a lesson's QR opens. The code never changes, so the QR can
 * stay on the lesson's slides; null when the site doesn't know the portal's
 * address, rather than printing codes that go nowhere.
 */
export function lessonUrl(code: string, portal: string = PORTAL_URL): string | null {
  if (!portal) return null;
  return `${portal.replace(/\/+$/, "")}/lesson/${encodeURIComponent(code)}`;
}

/** A file name for a downloaded QR, e.g. "airmanship-lesson-2.png". */
export function qrFileName(subject: Pick<TheorySubject, "name" | "parts">, part: number): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${slug(subject.name)}-${slug(lessonLabel(subject, part))}.png`;
}

/** React Query keys; recording a lesson refreshes both progress and the night's plan. */
export const THEORY_KEYS = {
  subjects: ["theory", "lessons"],
  progress: ["theory", "progress"],
  codes: ["theory", "qr-codes"],
  plan: ["classification-day"],
} as const;

/** One lesson of a subject, or (no part) every lesson of it. */
export type LessonRef = { key: string; part?: number };

/** Record (or with completed=false, clear) lessons for some cadets. Rejects with the API's message. */
export function markLessons(
  token: string,
  cadetCins: number[],
  lessons: LessonRef[],
  completed = true
): Promise<{ changed: number }> {
  return apiRequest(
    token,
    `${API_BASE}/cadets/theory/mark`,
    { method: "POST", body: { cadet_cins: cadetCins, lessons, completed } },
    "Couldn't save the lessons."
  );
}
