// Shared types + write calls for NCO quick comments.
//
// A comment is a short dated note, either about a cadet or about the squadron
// in general, that anyone who can see the page can reply to. Every NCO, SNCO
// and staff member sees the whole list; deleting is limited to the author (or
// staff) by the API.

"use client";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

export interface NcoCommentReply {
  id: number;
  body: string;
  author_name: string;
  author_email: string;
  created_at: string | null;
  can_delete: boolean;
}

export interface NcoComment {
  id: number;
  subject: string;
  body: string;
  comment_date: string | null;
  /** Null on a general comment — that's what makes it general. */
  cadet_cin: number | null;
  /** Empty on a general comment; the snapshotted name once a cadet has left. */
  cadet_name: string;
  cadet_flight: string | null;
  author_name: string;
  author_email: string;
  created_at: string | null;
  is_mine: boolean;
  can_delete: boolean;
  replies: NcoCommentReply[];
}

export interface NcoCommentList {
  comments: NcoComment[];
  is_staff: boolean;
}

export interface NewComment {
  subject: string;
  body: string;
  comment_date: string; // "YYYY-MM-DD"
  cadet_cin: number | null;
}

/** Today as "YYYY-MM-DD" in local time — the date a new comment starts on. */
export function todayISO(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function isAboutCadet(comment: NcoComment): boolean {
  return comment.cadet_cin !== null || comment.cadet_name !== "";
}

/** Comments about cadets, grouped by cadet, most recently commented-on first. */
export function groupByCadet(comments: NcoComment[]): {
  key: string;
  cin: number | null;
  name: string;
  flight: string | null;
  comments: NcoComment[];
}[] {
  const groups = new Map<string, { key: string; cin: number | null; name: string; flight: string | null; comments: NcoComment[] }>();
  for (const comment of comments) {
    if (!isAboutCadet(comment)) continue;
    // A cadet who has left has no CIN any more, so their name carries the group.
    const key = comment.cadet_cin !== null ? `cin:${comment.cadet_cin}` : `name:${comment.cadet_name}`;
    const group = groups.get(key);
    if (group) {
      group.comments.push(comment);
    } else {
      groups.set(key, {
        key,
        cin: comment.cadet_cin,
        name: comment.cadet_name || "Unknown cadet",
        flight: comment.cadet_flight,
        comments: [comment],
      });
    }
  }
  return [...groups.values()];
}

async function request<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/nco-comments${path}`, {
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
  if (!res.ok) throw new Error(data?.detail ?? "Something went wrong.");
  return data as T;
}

export function createComment(token: string, body: NewComment): Promise<NcoComment> {
  return request<NcoComment>(token, "", { method: "POST", body });
}

export function deleteComment(token: string, id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(token, `/${id}`, { method: "DELETE" });
}

/** Returns the whole comment, so the caller can swap in the updated chain. */
export function addReply(token: string, id: number, body: string): Promise<NcoComment> {
  return request<NcoComment>(token, `/${id}/replies`, { method: "POST", body: { body } });
}

export function deleteReply(token: string, id: number, replyId: number): Promise<NcoComment> {
  return request<NcoComment>(token, `/${id}/replies/${replyId}`, { method: "DELETE" });
}
