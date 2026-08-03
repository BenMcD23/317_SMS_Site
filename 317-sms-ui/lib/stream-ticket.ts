import { API_BASE } from "@/lib/config";

/**
 * Mints a short-lived, single-use ticket for an EventSource URL.
 *
 * EventSource can't set an Authorization header, so the stream endpoints used
 * to take the raw ID token in the query string — where it reaches proxy logs,
 * browser history and Referer headers. A ticket lasts 30 seconds and grants
 * only the stream, so a leaked URL costs far less than a leaked token.
 *
 * Shared by every page that opens a scraper stream so the mint-then-connect
 * dance lives in one place.
 */
export async function fetchStreamTicket(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/stream-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not authorise stream");
  const { ticket } = await res.json();
  return ticket as string;
}
