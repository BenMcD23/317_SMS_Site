import { apiFetch } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

/**
 * The inspection sheet in progress, kept on the server as well as on the
 * phone. The phone's copy (useAssessmentDraft) only lives in that browser, so
 * a cleared cache, an iPhone home-screen app losing its storage or a switch to
 * another device lost the night's marking. The page saves here each time a
 * cadet is recorded, and on load takes whichever copy was saved last.
 */

const URL_ = `${API_BASE}/inspections/draft`;

/** What the page needs from a sheet to compare and restore it. */
export type DraftSheet = { marks: Record<number, unknown>; saved_at?: string };

/** The server's copy, or null when it has none. Throws when it couldn't be
 *  checked, so the caller can tell "nothing saved" from "server unreachable". */
export async function loadServerDraft<T extends DraftSheet>(token: string): Promise<T | null> {
  const res = await apiFetch(URL_, { headers: { Authorization: `Bearer ${token}` } });
  // 404 is the API's "no inspection in progress" — a real answer, not a failure.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load the saved sheet (${res.status})`);
  const body = (await res.json()) as { data?: T };
  return body?.data ?? null;
}

/** Replace the server's copy with this sheet. Throws if it wasn't saved. */
export async function saveServerDraft(token: string, sheet: DraftSheet): Promise<void> {
  const res = await apiFetch(URL_, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(sheet),
  });
  if (!res.ok) throw new Error(`Couldn't save to the server (${res.status})`);
}

/** Throw away the server's copy ("Clear draft"). */
export async function clearServerDraft(token: string): Promise<void> {
  const res = await apiFetch(URL_, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Couldn't clear the saved sheet (${res.status})`);
}

/**
 * Whether the server's copy should replace the phone's. An empty phone always
 * takes it. Otherwise the later `saved_at` wins, so marking carried on from
 * another device isn't overwritten by an older copy left on this one; a copy
 * with no `saved_at` (saved before it was tracked) counts as oldest.
 */
export function serverDraftIsNewer(local: DraftSheet, server: DraftSheet | null): boolean {
  if (!server || Object.keys(server.marks ?? {}).length === 0) return false;
  if (Object.keys(local.marks ?? {}).length === 0) return true;
  const l = Date.parse(local.saved_at ?? "") || 0;
  const s = Date.parse(server.saved_at ?? "") || 0;
  return s > l;
}
