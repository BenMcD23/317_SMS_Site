import { apiFetch, errorDetail } from "@/lib/api-fetch";

/**
 * Submissions kept on this device until there is signal to send them.
 *
 * Drill halls have poor signal, and a marking sheet finished on a phone used to
 * fail with "Failed to fetch" and wait for someone to remember to submit it
 * again. Now a write that can't reach the API is stored here and sent by
 * `OutboxSync` (components/outbox.tsx) as soon as the connection is back.
 *
 * Only "couldn't reach the server" is queued. A 4xx is the server's answer
 * about the data, which retrying can't change, so the page shows it as usual.
 *
 * Each item records who queued it and is only sent with that person's token,
 * so a shared phone never sends one NCO's sheet under another's name. The
 * token itself isn't stored: it lasts an hour, the queue may wait longer.
 *
 * localStorage rather than IndexedDB: the queue is a few small JSON bodies and
 * must survive a reload or the app being closed, which both do. A body too big
 * for it (a large PDF attachment) fails to queue, and the page says so.
 */

export type OutboxItem = {
  id: string;
  url: string;
  method: string;
  body: unknown;
  /** What it is, for the outbox list: "Leadership assessment — Cdt Ava Smith". */
  label: string;
  /** Email of the person who submitted it. */
  owner: string;
  queuedAt: string;
  /** Set when the server refused it on a later try; kept so nothing vanishes unseen. */
  error?: string;
};

export type SendResult = { queued: true } | { queued: false; res: Response };

const KEY = "sms:outbox";
/** Fired on window whenever the queue changes, so indicators can re-read it. */
export const OUTBOX_EVENT = "sms:outbox-changed";

// The API host answered for an API that isn't there (deploying, proxy up but
// app down), or a gateway gave up: the write never reached our code.
const UNREACHABLE = [502, 503, 504];

export function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]) {
  if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export function outboxFor(owner: string | null | undefined): OutboxItem[] {
  if (!owner) return [];
  return readOutbox().filter((i) => i.owner === owner);
}

/** Store a write to send later. Throws if this device has no room for it. */
export function queueWrite(item: Omit<OutboxItem, "id" | "queuedAt">): OutboxItem {
  const queued: OutboxItem = {
    ...item,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  };
  try {
    writeOutbox([...readOutbox(), queued]);
  } catch {
    throw new Error(
      "No signal, and this sheet is too big to keep on the phone. Try again once you're online."
    );
  }
  return queued;
}

export function discardQueued(id: string) {
  try {
    writeOutbox(readOutbox().filter((i) => i.id !== id));
  } catch {
    // Storage unavailable: there was nothing we could have read either.
  }
}

/** A fetch that never got an answer: no signal, DNS, the API host down. */
export function isNetworkFailure(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}

function send(item: Pick<OutboxItem, "url" | "method" | "body">, token: string): Promise<Response> {
  return apiFetch(item.url, {
    method: item.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(item.body),
  });
}

/**
 * Send a write now, or keep it to send later if the server can't be reached.
 * Any answer from the server (including an error) comes back as `res` for the
 * page to handle as it always has.
 */
export async function sendOrQueue(
  write: Pick<OutboxItem, "url" | "method" | "body" | "label">,
  { token, owner }: { token: string; owner: string }
): Promise<SendResult> {
  let res: Response;
  try {
    res = await send(write, token);
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    queueWrite({ ...write, owner });
    return { queued: true };
  }
  if (UNREACHABLE.includes(res.status)) {
    queueWrite({ ...write, owner });
    return { queued: true };
  }
  return { queued: false, res };
}

let flushing: Promise<FlushResult> | null = null;

export type FlushResult = { sent: OutboxItem[]; refused: OutboxItem[] };

/**
 * Try to send everything `owner` has queued, oldest first. Stops at the first
 * item that still can't reach the server (no point trying the rest). An item
 * the server refuses is kept, marked with the reason, for the person to see and
 * discard; it is not retried, because the same body will be refused again.
 *
 * One flush at a time: a second call while one runs gets the same result
 * rather than sending the same items twice.
 */
export function flushOutbox(token: string, owner: string): Promise<FlushResult> {
  // Cleared in .finally, not inside run(): with nothing to send run() settles
  // before this assignment, and clearing there would leave the lock set forever.
  flushing ??= run(token, owner).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function run(token: string, owner: string): Promise<FlushResult> {
  const result: FlushResult = { sent: [], refused: [] };
  for (const item of outboxFor(owner).filter((i) => !i.error)) {
    let res: Response;
    try {
      res = await send(item, token);
    } catch {
      break;
    }
    // A 401 is the token, not the sheet: apiFetch has started a re-auth, and
    // the item goes after it. Rate-limited or unreachable: later.
    if (res.status === 401 || res.status === 429 || res.status >= 500) break;
    if (res.ok) {
      result.sent.push(item);
      writeOutbox(readOutbox().filter((i) => i.id !== item.id));
      continue;
    }
    const data = await res.json().catch(() => null);
    const refused = { ...item, error: errorDetail(data) ?? `Refused (${res.status})` };
    result.refused.push(refused);
    writeOutbox(readOutbox().map((i) => (i.id === item.id ? refused : i)));
  }
  return result;
}
