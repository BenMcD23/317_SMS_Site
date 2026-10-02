// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssessmentsOverviewPage from "@/app/cadets/assessments/page";
import { TooltipProvider } from "@/components/ui/tooltip";

const STAFF = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
const NCO = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk", name: "Nat NCO" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
let session = STAFF;
vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const toast = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const NAMES = ["Amy", "Ben", "Cal", "Dee", "Eve"];

function cadet(i: number, uploaded: boolean) {
  return {
    cin: 1001 + i,
    first_name: NAMES[i],
    last_name: "Able",
    rank: "Cdt",
    flight: "A",
    groups: [
      {
        assessment_type: "Blue Radio",
        assessments: [
          {
            id: 100 + i,
            assessment_type: "Blue Radio",
            created_at: "2026-09-14T19:00:00",
            passed: true,
            total_score: 10,
            exercise_name: null,
            assessor_name: "Sam Staff",
          },
        ],
        passed_count: 1,
        required_to_upload: 1,
        can_upload: true,
        uploaded,
        uploaded_at: uploaded ? "2026-10-02T19:00:00" : null,
      },
    ],
  };
}

const encoder = new TextEncoder();

/**
 * A fake API whose upload jobs stay running until the test finishes them, so
 * the test can see exactly how many are in flight. `failStart` makes the POST
 * for those assessment ids fail.
 */
function fakeApi({ failStart = [] as number[] } = {}) {
  const uploaded = new Set<number>();
  const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  const started: number[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname;
      if (path === "/assessments/overview") {
        return Promise.resolve(
          new Response(JSON.stringify(NAMES.map((_, i) => cadet(i, uploaded.has(100 + i)))), { status: 200 })
        );
      }
      if (path === "/assessments/upload-to-bader") {
        const [id] = JSON.parse(String(init.body)).assessment_ids as number[];
        started.push(id);
        if (failStart.includes(id)) {
          return Promise.resolve(
            new Response(JSON.stringify({ detail: "Server RAM too low" }), { status: 503 })
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ job_id: `job${id}` }), { status: 200 }));
      }
      const jobId = path.split("/").pop()!;
      const body = new ReadableStream<Uint8Array>({ start: (c) => void streams.set(jobId, c) });
      return Promise.resolve(new Response(body, { status: 200 }));
    })
  );

  return {
    started,
    async finish(id: number) {
      uploaded.add(id);
      await act(async () => {
        streams.get(`job${id}`)!.enqueue(encoder.encode(`data: {"type":"status","value":"done"}\n\n`));
      });
      await settle();
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};

// The app layout provides this; the page's info tooltips need it.
async function renderPage() {
  await act(
    async () =>
      void render(
        <TooltipProvider>
          <AssessmentsOverviewPage />
        </TooltipProvider>
      )
  );
  await settle();
}

async function openReadyTab() {
  await renderPage();
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: /ready/i })));
}

async function uploadAll(count: number) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `Upload all (${count})` })));
  await act(async () =>
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }))
  );
  await settle();
}

beforeEach(() => {
  session = STAFF;
  Object.values(toast).forEach((f) => f.mockClear());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe("Upload all on the ready tab", () => {
  it("uploads every ready qualification, only 3 at a time, starting the next as each finishes", async () => {
    const api = fakeApi();
    await openReadyTab();
    await uploadAll(5);

    expect(api.started).toEqual([100, 101, 102]);
    expect(screen.getAllByRole("button", { name: "Uploading…" })).toHaveLength(4); // 3 rows + the bulk button
    expect(screen.getAllByRole("button", { name: "Queued" })).toHaveLength(2);
    expect(screen.getByText(/0 of 5 finished/)).toBeTruthy();

    await api.finish(101);
    expect(api.started).toEqual([100, 101, 102, 103]);
    expect(screen.getByText(/1 of 5 finished/)).toBeTruthy();

    for (const id of [100, 102, 103]) await api.finish(id);
    expect(api.started).toEqual([100, 101, 102, 103, 104]);
    await api.finish(104);

    expect(toast.success).toHaveBeenCalledWith("All 5 qualifications uploaded");
    expect(screen.getByText("No assessments are ready to upload.")).toBeTruthy();
  });

  it("a single upload clicked while the batch is full waits its turn too", async () => {
    const api = fakeApi();
    await openReadyTab();
    const buttons = screen.getAllByRole("button", { name: "Upload to SMS" });
    for (const i of [0, 1, 2, 4]) await act(async () => fireEvent.click(buttons[i]));
    await settle();

    expect(api.started).toEqual([100, 101, 102]);
    expect(screen.getByRole("button", { name: "Queued" })).toBeTruthy();
    await api.finish(100);
    expect(api.started).toEqual([100, 101, 102, 104]);
  });

  it("one failure is reported and the rest of the batch carries on", async () => {
    const api = fakeApi({ failStart: [101] });
    await openReadyTab();
    await uploadAll(5);

    // The failed start freed its slot straight away.
    expect(api.started).toEqual([100, 101, 102, 103]);
    expect(toast.error).toHaveBeenCalledWith(
      "Upload failed — Blue Radio for Ben Able",
      expect.objectContaining({ description: "Server RAM too low" })
    );

    for (const id of [100, 102, 103, 104]) await api.finish(id);
    expect(toast.error).toHaveBeenCalledWith("4 of 5 uploaded — 1 failed", expect.anything());
    // Ben's is still ready, so it can be retried.
    expect(screen.getByRole("button", { name: "Upload all (1)" })).toBeTruthy();
  });

  it("only sends what the search is showing", async () => {
    const api = fakeApi();
    await openReadyTab();
    await act(async () =>
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "1002" } })
    );
    await uploadAll(1);
    expect(api.started).toEqual([101]);
  });

  it("cancelling the confirmation uploads nothing", async () => {
    const api = fakeApi();
    await openReadyTab();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload all (5)" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    await settle();
    expect(api.started).toEqual([]);
  });

  it("isn't offered to NCOs, who can't upload to SMS", async () => {
    session = NCO;
    fakeApi();
    await openReadyTab();
    expect(screen.queryByRole("button", { name: /Upload all/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload to SMS" })).toBeNull();
  });

  it("isn't shown on the active tab", async () => {
    fakeApi();
    await renderPage();
    expect(screen.queryByRole("button", { name: /Upload all/ })).toBeNull();
  });

  it("isn't shown when the overview fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }))
      )
    );
    await openReadyTab();
    expect(screen.getByText("Database is down")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Upload all/ })).toBeNull();
  });
});
