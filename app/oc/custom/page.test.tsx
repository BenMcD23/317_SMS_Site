// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OcCustomDashboardPage from "@/app/oc/custom/page";
import type { Panel } from "@/lib/custom-dashboard";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "oc@317atc.co.uk", name: "Olive OC" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

let oc = true;
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  API_BASE: "http://api",
  isOc: () => oc,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// The real grid measures its container, which jsdom can't. This stand-in
// renders the panels and offers a button that "drops" the first one
// somewhere else, so the page's save-on-drop is what's under test.
const grid = vi.hoisted(() => ({ width: 1200 }));
vi.mock("react-grid-layout", () => ({
  useContainerWidth: () => ({ width: grid.width, mounted: true, containerRef: { current: null } }),
  default: ({
    children,
    layout,
    onDragStop,
  }: {
    children: React.ReactNode;
    layout: { i: string; x: number; y: number; w: number; h: number }[];
    onDragStop: (l: typeof layout) => void;
  }) => (
    <div data-testid="grid">
      <button onClick={() => onDragStop(layout.map((l, i) => (i === 0 ? { ...l, x: 6, y: 9 } : l)))}>
        Drop first panel
      </button>
      {children}
    </div>
  ),
}));

const DATASETS = [
  {
    key: "cadets",
    label: "Cadets",
    description: "The roster",
    time_field: null,
    fields: [{ key: "flight", label: "Flight", kind: "text" }],
    measures: [{ key: "count", label: "Number of cadets", unit: "" }],
  },
  {
    key: "cadet_attendance",
    label: "Cadet attendance",
    description: "Registers",
    time_field: "date",
    fields: [{ key: "date", label: "Date", kind: "date" }],
    measures: [{ key: "turnout", label: "Turnout", unit: "%" }],
  },
];

const STAT: Panel = {
  id: "stat",
  title: "Cadets",
  viz: "stat",
  x: 0,
  y: 0,
  w: 3,
  h: 2,
  query: { dataset: "cadets", measure: "count", group_by: [], filters: [], sort: "label", limit: 100 },
};
const TABLE: Panel = {
  id: "table",
  title: "By flight",
  viz: "table",
  x: 3,
  y: 0,
  w: 6,
  h: 4,
  query: {
    dataset: "cadets",
    measure: "count",
    group_by: [{ field: "flight" }],
    filters: [],
    sort: "label",
    limit: 100,
  },
};

type Reply = [unknown, number?];
type Route = Reply | ((init?: RequestInit) => Reply | Promise<Response>);

/** Routes keyed "METHOD /path"; anything else 404s. Fresh Response per call. */
function stubApi(routes: Record<string, Route>) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? "GET"} ${new URL(url).pathname}`];
    const reply = typeof route === "function" ? route(init) : route;
    if (reply instanceof Promise) return reply;
    const [body, status] = reply ?? [{ detail: "not stubbed" }, 404];
    return Promise.resolve(new Response(JSON.stringify(body), { status: status ?? 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Answers each panel's query from its spec: the stat gets one number, a grouped query rows. */
function answerQuery(init?: RequestInit): Reply {
  const { query } = JSON.parse(String(init?.body));
  if (query.group_by.length === 0) return [{ rows: [{ keys: [], value: 42 }], truncated: false, unit: "" }];
  return [
    {
      rows: [
        { keys: ["A"], value: 20 },
        { keys: [null], value: 3 },
      ],
      truncated: false,
      unit: "",
    },
  ];
}

function routes(panels: Panel[], extra: Record<string, Route> = {}): Record<string, Route> {
  return {
    "GET /oc/custom-dashboard": [{ range_days: 90, panels, customised: panels.length > 0 }],
    "GET /oc/custom-dashboard/datasets": [DATASETS],
    "POST /oc/custom-dashboard/query": answerQuery,
    "PUT /oc/custom-dashboard": (init) => [{ ...JSON.parse(String(init?.body)), customised: true }],
    ...extra,
  };
}

const sent = (fetch: ReturnType<typeof stubApi>, method: string, path: string) =>
  fetch.mock.calls
    .filter(([url, init]) => (init?.method ?? "GET") === method && new URL(String(url)).pathname === path)
    .map(([, init]) => JSON.parse(String(init?.body)));

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <OcCustomDashboardPage />
      </QueryClientProvider>
    );
  });
  await settle();
}

beforeEach(() => {
  oc = true;
  grid.width = 1200;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture ??= () => false;
});

describe("custom dashboard", () => {
  it("is the OC's alone: anyone else sees the notice and nothing is fetched", async () => {
    oc = false;
    const fetch = stubApi(routes([STAT]));
    await renderPage();
    expect(screen.getByText("OC access required")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows each saved panel with its answer", async () => {
    stubApi(routes([STAT, TABLE]));
    await renderPage();
    const stat = screen.getByRole("article", { name: "Cadets" });
    expect(within(stat).getByText("42")).toBeInTheDocument();
    expect(within(stat).getByText("Cadets: number of cadets")).toBeInTheDocument();
    const table = screen.getByRole("article", { name: "By flight" });
    expect(within(table).getByRole("cell", { name: "A Flight" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "Not set" })).toBeInTheDocument();
  });

  it("runs every panel over the dashboard's saved range", async () => {
    const fetch = stubApi(routes([STAT]));
    await renderPage();
    expect(sent(fetch, "POST", "/oc/custom-dashboard/query")[0].range_days).toBe(90);
  });

  it("changing the range saves it and reruns the panels over the new one", async () => {
    const fetch = stubApi(routes([STAT]));
    await renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "All time" }));
    await settle();
    expect(sent(fetch, "PUT", "/oc/custom-dashboard").at(-1).range_days).toBeNull();
    expect(sent(fetch, "POST", "/oc/custom-dashboard/query").at(-1).range_days).toBeNull();
    expect(screen.getByRole("radio", { name: "All time" })).toHaveAttribute("data-state", "on");
  });

  it("one broken panel says why, and the rest still show", async () => {
    stubApi(
      routes([STAT, TABLE], {
        "POST /oc/custom-dashboard/query": (init) =>
          JSON.parse(String(init?.body)).query.group_by.length
            ? [{ detail: "Cadets can't be grouped by 'flight'" }, 400]
            : answerQuery(init),
      })
    );
    await renderPage();
    expect(within(screen.getByRole("article", { name: "By flight" })).getByRole("alert")).toHaveTextContent(
      "Cadets can't be grouped by 'flight'"
    );
    expect(within(screen.getByRole("article", { name: "Cadets" })).getByText("42")).toBeInTheDocument();
  });

  it("a panel on a dataset the API no longer has says so instead of querying", async () => {
    const fetch = stubApi(routes([{ ...STAT, query: { ...STAT.query, dataset: "subs" } }]));
    await renderPage();
    expect(screen.getByText(/dataset is no longer available/)).toBeInTheDocument();
    expect(sent(fetch, "POST", "/oc/custom-dashboard/query")).toHaveLength(0);
  });

  it("an unreadable dashboard shows the error rather than an empty page", async () => {
    stubApi(routes([], { "GET /oc/custom-dashboard": [{ detail: "Database down" }, 500] }));
    await renderPage();
    expect(screen.getByText("Couldn't load the dashboard")).toBeInTheDocument();
    expect(screen.getByText("Database down")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add panel" })).not.toBeInTheDocument();
  });

  it("an empty dashboard offers examples, and adding them saves them", async () => {
    const fetch = stubApi(routes([]));
    await renderPage();
    expect(screen.getByText("No panels yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add examples" }));
    await settle();
    const [saved] = sent(fetch, "PUT", "/oc/custom-dashboard");
    expect(saved.panels.length).toBeGreaterThan(2);
    expect(screen.getByRole("article", { name: "Turnout by month" })).toBeInTheDocument();
  });

  it("a failed save puts the dashboard back and says why", async () => {
    stubApi(routes([], { "PUT /oc/custom-dashboard": [{ detail: "Each panel needs its own id" }, 400] }));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add examples" }));
    await settle();
    expect(toast.error).toHaveBeenCalledWith("Each panel needs its own id");
    expect(screen.getByText("No panels yet")).toBeInTheDocument();
  });

  it("dropping a panel in a new place saves where it went", async () => {
    const fetch = stubApi(routes([STAT, TABLE]));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Drop first panel" }));
    await settle();
    const [saved] = sent(fetch, "PUT", "/oc/custom-dashboard");
    expect(saved.panels[0]).toMatchObject({ id: "stat", x: 6, y: 9 });
    expect(saved.panels[1]).toMatchObject({ id: "table", x: 3, y: 0 });
  });

  it("on a phone the panels stack in reading order instead of the grid", async () => {
    grid.width = 390;
    stubApi(
      routes([
        { ...TABLE, y: 0 },
        { ...STAT, y: 4 },
      ])
    );
    await renderPage();
    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Panels" });
    expect(
      within(list)
        .getAllByRole("heading")
        .map((h) => h.textContent)
    ).toEqual(["By flight", "Cadets"]);
  });

  it("removing a panel asks first, then saves the dashboard without it", async () => {
    const user = userEvent.setup();
    const fetch = stubApi(routes([STAT, TABLE]));
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Cadets options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(sent(fetch, "PUT", "/oc/custom-dashboard")).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: /confirm|remove|yes/i }));
    await settle();
    const [saved] = sent(fetch, "PUT", "/oc/custom-dashboard");
    expect(saved.panels.map((p: Panel) => p.id)).toEqual(["table"]);
    expect(screen.queryByRole("article", { name: "Cadets" })).not.toBeInTheDocument();
  });

  it("adding a panel needs a title, then saves it under the others", async () => {
    const user = userEvent.setup();
    const fetch = stubApi(routes([STAT, TABLE]));
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Add panel" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Add panel" }));
    expect(await within(dialog).findByText("Give the panel a title")).toBeInTheDocument();
    expect(sent(fetch, "PUT", "/oc/custom-dashboard")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText("Title"), "Headcount");
    await user.click(within(dialog).getByRole("button", { name: "Add panel" }));
    await settle();
    const [saved] = sent(fetch, "PUT", "/oc/custom-dashboard");
    const added = saved.panels.at(-1);
    expect(added).toMatchObject({ title: "Headcount", viz: "bar", x: 0, y: 4 });
    expect(added.query).toMatchObject({ dataset: "cadets", measure: "count", group_by: [] });
    expect(screen.getByRole("article", { name: "Headcount" })).toBeInTheDocument();
  });

  it("the editor previews the panel it's building", async () => {
    const user = userEvent.setup();
    stubApi(routes([STAT]));
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Cadets options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const preview = within(await screen.findByRole("dialog")).getByRole("region", { name: "Preview" });
    expect(within(preview).getByText("42")).toBeInTheDocument();
  });
});
