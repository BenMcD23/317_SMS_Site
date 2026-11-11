"use client";

import { z } from "zod";

import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import { personName } from "@/lib/session-planner";

/**
 * Types, form rules and write calls for training nights, programme links and
 * catch-ups (the API's routers/training.py). Shared by the three Training
 * pages so a lesson, a grouping or a link state reads the same on each.
 *
 * Lessons are the theory catalogue's subjects and lesson numbers (the QR
 * codes page). A cadet having had one is always their QR scan, so nothing
 * here ticks cadets off.
 */

export const TRAINING_KEYS = {
  night: (date: string) => ["training", "night", date] as const,
  links: ["training", "links"] as const,
  catchUps: ["training", "catch-ups"] as const,
};

// ── nights ────────────────────────────────────────────────────────────────────

/** Must match POOLS, INCLUDES and GROUPINGS in the API's core/training_plan.py. */
export const POOLS = ["auto", "checked_in", "expected"] as const;
export const GROUPINGS = ["one", "flight", "need", "mixed"] as const;
export type Pool = (typeof POOLS)[number];
export type Grouping = (typeof GROUPINGS)[number];

export const POOL_LABELS: Record<Pool, string> = {
  auto: "Checked in, or expected before the door opens",
  checked_in: "Only who's checked in",
  expected: "Everyone expected",
};

export const GROUPING_LABELS: Record<Grouping, string> = {
  one: "One group",
  flight: "By flight",
  need: "By need",
  mixed: "Mixed groups",
};

export type LessonStatus = "needs" | "behind" | "had";

export const STATUS_LABELS: Record<LessonStatus, string> = {
  needs: "Needs it",
  behind: "Missing an earlier lesson",
  had: "Had it",
};

export interface NightCadet {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  checked_in: boolean;
  /** Not in yet and rarely in on this night. */
  unlikely: boolean;
  status: LessonStatus | null;
  /** Scanned this lesson's QR code on this night. */
  scanned: boolean;
}

export interface NightSession {
  id: number;
  title: string;
  period: number | null;
  subject_key: string | null;
  part: number | null;
  flights: string[];
  pool: Pool;
  include: "all" | "need";
  grouping: Grouping;
  group_count: number | null;
  max_group: number | null;
  instructor: string | null;
  notes: string | null;
  lesson: { key: string; name: string; parts: number; code: string | null } | null;
  planning_with: "checked_in" | "expected";
  counts: { cadets: number; needs: number; behind: number; had: number; scanned: number };
  groups: { label: string; cadets: NightCadet[] }[];
  warnings: string[];
}

export type LinkState = "none" | "suggested" | "linked" | "not_lesson";

export interface LessonLink {
  state: LinkState;
  subject_key: string | null;
  subject_name: string | null;
  new_subject: string | null;
  part: number | null;
  source: "ai" | "rules" | "staff" | null;
  broken?: boolean;
}

export interface ProgrammeRow {
  period: number;
  flight: string;
  activity: string;
  category: string;
  instructor: string | null;
  split: boolean;
  link: LessonLink;
}

export interface TrainingNight {
  date: string;
  checked_in: number;
  flights: string[];
  programme: ProgrammeRow[];
  sessions: NightSession[];
}

/** A subject from the theory catalogue (`/cadets/theory/lessons`). */
export interface CatalogueSubject {
  key: string;
  name: string;
  category: string;
  parts: number;
}

/** "Map Reading, lesson 2" — or just the name for a one-lesson subject. */
export function lessonName(name: string, part: number, parts: number): string {
  return parts > 1 ? `${name}, lesson ${part}` : name;
}

/** A lesson as one select value, "key:part"; "" is no lesson. */
export function lessonValue(key: string | null, part: number | null): string {
  return key && part ? `${key}:${part}` : "";
}

export function parseLesson(value: string): { subject_key: string | null; part: number | null } {
  const at = value.lastIndexOf(":");
  if (!value || at < 1) return { subject_key: null, part: null };
  const part = Number(value.slice(at + 1));
  return Number.isInteger(part) && part > 0
    ? { subject_key: value.slice(0, at), part }
    : { subject_key: null, part: null };
}

const optionalCount = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), {
      message: `A whole number from ${min} to ${max}`,
    });

export const sessionSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a name").max(120, "120 characters at most"),
    period: z.string(),
    lesson: z.string(),
    flights: z.array(z.string()),
    pool: z.enum(POOLS),
    needOnly: z.boolean(),
    grouping: z.enum(GROUPINGS),
    groupCount: optionalCount(1, 20),
    maxGroup: optionalCount(2, 60),
    instructor: z.string().max(200, "200 characters at most"),
    notes: z.string().max(2000, "2000 characters at most"),
  })
  .superRefine((v, ctx) => {
    if (!v.lesson && v.needOnly)
      ctx.addIssue({ code: "custom", path: ["needOnly"], message: "Pick a lesson first" });
    if (!v.lesson && v.grouping === "need")
      ctx.addIssue({ code: "custom", path: ["grouping"], message: "Pick a lesson to group by need" });
  });

export type SessionForm = z.infer<typeof sessionSchema>;

export function sessionFormFrom(s: NightSession | null): SessionForm {
  return {
    title: s?.title ?? "",
    period: s?.period ? String(s.period) : "",
    lesson: lessonValue(s?.subject_key ?? null, s?.part ?? null),
    flights: s?.flights ?? [],
    pool: s?.pool ?? "auto",
    needOnly: s?.include === "need",
    grouping: s?.grouping ?? "one",
    groupCount: s?.group_count ? String(s.group_count) : "",
    maxGroup: s?.max_group ? String(s.max_group) : "",
    instructor: s?.instructor ?? "",
    notes: s?.notes ?? "",
  };
}

export function sessionPayload(v: SessionForm) {
  const num = (s: string) => (s.trim() ? Number(s) : null);
  return {
    title: v.title.trim(),
    period: num(v.period),
    ...parseLesson(v.lesson),
    flights: v.flights,
    pool: v.pool,
    include: v.lesson && v.needOnly ? "need" : "all",
    grouping: v.grouping,
    group_count: v.grouping === "mixed" ? num(v.groupCount) : null,
    max_group: num(v.maxGroup),
    instructor: v.instructor.trim() || null,
    notes: v.notes.trim() || null,
  };
}

/**
 * A parade night's two halves. Must match PERIODS in the API's
 * core/training_plan.py, which refuses any other.
 */
export const HALVES = [
  { period: 1, label: "1st half", time: "19:25–20:05" },
  { period: 2, label: "2nd half", time: "20:20–21:00" },
] as const;

/** "1st half (19:25–20:05)", or "Whole night" for a session that isn't in a half. */
export function periodLabel(period: number | null): string {
  const half = HALVES.find((h) => h.period === period);
  if (half) return `${half.label} (${half.time})`;
  return period ? `Period ${period}` : "Whole night";
}

/** The night as text to paste into a message: each session's groups. */
export function nightToText(night: TrainingNight): string {
  const lines: string[] = [];
  for (const s of night.sessions) {
    const lesson = s.lesson && s.part ? ` (${lessonName(s.lesson.name, s.part, s.lesson.parts)})` : "";
    lines.push(`${periodLabel(s.period)}: ${s.title}${lesson}${s.instructor ? ` - ${s.instructor}` : ""}`);
    for (const g of s.groups) {
      lines.push(`  ${g.label}: ${g.cadets.map(personName).join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ── programme links ───────────────────────────────────────────────────────────

export interface ActivityLink extends LessonLink {
  activity: string;
  category: string;
  nights: number;
  last: string;
  flights: string[];
}

/** What a link says, for a list: "Map Reading, lesson 2", "New: Flying Ops, lesson 1", "Not a lesson". */
export function linkSummary(link: LessonLink, subjects: CatalogueSubject[]): string {
  if (link.state === "none") return "No link";
  if (link.subject_key) {
    const subject = subjects.find((s) => s.key === link.subject_key);
    const name = link.subject_name ?? subject?.name ?? "A subject no longer in use";
    return lessonName(name, link.part ?? 1, subject?.parts ?? 2);
  }
  if (link.new_subject) return `New subject: ${lessonName(link.new_subject, link.part ?? 1, 2)}`;
  return "Not a lesson";
}

// ── catch-ups ─────────────────────────────────────────────────────────────────

export interface CatchUp {
  subject_key: string;
  name: string;
  part: number;
  parts: number;
  code: string | null;
  ran: { date: string; flights: string[]; split: boolean }[];
  missing: {
    cin: number;
    first_name: string;
    last_name: string;
    rank: string | null;
    flight: string | null;
    was_in: boolean;
  }[];
}

// ── writes ────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/training`;

export function saveSession(token: string, date: string, values: SessionForm, id?: number) {
  const body = sessionPayload(values);
  return id === undefined
    ? apiRequest<{ id: number }>(
        token,
        `${BASE}/nights/${date}/sessions`,
        { method: "POST", body },
        "Couldn't add the session."
      )
    : apiRequest<{ id: number }>(
        token,
        `${BASE}/sessions/${id}`,
        { method: "PUT", body },
        "Couldn't save the session."
      );
}

export function deleteSession(token: string, id: number): Promise<void> {
  return apiRequest(token, `${BASE}/sessions/${id}`, { method: "DELETE" }, "Couldn't delete the session.");
}

export function startFromProgramme(token: string, date: string): Promise<{ sessions: number }> {
  return apiRequest(
    token,
    `${BASE}/nights/${date}/from-programme`,
    { method: "POST" },
    "Couldn't start from the programme."
  );
}

export function suggestLinks(token: string): Promise<{ suggested: number; ai: number; rules: number }> {
  return apiRequest(token, `${BASE}/links/suggest`, { method: "POST" }, "Couldn't suggest links.");
}

export function setLink(token: string, activity: string, subject_key: string | null, part: number | null) {
  return apiRequest<ActivityLink>(
    token,
    `${BASE}/links`,
    { method: "PUT", body: { activity, subject_key, part } },
    "Couldn't save the link."
  );
}

export function clearLink(token: string, activity: string): Promise<void> {
  return apiRequest(
    token,
    `${BASE}/links?activity=${encodeURIComponent(activity)}`,
    { method: "DELETE" },
    "Couldn't forget the link."
  );
}

export function acceptLinks(
  token: string,
  activities: string[]
): Promise<{
  accepted: number;
  created_subjects: string[];
  skipped: { activity: string; reason: string }[];
}> {
  return apiRequest(
    token,
    `${BASE}/links/accept`,
    { method: "POST", body: { activities } },
    "Couldn't accept the suggestions."
  );
}
