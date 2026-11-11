// Shared types, write calls and helpers for staff notes about NCOs.
//
// Staff-only: these are what staff notice about the NCOs themselves, kept so
// the next appraisal can be drafted from them. The NCO comments page is the
// shared one. A note an appraisal has used is marked with it, so the next
// appraisal only gets what's been noted since.

"use client";

import { API_BASE } from "@/lib/config";
import { apiFetch, apiRequest, errorDetail } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";

export type NoteSource = "typed" | "voice";

export interface NcoNote {
  id: number;
  /** Null once the cadet has left; `cadet_name` is the snapshot then. */
  cadet_cin: number | null;
  cadet_name: string;
  body: string;
  note_date: string | null;
  source: NoteSource;
  author_name: string;
  is_mine: boolean;
  can_edit: boolean;
  can_delete: boolean;
  /** The appraisal that was drafted from this note, if one has been. */
  appraisal_id: number | null;
  appraisal_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NcoNoteRow {
  cin: number;
  name: string;
  rank: string | null;
  first_name: string;
  last_name: string;
  flight: string | null;
  /** Notes no appraisal has used yet. */
  open_notes: number;
  last_note_date: string | null;
  last_appraisal_date: string | null;
}

export interface NcoNotesOverview {
  ncos: NcoNoteRow[];
  recent: NcoNote[];
  /** False when the API has no speech-to-text key, so the mic is hidden. */
  voice_available: boolean;
}

export interface NcoProfile {
  nco: {
    cin: number;
    name: string;
    rank: string | null;
    first_name: string;
    last_name: string;
    flight: string | null;
  };
  notes: NcoNote[];
  open_notes: number;
  appraisals: { id: number; appraisal_date: string | null; next_review_date: string | null }[];
  next_review_date: string | null;
}

export interface SplitNote {
  cin: number;
  cadet_name: string;
  body: string;
}

export interface SplitResult {
  notes: SplitNote[];
  /** Parts the AI couldn't pin on exactly one NCO, for staff to place. */
  unassigned: string[];
  model: string;
  model_label: string;
}

export interface Transcript {
  text: string;
  model: string;
  model_label: string;
}

function request<T>(token: string, path: string, init: { method: string; body?: unknown }): Promise<T> {
  return apiRequest<T>(token, `${API_BASE}/nco-notes${path}`, init);
}

export function createNote(
  token: string,
  body: { cadet_cin: number; body: string; note_date?: string; source: NoteSource }
): Promise<NcoNote> {
  return request<NcoNote>(token, "", { method: "POST", body });
}

export function createNotes(
  token: string,
  notes: { cadet_cin: number; body: string }[],
  source: NoteSource,
  note_date?: string
): Promise<{ notes: NcoNote[] }> {
  return request<{ notes: NcoNote[] }>(token, "/batch", {
    method: "POST",
    body: { notes, source, note_date },
  });
}

export function editNote(
  token: string,
  id: number,
  body: { body: string; cadet_cin?: number }
): Promise<NcoNote> {
  return request<NcoNote>(token, `/${id}`, { method: "PUT", body });
}

export function deleteNote(token: string, id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(token, `/${id}`, { method: "DELETE" });
}

export function splitDebrief(token: string, text: string): Promise<SplitResult> {
  return request<SplitResult>(token, "/split", { method: "POST", body: { text } });
}

/**
 * Send a recorded clip for transcription. Multipart rather than JSON, so it
 * can't use apiRequest — but it still goes through apiFetch for the 401 and
 * outage handling, and rejects with the API's own message like apiRequest.
 */
export async function transcribe(token: string, audio: Blob): Promise<Transcript> {
  const form = new FormData();
  form.append("audio", audio, `note.${extensionFor(audio.type)}`);
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/nco-notes/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new Error("Server unreachable.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorDetail(data) ?? "Couldn't turn that recording into text.");
  return data as Transcript;
}

/** Recording formats in order of preference. Chrome and Firefox record WebM;
 *  Safari only MP4. The API transcribes all of them. */
export const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** The first format this browser can record, or "" to let it choose. */
export function pickRecordingType(isSupported: (type: string) => boolean): string {
  return RECORDING_TYPES.find((type) => isSupported(type)) ?? "";
}

function extensionFor(type: string): string {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

/** Notes no appraisal has used yet — what the next one is drafted from. */
export function openNotes(notes: NcoNote[]): NcoNote[] {
  return notes.filter((n) => n.appraisal_id === null);
}

/**
 * The selected notes as the appraisal writer's bullet points, oldest first and
 * dated, so the draft can say how the NCO has changed over the period rather
 * than reading every note as true of today.
 */
export function notesAsPoints(notes: NcoNote[]): string {
  return [...notes]
    .sort((a, b) => (a.note_date ?? "").localeCompare(b.note_date ?? "") || a.id - b.id)
    .map((n) => `- ${n.note_date ? formatDate(n.note_date) : "Undated"}: ${n.body.trim()}`)
    .join("\n");
}

/** Notes grouped by the appraisal that used them: the open ones first (no
 *  appraisal yet), then each appraisal newest first. Drives the profile. */
export function groupByAppraisal(
  notes: NcoNote[]
): { appraisalId: number | null; appraisalDate: string | null; notes: NcoNote[] }[] {
  const groups = new Map<
    number | null,
    { appraisalId: number | null; appraisalDate: string | null; notes: NcoNote[] }
  >();
  for (const note of notes) {
    const key = note.appraisal_id;
    const group = groups.get(key) ?? { appraisalId: key, appraisalDate: note.appraisal_date, notes: [] };
    group.notes.push(note);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.appraisalId === null) return -1;
    if (b.appraisalId === null) return 1;
    return (b.appraisalDate ?? "").localeCompare(a.appraisalDate ?? "");
  });
}
