"use client";

import { z } from "zod";

import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import type { Attendance } from "@/lib/classification-day";

/**
 * Types, form rules and write calls for the session planner's task bank and
 * kit list (the API's routers/session_planner.py). Shared by the bank page and
 * the leadership assessment's task picker so a task is labelled the same way
 * in both.
 */

/** Must match SESSION_KINDS in the API's core/session_tasks.py. */
export const SESSION_KINDS = [
  "leadership",
  "radio",
  "first_aid",
  "fieldcraft",
  "drill",
  "sports",
  "general",
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const KIND_LABELS: Record<SessionKind, string> = {
  leadership: "Leadership",
  radio: "Radio",
  first_aid: "First aid",
  fieldcraft: "Fieldcraft",
  drill: "Drill",
  sports: "Sports",
  general: "General",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as SessionKind] ?? kind;
}

export interface KitItem {
  id: number;
  name: string;
  quantity: number;
  notes: string;
  used_by: { task_id: number; name: string; quantity: number }[];
}

export interface BankTask {
  id: number;
  kind: SessionKind;
  number: string | null;
  name: string;
  brief: string;
  duration_minutes: number;
  min_group: number | null;
  max_group: number | null;
  active: boolean;
  kit: { kit_id: number; name: string; quantity: number; in_stock: number }[];
  /** Kit it needs more of than the squadron has: it can't run at all. */
  kit_short: string[];
  led_count: number;
  passed_count: number;
  cadets_led: number;
}

/** A leadership sheet the bank can't place on a task by its number or name. */
export interface UnlinkedSheet {
  assessment_id: number;
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  exercise_no: string;
  exercise_name: string;
  date: string;
  passed: boolean;
}

/** A task in the leadership form's picker, marked with how the cadet got on if they've led it. */
export interface PickerTask {
  id: number;
  number: string | null;
  name: string;
  duration_minutes: number;
  led: "passed" | "failed" | null;
}

/** "3. Bridge the Gap", or just the name for a task with no number. */
export function taskLabel(t: { number: string | null; name: string }): string {
  return t.number ? `${t.number}. ${t.name}` : t.name;
}

/** "4–6 cadets", "Up to 6", "At least 4" or "Any size". */
export function groupSizeLabel(min: number | null, max: number | null): string {
  if (min && max) return min === max ? `${min} cadets` : `${min}–${max} cadets`;
  if (max) return `Up to ${max}`;
  if (min) return `At least ${min}`;
  return "Any size";
}

/** "2 × Plank, Rope": what a task needs, with counts only where it's more than one. */
export function kitSummary(kit: BankTask["kit"]): string {
  return kit.map((k) => (k.quantity > 1 ? `${k.quantity} × ${k.name}` : k.name)).join(", ");
}

// ── forms ─────────────────────────────────────────────────────────────────────

const LIMIT = 999;

export const kitSchema = z.object({
  name: z.string().trim().min(1, "Give the kit a name").max(120, "120 characters at most"),
  quantity: z
    .number({ error: "Enter how many there are" })
    .int("Whole items only")
    .min(0, "Can't be negative")
    .max(LIMIT, `${LIMIT} at most`),
  notes: z.string().max(1000, "1000 characters at most"),
});
export type KitForm = z.infer<typeof kitSchema>;

/** An optional group size typed into a text box: blank, or a whole number from 1 to 50. */
const groupSize = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 50),
    "A number from 1 to 50, or leave it blank"
  );

export const taskSchema = z
  .object({
    kind: z.enum(SESSION_KINDS),
    number: z.string().trim().max(20, "20 characters at most"),
    name: z.string().trim().min(1, "Give the task a name").max(120, "120 characters at most"),
    brief: z.string().max(4000, "4000 characters at most"),
    duration: z
      .number({ error: "Enter how many minutes it takes" })
      .int("Whole minutes")
      .min(1, "At least 1 minute")
      .max(240, "240 minutes at most"),
    minGroup: groupSize,
    maxGroup: groupSize,
    active: z.boolean(),
    kit: z.array(
      z.object({
        kitId: z.number(),
        quantity: z.number({ error: "How many?" }).int("Whole items only").min(1, "At least 1").max(LIMIT),
      })
    ),
  })
  .refine((v) => !v.minGroup || !v.maxGroup || +v.minGroup <= +v.maxGroup, {
    path: ["maxGroup"],
    message: "Can't be smaller than the smallest group",
  });
export type TaskForm = z.infer<typeof taskSchema>;

export function taskFormFrom(task: BankTask | null, kind: SessionKind = "leadership"): TaskForm {
  return {
    kind: task?.kind ?? kind,
    number: task?.number ?? "",
    name: task?.name ?? "",
    brief: task?.brief ?? "",
    duration: task?.duration_minutes ?? 15,
    minGroup: task?.min_group ? String(task.min_group) : "",
    maxGroup: task?.max_group ? String(task.max_group) : "",
    active: task?.active ?? true,
    kit: (task?.kit ?? []).map((k) => ({ kitId: k.kit_id, quantity: k.quantity })),
  };
}

/** The body the tasks API takes: blanks become null. */
export function taskPayload(v: TaskForm) {
  return {
    kind: v.kind,
    number: v.number.trim() || null,
    name: v.name.trim(),
    brief: v.brief.trim(),
    duration_minutes: v.duration,
    min_group: v.minGroup ? Number(v.minGroup) : null,
    max_group: v.maxGroup ? Number(v.maxGroup) : null,
    active: v.active,
    kit: v.kit.map((k) => ({ kit_id: k.kitId, quantity: k.quantity })),
  };
}

// ── writes ────────────────────────────────────────────────────────────────────

const BASE = `${API_BASE}/session-planner`;

export function saveKit(token: string, values: KitForm, id?: number): Promise<KitItem> {
  const body = { name: values.name.trim(), quantity: values.quantity, notes: values.notes.trim() };
  return id === undefined
    ? apiRequest(token, `${BASE}/kit`, { method: "POST", body }, "Couldn't add the kit.")
    : apiRequest(token, `${BASE}/kit/${id}`, { method: "PUT", body }, "Couldn't save the kit.");
}

export function deleteKit(token: string, id: number): Promise<void> {
  return apiRequest(token, `${BASE}/kit/${id}`, { method: "DELETE" }, "Couldn't delete the kit.");
}

export function saveTask(token: string, values: TaskForm, id?: number): Promise<BankTask> {
  const body = taskPayload(values);
  return id === undefined
    ? apiRequest(token, `${BASE}/tasks`, { method: "POST", body }, "Couldn't add the task.")
    : apiRequest(token, `${BASE}/tasks/${id}`, { method: "PUT", body }, "Couldn't save the task.");
}

export function deleteTask(token: string, id: number): Promise<void> {
  return apiRequest(token, `${BASE}/tasks/${id}`, { method: "DELETE" }, "Couldn't delete the task.");
}

export function linkSheet(token: string, assessmentId: number, taskId: number): Promise<unknown> {
  return apiRequest(
    token,
    `${BASE}/assessments/${assessmentId}/link`,
    { method: "POST", body: { task_id: taskId } },
    "Couldn't link the sheet."
  );
}

// ── planning a session ────────────────────────────────────────────────────────

/** A cadet as the planner lists them for ticking. */
export interface PlannerCadet {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  attendance: Attendance;
  /** Leadership badge held ("blue", "bronze"…), and sheets the bank can place. */
  leadership: { level: string | null; led: number; passes: number };
}

export interface PlanPerson {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
}

export interface PlanRun {
  group: number;
  task_id: number;
  task_name: string;
  task_number: string | null;
  leader: PlanPerson | null;
}

export interface SessionPlan {
  kind: SessionKind;
  leadership: boolean;
  groups: { number: number; cadets: PlanPerson[] }[];
  rounds: { number: number; start: string; end: string; runs: PlanRun[]; idle_groups: number[] }[];
  leads: { cin: number; count: number }[];
  not_leading: PlanPerson[];
  warnings: string[];
}

export interface PlanRequest {
  kind: SessionKind;
  date: string;
  start: string;
  end: string;
  changeover_minutes: number;
  stands: number;
  task_ids: number[];
  cins: number[];
}

export function planSession(token: string, body: PlanRequest): Promise<SessionPlan> {
  return apiRequest(token, `${BASE}/plan`, { method: "POST", body }, "Couldn't plan the session.");
}

export function personName(p: { rank?: string | null; first_name: string; last_name: string }): string {
  return `${p.rank ? `${p.rank} ` : ""}${p.first_name} ${p.last_name}`;
}

/** "Blue", "Bronze"… for the badge held, or null. */
export function badgeLevel(level: string | null): string | null {
  return level ? level.charAt(0).toUpperCase() + level.slice(1) : null;
}

/**
 * The plan as plain text for pasting into a message or the session plan:
 * each round's stands, then who's in each group. Rounds come first because
 * that's what staff run the night from.
 */
export function planToText(plan: SessionPlan): string {
  const lines: string[] = [];
  for (const r of plan.rounds) {
    lines.push(`Round ${r.number}, ${r.start}–${r.end}`);
    for (const run of r.runs) {
      const leader = plan.leadership
        ? run.leader
          ? `, led by ${personName(run.leader)}`
          : ", no leader"
        : "";
      lines.push(
        `  Group ${run.group}: ${taskLabel({ number: run.task_number, name: run.task_name })}${leader}`
      );
    }
    for (const g of r.idle_groups) lines.push(`  Group ${g}: sits out`);
  }
  lines.push("");
  for (const g of plan.groups) {
    lines.push(`Group ${g.number}: ${g.cadets.map(personName).join(", ")}`);
  }
  return lines.join("\n");
}
