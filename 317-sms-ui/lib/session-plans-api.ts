"use client";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import type { SessionPlanContent, SessionPlanDetail } from "@/lib/session-plans";

/**
 * Write calls against /session-plans, shared by the new, edit and detail pages
 * so the URL shape and the backend's `detail` error message are unwrapped in
 * one place. Rejects with the backend's message, so callers just
 * `catch (e) { toast.error(...) }`.
 */
async function request<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown } = { method: "POST" },
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/session-plans${path}`, {
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

/** Create a draft (no `id`) or save an existing one. */
export function savePlan(
  token: string,
  content: SessionPlanContent,
  id?: number,
): Promise<SessionPlanDetail> {
  return request<SessionPlanDetail>(
    token,
    id ? `/${id}` : "",
    { method: id ? "PUT" : "POST", body: content },
  );
}

/** Send a plan to staff for approval — emails them. */
export function submitPlan(token: string, id: number): Promise<SessionPlanDetail> {
  return request<SessionPlanDetail>(token, `/${id}/submit`, { method: "POST" });
}

/** Staff decision. `note`/`feedback` reach the NCO in the notification email. */
export function reviewPlan(
  token: string,
  id: number,
  decision: "approve" | "request-amendments",
  body: { note: string; feedback: Record<string, string> },
): Promise<SessionPlanDetail> {
  return request<SessionPlanDetail>(token, `/${id}/${decision}`, { method: "POST", body });
}

export function deletePlan(token: string, id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(token, `/${id}`, { method: "DELETE" });
}

export function deleteAttachment(
  token: string,
  id: number,
  attachmentId: number,
): Promise<SessionPlanDetail> {
  return request<SessionPlanDetail>(token, `/${id}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}
