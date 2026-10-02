"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { streamSse } from "@/lib/sse";

/** How many Bader uploads may run at once. Each is a headless browser on the
 *  API host, so the rest wait their turn rather than starving it of RAM. */
export const MAX_CONCURRENT_UPLOADS = 3;

type UploadEvent = { type: string; value: string };

/**
 * Upload one cadet's qualification (a set of assessment sheets) to Bader SMS
 * and resolve once the API's job has finished, or reject with why it didn't.
 *
 * The job's log is read with `apiFetch` + `streamSse` rather than an
 * `EventSource`, so the token goes in a header instead of the URL. The API
 * never closes the stream itself, so it's aborted once the outcome is known.
 */
export async function uploadToBader(
  token: string,
  assessmentIds: number[],
  onProgress?: (message: string) => void
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };

  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/assessments/upload-to-bader`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ assessment_ids: assessmentIds }),
    });
  } catch {
    throw new Error("Server unreachable.");
  }
  const started = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorDetail(started) ?? "Upload failed");
  const jobId = (started as { job_id?: string } | null)?.job_id;
  if (!jobId) throw new Error("The API didn't start an upload job.");

  const abort = new AbortController();
  try {
    const stream = await apiFetch(`${API_BASE}/upload-stream/${jobId}`, { headers, signal: abort.signal });
    if (!stream.ok) throw new Error("Couldn't follow the upload's progress.");
    for await (const event of streamSse<UploadEvent>(stream)) {
      if (event.type === "status" && event.value === "done") return;
      if (event.type === "error") throw new Error(event.value);
      if (["info", "warning", "log"].includes(event.type)) onProgress?.(event.value);
    }
    throw new Error("Connection to scraper lost.");
  } catch (e) {
    // Our own plain Errors carry the job's message; anything else (a dropped
    // connection, a garbled frame) is the stream breaking, not the upload.
    if (e instanceof Error && e.constructor === Error) throw e;
    throw new Error("Connection to scraper lost.");
  } finally {
    abort.abort();
  }
}

/**
 * Returns a `run(task)` that starts at most `limit` tasks at a time; the rest
 * wait in order. Each call resolves or rejects with its own task's result.
 */
export function limitConcurrency(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const startNext = () => {
    if (active >= limit) return;
    const start = waiting.shift();
    if (!start) return;
    active++;
    start();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        // Promise.resolve().then so a task that throws synchronously still
        // frees its slot instead of jamming the queue.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            startNext();
          });
      });
      startNext();
    });
  };
}

export type UploadStatus = "queued" | "uploading" | "done" | "failed";

/**
 * Page-wide queue for Bader uploads. The single "Upload to SMS" buttons and
 * "Upload all" share it, so a click during a bulk upload waits its turn too
 * rather than becoming a fourth browser. Progress goes to a toast per upload,
 * which outlives the row once a refetch moves it to Completed.
 */
export function useBaderUploads(token: string | null, onUploaded: () => void) {
  const [statuses, setStatuses] = useState<Record<string, UploadStatus>>({});
  const runRef = useRef<ReturnType<typeof limitConcurrency> | null>(null);
  runRef.current ??= limitConcurrency(MAX_CONCURRENT_UPLOADS);
  // A ref, not state: two clicks in the same render must not both get in.
  const inFlight = useRef(new Set<string>());

  const setStatus = useCallback(
    (key: string, status: UploadStatus) => setStatuses((prev) => ({ ...prev, [key]: status })),
    []
  );

  /** Queue one upload. Resolves to whether it succeeded; never rejects. */
  const upload = useCallback(
    async (key: string, assessmentIds: number[], label: string): Promise<boolean> => {
      if (!token || inFlight.current.has(key)) return false;
      inFlight.current.add(key);
      setStatus(key, "queued");
      const toastId = `upload-${key}`;
      toast.loading(`${label}: queued`, { id: toastId, duration: Infinity });

      try {
        await runRef.current!(() => {
          setStatus(key, "uploading");
          toast.loading(`${label}: connecting to SMS…`, { id: toastId, duration: Infinity });
          return uploadToBader(token, assessmentIds, (msg) =>
            toast.loading(msg, { id: toastId, duration: Infinity })
          );
        });
        setStatus(key, "done");
        toast.success("Upload complete", {
          id: toastId,
          description: `${label} uploaded to Bader SMS.`,
          duration: 6000,
        });
        onUploaded();
        return true;
      } catch (e) {
        setStatus(key, "failed");
        toast.error(`Upload failed — ${label}`, {
          id: toastId,
          description: e instanceof Error ? e.message : "Upload failed",
          duration: 8000,
        });
        return false;
      } finally {
        inFlight.current.delete(key);
      }
    },
    [token, onUploaded, setStatus]
  );

  return { statuses, upload };
}
