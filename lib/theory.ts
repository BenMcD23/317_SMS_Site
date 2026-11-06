/**
 * Theory lessons in Training — the shapes /cadets/theory/*
 * sends, and the rules for who still has a subject to do and where a lesson's
 * QR code points. Kept out of the page so they're tested on their own.
 */

import { z } from "zod";

import { apiRequest } from "@/lib/api-fetch";
import { API_BASE, PORTAL_URL } from "@/lib/config";

/**
 * A subject and how many lessons it's taught over (3 for classification, 1 for
 * badge theory). `custom` is one staff added, rather than the built-in syllabus.
 */
export type TheorySubject = { key: string; name: string; category: string; parts: number; custom?: boolean };

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

const BUILT_IN_ORDER = ["Leading", "Senior/Master", "Badges"];

/**
 * Categories for the page's tabs and lists: the classification subjects first,
 * as they're what the page is mostly for, then badge theory, then sections
 * staff added, in the API's order.
 */
export function categoriesOf(subjects: Pick<TheorySubject, "category">[]): string[] {
  const all = [...new Set(subjects.map((s) => s.category))];
  return [
    ...BUILT_IN_ORDER.filter((c) => all.includes(c)),
    ...all.filter((c) => !BUILT_IN_ORDER.includes(c)),
  ];
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

/**
 * "2 of 3 lessons", "Taught", "Passed" — what a progress cell says to a screen
 * reader and on hover. `exam` is false for a subject staff added, which has none.
 */
export function progressLabel(progress: SubjectProgress, parts: number, exam = true): string {
  if (progress.passed) return "Passed";
  // A subject staff added has no exam: every lesson in is the end of it.
  if (progress.taught) return exam ? "Taught, exam to sit" : "All lessons had";
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
  sections: ["theory", "sections"],
  custom: ["theory", "custom-subjects"],
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

// ── sections and subjects staff add ───────────────────────────────────────────

/** A heading on the QR codes page. Built-in ones can't be renamed; `can_add` is false for the classification syllabus. */
export type TheorySection = {
  id: number | null;
  name: string;
  built_in: boolean;
  can_add: boolean;
  subjects: number;
};

/** A subject staff added, retired ones too. `used` means lessons are recorded on it: retire, don't delete. */
export type CustomSubject = {
  key: string;
  name: string;
  category: string;
  parts: number;
  active: boolean;
  codes: { part: number; code: string }[];
  used: boolean;
};

/** Must match MAX_PARTS in the API's core/theory_catalogue.py. */
export const MAX_LESSONS = 10;

export const sectionSchema = z.object({
  name: z.string().trim().min(1, "Give the section a name").max(60, "60 characters at most"),
});
export type SectionForm = z.infer<typeof sectionSchema>;

/** The subject form. An edit can't go below the lessons it already has: their codes may be printed. */
export function subjectSchema(minLessons = 1) {
  return z.object({
    name: z.string().trim().min(1, "Give it a name").max(120, "120 characters at most"),
    section: z.string().min(1, "Choose a section"),
    parts: z
      .number({ error: "Enter how many lessons" })
      .int("Whole lessons only")
      .min(minLessons, minLessons > 1 ? `At least ${minLessons}: those codes may be printed` : "At least 1")
      .max(MAX_LESSONS, `${MAX_LESSONS} at most`),
    active: z.boolean(),
  });
}
export type SubjectForm = z.infer<ReturnType<typeof subjectSchema>>;

const THEORY = `${API_BASE}/cadets/theory`;

export function saveSection(token: string, values: SectionForm, id?: number): Promise<TheorySection> {
  const body = { name: values.name.trim() };
  return id === undefined
    ? apiRequest(token, `${THEORY}/sections`, { method: "POST", body }, "Couldn't add the section.")
    : apiRequest(token, `${THEORY}/sections/${id}`, { method: "PUT", body }, "Couldn't rename the section.");
}

export function deleteSection(token: string, id: number): Promise<void> {
  return apiRequest(token, `${THEORY}/sections/${id}`, { method: "DELETE" }, "Couldn't delete the section.");
}

export function saveSubject(token: string, values: SubjectForm, key?: string): Promise<CustomSubject> {
  const body = {
    name: values.name.trim(),
    section: values.section,
    parts: values.parts,
    active: values.active,
  };
  return key === undefined
    ? apiRequest(token, `${THEORY}/subjects`, { method: "POST", body }, "Couldn't add the QR codes.")
    : apiRequest(
        token,
        `${THEORY}/subjects/${encodeURIComponent(key)}`,
        { method: "PUT", body },
        "Couldn't save."
      );
}

export function deleteSubject(token: string, key: string): Promise<void> {
  return apiRequest(
    token,
    `${THEORY}/subjects/${encodeURIComponent(key)}`,
    { method: "DELETE" },
    "Couldn't delete it."
  );
}
