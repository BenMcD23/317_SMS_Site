// @vitest-environment jsdom
// The session planner's bank page: the task list with its kit and lead counts,
// adding and deleting kit, adding a task with kit, linking an old leadership
// sheet, and the empty, error and access cases.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TaskBankPage from "@/app/training/tasks/page";
import { canAccess } from "@/lib/access";
import type { BankTask, KitItem, UnlinkedSheet } from "@/lib/session-planner";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const KIT: KitItem[] = [
  {
    id: 1,
    name: "Oil drum",
    quantity: 2,
    notes: "",
    used_by: [{ task_id: 10, name: "Toxic Barrel", quantity: 1 }],
  },
  { id: 2, name: "First aid manikin", quantity: 0, notes: "Away for repair", used_by: [] },
];

const task = (over: Partial<BankTask>): BankTask => ({
  id: 10,
  kind: "leadership",
  number: "3",
  name: "Toxic Barrel",
  brief: "",
  duration_minutes: 20,
  min_group: 4,
  max_group: 6,
  active: true,
  kit: [{ kit_id: 1, name: "Oil drum", quantity: 1, in_stock: 2 }],
  kit_short: [],
  led_count: 3,
  passed_count: 2,
  cadets_led: 2,
  ...over,
});

const TASKS: BankTask[] = [
  task({}),
  task({
    id: 11,
    kind: "first_aid",
    number: null,
    name: "Casualty Scenario",
    kit: [{ kit_id: 2, name: "First aid manikin", quantity: 1, in_stock: 0 }],
    kit_short: ["First aid manikin"],
    led_count: 0,
    cadets_led: 0,
  }),
  task({ id: 12, number: "7", name: "Pipeline", active: false, kit: [], led_count: 0, cadets_led: 0 }),
];

const SHEETS: UnlinkedSheet[] = [
  {
    assessment_id: 50,
    cin: 4,
    first_name: "Zoë",
    last_name: "Ó Briain",
    rank: "Cpl",
    exercise_no: "",
    exercise_name: "Swamp crossing",
    date: "2026-08-01",
    passed: true,
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Answer = (url: string, init?: RequestInit) => Response | undefined;

/** Answers the three reads; `write` gets first say on anything else. */
function api({
  tasks = TASKS,
  kit = KIT,
  sheets = SHEETS,
  write,
}: { tasks?: unknown; kit?: unknown; sheets?: unknown; write?: Answer } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") return write?.(url, init) ?? json({}, 200);
    if (url.includes("/session-planner/tasks")) return json(tasks);
    if (url.includes("/session-planner/kit")) return json(kit);
    if (url.includes("/session-planner/unlinked-assessments")) return json(sheets);
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
  // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Tasks & kit", () => {
  it("lists the tasks in use with their kit, and flags one the kit can't cover", async () => {
    api();
    renderWithQuery(<TaskBankPage />);

    const table = await screen.findByRole("table", { name: "Task bank" });
    expect(within(table).getByRole("button", { name: /Toxic Barrel/ })).toBeInTheDocument();
    expect(within(table).getByText("2 cadets")).toBeInTheDocument();
    expect(within(table).getByText("Not enough First aid manikin")).toBeInTheDocument();
    // Retired tasks are hidden until asked for.
    expect(within(table).queryByText("Pipeline")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kit" })).toBeInTheDocument();
    // Old sheets to link are flagged at the top and listed at the bottom.
    expect(screen.getByText(/1 old leadership sheet isn't on a task/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Link it" })).toHaveAttribute("href", "#unlinked");

    await userEvent.click(screen.getByRole("switch", { name: "Show 1 retired" }));
    expect(within(table).getByText(/Pipeline/)).toBeInTheDocument();
  });

  it("narrows the bank to one kind of session", async () => {
    api();
    renderWithQuery(<TaskBankPage />);
    await screen.findByRole("table", { name: "Task bank" });

    await userEvent.click(screen.getByRole("radio", { name: "First aid" }));
    const table = screen.getByRole("table", { name: "Task bank" });
    expect(within(table).queryByText("Toxic Barrel")).not.toBeInTheDocument();
    expect(within(table).getByText("Casualty Scenario")).toBeInTheDocument();
  });

  it("an empty bank says how to fill it", async () => {
    api({ tasks: [], kit: [], sheets: [] });
    renderWithQuery(<TaskBankPage />);
    expect(await screen.findByText("No tasks yet")).toBeInTheDocument();

    expect(screen.getByText("No kit on the list")).toBeInTheDocument();
    // Nothing to link takes no room at all.
    expect(screen.queryByRole("heading", { name: "Leadership sheets to link" })).not.toBeInTheDocument();
    expect(screen.queryByText(/old leadership sheet/)).not.toBeInTheDocument();
  });

  it("an API error shows its message instead of an empty bank", async () => {
    api({ tasks: { detail: "Database is down" } });
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/tasks") ? json({ detail: "Database is down" }, 500) : json([])
    );
    renderWithQuery(<TaskBankPage />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("adds kit with how many there are", async () => {
    const fetchMock = api({ write: () => json({ ...KIT[0], id: 3, name: "Cargo net", quantity: 1 }, 201) });
    renderWithQuery(<TaskBankPage />);
    await screen.findByRole("heading", { name: "Kit" });
    expect(screen.getByText("None working")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add kit" }));
    await userEvent.type(screen.getByLabelText("Name"), "Cargo net");
    const howMany = screen.getByLabelText("How many");
    await userEvent.clear(howMany);
    await userEvent.type(howMany, "1");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add kit" }));

    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([
        {
          url: expect.stringContaining("/session-planner/kit"),
          method: "POST",
          body: { name: "Cargo net", quantity: 1, notes: "" },
        },
      ])
    );
    expect(toast.success).toHaveBeenCalledWith("Cargo net added");
  });

  it("refuses kit with no name before sending anything", async () => {
    const fetchMock = api();
    renderWithQuery(<TaskBankPage />);
    await screen.findByRole("heading", { name: "Kit" });
    await userEvent.click(screen.getByRole("button", { name: "Add kit" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add kit" }));

    expect(await screen.findByText("Give the kit a name")).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
  });

  it("shows the API's reason when kit a task needs can't be deleted", async () => {
    api({
      write: () => json({ detail: "Still needed by Toxic Barrel. Take it off those tasks first." }, 409),
    });
    renderWithQuery(<TaskBankPage />);
    await screen.findByRole("heading", { name: "Kit" });
    await userEvent.click(screen.getByRole("button", { name: "Oil drum" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete kit" }));
    const sure = screen.getByRole("dialog", { name: "Are you sure?" });
    expect(within(sure).getByText("Delete Oil drum from the kit list?")).toBeInTheDocument();
    await userEvent.click(within(sure).getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Still needed by Toxic Barrel. Take it off those tasks first.")
    );
  });

  it("adds a task with the kit it needs", async () => {
    const fetchMock = api({ write: () => json(task({ id: 13, name: "Bridge" }), 201) });
    renderWithQuery(<TaskBankPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add task" }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Number"), "1");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Bridge");
    await userEvent.type(within(dialog).getByLabelText("Largest group"), "6");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Add kit to this task" }));
    await userEvent.click(await screen.findByRole("option", { name: "Oil drum" }));
    const drums = within(dialog).getByLabelText("How many Oil drum");
    await userEvent.clear(drums);
    await userEvent.type(drums, "2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toEqual({
      url: expect.stringContaining("/session-planner/tasks"),
      method: "POST",
      body: {
        kind: "leadership",
        number: "1",
        name: "Bridge",
        brief: "",
        duration_minutes: 15,
        min_group: null,
        max_group: 6,
        active: true,
        kit: [{ kit_id: 1, quantity: 2 }],
      },
    });
  });

  it("a task cadets have led can't be deleted or change kind, only retired", async () => {
    api();
    renderWithQuery(<TaskBankPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Toxic Barrel/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Delete task" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Kind of session" })).toBeDisabled();
    expect(within(dialog).getByRole("switch", { name: "In use" })).toBeChecked();
  });

  it("links an old sheet to the task it was for", async () => {
    const fetchMock = api({ write: () => json({ assessment_id: 50, task_id: 10 }) });
    renderWithQuery(<TaskBankPage />);
    await screen.findByRole("heading", { name: "Leadership sheets to link" });
    expect(screen.getByText("Cpl Zoë Ó Briain")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();

    await userEvent.click(screen.getByRole("combobox", { name: "Task for Cpl Zoë Ó Briain's sheet" }));
    // Only leadership tasks, retired ones included: an old sheet may be for one.
    expect(screen.queryByRole("option", { name: "Casualty Scenario" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "7. Pipeline (retired)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "3. Toxic Barrel" }));
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([
        {
          url: expect.stringContaining("/session-planner/assessments/50/link"),
          method: "POST",
          body: { task_id: 10 },
        },
      ])
    );
  });
});

describe("Tasks & kit access", () => {
  it.each([
    ["staff", true],
    ["snco", false],
    ["nco", false],
    [undefined, false],
  ])("%s reaching it is %s", (role, allowed) => {
    expect(canAccess(role, "/training/tasks")).toBe(allowed);
  });
});
