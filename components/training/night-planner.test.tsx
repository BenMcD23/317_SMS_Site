// @vitest-environment jsdom
// The Nights tab: the groups the API sends back, starting from the programme,
// adding, changing and deleting sessions, the lesson QR, and the empty and
// error states.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NightPlanner } from "@/components/training/night-planner";
import type { NightCadet, NightSession, TrainingNight } from "@/lib/training";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const cadet = (cin: number, last: string, over: Partial<NightCadet> = {}): NightCadet => ({
  cin,
  first_name: "Sam",
  last_name: last,
  rank: "Cadet",
  flight: "A",
  checked_in: true,
  unlikely: false,
  status: null,
  scanned: false,
  ...over,
});

const MAP_READING: NightSession = {
  id: 7,
  title: "Map Reading 2",
  period: 1,
  subject_key: "acp_32_2",
  part: 2,
  flights: ["A", "B"],
  pool: "auto",
  include: "need",
  grouping: "need",
  group_count: null,
  max_group: 8,
  instructor: "Sgt Davies",
  notes: "Room 2",
  lesson: { key: "acp_32_2", name: "Basic Navigation", parts: 3, code: "ABCD2345" },
  planning_with: "checked_in",
  counts: { cadets: 3, needs: 2, behind: 1, had: 0, scanned: 1 },
  groups: [
    {
      label: "Needs this lesson",
      cadets: [cadet(1, "Able", { status: "needs", scanned: true }), cadet(2, "Ørsted", { status: "needs" })],
    },
    { label: "Missing an earlier lesson", cadets: [cadet(3, "Baker", { status: "behind" })] },
  ],
  warnings: [],
};

const DRILL: NightSession = {
  ...MAP_READING,
  id: 8,
  title: "Drill",
  subject_key: null,
  part: null,
  include: "all",
  grouping: "flight",
  max_group: null,
  instructor: null,
  notes: null,
  lesson: null,
  planning_with: "expected",
  counts: { cadets: 1, needs: 0, behind: 0, had: 0, scanned: 0 },
  groups: [{ label: "A Flight", cadets: [cadet(4, "Dunn", { checked_in: false, unlikely: true })] }],
  warnings: ["Nobody it's for has checked in yet."],
};

const PROGRAMME = [
  {
    period: 1,
    flight: "A",
    activity: "Map Reading 2",
    category: "fieldcraft",
    instructor: "Sgt Davies",
    split: false,
    link: {
      state: "linked" as const,
      subject_key: "acp_32_2",
      subject_name: "Basic Navigation",
      new_subject: null,
      part: 2,
      source: "staff" as const,
    },
  },
];

const night = (over: Partial<TrainingNight> = {}): TrainingNight => ({
  date: "2026-11-02",
  checked_in: 3,
  flights: ["A", "B", "C"],
  programme: PROGRAMME,
  sessions: [MAP_READING, DRILL],
  ...over,
});

const SUBJECTS = [{ key: "acp_32_2", name: "Basic Navigation", category: "Leading", parts: 3 }];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api({
  nights = [night()] as (TrainingNight | Response)[],
  write = () => json({ id: 9 }, 201),
}: { nights?: (TrainingNight | Response)[]; write?: () => Response } = {}) {
  let served = 0;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== "GET") return write();
    if (url.includes("/cadets/theory/lessons")) return json(SUBJECTS);
    if (url.includes("/training/nights/")) {
      // Each refetch gets the next answer; the last one repeats.
      const next = nights[Math.min(served++, nights.length - 1)];
      return next instanceof Response ? next.clone() : json(next);
    }
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => ({
      url: String(url),
      method: init!.method,
      body: init!.body ? JSON.parse(String(init!.body)) : undefined,
    }));

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Training nights", () => {
  it("shows each session's inputs, its groups and where each cadet is with the lesson", async () => {
    api();
    renderWithQuery(<NightPlanner />);
    const nav = await screen.findByRole("article", { name: "Map Reading 2" });
    expect(within(nav).getByText("1st half (19:25–20:05) · A, B Flight · Sgt Davies")).toBeInTheDocument();
    expect(within(nav).getByText("Basic Navigation, lesson 2")).toBeInTheDocument();
    expect(within(nav).getByText("Only who needs it · By need · up to 8 a group")).toBeInTheDocument();
    expect(
      within(nav).getByText("3 cadets · 2 need it · 1 missing an earlier lesson · 1 scanned in")
    ).toBeInTheDocument();
    expect(within(nav).getByText("Room 2")).toBeInTheDocument();

    const needs = within(nav).getByRole("region", { name: "Map Reading 2: Needs this lesson" });
    expect(within(needs).getByText("Cadet Sam Ørsted")).toBeInTheDocument();
    // Grouped by need, so the group already says it: no badge per cadet.
    expect(within(needs).queryByText("Needs it")).not.toBeInTheDocument();
    expect(within(needs).getAllByText("Scanned in")).toHaveLength(1);
  });

  it("flags a session planned before the door opens, the cadets unlikely to come, and the API's warnings", async () => {
    api();
    renderWithQuery(<NightPlanner />);
    const drill = await screen.findByRole("article", { name: "Drill" });
    expect(within(drill).getByText(/nobody's checked in yet, so this is who's expected/)).toBeInTheDocument();
    expect(within(drill).getByText("Rarely in")).toBeInTheDocument();
    expect(within(drill).getByText("Nobody it's for has checked in yet.")).toBeInTheDocument();
    // No lesson, so no QR code to show.
    expect(within(drill).queryByRole("button", { name: "QR code" })).not.toBeInTheDocument();
  });

  it("totals the night across sessions", async () => {
    api();
    renderWithQuery(<NightPlanner />);
    await screen.findByRole("article", { name: "Drill" });
    expect(screen.getByText("Still to have tonight's lessons").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Scanned in", { selector: "p" }).nextSibling).toHaveTextContent("1");
  });

  it("asks for the night picked", async () => {
    const fetchMock = api();
    renderWithQuery(<NightPlanner />);
    await screen.findByRole("article", { name: "Drill" });
    fireEvent.change(screen.getByLabelText("Night"), { target: { value: "2026-12-07" } });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/training/nights/2026-12-07"))).toBe(
        true
      )
    );
  });

  it("starts an empty night from its programme", async () => {
    const fetchMock = api({
      nights: [night({ sessions: [] }), night()],
      write: () => json({ sessions: 2 }, 201),
    });
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Start from the programme" }));
    expect(await screen.findByRole("article", { name: "Map Reading 2" })).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([
      expect.objectContaining({
        method: "POST",
        url: expect.stringMatching(/\/training\/nights\/[\d-]+\/from-programme$/),
      }),
    ]);
    expect(toast.success).toHaveBeenCalledWith("2 sessions added from the programme");
  });

  it("offers only adding by hand when there's no programme for the night", async () => {
    api({ nights: [night({ sessions: [], programme: [] })] });
    renderWithQuery(<NightPlanner />);
    expect(await screen.findByText(/no programme imported for this night/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start from the programme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "On the programme" })).not.toBeInTheDocument();
  });

  it("says why starting from the programme failed", async () => {
    api({
      nights: [night({ sessions: [] })],
      write: () => json({ detail: "This night already has sessions. Add to them instead." }, 409),
    });
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Start from the programme" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This night already has sessions. Add to them instead.")
    );
  });

  it("adds a session with the inputs picked", async () => {
    const fetchMock = api();
    renderWithQuery(<NightPlanner />);
    await screen.findByRole("article", { name: "Drill" });
    await userEvent.click(screen.getAllByRole("button", { name: "Add session" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Leadership tasks");
    await userEvent.click(within(dialog).getByRole("button", { name: "C Flight" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "Mixed groups" }));
    await userEvent.type(within(dialog).getByLabelText("How many groups"), "3");
    await userEvent.type(within(dialog).getByLabelText("Who's running it"), "Fg Off Barker");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add session" }));

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      method: "POST",
      url: expect.stringMatching(/\/training\/nights\/[\d-]+\/sessions$/),
      body: {
        title: "Leadership tasks",
        flights: ["C"],
        grouping: "mixed",
        group_count: 3,
        include: "all",
        subject_key: null,
        instructor: "Fg Off Barker",
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers the night's two halves, with their times, or the whole night", async () => {
    api();
    renderWithQuery(<NightPlanner />);
    await screen.findByRole("article", { name: "Drill" });
    await userEvent.click(screen.getAllByRole("button", { name: "Add session" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "When" }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["1st half (19:25–20:05)", "2nd half (20:20–21:00)", "Whole night"]);
  });

  it("won't group by need or take only who needs it until a lesson is picked", async () => {
    api();
    renderWithQuery(<NightPlanner />);
    await screen.findByRole("article", { name: "Drill" });
    await userEvent.click(screen.getAllByRole("button", { name: "Add session" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "By need" })).toBeDisabled();
    expect(within(dialog).getByRole("switch", { name: /Only cadets who still need it/ })).toBeDisabled();
  });

  it("doesn't send a session without a name, and says what to do", async () => {
    const fetchMock = api();
    renderWithQuery(<NightPlanner />);
    await screen.findByRole("article", { name: "Drill" });
    await userEvent.click(screen.getAllByRole("button", { name: "Add session" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add session" }));
    expect(await within(dialog).findByText("Give it a name")).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
  });

  it("keeps the dialog open with the API's reason when a save is refused", async () => {
    api({
      write: () => json({ detail: [{ msg: "Value error, Grouping by need takes a lesson: pick one" }] }, 422),
    });
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Change Drill" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Drill");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText(/Grouping by need takes a lesson/)).toBeInTheDocument();
  });

  it("saves a change to an existing session by its id", async () => {
    const fetchMock = api();
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Change Map Reading 2" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Largest group"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      method: "PUT",
      url: expect.stringMatching(/\/training\/sessions\/7$/),
      body: { subject_key: "acp_32_2", part: 2, include: "need", grouping: "need", max_group: null },
    });
  });

  it("deletes a session after confirming", async () => {
    const fetchMock = api({ write: () => new Response(null, { status: 204 }) });
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Change Drill" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete session" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      method: "DELETE",
      url: expect.stringMatching(/\/sessions\/8$/),
    });
  });

  it("shows the lesson's QR code, or why it can't", async () => {
    api();
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "QR code" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Basic Navigation, lesson 2")).toBeInTheDocument();
    // The test environment has no portal address set.
    expect(within(dialog).getByText("The cadet portal's address isn't set")).toBeInTheDocument();
  });

  it("shows the API's error instead of a blank page when the night can't load", async () => {
    api({ nights: [json({ detail: "Database is down" }, 500)] });
    renderWithQuery(<NightPlanner />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add session" })).toBeDisabled();
  });

  it("copies the groups as text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    api();
    renderWithQuery(<NightPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy groups" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]).toEqual([
      expect.stringContaining("Needs this lesson: Cadet Sam Able, Cadet Sam Ørsted"),
    ]);
  });
});
