// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OcDashboardPage from "@/app/oc/page";

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

const DASH = {
  strength: { total_cadets: 0, total_staff: 0, by_flight: {}, by_classification: {}, badges: {} },
  badge_coverage: { cadets: 0, badges: {} },
  staff_attendance: [],
  attendance_trend: [],
  qual_summary: { total: 0, expired: 0, expiring_30: 0, expiring_90: 0 },
  expiring_quals: [],
};
const DEFAULT = ["committee", "strength", "qualifications", "compliance", "pipeline"];
const TITLES = [
  "Committee Requests",
  "Strength & Attendance",
  "Qualifications",
  "Staff DBS & Training",
  "In the Pipeline",
];

type Reply = [unknown, number?] | (() => Promise<Response>);

/** Routes keyed "METHOD /path"; anything else 404s. Fresh Response per call. */
function stubApi(routes: Record<string, Reply>) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const reply = routes[key];
    if (typeof reply === "function") return reply();
    const [body, status] = reply ?? [{ detail: "not stubbed" }, 404];
    return Promise.resolve(new Response(JSON.stringify(body), { status: status ?? 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function routes(sections: string[] = DEFAULT, extra: Record<string, Reply> = {}) {
  return {
    "GET /oc/dashboard": [DASH] as Reply,
    "GET /committee-requests": [{ requests: [], is_oc: true }] as Reply,
    "GET /oc/dashboard/layout": [{ sections, customised: sections !== DEFAULT }] as Reply,
    ...extra,
  };
}

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <OcDashboardPage />
      </QueryClientProvider>
    );
  });
  await settle();
}

/** The dashboard's section headings, top to bottom, as they'd print. */
const sectionOrder = () =>
  screen
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent)
    .filter((t) => TITLES.includes(t ?? ""));

const sentBodies = (fetch: ReturnType<typeof stubApi>, method: string) =>
  fetch.mock.calls
    .filter(([url, init]) => init?.method === method && String(url).endsWith("/oc/dashboard/layout"))
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null));

beforeEach(() => {
  oc = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe("OC dashboard layout", () => {
  it("shows the sections in the OC's saved order", async () => {
    stubApi(routes(["qualifications", "pipeline", "committee", "strength"]));
    await renderPage();
    expect(sectionOrder()).toEqual([
      "Qualifications",
      "In the Pipeline",
      "Committee Requests",
      "Strength & Attendance",
      "Staff DBS & Training",
    ]);
  });

  it("an unreadable layout falls back to the default order instead of hiding the dashboard", async () => {
    stubApi(routes(DEFAULT, { "GET /oc/dashboard/layout": [{ detail: "boom" }, 500] }));
    await renderPage();
    expect(sectionOrder()).toEqual(TITLES);
  });

  it("a layout naming sections this site doesn't have still shows every section once", async () => {
    stubApi(routes(["pipeline", "subs-radar", "pipeline"]));
    await renderPage();
    expect(sectionOrder()).toEqual([
      "In the Pipeline",
      "Committee Requests",
      "Strength & Attendance",
      "Qualifications",
      "Staff DBS & Training",
    ]);
  });

  it("moving a section saves the new order and the dashboard follows it", async () => {
    const fetch = stubApi(
      routes(DEFAULT, {
        "PUT /oc/dashboard/layout": [
          {
            sections: ["committee", "qualifications", "strength", "compliance", "pipeline"],
            customised: true,
          },
        ],
      })
    );
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Arrange sections" }));
    const list = screen.getByRole("list", { name: "OC dashboard sections" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(TITLES);
    // The ends can't move further.
    expect(
      (screen.getByRole("button", { name: "Move Committee Requests up" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Move In the Pipeline down" }) as HTMLButtonElement).disabled
    ).toBe(true);
    // Each section has a drag handle with a name a screen reader can say.
    expect(screen.getByRole("button", { name: "Drag Qualifications" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move Qualifications up" }));
    await settle();
    expect(sentBodies(fetch, "PUT")).toEqual([
      { sections: ["committee", "qualifications", "strength", "compliance", "pipeline"] },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(sectionOrder()).toEqual([
      "Committee Requests",
      "Qualifications",
      "Strength & Attendance",
      "Staff DBS & Training",
      "In the Pipeline",
    ]);
  });

  it("a failed save puts the order back and says why", async () => {
    stubApi(routes(DEFAULT, { "PUT /oc/dashboard/layout": [{ detail: "OC access required" }, 403] }));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Arrange sections" }));
    fireEvent.click(screen.getByRole("button", { name: "Move In the Pipeline up" }));
    await settle();
    expect(toast.error).toHaveBeenCalledWith("OC access required");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(sectionOrder()).toEqual(TITLES);
  });

  it("an API that can't be reached keeps the old order rather than one that wasn't saved", async () => {
    stubApi(
      routes(DEFAULT, { "PUT /oc/dashboard/layout": () => Promise.reject(new TypeError("Failed to fetch")) })
    );
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Arrange sections" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Strength & Attendance down" }));
    await settle();
    expect(toast.error).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(sectionOrder()).toEqual(TITLES);
  });

  it("reset puts the default order back", async () => {
    const custom = ["pipeline", "qualifications", "strength", "committee"];
    const fetch = stubApi(
      routes(custom, { "DELETE /oc/dashboard/layout": [{ sections: DEFAULT, customised: false }] })
    );
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Arrange sections" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    await settle();
    expect(sentBodies(fetch, "DELETE")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(sectionOrder()).toEqual(TITLES);
  });

  it("offers no reset while the layout is already the default", async () => {
    stubApi(routes());
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Arrange sections" }));
    expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
  });
});

describe("OC dashboard export", () => {
  it("prints the page, headed and in the saved order", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    stubApi(routes(["pipeline", "committee", "strength", "qualifications"]));
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Print / PDF" }));
    expect(print).toHaveBeenCalledOnce();
    // The printout is this page, so its sections come out in the same order.
    expect(screen.getByText("317 Squadron — OC Dashboard")).toBeTruthy();
    expect(sectionOrder()).toEqual([
      "In the Pipeline",
      "Committee Requests",
      "Strength & Attendance",
      "Qualifications",
      "Staff DBS & Training",
    ]);
  });
});

describe("OC dashboard staff DBS and training", () => {
  const person = (cin: number, name: string, status: string | null, items: unknown[] | null) => ({
    cin,
    name,
    rank: "CI",
    status,
    items,
    synced_at: status ? "2026-11-10T09:00:00" : null,
  });
  const lapsed = {
    key: "dbs",
    name: "DBS",
    kind: "vetting",
    achieved: "2023-01-01",
    expires: "2026-01-01",
    status: "expired",
  };
  const fine = {
    key: "dbs",
    name: "DBS",
    kind: "vetting",
    achieved: "2025-01-01",
    expires: "2028-01-01",
    status: "ok",
  };

  it("lists only the staff with something due, worst first, with the counts", async () => {
    stubApi(
      routes(DEFAULT, {
        "GET /staff/compliance": [
          {
            everyone: true,
            due_within_days: 60,
            staff: [
              person(1, "Ann Fine", "ok", [fine]),
              person(2, "Órla Lapsed", "expired", [lapsed]),
              person(3, "Pat Never", null, null),
            ],
          },
        ],
      })
    );
    await renderPage();
    const section = screen.getByRole("heading", { name: "Staff DBS & Training" }).closest("section")!;
    expect(section.textContent).toContain("CI Órla Lapsed");
    expect(section.textContent).toContain("Lapsed 1 Jan 2026");
    expect(section.textContent).not.toContain("Ann Fine");
    expect(section.textContent).toMatch(/Not synced\s*1/);
  });

  it("says so when everyone synced is up to date", async () => {
    stubApi(
      routes(DEFAULT, {
        "GET /staff/compliance": [
          { everyone: true, due_within_days: 60, staff: [person(1, "Ann Fine", "ok", [fine])] },
        ],
      })
    );
    await renderPage();
    expect(screen.getByText("Everyone synced is up to date.")).toBeTruthy();
  });

  it("an API error is a message in that section, not a broken dashboard", async () => {
    stubApi(routes(DEFAULT, { "GET /staff/compliance": [{ detail: "boom" }, 500] }));
    await renderPage();
    expect(screen.getByText("Couldn't load staff DBS and training.")).toBeTruthy();
    expect(sectionOrder()).toEqual(TITLES);
  });
});

describe("OC dashboard access", () => {
  it("someone who isn't the OC never asks for the layout", async () => {
    oc = false;
    const fetch = stubApi(routes());
    await renderPage();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/oc/dashboard"))).toBe(false);
    expect(screen.queryByRole("button", { name: "Arrange sections" })).toBeNull();
  });
});
