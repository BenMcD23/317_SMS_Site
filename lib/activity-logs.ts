// Shared types, labels and write calls for DofE activity logs.
//
// Cadets log their Skills, Volunteering and Physical sections week by week on
// the cadet portal; staff switch a cadet's log on, watch who has and hasn't
// logged each week, and can fix or add entries for them. The API answers every
// write with the cadet's whole log, so pages just swap it in.

"use client";

import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";

export type SectionKey = "skills" | "volunteering" | "physical";
export type Level = "Bronze" | "Silver" | "Gold";

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "skills", label: "Skills" },
  { key: "volunteering", label: "Volunteering" },
  { key: "physical", label: "Physical" },
];
export const LEVELS: Level[] = ["Bronze", "Silver", "Gold"];
export const DURATIONS = [3, 6, 12, 18] as const;
export const WEEKLY_MINUTES = 60;

/** A section's state for the week being looked at, as the API works it out. */
export type WeekStatus = "done" | "some" | "none" | "not_set_up" | "not_started" | "complete";

export interface WeeklySection {
  section: SectionKey;
  label: string;
  status: WeekStatus;
  minutes: number;
  weeks_done: number;
  weeks_needed: number | null;
  /** Past weeks still under an hour. */
  missed: number;
  last_added: string | null;
}

export interface WeeklyCadet {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  level: Level;
  /** A section due this week is under an hour, or nothing is set up yet. */
  behind: boolean;
  sections: WeeklySection[];
}

export interface WeeklyDashboard {
  week_start: string;
  week_end: string;
  is_current_week: boolean;
  cadets: WeeklyCadet[];
}

export interface Entry {
  id: number;
  date: string;
  description: string;
  minutes: number;
  created_at: string;
}

export interface SectionLog {
  id: number;
  activity: string;
  goal: string;
  assessor_name: string;
  assessor_role: string;
  duration_months: number;
  start_date: string;
  end_date: string;
  completed_at: string | null;
  /** Newest first. */
  entries: Entry[];
  weeks_done: number;
  weeks_needed: number;
  complete: boolean;
  this_week_minutes: number;
  started: boolean;
  weeks: { week_start: string; minutes: number; done: boolean }[];
  missed: string[];
}

export interface CadetActivityLog {
  enabled: boolean;
  cin: number;
  name: string;
  level?: Level;
  sections: { section: SectionKey; label: string; log: SectionLog | null }[];
}

export interface SetupBody {
  activity: string;
  goal: string;
  assessor_name: string;
  assessor_role: string;
  duration_months: number;
  start_date: string;
}

export interface EntryBody {
  date: string;
  description: string;
  minutes: number;
}

/** The dashboard's words for a status. Every badge says it, so colour is never the only signal. */
export const STATUS_LABEL: Record<WeekStatus, string> = {
  done: "Done",
  some: "Under an hour",
  none: "Nothing logged",
  not_set_up: "Not set up",
  not_started: "Not started",
  complete: "Finished",
};

export const STATUS_TONE: Record<WeekStatus, "success" | "warning" | "destructive" | "muted"> = {
  done: "success",
  complete: "success",
  some: "warning",
  none: "destructive",
  not_set_up: "warning",
  not_started: "muted",
};

/** The Monday of the week `days` away from the given Monday, as "YYYY-MM-DD". */
export function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const day = new Date(y, m - 1, d + 7 * weeks);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

const base = (cin: number) => `${API_BASE}/activity-logs/cadets/${cin}`;

export function switchOn(token: string, cin: number, level: Level) {
  return apiRequest<CadetActivityLog>(
    token,
    `${base(cin)}/enrolment`,
    { method: "PUT", body: { level } },
    "Couldn't switch the activity log on."
  );
}

export function switchOff(token: string, cin: number) {
  return apiRequest<CadetActivityLog>(
    token,
    `${base(cin)}/enrolment`,
    { method: "DELETE" },
    "Couldn't switch the activity log off."
  );
}

export function saveSetup(token: string, cin: number, section: SectionKey, body: SetupBody) {
  return apiRequest<CadetActivityLog>(
    token,
    `${base(cin)}/${section}`,
    { method: "PUT", body },
    "Couldn't save the section."
  );
}

export function addEntry(token: string, cin: number, section: SectionKey, entry: EntryBody) {
  return apiRequest<CadetActivityLog>(
    token,
    `${base(cin)}/${section}/entries`,
    { method: "POST", body: { entries: [entry] } },
    "Couldn't add the entry."
  );
}

export function editEntry(token: string, cin: number, section: SectionKey, id: number, entry: EntryBody) {
  return apiRequest<CadetActivityLog>(
    token,
    `${base(cin)}/${section}/entries/${id}`,
    { method: "PATCH", body: entry },
    "Couldn't save the entry."
  );
}

export function deleteEntry(token: string, cin: number, section: SectionKey, id: number) {
  return apiRequest<CadetActivityLog>(
    token,
    `${base(cin)}/${section}/entries/${id}`,
    { method: "DELETE" },
    "Couldn't delete the entry."
  );
}

export function pdfUrl(cin: number, section: SectionKey): string {
  return `${base(cin)}/${section}/pdf`;
}
