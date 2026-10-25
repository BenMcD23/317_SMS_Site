import { apiFetch } from "@/lib/api-fetch";

/**
 * Read a `text/event-stream` response as it arrives, yielding each event's
 * decoded `data:` payload.
 *
 * Streams that need authentication can't use `EventSource` — it sets no headers,
 * so the id_token would have to go in the query string and from there into every
 * access log. Those are POSTed through `apiFetch` instead and the body is parsed
 * here. Only the `data:` field is read: the API sends one JSON object per event
 * and uses no event names or ids.
 */
export async function* streamSse<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      // A blank line ends an event; whatever follows the last one is a partial
      // event still on its way, so it stays in the buffer.
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data) yield JSON.parse(data) as T;
        end = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Open an authenticated GET stream and yield its events.
 *
 * Shared by the scraper log and the assessment upload progress so neither
 * needs `EventSource`: that can't set an Authorization header, which left the
 * id_token in the URL, and from there in proxy logs, history and Referer.
 * Abort `signal` to close the connection (on unmount, or once the job is done).
 * A non-2xx answer throws with the API's own message.
 */
export async function* streamAuthed<T>(url: string, token: string, signal: AbortSignal): AsyncGenerator<T> {
  const res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : res.statusText || `HTTP ${res.status}`);
  }
  yield* streamSse<T>(res);
}
