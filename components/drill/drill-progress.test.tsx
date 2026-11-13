// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DrillProgressView } from "@/components/drill/drill-progress";
import type { DrillCadet, DrillProgress } from "@/lib/drill";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "snco", user: { email: "snco@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const STAGES: DrillProgress["stages"] = [
  {
    id: 1,
    name: "Stage 1: At the halt",
    test_name: "5x5 drill test",
    max_score: 25,
    pass_mark: 15,
    lessons: [
      { id: 11, name: "Turns at the halt" },
      { id: 12, name: "Saluting at the halt" },
    ],
  },
  {
    id: 2,
    name: "Stage 2: On the march",
    test_name: "5x5 drill test",
    max_score: 25,
    pass_mark: null,
    lessons: [{ id: 21, name: "Wheeling" }],
  },
];

function cadet(cin: number, name: string, over: Partial<DrillCadet> = {}): DrillCadet {
  return {
    cin,
    name,
    rank: "Cdt",
    flight: "A",
    lessons: {},
    tests: [],
    stages: { "1": "not_started", "2": "not_started" },
    current: 1,
    ready_for_test: [],
    ...over,
  };
}

const READY = cadet(1, "Siân Ó Briain", {
  lessons: {
    "11": { taught_at: "2026-10-01T19:30:00", passed_at: "2026-10-08T19:30:00", passed_by: "s" },
    "12": { taught_at: "2026-10-01T19:30:00", passed_at: "2026-10-08T19:30:00", passed_by: "s" },
  },
  stages: { "1": "ready", "2": "not_started" },
  ready_for_test: [1],
});
const LEARNING = cadet(2, "Tom Able", {
  flight: "B",
  lessons: { "11": { taught_at: "2026-10-01T19:30:00", passed_at: null, passed_by: null } },
  stages: { "1": "in_progress", "2": "not_started" },
});
const DONE = cadet(3, "Ann Done", {
  stages: { "1": "complete", "2": "complete" },
  current: null,
  tests: [
    {
      id: 70,
      stage_id: 1,
      tested_on: "2026-09-01",
      score: 11,
      passed: false,
      notes: "Rushed turns",
      tested_by: "s",
    },
    { id: 71, stage_id: 1, tested_on: "2026-09-15", score: 19, passed: true, notes: null, tested_by: "s" },
  ],
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function api(
  progress: () => Response = () => json({ stages: STAGES, cadets: [READY, LEARNING, DONE] }),
  write = () => json({})
) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    !init?.method || init.method === "GET" ? progress() : write()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => ({
      url: new URL(url).pathname,
      method: init!.method,
      body: init!.body ? JSON.parse(String(init!.body)) : null,
    }));

describe("Drill progress", () => {
  it("leads with who is ready for a test, then lists everyone with their stage", async () => {
    api();
    renderWithQuery(<DrillProgressView canRecord />);
    const ready = await screen.findByRole("region", { name: "Ready for a test" });
    expect(within(ready).getByText("Siân Ó Briain")).toBeTruthy();
    expect(within(ready).queryByText("Tom Able")).toBeNull();
    const everyone = screen.getByRole("region", { name: "Everyone" });
    expect(
      within(everyone)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual([
      expect.stringContaining("Siân Ó Briain"),
      expect.stringContaining("Tom Able"),
      expect.stringContaining("Ann Done"),
    ]);
    // The word is there as well as the colour.
    expect(within(everyone).getByText("Learning")).toBeTruthy();
  });

  it("narrows to one flight", async () => {
    api();
    renderWithQuery(<DrillProgressView canRecord />);
    await screen.findByRole("region", { name: "Everyone" });
    await userEvent.click(screen.getByRole("radio", { name: /B/ }));
    const everyone = screen.getByRole("region", { name: "Everyone" });
    expect(within(everyone).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Ready for a test" })).toBeNull();
  });

  it("an SNCO marks a lesson passed from the cadet's record", async () => {
    const fetchMock = api();
    renderWithQuery(<DrillProgressView canRecord />);
    await userEvent.click(await screen.findByRole("button", { name: /Tom Able/ }));
    const dialog = await screen.findByRole("dialog");
    const row = within(dialog).getByRole("radiogroup", { name: "Turns at the halt for Tom Able" });
    await userEvent.click(within(row).getByRole("radio", { name: "Passed" }));
    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([
        { url: "/cadets/2/drill/lessons/11", method: "PUT", body: { taught: true, passed: true } },
      ])
    );
  });

  it("an API refusal is shown, not swallowed", async () => {
    api(undefined, () => json({ detail: "Staff or SNCO access required" }, 403));
    renderWithQuery(<DrillProgressView canRecord />);
    await userEvent.click(await screen.findByRole("button", { name: /Tom Able/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getAllByRole("radio", { name: "Taught" })[1]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Staff or SNCO access required"));
  });

  it("an NCO sees the record read-only, with no way to sign off or mark a squad", async () => {
    const fetchMock = api();
    renderWithQuery(<DrillProgressView canRecord={false} />);
    await screen.findByRole("region", { name: "Everyone" });
    expect(screen.queryByRole("button", { name: "Mark a squad" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Ann Done/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("radio")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Record/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Delete/ })).toBeNull();
    // Both attempts show, the failed one with its notes.
    expect(within(dialog).getByText("Rushed turns")).toBeTruthy();
    expect(within(dialog).getByText(/19\/25/)).toBeTruthy();
    expect(writes(fetchMock)).toEqual([]);
  });

  it("recording a test with a pass mark needs a score, then saves it", async () => {
    const fetchMock = api(undefined, () =>
      json({
        id: 80,
        stage_id: 1,
        tested_on: "2026-11-13",
        score: 20,
        passed: true,
        notes: null,
        tested_by: "s",
      })
    );
    renderWithQuery(<DrillProgressView canRecord />);
    await userEvent.click(
      within(await screen.findByRole("region", { name: "Ready for a test" })).getByRole("button", {
        name: /Siân/,
      })
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Record 5x5 drill test" })[0]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save 5x5 drill test" }));
    expect(await within(dialog).findByText("Enter the score: the pass mark is 15")).toBeTruthy();
    expect(writes(fetchMock)).toEqual([]);

    await userEvent.type(within(dialog).getByLabelText("Score out of 25"), "30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save 5x5 drill test" }));
    expect(await within(dialog).findByText("A whole number from 0 to 25")).toBeTruthy();

    await userEvent.clear(within(dialog).getByLabelText("Score out of 25"));
    await userEvent.type(within(dialog).getByLabelText("Score out of 25"), "20");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save 5x5 drill test" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      url: "/cadets/1/drill/tests",
      method: "POST",
      body: { stage_id: 1, score: 20, passed: null, notes: null },
    });
    expect(toast.success).toHaveBeenCalledWith("5x5 drill test passed");
  });

  it("a stage with no pass mark asks the tester for the result", async () => {
    api();
    renderWithQuery(<DrillProgressView canRecord />);
    await userEvent.click(await screen.findByRole("button", { name: /Tom Able/ }));
    const dialog = await screen.findByRole("dialog");
    const stage2 = within(dialog).getByRole("region", { name: "Stage 2: On the march" });
    await userEvent.click(within(stage2).getByRole("button", { name: "Record 5x5 drill test" }));
    await userEvent.click(within(stage2).getByRole("button", { name: "Save 5x5 drill test" }));
    expect(await within(stage2).findByText("Pick pass or fail")).toBeTruthy();
  });

  it("an API error is an error, not an empty list", async () => {
    api(() => json({ detail: "boom" }, 500));
    renderWithQuery(<DrillProgressView canRecord />);
    expect(await screen.findByText("Couldn't load drill progress")).toBeTruthy();
  });

  it("an error body where the progress was expected doesn't crash", async () => {
    api(() => json({ detail: "odd" }));
    renderWithQuery(<DrillProgressView canRecord />);
    expect(await screen.findByText("No drill syllabus yet")).toBeTruthy();
  });

  it("says when there's a syllabus but no cadets", async () => {
    api(() => json({ stages: STAGES, cadets: [] }));
    renderWithQuery(<DrillProgressView canRecord />);
    expect(await screen.findByText("No cadets on the roster")).toBeTruthy();
  });
});
