import { apiFetch } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

/**
 * Assessment and inspection sheets kept on the server while they're being
 * filled in, as well as on the phone. The phone's copy only lives in that
 * browser, so a cleared cache, an iPhone home-screen app losing its storage or
 * a switch of device lost the work. useAssessmentDraft saves here and, on
 * load, takes whichever copy was saved last.
 */

export type DraftKind = "inspection" | "leadership" | "radio" | "space" | "moi";
export type ServerDraft<T> = { data: T; saved_at: string | null };

const url = (kind: DraftKind) => `${API_BASE}/assessment-drafts/${kind}`;

/** The server's copy, or null when it has none. Throws when it couldn't be
 *  checked, so the caller can tell "nothing saved" from "server unreachable". */
export async function loadServerDraft<T>(kind: DraftKind, token: string): Promise<ServerDraft<T> | null> {
  const res = await apiFetch(url(kind), { headers: { Authorization: `Bearer ${token}` } });
  // 404 is the API's "no draft saved", a real answer rather than a failure.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load the saved draft (${res.status})`);
  const body = (await res.json()) as Partial<ServerDraft<T>>;
  return body?.data ? { data: body.data, saved_at: body.saved_at ?? null } : null;
}

/** Replace the server's copy. Throws if it wasn't saved. */
export async function saveServerDraft<T>(
  kind: DraftKind,
  token: string,
  data: T,
  savedAt: string
): Promise<void> {
  const res = await apiFetch(url(kind), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data, saved_at: savedAt }),
  });
  if (!res.ok) throw new Error(`Couldn't save to the server (${res.status})`);
}

/** Throw away the server's copy. Throws if it couldn't. */
export async function clearServerDraft(kind: DraftKind, token: string): Promise<void> {
  const res = await apiFetch(url(kind), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Couldn't clear the saved draft (${res.status})`);
}

/**
 * Whether the server's copy should replace the phone's. A phone with nothing
 * worth keeping always takes it. Otherwise the later save wins, so work carried
 * on from another device isn't overwritten by an older copy left on this one.
 * A copy with no time (saved before times were kept) counts as oldest, and when
 * neither has one the phone's copy stays.
 */
export function serverDraftIsNewer(
  local: { meaningful: boolean; savedAt: string | null },
  server: { meaningful: boolean; savedAt: string | null } | null
): boolean {
  if (!server?.meaningful) return false;
  if (!local.meaningful) return true;
  const l = Date.parse(local.savedAt ?? "") || 0;
  const s = Date.parse(server.savedAt ?? "") || 0;
  return s > l;
}
