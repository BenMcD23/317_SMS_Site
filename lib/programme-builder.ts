"use client";

import { z } from "zod";

import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";

/**
 * Types, rules and write calls for the programme builder (the API's
 * routers/programme_builder.py). Shared by the month list, the builder and
 * its panels, so a half, a flight span, a mention or a category reads the same
 * everywhere and the drag-and-drop maths is tested once.
 */

export const PROGRAMME_KEYS = {
  months: ["programme-builder", "months"] as const,
  month: (month: string) => ["programme-builder", "month", month] as const,
  suggestions: (month: string) => ["programme-builder", "suggestions", month] as const,
  bank: ["programme-builder", "bank"] as const,
  kinds: ["programme-builder", "kinds"] as const,
  bankHistory: ["programme-builder", "bank-history"] as const,
  people: (month: string) => ["programme-builder", "people", month] as const,
};

// ── types ─────────────────────────────────────────────────────────────────────

export type Period = 1 | 2;
export type ProgrammeStatus = "draft" | "published" | "changed";
export type Severity = "clash" | "warning" | "info";

export interface MonthSummary {
  month: string;
  name: string;
  status: ProgrammeStatus;
  nights: number;
  sessions: number;
  open_comments: number;
  updated_at: string;
  updated_by: string | null;
  published_at: string | null;
}

export interface MonthList {
  programmes: MonthSummary[];
  record_months: string[];
  /** Every month a new one can copy, built or only in the record (old docs). Missing from an older API. */
  copy_months?: string[];
  parade_weekdays: number[];
  next_month: string | null;
}

export interface Flight {
  key: string;
  label: string;
  expected: number;
}

export interface Room {
  id: number;
  name: string;
  capacity: number | null;
  notes: string | null;
  position: number;
  active: boolean;
}

export interface PersonRef {
  key: string;
  name: string;
  kind?: string;
}

export interface Slot {
  id: number;
  night_id: number;
  period: Period | null;
  flights: string[];
  title: string;
  category: string;
  bank_item_id: number | null;
  room_id: number | null;
  instructor: string | null;
  people: PersonRef[];
  subject_key: string | null;
  part: number | null;
  notes: string | null;
  headcount: number;
  open_comments: number;
}

export interface Night {
  id: number;
  date: string;
  uniform: string | null;
  duty_nco: string | null;
  notes: string | null;
  slots: Slot[];
}

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  night_id: number | null;
  slot_ids: number[];
  fix: { slot_id: number; room_id: number; label: string } | null;
}

export interface Comment {
  id: number;
  parent_id: number | null;
  night_id: number | null;
  slot_id: number | null;
  quote: string | null;
  author: { name: string; key: string | null; email: string | null };
  body: string;
  mentions: PersonRef[];
  assignee: PersonRef | null;
  created_at: string;
  edited_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  can_edit: boolean;
  can_delete: boolean;
}

export interface Thread extends Comment {
  replies: Comment[];
}

export interface Programme {
  month: string;
  name: string;
  status: ProgrammeStatus;
  notes: string | null;
  /** The printed programme's "Important Dates". */
  key_dates: KeyDate[];
  can_edit: boolean;
  updated_at: string;
  updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
  flights: Flight[];
  rooms: Room[];
  nights: Night[];
  issues: Issue[];
  comments: Thread[];
  history: { at: string; by: string | null; summary: string }[];
}

export interface KeyDate {
  when: string;
  what: string;
}

/** A kind of session: the built-in ones (renamed, coloured or hidden) and any staff added. */
export interface Kind {
  key: string;
  label: string;
  /** Fills the session's cell on the printed programme, and edges it here. */
  colour: string | null;
  hidden: boolean;
  builtin: boolean;
}

export interface BankItem {
  id: number;
  title: string;
  category: string;
  whole_night: boolean;
  room_id: number | null;
  instructor: string | null;
  /** Staff and NCOs who usually run it: they go on the session when it's placed. */
  /** Missing from an API older than this page. */
  people?: PersonRef[];
  subject_key: string | null;
  part: number | null;
  notes: string | null;
  active: boolean;
  times_run: number;
  last_run: string | null;
}

export interface HistoryActivity {
  title: string;
  category: string;
  times: number;
  last_run: string | null;
}

export interface Person {
  key: string;
  name: string;
  kind: "staff" | "nco" | "cadet";
  flight: string | null;
  mentionable: boolean;
  email: string | null;
  away: [string, string][];
}

export interface SuggestionOption {
  kind: "bank" | "join";
  bank_item_id?: number;
  slot_id?: number;
  title: string;
  category: string;
  room_id: number | null;
  score: number;
  reason: string;
}

export interface Suggestion {
  night_id: number;
  date: string;
  period: Period;
  flight: string;
  options: SuggestionOption[];
}

// ── labels ────────────────────────────────────────────────────────────────────

/**
 * The built-in kinds, as the API's CATEGORIES in core/programme.py. The live
 * list (with staff's renames and additions) is useKinds(); this stands in
 * until it loads.
 */
export const CATEGORIES: { key: string; label: string }[] = [
  { key: "drill", label: "Drill and inspection" },
  { key: "classifications", label: "Classifications" },
  { key: "lessons", label: "Training lessons" },
  { key: "fieldcraft", label: "Fieldcraft and adventure" },
  { key: "first_aid", label: "First aid" },
  { key: "stem", label: "STEM and aviation" },
  { key: "sport", label: "Sport and fitness" },
  { key: "shooting", label: "Shooting" },
  { key: "dofe", label: "Duke of Edinburgh" },
  { key: "music", label: "Band" },
  { key: "leadership", label: "Leadership and NCOs" },
  { key: "admin", label: "Admin and flight time" },
  { key: "social", label: "Social and events" },
  { key: "other", label: "Other" },
];

export const BUILT_IN_KINDS: Kind[] = CATEGORIES.map((c) => ({
  ...c,
  colour: null,
  hidden: false,
  builtin: true,
}));

export function categoryLabel(key: string, kinds: Kind[] = BUILT_IN_KINDS): string {
  return kinds.find((c) => c.key === key)?.label ?? key;
}

/** The kinds to pick from: the shown ones, plus `current` so an edit never loses a hidden kind. */
export function pickableKinds(kinds: Kind[], current?: string): Kind[] {
  return kinds.filter((k) => !k.hidden || k.key === current);
}

// Five chart hues for fourteen kinds, grouped so neighbours in a month look
// different. Never the status colours: a kind of night is never "wrong".
const CATEGORY_HUE: Record<string, string> = {
  drill: "var(--chart-1)",
  classifications: "var(--chart-2)",
  lessons: "var(--chart-2)",
  fieldcraft: "var(--chart-3)",
  first_aid: "var(--chart-3)",
  stem: "var(--chart-5)",
  sport: "var(--chart-4)",
  shooting: "var(--chart-3)",
  dofe: "var(--chart-4)",
  music: "var(--chart-5)",
  leadership: "var(--chart-1)",
};

/** The left-edge colour of a session: its kind's own colour, a chart hue, or the border colour for admin and the like. */
export function categoryColour(key: string, kinds: Kind[] = BUILT_IN_KINDS): string {
  return kinds.find((k) => k.key === key)?.colour ?? CATEGORY_HUE[key] ?? "var(--muted-foreground)";
}

/** A parade night's halves. Must match PERIODS in the API's core/programme_builder.py. */
export const HALVES: { period: Period; label: string; short: string; time: string }[] = [
  { period: 1, label: "1st half", short: "1st", time: "19:25" },
  { period: 2, label: "2nd half", short: "2nd", time: "20:20" },
];

export function periodLabel(period: Period | null): string {
  return HALVES.find((h) => h.period === period)?.label ?? "Whole night";
}

/** "Mon 7 Dec" from "2026-12-07", without the time zone moving the day. */
export function nightLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "All", "A Flight" or "A and B Flights". */
export function whoLabel(flights: string[], all: string[]): string {
  if (!flights.length || all.every((f) => flights.includes(f))) return "All";
  const ordered = [...all.filter((f) => flights.includes(f)), ...flights.filter((f) => !all.includes(f))];
  if (ordered.length === 1) return `${ordered[0]} Flight`;
  return `${ordered.slice(0, -1).join(", ")} and ${ordered[ordered.length - 1]} Flights`;
}

export const STATUS_LABELS: Record<ProgrammeStatus, string> = {
  draft: "Draft",
  published: "Published",
  changed: "Changed since publishing",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  clash: "Clash",
  warning: "Check",
  info: "Note",
};

// ── mentions ──────────────────────────────────────────────────────────────────
// The API stores a mention as "@[Sgt Sarah Hughes](staff:3001)". People type
// "@Sarah", pick from the list, and see "@Sgt Sarah Hughes" in the box; the
// tokens are only made when the comment is sent, and unmade to edit it.

const TOKEN = /@\[([^\]\n]{1,80})\]\(((?:staff|cadet):\d{1,12})\)/g;

export type BodyPart = { text: string } | { mention: PersonRef };

/** A comment body as text and mention chips, in order. */
export function splitBody(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let at = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m.index! > at) parts.push({ text: body.slice(at, m.index) });
    parts.push({ mention: { name: m[1], key: m[2] } });
    at = m.index! + m[0].length;
  }
  if (at < body.length) parts.push({ text: body.slice(at) });
  return parts;
}

/** The word being typed after an "@" right before the caret, or null when the caret isn't in one. */
export function mentionQuery(beforeCaret: string): string | null {
  const m = beforeCaret.match(/(?:^|\s)@([^\s@][^@\n]{0,30}|)$/);
  if (!m) return null;
  // Two words at most: "@Sarah Hu" still searches, a whole sentence doesn't.
  return m[1].split(" ").length > 2 ? null : m[1];
}

/** Replace the "@query" before the caret with "@Name ", returning the text and where the caret goes. */
export function insertMention(text: string, caret: number, name: string): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  const inserted = `@${name} `;
  return { text: text.slice(0, at) + inserted + text.slice(caret), caret: at + inserted.length };
}

/** Typed text and the people picked, as the body the API takes. A pick whose "@Name" was deleted mentions no one. */
export function toTokens(text: string, picked: PersonRef[]): string {
  let out = text;
  // Longest names first, so "@Sam Staff" isn't eaten by a pick called "Sam".
  for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    out = out.split(`@${p.name}`).join(`@[${p.name}](${p.key})`);
  }
  return out;
}

/** A stored body back as typed text and its picks, to edit it. */
export function fromTokens(body: string): { text: string; picked: PersonRef[] } {
  const picked: PersonRef[] = [];
  const text = body.replace(TOKEN, (_, name: string, key: string) => {
    if (!picked.some((p) => p.key === key)) picked.push({ key, name });
    return `@${name}`;
  });
  return { text, picked };
}

/** People whose name matches what's typed after "@": word starts first, then anywhere. */
export function matchPeople<T extends { name: string }>(people: T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  const starts = people.filter((p) =>
    p.name
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.startsWith(q))
  );
  const within = people.filter((p) => !starts.includes(p) && p.name.toLowerCase().includes(q));
  return [...starts, ...within].slice(0, limit);
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

// ── the grid ──────────────────────────────────────────────────────────────────
// A night is a grid: a column per flight, a row per half (and one for the
// whole night when something runs all night). A session for neighbouring
// flights spans their columns; one for flights that aren't neighbours is drawn
// once per run of columns. Sessions that share a column stack in lanes.

export type RowKey = Period | "all";

export interface Placed {
  slot: Slot;
  start: number; // column index, 0-based
  span: number;
  lane: number;
}

/** Runs of neighbouring columns a session covers: [[start, span], …]. */
export function columnRuns(flights: string[], all: string[]): [number, number][] {
  const cols = (flights.length ? flights : all)
    .map((f) => all.indexOf(f))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const c of cols) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === c) last[1] += 1;
    else runs.push([c, 1]);
  }
  return runs;
}

/** The sessions in one row of a night, each run given a lane so none overlap. */
export function layoutRow(slots: Slot[], row: RowKey, all: string[]): { placed: Placed[]; lanes: number } {
  const inRow = slots.filter((s) => (row === "all" ? s.period === null : s.period === row));
  const pieces = inRow
    .flatMap((slot) => columnRuns(slot.flights, all).map(([start, span]) => ({ slot, start, span })))
    .sort((a, b) => a.start - b.start || b.span - a.span || a.slot.id - b.slot.id);
  const lanes: boolean[][] = [];
  const placed: Placed[] = [];
  for (const p of pieces) {
    let lane = 0;
    while (lanes[lane]?.slice(p.start, p.start + p.span).some(Boolean)) lane++;
    lanes[lane] ??= Array(all.length).fill(false);
    for (let c = p.start; c < p.start + p.span; c++) lanes[lane][c] = true;
    placed.push({ ...p, lane });
  }
  return { placed, lanes: lanes.length };
}

/** A drop target's id: "cell:12:1:A" is night 12, 1st half, A Flight. */
export function cellId(nightId: number, row: RowKey, flight: string): string {
  return `cell:${nightId}:${row}:${flight}`;
}

export function parseCellId(id: string): { nightId: number; row: RowKey; flight: string } | null {
  const m = /^cell:(\d+):(1|2|all):(.+)$/.exec(id);
  if (!m) return null;
  return { nightId: Number(m[1]), row: m[2] === "all" ? "all" : (Number(m[2]) as Period), flight: m[3] };
}

/**
 * Where a session dragged onto a cell ends up. It keeps its flights when the
 * cell's flight is one of them (or it's for everyone), so dragging a shared
 * session to another night moves all of it; a one-flight session moves to
 * the new flight; a shared one dropped on another flight keeps its flights.
 */
export function movedTo(slot: Slot, cell: { nightId: number; row: RowKey; flight: string }) {
  const flights =
    !slot.flights.length || slot.flights.includes(cell.flight)
      ? slot.flights
      : slot.flights.length === 1
        ? [cell.flight]
        : slot.flights;
  return { night_id: cell.nightId, period: cell.row === "all" ? null : cell.row, flights };
}

export function sameSpot(slot: Slot, to: ReturnType<typeof movedTo>): boolean {
  return (
    slot.night_id === to.night_id && slot.period === to.period && slot.flights.join() === to.flights.join()
  );
}

// ── forms ─────────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max, `${max} characters at most`);

export const slotSchema = z.object({
  title: z.string().trim().min(1, "Give the session a name").max(120, "120 characters at most"),
  category: z.string().min(1, "Pick a kind"),
  nightId: z.number({ error: "Pick a night" }),
  period: z.enum(["1", "2", "all"]),
  flights: z.array(z.string()),
  roomId: z.string(),
  instructor: text(200),
  people: z.array(z.string()).max(40, "40 people at most"),
  lesson: z.string(),
  notes: text(1000),
});
export type SlotForm = z.infer<typeof slotSchema>;

export function slotFormFrom(slot: Slot | null, fallback: Partial<SlotForm> = {}): SlotForm {
  return {
    title: slot?.title ?? "",
    category: slot?.category ?? "other",
    nightId: slot?.night_id ?? (fallback.nightId as number),
    period: slot ? (slot.period === null ? "all" : (String(slot.period) as "1" | "2")) : "1",
    flights: slot?.flights ?? [],
    roomId: slot?.room_id ? String(slot.room_id) : "",
    instructor: slot?.instructor ?? "",
    people: slot?.people.map((p) => p.key) ?? [],
    lesson: slot?.subject_key && slot.part ? `${slot.subject_key}:${slot.part}` : "",
    notes: slot?.notes ?? "",
    ...fallback,
  };
}

function lessonParts(value: string): { subject_key: string | null; part: number | null } {
  const at = value.lastIndexOf(":");
  const part = Number(value.slice(at + 1));
  return at > 0 && Number.isInteger(part) && part > 0
    ? { subject_key: value.slice(0, at), part }
    : { subject_key: null, part: null };
}

export function slotPayload(v: SlotForm) {
  return {
    night_id: v.nightId,
    title: v.title.trim(),
    category: v.category,
    period: v.period === "all" ? null : Number(v.period),
    flights: v.flights,
    room_id: v.roomId ? Number(v.roomId) : null,
    instructor: v.instructor.trim() || null,
    people: v.people,
    ...lessonParts(v.lesson),
    notes: v.notes.trim() || null,
  };
}

export const bankSchema = z.object({
  title: z.string().trim().min(1, "Give the session a name").max(120, "120 characters at most"),
  category: z.string().min(1, "Pick a kind"),
  wholeNight: z.boolean(),
  roomId: z.string(),
  instructor: text(200),
  people: z.array(z.string()),
  lesson: z.string(),
  notes: text(1000),
  active: z.boolean(),
});
export type BankForm = z.infer<typeof bankSchema>;

export function bankFormFrom(item: BankItem | null): BankForm {
  return {
    title: item?.title ?? "",
    category: item?.category ?? "other",
    wholeNight: item?.whole_night ?? false,
    roomId: item?.room_id ? String(item.room_id) : "",
    instructor: item?.instructor ?? "",
    people: item?.people?.map((p) => p.key) ?? [],
    lesson: item?.subject_key && item.part ? `${item.subject_key}:${item.part}` : "",
    notes: item?.notes ?? "",
    active: item?.active ?? true,
  };
}

export function bankPayload(v: BankForm) {
  return {
    title: v.title.trim(),
    category: v.category,
    whole_night: v.wholeNight,
    room_id: v.roomId ? Number(v.roomId) : null,
    instructor: v.instructor.trim() || null,
    people: v.people,
    ...lessonParts(v.lesson),
    notes: v.notes.trim() || null,
    active: v.active,
  };
}

export const roomSchema = z.object({
  name: z.string().trim().min(1, "Give the room a name").max(80, "80 characters at most"),
  capacity: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 500), "A number from 1 to 500, or blank"),
  notes: text(500),
});
export type RoomForm = z.infer<typeof roomSchema>;

export const nightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  uniform: text(120),
  dutyNco: text(120),
  notes: text(1000),
});
export type NightForm = z.infer<typeof nightSchema>;

// ── writes ────────────────────────────────────────────────────────────────────
// Every write that changes a month answers with the whole month, so the page
// swaps in the answer: the checks and the history are always the API's.

const BASE = `${API_BASE}/programme-builder`;

type Write = { method: string; body?: unknown };

function call<T>(token: string, path: string, init: Write, fallback: string): Promise<T> {
  return apiRequest<T>(token, `${BASE}${path}`, init, fallback);
}

export const programmeApi = {
  createMonth: (t: string, month: string, start: "empty" | "record" | "copy", copyFrom?: string) =>
    call<Programme>(
      t,
      "/months",
      { method: "POST", body: { month, start, copy_from: copyFrom ?? null } },
      "Couldn't start the programme."
    ),
  deleteMonth: (t: string, month: string) =>
    call<{ ok: true }>(t, `/months/${month}`, { method: "DELETE" }, "Couldn't delete the programme."),
  editMonth: (t: string, month: string, body: { notes?: string; key_dates?: KeyDate[] }) =>
    call<Programme>(t, `/months/${month}`, { method: "PATCH", body }, "Couldn't save it."),
  addNight: (t: string, month: string, v: NightForm) =>
    call<Programme>(
      t,
      `/months/${month}/nights`,
      { method: "POST", body: nightBody(v) },
      "Couldn't add the night."
    ),
  editNight: (t: string, id: number, v: NightForm) =>
    call<Programme>(t, `/nights/${id}`, { method: "PATCH", body: nightBody(v) }, "Couldn't save the night."),
  deleteNight: (t: string, id: number) =>
    call<Programme>(t, `/nights/${id}`, { method: "DELETE" }, "Couldn't remove the night."),
  addSlot: (t: string, month: string, body: Record<string, unknown>) =>
    call<Programme>(t, `/months/${month}/slots`, { method: "POST", body }, "Couldn't add the session."),
  editSlot: (t: string, id: number, body: Record<string, unknown>) =>
    call<Programme>(t, `/slots/${id}`, { method: "PATCH", body }, "Couldn't save the session."),
  deleteSlot: (t: string, id: number) =>
    call<Programme>(t, `/slots/${id}`, { method: "DELETE" }, "Couldn't remove the session."),
  copySlot: (t: string, id: number, nightIds: number[]) =>
    call<Programme>(
      t,
      `/slots/${id}/copy`,
      { method: "POST", body: { night_ids: nightIds } },
      "Couldn't copy it."
    ),
  fill: (t: string, month: string, cells?: { night_id: number; period: Period; flight: string }[]) =>
    call<{ filled: number; programme: Programme }>(
      t,
      `/months/${month}/fill`,
      { method: "POST", body: { cells: cells ?? null } },
      "Couldn't fill the gaps."
    ),
  publish: (t: string, month: string, body: { website: boolean; record: boolean; notify: boolean }) =>
    call<{ website?: { pdf: string }; record?: { nights: number; sessions: number }; programme: Programme }>(
      t,
      `/months/${month}/publish`,
      { method: "POST", body },
      "Couldn't publish the programme."
    ),
  saveBankItem: (t: string, v: BankForm, id?: number) =>
    id === undefined
      ? call<BankItem>(t, "/bank", { method: "POST", body: bankPayload(v) }, "Couldn't add it to the bank.")
      : call<BankItem>(
          t,
          `/bank/${id}`,
          { method: "PUT", body: bankPayload(v) },
          "Couldn't save the session."
        ),
  deleteBankItem: (t: string, id: number) =>
    call<{ ok: true }>(t, `/bank/${id}`, { method: "DELETE" }, "Couldn't remove it from the bank."),
  importBank: (t: string, titles: string[]) =>
    call<{ added: number }>(t, "/bank/import", { method: "POST", body: { titles } }, "Couldn't add them."),
  saveRoom: (t: string, v: RoomForm & { active?: boolean }, id?: number) => {
    const body = {
      name: v.name.trim(),
      capacity: v.capacity.trim() ? Number(v.capacity) : null,
      notes: v.notes.trim() || null,
      active: v.active ?? true,
    };
    return id === undefined
      ? call<Room>(t, "/rooms", { method: "POST", body }, "Couldn't add the room.")
      : call<Room>(t, `/rooms/${id}`, { method: "PUT", body }, "Couldn't save the room.");
  },
  deleteRoom: (t: string, id: number) =>
    call<{ ok: true }>(t, `/rooms/${id}`, { method: "DELETE" }, "Couldn't delete the room."),
  saveKind: (t: string, v: { label: string; colour: string | null; hidden: boolean }, key?: string) =>
    key === undefined
      ? call<Kind[]>(t, "/kinds", { method: "POST", body: v }, "Couldn't add the kind.")
      : call<Kind[]>(t, `/kinds/${key}`, { method: "PUT", body: v }, "Couldn't save the kind."),
  deleteKind: (t: string, key: string) =>
    call<Kind[]>(t, `/kinds/${key}`, { method: "DELETE" }, "Couldn't delete the kind."),
  comment: (
    t: string,
    month: string,
    body: { body: string; night_id?: number; slot_id?: number; parent_id?: number; assign?: boolean }
  ) =>
    call<Programme>(t, `/months/${month}/comments`, { method: "POST", body }, "Couldn't post the comment."),
  editComment: (t: string, id: number, body: string) =>
    call<Programme>(t, `/comments/${id}`, { method: "PATCH", body: { body } }, "Couldn't save the comment."),
  deleteComment: (t: string, id: number) =>
    call<Programme>(t, `/comments/${id}`, { method: "DELETE" }, "Couldn't delete the comment."),
  resolve: (t: string, id: number, resolved: boolean) =>
    call<Programme>(
      t,
      `/comments/${id}/${resolved ? "resolve" : "reopen"}`,
      { method: "POST" },
      resolved ? "Couldn't resolve it." : "Couldn't reopen it."
    ),
};

function nightBody(v: NightForm) {
  return {
    date: v.date,
    uniform: v.uniform.trim() || null,
    duty_nco: v.dutyNco.trim() || null,
    notes: v.notes.trim() || null,
  };
}

/** Each kind of issue, counted, for the checks tab and the publish warning. */
export function issueCounts(issues: Issue[]): Record<Severity, number> {
  return {
    clash: issues.filter((i) => i.severity === "clash").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}

/** "December 2026" from "2026-12". */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
