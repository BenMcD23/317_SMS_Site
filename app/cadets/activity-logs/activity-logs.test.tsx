// @vitest-environment jsdom
// DofE activity logs, staff side: the week grid (who has and hasn't
// logged), switching a cadet on, and one cadet's log with its PDF.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ActivityLogsPage from "@/app/cadets/activity-logs/page";
import CadetActivityLogPage from "@/app/cadets/activity-logs/[cin]/page";
import type {
  CadetActivityLog,
  CellState,
  GridCadet,
  GridCell,
  GridSection,
  SectionKey,
  SectionLog,
  WeekGrid,
} from "@/lib/activity-logs";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useParams: () => ({ cin: "2100001" }) }));
const download = vi.hoisted(() => ({ saveResponseAsFile: vi.fn(() => Promise.resolve("x.pdf")) }));
vi.mock("@/lib/download", () => download);

const WEEKS = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"];
type Cells = Record<SectionKey, GridCell>;
const cells = (s: CellState, v: CellState, p: CellState, minutes = 60): Cells => ({
  skills: { state: s, minutes: s === "done" ? minutes : 0 },
  volunteering: { state: v, minutes: v === "done" ? minutes : v === "short" ? 20 : 0 },
  physical: { state: p, minutes: p === "done" ? minutes : 0 },
});
const gridSection = (key: SectionKey, over: Partial<GridSection> = {}): GridSection => ({
  section: key,
  label: key[0].toUpperCase() + key.slice(1),
  set_up: true,
  complete: false,
  weeks_done: 5,
  weeks_needed: 12,
  last_added: "2026-10-20T19:00:00",
  ...over,
});

const cadet = (over: Partial<GridCadet>, weekCells: Cells[]): GridCadet => ({
  cin: 2100001,
  name: "Cara Cadet",
  rank: "Cpl",
  flight: "A",
  level: "Bronze",
  behind: false,
  sections: [gridSection("skills"), gridSection("volunteering"), gridSection("physical")],
  weeks: WEEKS.map((week_start, i) => ({ week_start, cells: weekCells[i] })),
  ...over,
});

const GRID: WeekGrid = {
  weeks: WEEKS,
  current_week: "2026-10-19",
  cadets: [
    cadet(
      {},
      WEEKS.map(() => cells("done", "done", "done"))
    ),
    cadet(
      {
        cin: 2100002,
        name: "Zoë Ó Briain",
        rank: null,
        flight: "B",
        behind: true,
        sections: [
          gridSection("skills"),
          gridSection("volunteering", { complete: true, weeks_done: 12 }),
          gridSection("physical", { set_up: false, weeks_needed: null, weeks_done: 0, last_added: null }),
        ],
      },
      [
        cells("done", "done", "off"),
        cells("missed", "done", "off"),
        cells("missed", "off", "off"),
        cells("due", "off", "off"),
      ]
    ),
  ],
};

type Routes = Record<string, [unknown, number?]>;
// Keys are "METHOD /path"; the path must match the end of the URL (query aside).
function stubApi(routes: Routes) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const hit = Object.entries(routes).find(([key]) => {
      const [m, path] = key.split(" ");
      return m === method && String(url).split("?")[0].endsWith(path);
    });
    const [body, status] = hit?.[1] ?? [{ detail: "not stubbed" }, 404];
    if (body === "PDF")
      return Promise.resolve(new Response("%PDF", { headers: { "Content-Type": "application/pdf" } }));
    return Promise.resolve(new Response(JSON.stringify(body), { status: status ?? 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const calls = (fetch: ReturnType<typeof stubApi>, method: string, path: string) =>
  fetch.mock.calls.filter(([url, init]) => (init?.method ?? "GET") === method && String(url).includes(path));

async function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  Element.prototype.scrollIntoView = vi.fn();
  toast.success.mockReset();
  toast.error.mockReset();
  router.push.mockReset();
  download.saveResponseAsFile.mockClear();
});

describe("week grid", () => {
  it("shows each cadet against the weeks, with which sections got their hour", async () => {
    stubApi({ "GET /activity-logs/grid": [GRID] });
    await show(<ActivityLogsPage />);
    const table = within(await screen.findByRole("table", { name: "DofE activity, week by week" }));
    expect(table.getByRole("link", { name: "Cpl Cara Cadet" })).toHaveAttribute(
      "href",
      "/cadets/activity-logs/2100001"
    );
    expect(table.getByRole("columnheader", { name: /This week/ })).toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: /28 Sept/ })).toBeInTheDocument();

    const zoe = within(table.getByRole("link", { name: "Zoë Ó Briain" }).closest("tr")!);
    // Each week reads out in words, so the squares' colours aren't the only signal.
    expect(
      zoe.getByRole("img", {
        name: "Week of 12 Oct: Skills missed, Volunteering nothing due, Physical nothing due",
      })
    ).toBeInTheDocument();
    expect(zoe.getByRole("img", { name: /Week of 19 Oct: Skills not logged yet/ })).toBeInTheDocument();
    // Under the name on a phone, in its own column wider up.
    expect(zoe.getAllByText("Chase")).toHaveLength(2);

    const stat = (label: string) => screen.getByText(label, { selector: "p" }).parentElement!;
    expect(stat("Switched on")).toHaveTextContent("2");
    expect(stat("To chase this week")).toHaveTextContent("1");
    expect(stat("Sections finished")).toHaveTextContent("1");
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("hour done");
  });

  it("narrows to the cadets to chase this week", async () => {
    stubApi({ "GET /activity-logs/grid": [GRID] });
    await show(<ActivityLogsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "To chase" }));
    const table = within(screen.getByRole("table", { name: "DofE activity, week by week" }));
    expect(table.getByRole("link", { name: "Zoë Ó Briain" })).toBeInTheDocument();
    expect(table.queryByRole("link", { name: "Cpl Cara Cadet" })).toBeNull();
  });

  it("says there's nobody to chase when everyone's up to date", async () => {
    stubApi({ "GET /activity-logs/grid": [{ ...GRID, cadets: [GRID.cadets[0]] }] });
    await show(<ActivityLogsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "To chase" }));
    expect(screen.getByText("Nobody to chase. Everyone's up to date this week.")).toBeInTheDocument();
  });

  it("steps back to earlier weeks, and can't go past this week", async () => {
    const fetch = stubApi({ "GET /activity-logs/grid": [GRID] });
    await show(<ActivityLogsPage />);
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: "Later weeks" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Earlier weeks" }));
    await waitFor(() => expect(calls(fetch, "GET", "end=2026-09-21")).toHaveLength(1));
  });

  it("shows an empty state when nobody is switched on", async () => {
    stubApi({ "GET /activity-logs/grid": [{ ...GRID, cadets: [] }] });
    await show(<ActivityLogsPage />);
    expect(await screen.findByText("No DofE activity logs switched on")).toBeInTheDocument();
  });

  it("shows the API's error, and doesn't crash on an error body", async () => {
    stubApi({ "GET /activity-logs/grid": [{ detail: "Forbidden" }, 403] });
    await show(<ActivityLogsPage />);
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("won't switch on without a cadet", async () => {
    const fetch = stubApi({ "GET /activity-logs/grid": [GRID] });
    await show(<ActivityLogsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Switch on a cadet" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("radio", { name: "Bronze" })).toBeChecked();
    await user.click(dialog.getByRole("button", { name: "Switch on" }));
    expect(await dialog.findByText("Choose a cadet")).toBeInTheDocument();
    expect(calls(fetch, "PUT", "/enrolment")).toHaveLength(0);
  });
});

const sectionLog = (over: Partial<SectionLog> = {}): SectionLog => ({
  id: 1,
  activity: "Charity shop",
  goal: "Run the till",
  assessor_name: "Sarah Hughes",
  assessor_role: "Shop manager",
  duration_months: 3,
  start_date: "2026-07-27",
  end_date: "2026-10-27",
  completed_at: null,
  entries: [{ id: 7, date: "2026-10-14", description: "Sorted donations", minutes: 60, created_at: "" }],
  weeks_done: 10,
  weeks_needed: 12,
  complete: false,
  this_week_minutes: 0,
  started: true,
  weeks: [],
  missed: ["2026-08-17"],
  ...over,
});

const LOG: CadetActivityLog = {
  enabled: true,
  cin: 2100001,
  name: "Cpl Cara Cadet",
  level: "Bronze",
  sections: [
    { section: "skills", label: "Skills", log: null },
    { section: "volunteering", label: "Volunteering", log: sectionLog() },
    { section: "physical", label: "Physical", log: sectionLog({ complete: true, entries: [] }) },
  ],
};
const BASE = "/activity-logs/cadets/2100001";

describe("one cadet's log", () => {
  it("shows each section's plan, progress and entries", async () => {
    stubApi({ [`GET ${BASE}`]: [LOG] });
    await show(<CadetActivityLogPage />);
    expect(await screen.findByRole("heading", { name: "Cpl Cara Cadet" })).toBeInTheDocument();
    const vol = within(screen.getByRole("region", { name: /Volunteering/ }));
    expect(vol.getByText("10 of 12 weeks done")).toBeInTheDocument();
    expect(vol.getByText("Sarah Hughes, Shop manager")).toBeInTheDocument();
    expect(vol.getByText("Sorted donations")).toBeInTheDocument();
    expect(vol.getByText("Nothing logged")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /Physical/ })).getByText("Finished")
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /Skills/ })).getByText("Not set up yet")
    ).toBeInTheDocument();
  });

  it("sets a section up for the cadet", async () => {
    const fetch = stubApi({ [`GET ${BASE}`]: [LOG], [`PUT ${BASE}/skills`]: [LOG] });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Set up Skills" }));
    await user.click(dialog.getByRole("button", { name: "Save section" }));
    expect(await dialog.findByText("Enter the activity")).toBeInTheDocument();
    expect(dialog.getByText("Choose how long")).toBeInTheDocument();

    await user.type(dialog.getByLabelText("Activity"), "Guitar");
    await user.type(dialog.getByLabelText("Goal"), "Three songs");
    await user.click(dialog.getByRole("radio", { name: "6 months" }));
    await user.click(dialog.getByRole("button", { name: "Save section" }));
    await waitFor(() => expect(calls(fetch, "PUT", `${BASE}/skills`)).toHaveLength(1));
    expect(JSON.parse(calls(fetch, "PUT", `${BASE}/skills`)[0][1]!.body as string)).toMatchObject({
      activity: "Guitar",
      goal: "Three songs",
      duration_months: 6,
    });
  });

  it("adds an entry for a cadet who told staff instead of logging it", async () => {
    const fetch = stubApi({ [`GET ${BASE}`]: [LOG], [`POST ${BASE}/volunteering/entries`]: [LOG, 201] });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    const vol = within(await screen.findByRole("region", { name: /Volunteering/ }));
    await user.click(vol.getByRole("button", { name: "Add entry" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add entry" }));
    await user.type(dialog.getByLabelText("What they did"), "Till training");
    await user.click(dialog.getByRole("button", { name: "Add entry" }));
    await waitFor(() => expect(calls(fetch, "POST", "/entries")).toHaveLength(1));
    const body = JSON.parse(calls(fetch, "POST", "/entries")[0][1]!.body as string);
    expect(body.entries[0]).toMatchObject({ description: "Till training", minutes: 60 });
  });

  it("an entry the API refuses keeps the dialog open with its reason", async () => {
    stubApi({
      [`GET ${BASE}`]: [LOG],
      [`POST ${BASE}/volunteering/entries`]: [{ detail: "21 Oct 2026 hasn't happened yet." }, 400],
    });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("region", { name: /Volunteering/ })).getByRole("button", {
        name: "Add entry",
      })
    );
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("What they did"), "x");
    await user.click(dialog.getByRole("button", { name: "Add entry" }));
    expect(await dialog.findByText("21 Oct 2026 hasn't happened yet.")).toBeInTheDocument();
  });

  it("deletes an entry only after confirming", async () => {
    const fetch = stubApi({ [`GET ${BASE}`]: [LOG], [`DELETE ${BASE}/volunteering/entries/7`]: [LOG] });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete 14 Oct 2026" }));
    expect(calls(fetch, "DELETE", "/entries/7")).toHaveLength(0);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /Confirm|Delete/ })
    );
    await waitFor(() => expect(calls(fetch, "DELETE", "/entries/7")).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledWith("Entry deleted.");
  });

  it("downloads the PDF for the assessor", async () => {
    const fetch = stubApi({ [`GET ${BASE}`]: [LOG], [`GET ${BASE}/volunteering/pdf`]: ["PDF"] });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    const vol = within(await screen.findByRole("region", { name: /Volunteering/ }));
    await user.click(vol.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(download.saveResponseAsFile).toHaveBeenCalled());
    expect(calls(fetch, "GET", "/volunteering/pdf")[0][1]).toMatchObject({
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("a PDF that fails says why instead of saving an error page", async () => {
    stubApi({ [`GET ${BASE}`]: [LOG], [`GET ${BASE}/volunteering/pdf`]: [{ detail: "Set up first." }, 404] });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    const vol = within(await screen.findByRole("region", { name: /Volunteering/ }));
    await user.click(vol.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Set up first."));
    expect(download.saveResponseAsFile).not.toHaveBeenCalled();
  });

  it("switching off asks first, then shows the switched-off state", async () => {
    const fetch = stubApi({
      [`GET ${BASE}`]: [LOG],
      [`DELETE ${BASE}/enrolment`]: [{ enabled: false, cin: 2100001, name: "Cpl Cara Cadet", sections: [] }],
    });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Switch off" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /Confirm|Delete|Yes/ })
    );
    await waitFor(() => expect(calls(fetch, "DELETE", "/enrolment")).toHaveLength(1));
    expect(await screen.findByText("DofE activity log switched off")).toBeInTheDocument();
  });

  it("a switched-off cadet can be switched back on", async () => {
    const fetch = stubApi({
      [`GET ${BASE}`]: [{ enabled: false, cin: 2100001, name: "Cpl Cara Cadet", sections: [] }],
      [`PUT ${BASE}/enrolment`]: [LOG],
    });
    await show(<CadetActivityLogPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Switch on (Bronze)" }));
    await waitFor(() => expect(calls(fetch, "PUT", "/enrolment")).toHaveLength(1));
    expect(await screen.findByRole("region", { name: /Volunteering/ })).toBeInTheDocument();
  });

  it("a cadet who doesn't exist shows the API's error", async () => {
    stubApi({ [`GET ${BASE}`]: [{ detail: "Cadet not found" }, 404] });
    await show(<CadetActivityLogPage />);
    expect(await screen.findByText("Cadet not found")).toBeInTheDocument();
  });
});
