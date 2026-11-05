// @vitest-environment jsdom
// The session planner: what's sent to the API from the ticks (flights, cadets,
// tasks, times, stands), the plan it shows back, and the empty, error and
// stale states.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isUnlikely, SessionPlanner } from "@/components/session-planner/planner";
import type { Attendance } from "@/lib/classification-day";
import type { BankTask, PlannerCadet, SessionPlan } from "@/lib/session-planner";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const ATT: Attendance = {
  nights: 10,
  present: 9,
  weekday_nights: 10,
  weekday_present: 9,
  last_present: "2026-11-02",
  likelihood: 0.9,
  flags: [],
};

const cadet = (
  cin: number,
  last: string,
  flight: string,
  over: Partial<PlannerCadet> = {}
): PlannerCadet => ({
  cin,
  first_name: "Sam",
  last_name: last,
  rank: "Cadet",
  flight,
  attendance: ATT,
  leadership: { level: null, led: 0, passes: 0 },
  ...over,
});

const ROSTER: PlannerCadet[] = [
  cadet(1, "Able", "A", { leadership: { level: "blue", led: 3, passes: 2 } }),
  cadet(2, "Baker", "A", { attendance: { ...ATT, likelihood: 0.2 } }),
  cadet(3, "Ørsted", "B", {
    attendance: { ...ATT, flags: [{ code: "absence_booked", message: "Absence booked for this date" }] },
  }),
  cadet(4, "Dunn", "C"),
];

const task = (id: number, name: string, over: Partial<BankTask> = {}): BankTask => ({
  id,
  kind: "leadership",
  number: String(id),
  name,
  brief: "",
  duration_minutes: 15,
  min_group: null,
  max_group: null,
  active: true,
  kit: [],
  kit_short: [],
  led_count: 0,
  passed_count: 0,
  cadets_led: 0,
  ...over,
});

const TASKS: BankTask[] = [
  task(1, "Bridge"),
  task(2, "Swamp"),
  task(3, "Casualty", { kind: "first_aid" }),
  task(4, "Wall", { kit_short: ["Cargo net"] }),
];

const PLAN: SessionPlan = {
  kind: "leadership",
  leadership: true,
  groups: [
    { number: 1, cadets: [{ cin: 1, first_name: "Sam", last_name: "Able", rank: "Cadet", flight: "A" }] },
    { number: 2, cadets: [{ cin: 4, first_name: "Sam", last_name: "Dunn", rank: "Cadet", flight: "C" }] },
  ],
  rounds: [
    {
      number: 1,
      start: "19:30",
      end: "19:45",
      runs: [
        {
          group: 1,
          task_id: 1,
          task_name: "Bridge",
          task_number: "1",
          leader: { cin: 1, first_name: "Sam", last_name: "Able", rank: "Cadet", flight: "A" },
        },
        { group: 2, task_id: 2, task_name: "Swamp", task_number: "2", leader: null },
      ],
      idle_groups: [],
    },
  ],
  leads: [{ cin: 1, count: 1 }],
  not_leading: [{ cin: 4, first_name: "Sam", last_name: "Dunn", rank: "Cadet", flight: "C" }],
  warnings: ["Round 1, group 2: everyone in the group has led Swamp, so nobody leads it."],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api({
  tasks = TASKS as unknown,
  roster = ROSTER as unknown,
  plan = () => json(PLAN),
}: { tasks?: unknown; roster?: unknown; plan?: () => Response } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") return plan();
    if (url.includes("/session-planner/tasks")) return json(tasks);
    if (url.includes("/session-planner/cadets")) return json(roster);
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof api>) => {
  const call = fetchMock.mock.calls.findLast(([, init]) => init?.method === "POST");
  return call ? JSON.parse(String(call[1]!.body)) : undefined;
};

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Session planner", () => {
  it("sends every ticked cadet and usable task with the times and stands", async () => {
    const fetchMock = api();
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Plan session" }));

    await waitFor(() => expect(sent(fetchMock)).toBeDefined());
    expect(sent(fetchMock)).toMatchObject({
      kind: "leadership",
      start: "19:30",
      end: "21:00",
      changeover_minutes: 5,
      stands: 3,
      // Only leadership tasks, and not the one the kit can't cover.
      task_ids: [1, 2],
      cins: [1, 2, 3, 4],
    });
    expect(screen.getByRole("checkbox", { name: /4\. Wall/ })).toBeDisabled();
  });

  it("narrows to the flights picked, and the ticks pick who's in", async () => {
    const fetchMock = api();
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "C Flight" }));
    expect(screen.queryByText("Dunn, Sam")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Able, Sam/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /2\. Swamp/ }));
    await userEvent.clear(screen.getByLabelText("Stands at once"));
    await userEvent.type(screen.getByLabelText("Stands at once"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Plan session" }));

    await waitFor(() => expect(sent(fetchMock)).toMatchObject({ cins: [2, 3], task_ids: [1], stands: 2 }));
  });

  it("'Untick unlikely' takes off booked absences and low attendance", async () => {
    const fetchMock = api();
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Untick unlikely" }));
    expect(screen.getByText("2 ticked")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Plan session" }));
    await waitFor(() => expect(sent(fetchMock)).toMatchObject({ cins: [1, 4] }));
  });

  it("shows each cadet's leadership so far", async () => {
    api();
    renderWithQuery(<SessionPlanner />);
    expect(await screen.findByText("Blue Leadership held. Led 3, passed 2")).toBeInTheDocument();
    expect(screen.getAllByText("Not led a task yet")).toHaveLength(3);
  });

  it("shows the rounds, leaders, groups and warnings it gets back", async () => {
    api();
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Plan session" }));

    const round = await screen.findByRole("table", { name: "Round 1" });
    const rows = within(round).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1. Bridge");
    expect(rows[1]).toHaveTextContent("Cadet Sam Able");
    expect(rows[2]).toHaveTextContent("No leader");
    expect(screen.getByText(PLAN.warnings[0])).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not leading tonight" })).toBeInTheDocument();
  });

  it("says when the inputs have changed since the plan", async () => {
    api();
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Plan session" }));
    await screen.findByRole("table", { name: "Round 1" });
    expect(screen.queryByText("Changed since this plan.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Baker, Sam/ }));
    expect(screen.getByText("Changed since this plan.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan again" })).toBeEnabled();
  });

  it("copies the plan as text", async () => {
    api();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Plan session" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy plan" }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Group 1: 1. Bridge, led by Cadet Sam Able")
    );
    expect(toast.success).toHaveBeenCalledWith("Plan copied");
  });

  it("won't plan with nothing ticked, and says why", async () => {
    const fetchMock = api();
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Untick all" }));
    expect(screen.getByText("Tick at least one cadet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan session" })).toBeDisabled();
    expect(sent(fetchMock)).toBeUndefined();
  });

  it("a stands box left empty or out of range stops the plan and says what to type", async () => {
    api();
    renderWithQuery(<SessionPlanner />);
    const stands = await screen.findByLabelText("Stands at once");
    await userEvent.clear(stands);
    expect(screen.getByText("Stands at once: a number from 1 to 20.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan session" })).toBeDisabled();
    await userEvent.type(stands, "0");
    expect(screen.getByRole("button", { name: "Plan session" })).toBeDisabled();
    await userEvent.clear(stands);
    await userEvent.type(stands, "4");
    expect(screen.getByRole("button", { name: "Plan session" })).toBeEnabled();
  });

  it("shows the API's reason when it refuses the plan", async () => {
    api({ plan: () => json({ detail: "Some of those cadets aren't on the roster" }, 404) });
    renderWithQuery(<SessionPlanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Plan session" }));
    expect(await screen.findByText("Some of those cadets aren't on the roster")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Round 1" })).not.toBeInTheDocument();
  });

  it("an empty bank points to it instead of a planner that can't work", async () => {
    api({ tasks: [] });
    renderWithQuery(<SessionPlanner />);
    expect(await screen.findByText("No tasks in the bank yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the task bank" })).toHaveAttribute(
      "href",
      "/session-planner/bank"
    );
  });

  it("a roster that fails to load shows the error, not an empty list", async () => {
    api();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/cadets") ? json({ detail: "Database is down" }, 500) : json(TASKS)
    );
    renderWithQuery(<SessionPlanner />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
  });
});

describe("isUnlikely", () => {
  it("is a booked absence or under half the nights, and not someone with no history", () => {
    expect(isUnlikely(ROSTER[0])).toBe(false);
    expect(isUnlikely(ROSTER[1])).toBe(true);
    expect(isUnlikely(ROSTER[2])).toBe(true);
    expect(isUnlikely(cadet(9, "New", "A", { attendance: { ...ATT, likelihood: null } }))).toBe(false);
  });
});
