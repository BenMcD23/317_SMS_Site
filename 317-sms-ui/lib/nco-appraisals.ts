// Shared types, write calls and form helpers for NCO appraisals.
//
// An appraisal is staff-written and staff-owned; the NCO sees it as the PDF that
// gets emailed to them. Choosing the next-review interval is what schedules the
// follow-up, so the upcoming list needs no separate tracking — except for NCOs
// who've never been appraised, which is what reminders cover.

"use client";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

/** Intervals the form offers, and the only values the API accepts. */
export const REVIEW_INTERVALS = [12, 6, 3] as const;
export type ReviewInterval = (typeof REVIEW_INTERVALS)[number];

/** The five free-text sections, in form order. Drives the form, the AI draft
 *  merge and the read-only view, so a section is never listed twice. */
export const APPRAISAL_SECTIONS = [
  {
    key: "general_observations",
    label: "General Observations",
    hint: "Who they are on squadron overall, what they contribute, and the honest headline.",
  },
  {
    key: "effectiveness_in_role",
    label: "Effectiveness in Role",
    hint: "How they actually perform the NCO job — attendance, reliability, running things.",
  },
  {
    key: "strengths",
    label: "Strengths",
    hint: 'One per line, as "Label - explanation."',
  },
  {
    key: "weaknesses",
    label: "Weaknesses",
    hint: 'One per line, as "Label - explanation."',
  },
  {
    key: "targets",
    label: "Targets",
    hint: "One objective per line. Numbering is added on the document.",
  },
] as const;

export type SectionKey = (typeof APPRAISAL_SECTIONS)[number]["key"];

export type AppraisalSections = Record<SectionKey, string>;

export interface NcoOption {
  cin: number;
  rank: string | null;
  first_name: string;
  last_name: string;
  flight: string | null;
  email: string | null;
  /** Auto-filled header block, computed from the cadet's record right now. */
  nco_name: string;
  age: string;
  attendance: string;
  last_appraisal_id: number | null;
  last_appraisal_date: string | null;
  next_review_date: string | null;
  appraisal_count: number;
  reminder_id: number | null;
}

export interface AppraisalSummary {
  id: number;
  cadet_id: number;
  nco_name: string;
  rank: string | null;
  appraisal_date: string | null;
  next_review_months: number;
  next_review_date: string | null;
  cause_for_concern: boolean;
  extend_probation: boolean;
  author_name: string;
  emailed_at: string | null;
  emailed_to: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Appraisal extends AppraisalSummary, AppraisalSections {
  age: string;
  attendance: string;
  cadet_email: string | null;
  generated_by: string | null;
  generated_by_label: string | null;
  /** True when a quota fallback answered instead of the preferred model. */
  generated_with_fallback: boolean;
}

export interface Reminder {
  id: number;
  cadet_id: number;
  nco_name: string;
  due_date: string;
  note: string;
  created_by_name: string;
  created_at: string | null;
}

/** One row of the "coming up" list — either a real appraisal's next-review date
 *  or a reminder standing in for an NCO who has never had one. */
export interface UpcomingReview {
  cin: number;
  nco_name: string;
  due_date: string;
  source: "appraisal" | "reminder";
  overdue: boolean;
  days_until: number;
  appraisal_id: number | null;
  reminder_id: number | null;
  note: string;
  last_appraisal_date: string | null;
}

export interface AppraisalOverview {
  ncos: NcoOption[];
  appraisals: AppraisalSummary[];
  reminders: Reminder[];
  upcoming: UpcomingReview[];
  /** CINs with neither an appraisal nor a reminder — nothing scheduled at all. */
  unscheduled: number[];
  next_review_options: number[];
  ai_available: boolean;
  primary_model_label: string;
}

export interface AppraisalDraft extends AppraisalSections {
  cadet_id: number | null;
  appraisal_date: string;
  nco_name: string;
  age: string;
  attendance: string;
  next_review_months: ReviewInterval;
  cause_for_concern: boolean;
  extend_probation: boolean;
  generated_by: string | null;
}

export interface AiDraftResult {
  sections: AppraisalSections;
  model: string;
  model_label: string;
  used_fallback: boolean;
}

export const EMPTY_SECTIONS: AppraisalSections = {
  general_observations: "",
  effectiveness_in_role: "",
  strengths: "",
  weaknesses: "",
  targets: "",
};

/** "YYYY-MM-DD" for today, in local time — `toISOString` would shift the date
 *  back an hour either side of midnight during BST. */
export function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyDraft(): AppraisalDraft {
  return {
    ...EMPTY_SECTIONS,
    cadet_id: null,
    appraisal_date: todayInput(),
    nco_name: "",
    age: "",
    attendance: "",
    next_review_months: 12,
    cause_for_concern: false,
    extend_probation: false,
    generated_by: null,
  };
}

/** A saved appraisal back in editable form. */
export function draftFrom(appraisal: Appraisal): AppraisalDraft {
  const interval = REVIEW_INTERVALS.find((m) => m === appraisal.next_review_months) ?? 12;
  return {
    cadet_id: appraisal.cadet_id,
    appraisal_date: (appraisal.appraisal_date ?? "").slice(0, 10) || todayInput(),
    nco_name: appraisal.nco_name,
    age: appraisal.age,
    attendance: appraisal.attendance,
    general_observations: appraisal.general_observations,
    effectiveness_in_role: appraisal.effectiveness_in_role,
    strengths: appraisal.strengths,
    weaknesses: appraisal.weaknesses,
    targets: appraisal.targets,
    next_review_months: interval,
    cause_for_concern: appraisal.cause_for_concern,
    extend_probation: appraisal.extend_probation,
    generated_by: appraisal.generated_by,
  };
}

/** The date the next review lands on, for the form's live preview. Mirrors the
 *  API's add_months (end-of-month clamped), which is the value actually saved. */
export function nextReviewDate(appraisalDate: string, months: number): Date | null {
  if (!appraisalDate) return null;
  const [y, m, d] = appraisalDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return target;
}

async function request<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown } = { method: "POST" },
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/nco-appraisals${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error("Server unreachable.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(data) ?? "Something went wrong.");
  return data as T;
}

/** FastAPI's `detail` is a string for our own HTTPExceptions but an array of
 *  per-field objects when validation rejects the body — flatten both. */
function errorMessage(data: unknown): string | null {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => (d as { msg?: string })?.msg)
      .filter((m): m is string => !!m);
    if (messages.length) return messages.join(", ");
  }
  return null;
}

export function createAppraisal(token: string, draft: AppraisalDraft): Promise<Appraisal> {
  return request<Appraisal>(token, "", { method: "POST", body: draft });
}

export function updateAppraisal(
  token: string, id: number, draft: AppraisalDraft,
): Promise<Appraisal> {
  return request<Appraisal>(token, `/${id}`, { method: "PUT", body: draft });
}

export function deleteAppraisal(token: string, id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(token, `/${id}`, { method: "DELETE" });
}

/** Draft the five sections from staff notes. Nothing is saved — the result goes
 *  back into the form for staff to correct before it reaches anyone. */
export function draftWithAi(
  token: string,
  body: { cadet_id: number; points: string; nco_name?: string; age?: string; attendance?: string },
): Promise<AiDraftResult> {
  return request<AiDraftResult>(token, "/ai", { method: "POST", body });
}

export function saveReminder(
  token: string, body: { cadet_id: number; due_date: string; note: string },
): Promise<Reminder> {
  return request<Reminder>(token, "/reminders", { method: "POST", body });
}

export function deleteReminder(token: string, id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(token, `/reminders/${id}`, { method: "DELETE" });
}

export function emailAppraisal(
  token: string, id: number, body: { to?: string; reply_to?: string },
): Promise<Appraisal> {
  return request<Appraisal>(token, `/${id}/email`, { method: "POST", body });
}

/**
 * Download the appraisal as a Word document or PDF.
 *
 * Fetched with the auth header and saved from the blob rather than pointed at
 * with a plain link — the API needs the bearer token, which a navigation can't
 * carry.
 */
export async function downloadAppraisal(
  token: string, id: number, format: "docx" | "pdf",
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/nco-appraisals/${id}/document?fmt=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(errorMessage(data) ?? "Couldn't build the document.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
    ?? `NCO_Appraisal_${id}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
