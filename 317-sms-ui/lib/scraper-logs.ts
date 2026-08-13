/**
 * Follow a scraper job's log by polling, shared by the scraper console and the
 * assessments upload button.
 *
 * This replaced an `EventSource` stream per page. Scrapers now run on the home
 * box and log to the database rather than to memory in the API process, so
 * there is no in-process buffer left to stream from — and the API itself runs
 * on Lambda, which can't reliably stream a Python response anyway. Polling for
 * "everything after seq N" survives any proxy in between, and drops the
 * `?token=` query-string auth `EventSource` forced on us (it can't set
 * headers), so these requests carry a normal `Authorization` header through
 * `apiFetch`.
 */
import { useEffect, useRef, useState } from "react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

export type ScraperLogLine = {
  seq: number;
  ts: string;
  /** info | log | warning | error | status */
  type: string;
  value: string;
};

/** `queued` means nobody has picked the job up yet — normally momentary, but
 *  it's also what you see when the home box is offline. */
export type ScraperJobStatus =
  | "queued" | "claimed" | "running" | "done" | "failed" | "cancelled";

export type ScraperJobPoll = {
  job_id: number;
  scraper_id: string;
  status: ScraperJobStatus;
  running: boolean;
  started_by: string | null;
  requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  logs: ScraperLogLine[];
  last_seq: number;
  /** The server truncated this page — poll again before believing `status`. */
  has_more: boolean;
};

const POLL_MS = 1500;
// Backgrounded tabs get a slower cadence: a scrape runs for minutes and nobody
// is reading a hidden tab, so there's no reason to keep hitting the API.
const HIDDEN_POLL_MS = 8000;

export const TERMINAL_STATUSES: ScraperJobStatus[] = ["done", "failed", "cancelled"];

export function isFinished(status: ScraperJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export async function fetchScraperLogs(
  token: string,
  jobId: number,
  after: number,
): Promise<ScraperJobPoll> {
  const res = await apiFetch(`${API_BASE}/scraper-logs/${jobId}?after=${after}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Could not read the job log (${res.status}).`);
  }
  return (await res.json()) as ScraperJobPoll;
}

type Options = {
  /** New lines only — never replayed, so this is safe to push into a toast. */
  onLines?: (lines: ScraperLogLine[]) => void;
  /** Called once, when the job reaches a terminal status. */
  onFinished?: (job: ScraperJobPoll) => void;
};

/**
 * Poll one job until it finishes. Returns the accumulated lines plus the live
 * status, so a caller can either render the log or just react to the outcome.
 */
export function useScraperJob(
  jobId: number | null,
  token: string | null,
  { onLines, onFinished }: Options = {},
) {
  const [lines, setLines] = useState<ScraperLogLine[]>([]);
  const [status, setStatus] = useState<ScraperJobStatus>("queued");
  const [startedBy, setStartedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Callbacks live in refs so a caller passing an inline arrow function doesn't
  // tear down and restart the poll on every render. Kept up to date in an
  // effect rather than during render — this effect is declared first, so the
  // refs are current before the poll below ever reads them.
  const onLinesRef = useRef(onLines);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onLinesRef.current = onLines;
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (jobId == null || !token) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;

    const tick = async () => {
      try {
        const job = await fetchScraperLogs(token, jobId, cursor);
        if (cancelled) return;

        if (job.logs.length > 0) {
          cursor = job.last_seq;
          setLines((current) => [...current, ...job.logs]);
          onLinesRef.current?.(job.logs);
        }
        setStatus(job.status);
        setStartedBy(job.started_by);

        if (job.has_more) {
          // Catching up on a truncated page — come straight back for the rest
          // rather than treating a finished job's partial log as the whole of
          // it, which is what a backgrounded tab through a long run produces.
          timer = setTimeout(tick, 0);
          return;
        }

        if (isFinished(job.status)) {
          onFinishedRef.current?.(job);
          return;
        }
      } catch (e) {
        if (cancelled) return;
        // A single failed poll is usually a blip (a cold Lambda, a dropped
        // connection); surface it but keep polling so the run isn't abandoned
        // over one bad request.
        setError(e instanceof Error ? e.message : "Lost contact with the server.");
      }
      timer = setTimeout(tick, document.hidden ? HIDDEN_POLL_MS : POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, token]);

  return { lines, status, startedBy, error };
}
