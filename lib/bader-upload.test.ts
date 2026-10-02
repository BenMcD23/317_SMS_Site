// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { limitConcurrency, uploadToBader } from "@/lib/bader-upload";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const encoder = new TextEncoder();

/** An SSE body carrying these events. Left open unless `close`, like the API's
 *  stream, which never ends on its own. */
function sse(events: object[], { close = false } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      if (close) c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Stub fetch: the POST answers `start()`, the stream GET answers `stream()`. */
function stubApi(
  start: () => Response,
  stream: () => Response = () => sse([{ type: "status", value: "done" }])
) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(String(url).includes("/upload-stream/") ? stream() : start());
    })
  );
  return calls;
}

describe("uploadToBader", () => {
  it("starts a job for the given sheets, reports progress and resolves when it's done", async () => {
    const calls = stubApi(
      () => json({ status: "started", job_id: "abc123" }),
      () =>
        sse([
          { type: "info", value: "Logged in to Bader SMS." },
          { type: "warning", value: "No PDFs stored" },
          { type: "info", value: "Badge order created: Leadership – Blue for Zoë Ó Briain." },
          { type: "status", value: "done" },
        ])
    );
    const progress: string[] = [];

    await uploadToBader("tok", [4, 5], (m) => progress.push(m));

    expect(calls[0].url).toMatch(/\/assessments\/upload-to-bader$/);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ assessment_ids: [4, 5] });
    expect(calls[1].url).toMatch(/\/upload-stream\/abc123$/);
    // The token travels in a header, never the URL (which ends up in access logs).
    expect(calls[1].url).not.toContain("tok");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(progress).toEqual([
      "Logged in to Bader SMS.",
      "No PDFs stored",
      "Badge order created: Leadership – Blue for Zoë Ó Briain.",
    ]);
  });

  it("hangs up on the stream once the job is done, since the API never closes it", async () => {
    const calls = stubApi(() => json({ job_id: "j" }));
    await uploadToBader("tok", [1]);
    expect(calls[1].init.signal?.aborted).toBe(true);
  });

  it("rejects with the job's own error", async () => {
    stubApi(
      () => json({ job_id: "j" }),
      () =>
        sse([
          { type: "info", value: "Logged in" },
          { type: "error", value: "Upload scraper error: Bader said no" },
        ])
    );
    await expect(uploadToBader("tok", [1])).rejects.toThrow("Upload scraper error: Bader said no");
  });

  it("a stream that ends without finishing is a lost connection, not a success", async () => {
    stubApi(
      () => json({ job_id: "j" }),
      () => sse([{ type: "info", value: "Logged in" }], { close: true })
    );
    await expect(uploadToBader("tok", [1])).rejects.toThrow("Connection to scraper lost.");
  });

  it("a stream that can't be opened is reported", async () => {
    stubApi(
      () => json({ job_id: "j" }),
      () => json({ detail: "Upload job not found" }, 404)
    );
    await expect(uploadToBader("tok", [1])).rejects.toThrow("Couldn't follow the upload's progress.");
  });

  it("the stream dropping mid-job is a lost connection", async () => {
    stubApi(
      () => json({ job_id: "j" }),
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.error(new TypeError("network error"));
            },
          })
        )
    );
    await expect(uploadToBader("tok", [1])).rejects.toThrow("Connection to scraper lost.");
  });

  it.each([
    [
      400,
      { detail: "Bader credentials not saved. Please go to Settings first." },
      "Bader credentials not saved",
    ],
    [404, { detail: "Assessment ID(s) not found: [9]" }, "Assessment ID(s) not found: [9]"],
    [503, { detail: "Server RAM too low (300 MB available, need 500 MB)." }, "Server RAM too low"],
    [422, { detail: [{ msg: "Input should be a valid list" }] }, "Input should be a valid list"],
    [500, "Internal Server Error", "Upload failed"],
  ])("a %i from the API rejects with its reason and never opens a stream", async (status, body, message) => {
    const calls = stubApi(() => json(body, status));
    await expect(uploadToBader("tok", [1])).rejects.toThrow(message);
    expect(calls).toHaveLength(1);
  });

  it("an unreachable API is reported as such", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    await expect(uploadToBader("tok", [1])).rejects.toThrow("Server unreachable.");
  });

  it("a 200 without a job id is an error rather than a stream for 'undefined'", async () => {
    const calls = stubApi(() => json({ status: "started" }));
    await expect(uploadToBader("tok", [1])).rejects.toThrow("didn't start an upload job");
    expect(calls).toHaveLength(1);
  });
});

/** A task the test finishes by hand. */
function deferred() {
  let resolve!: (v: string) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("limitConcurrency", () => {
  it("runs at most 3 at once and starts the queued ones in order as slots free", async () => {
    const run = limitConcurrency(3);
    const tasks = Array.from({ length: 5 }, deferred);
    const started: number[] = [];
    const results = tasks.map((t, i) =>
      run(() => {
        started.push(i);
        return t.promise;
      })
    );

    await flush();
    expect(started).toEqual([0, 1, 2]);

    tasks[1].resolve("b");
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);

    tasks.forEach((t, i) => i !== 1 && t.resolve(String(i)));
    await flush();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(await Promise.all(results)).toEqual(["0", "b", "2", "3", "4"]);
  });

  it("a failed task rejects its own call and still frees its slot", async () => {
    const run = limitConcurrency(1);
    const first = run(() => Promise.reject(new Error("Bader said no")));
    const second = run(() => Promise.resolve("ok"));
    await expect(first).rejects.toThrow("Bader said no");
    expect(await second).toBe("ok");
  });

  it("a task that throws before returning a promise doesn't jam the queue", async () => {
    const run = limitConcurrency(1);
    const first = run((): Promise<string> => {
      throw new Error("boom");
    });
    await expect(first).rejects.toThrow("boom");
    expect(await run(() => Promise.resolve("next"))).toBe("next");
  });
});
