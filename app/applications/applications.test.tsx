// @vitest-environment jsdom
// Staff cadet and adult staff applications: who's nearing 18, starting an
// application, ticking steps, the print-off form links, notes, removing, and
// the officer-only Region board.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StaffCadetApplicationsPage from "@/app/applications/staff-cadets/page";
import AdultStaffApplicationsPage from "@/app/applications/adult-staff/page";
import type {
  NearingCadet,
  Stage,
  StaffCadetApplication,
  StaffCadetResponse,
  UniformedApplication,
  UniformedResponse,
} from "@/lib/applications";
import { setPersonalDataHidden } from "@/lib/privacy";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const CADET_STAGES: Stage[] = [
  {
    key: "dbs_bpss",
    title: "Stage 1 – DBS and BPSS",
    routes: [],
    note: null,
    steps: [
      {
        key: "bpss",
        label: "BPSS form completed",
        hint: "Every signature must be wet-signed.",
        links: [
          {
            label: "BPSS form (Pers Form 1-01)",
            url: "https://rafac.sharepoint.com/x/Pers%20Form%201-01.docx?web=1",
          },
          { label: "whq@mod.gov.uk", url: "mailto:whq@mod.gov.uk" },
        ],
      },
      { key: "dbs_requested", label: "DBS requested", hint: null, links: [] },
    ],
  },
];

const ADULT_STAGES: Stage[] = [
  {
    key: "application",
    title: "Step 1 – Application",
    routes: [],
    note: null,
    steps: [{ key: "pers_1_10", label: "Pers Form 1-10 completed", hint: null, links: [] }],
  },
  {
    key: "region",
    title: "Step 3 – Region interview",
    routes: ["cfc"],
    note: "If not recommended, the Development Officer contacts the applicant.",
    steps: [{ key: "region_board", label: "Region board held", hint: null, links: [] }],
  },
];

const nearing = (over: Partial<NearingCadet> = {}): NearingCadet => ({
  cin: 2100001,
  name: "Zoë Ó Briain",
  rank: "Sgt",
  flight: "A",
  dateOfBirth: "2008-11-03",
  turns18On: "2026-11-03",
  daysTo18: 10,
  ...over,
});

const cadetApp = (over: Partial<StaffCadetApplication> = {}): StaffCadetApplication => ({
  id: 1,
  kind: "staff_cadet",
  cadet: nearing(),
  notes: null,
  steps: {},
  startedAt: "2026-10-01T19:00:00",
  startedBy: "staff@317atc.co.uk",
  done: 0,
  total: 2,
  complete: false,
  nextStep: "bpss",
  ...over,
});

const adultApp = (over: Partial<UniformedApplication> = {}): UniformedApplication => ({
  id: 5,
  kind: "uniformed",
  name: "Daniel Okafor",
  route: "snco",
  cicDueBy: null,
  notes: null,
  steps: {},
  startedAt: "2026-09-01T19:00:00",
  startedBy: "staff@317atc.co.uk",
  done: 0,
  total: 1,
  complete: false,
  nextStep: "pers_1_10",
  ...over,
});

type Routes = Record<string, [unknown, number?]>;
// Keys are "METHOD /path"; the path must match the end of the URL.
function stubApi(routes: Routes) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const hit = Object.entries(routes).find(([key]) => {
      const [m, path] = key.split(" ");
      return m === method && String(url).endsWith(path);
    });
    const [body, status] = hit?.[1] ?? [{ detail: "not stubbed" }, 404];
    // A fresh Response per call: a body can only be read once.
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status: status ?? 200 })
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const calls = (fetch: ReturnType<typeof stubApi>, method: string, path: string) =>
  fetch.mock.calls.filter(([url, init]) => (init?.method ?? "GET") === method && String(url).endsWith(path));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

async function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

beforeEach(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => window.localStorage.clear());

const staffCadets = (over: Partial<StaffCadetResponse> = {}): StaffCadetResponse => ({
  stages: CADET_STAGES,
  applications: [],
  nearing18: [],
  ...over,
});

describe("Staff cadet applications", () => {
  it("opens on Nearing 18 when nothing is in progress, soonest birthday first with the deadline", async () => {
    stubApi({
      "GET /applications/staff-cadets": [
        staffCadets({ nearing18: [nearing({ daysTo18: -5, cin: 9, name: "Late Larry" }), nearing()] }),
      ],
    });
    await show(<StaffCadetApplicationsPage />);
    expect(await screen.findByText("Late Larry")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Nearing 18 2" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Past 18th birthday")).toBeTruthy();
    expect(screen.getByText(/Turns 18 in 10 days \(3 Nov 2026\)/)).toBeTruthy();
  });

  it("starting an application moves the cadet to In progress", async () => {
    const fetch = stubApi({
      "GET /applications/staff-cadets": [staffCadets({ nearing18: [nearing()] })],
      "POST /applications/staff-cadets": [cadetApp(), 201],
    });
    await show(<StaffCadetApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Start application" }));
    await waitFor(() => expect(calls(fetch, "POST", "/applications/staff-cadets")).toHaveLength(1));
    expect(bodyOf(calls(fetch, "POST", "/applications/staff-cadets")[0])).toEqual({ cin: 2100001 });
    expect(toast.success).toHaveBeenCalledWith("Application started for Zoë Ó Briain.");
    // The list is fetched again, so the cadet moves across.
    await waitFor(() => expect(calls(fetch, "GET", "/applications/staff-cadets")).toHaveLength(2));
    expect(screen.getByRole("tab", { name: "In progress 0" }).getAttribute("aria-selected")).toBe("true");
  });

  it("a refused start shows the API's reason and keeps the cadet listed", async () => {
    stubApi({
      "GET /applications/staff-cadets": [staffCadets({ nearing18: [nearing()] })],
      "POST /applications/staff-cadets": [
        { detail: "Zoë Ó Briain already has an application in progress." },
        409,
      ],
    });
    await show(<StaffCadetApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Start application" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Zoë Ó Briain already has an application in progress.")
    );
    expect(screen.getByRole("button", { name: "Start application" })).toBeTruthy();
  });

  it("ticking a step saves it and updates the row's progress", async () => {
    const fetch = stubApi({
      "GET /applications/staff-cadets": [staffCadets({ applications: [cadetApp()] })],
      "PUT /applications/1/steps/bpss": [
        cadetApp({
          steps: { bpss: { at: "2026-10-24T19:30:00", by: "staff@317atc.co.uk" } },
          done: 1,
          nextStep: "dbs_requested",
        }),
      ],
    });
    await show(<StaffCadetApplicationsPage />);
    expect(await screen.findByText("Next: BPSS form completed")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Expand application for Zoë Ó Briain" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "BPSS form completed" }));

    await waitFor(() => expect(screen.getByText("1 of 2 done")).toBeTruthy());
    expect(bodyOf(calls(fetch, "PUT", "/applications/1/steps/bpss")[0])).toEqual({ done: true });
    expect(screen.getByRole("checkbox", { name: "BPSS form completed" }).getAttribute("aria-checked")).toBe(
      "true"
    );
    expect(screen.getByText("Done 24 Oct 2026 by staff@317atc.co.uk")).toBeTruthy();
    expect(screen.getByText("Next: DBS requested")).toBeTruthy();
  });

  it("a failed tick says why and leaves the box unticked", async () => {
    stubApi({
      "GET /applications/staff-cadets": [staffCadets({ applications: [cadetApp()] })],
      "PUT /applications/1/steps/bpss": [{ detail: "boom" }, 500],
    });
    await show(<StaffCadetApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Expand application for Zoë Ó Briain" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "BPSS form completed" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    expect(screen.getByRole("checkbox", { name: "BPSS form completed" }).getAttribute("aria-checked")).toBe(
      "false"
    );
  });

  it("links each paper form to print, opening in a new tab, and emails as mail links", async () => {
    stubApi({ "GET /applications/staff-cadets": [staffCadets({ applications: [cadetApp()] })] });
    await show(<StaffCadetApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Expand application for Zoë Ó Briain" }));
    const form = screen.getByRole("link", { name: "BPSS form (Pers Form 1-01)" });
    expect(form.getAttribute("href")).toContain("Pers%20Form%201-01.docx");
    expect(form.getAttribute("target")).toBe("_blank");
    const mail = screen.getByRole("link", { name: "whq@mod.gov.uk" });
    expect(mail.getAttribute("href")).toBe("mailto:whq@mod.gov.uk");
    expect(mail.getAttribute("target")).toBeNull();
    expect(screen.getByText("Every signature must be wet-signed.")).toBeTruthy();
  });

  it("saves notes, offering Save only once they've changed", async () => {
    const fetch = stubApi({
      "GET /applications/staff-cadets": [staffCadets({ applications: [cadetApp()] })],
      "PATCH /applications/1": [cadetApp({ notes: "MOI booked" })],
    });
    await show(<StaffCadetApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Expand application for Zoë Ó Briain" }));
    expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Notes" }), "MOI booked ");
    await userEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Notes saved."));
    expect(bodyOf(calls(fetch, "PATCH", "/applications/1")[0])).toEqual({ notes: "MOI booked" });
    expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull();
  });

  it("removing asks first, then refetches so the cadet goes back on the list", async () => {
    const fetch = stubApi({
      "GET /applications/staff-cadets": [staffCadets({ applications: [cadetApp()] })],
      "DELETE /applications/1": [null, 204],
    });
    await show(<StaffCadetApplicationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Expand application for Zoë Ó Briain" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove application" }));
    expect(calls(fetch, "DELETE", "/applications/1")).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/go back on the Nearing 18 list/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: /confirm|remove|delete|yes/i }));
    await waitFor(() => expect(calls(fetch, "DELETE", "/applications/1")).toHaveLength(1));
    await waitFor(() => expect(calls(fetch, "GET", "/applications/staff-cadets")).toHaveLength(2));
  });

  it("finished applications sit under Complete", async () => {
    stubApi({
      "GET /applications/staff-cadets": [
        staffCadets({ applications: [cadetApp({ complete: true, done: 2, nextStep: null })] }),
      ],
    });
    await show(<StaffCadetApplicationsPage />);
    expect(await screen.findByText("No applications in progress")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Complete 1" }));
    expect(screen.getByText("Complete", { selector: "[data-slot=badge]" })).toBeTruthy();
    expect(screen.getByText("Zoë Ó Briain")).toBeTruthy();
  });

  it("hiding personal data takes the birthday off but keeps how urgent it is", async () => {
    setPersonalDataHidden(true);
    stubApi({
      "GET /applications/staff-cadets": [staffCadets({ nearing18: [nearing({ daysTo18: 5 })] })],
    });
    await show(<StaffCadetApplicationsPage />);
    expect(await screen.findByText("Zoë Ó Briain")).toBeTruthy();
    expect(screen.queryByText(/3 Nov 2026/)).toBeNull();
    expect(screen.getByText("18 soon")).toBeTruthy();
  });

  it("an empty squadron says nobody is nearing 18", async () => {
    stubApi({ "GET /applications/staff-cadets": [staffCadets()] });
    await show(<StaffCadetApplicationsPage />);
    expect(await screen.findByText("No applications in progress")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Nearing 18 0" }));
    expect(screen.getByText("Nobody is nearing 18")).toBeTruthy();
  });

  it("an API error shows the reason instead of crashing", async () => {
    stubApi({ "GET /applications/staff-cadets": [{ detail: "Staff access required" }, 403] });
    await show(<StaffCadetApplicationsPage />);
    expect(await screen.findByText("Staff access required")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

const adults = (over: Partial<UniformedResponse> = {}): UniformedResponse => ({
  stages: ADULT_STAGES,
  applications: [],
  ...over,
});

describe("Adult staff applications", () => {
  it("adds an applicant with a name and route", async () => {
    const fetch = stubApi({
      "GET /applications/uniformed": [adults()],
      "POST /applications/uniformed": [adultApp({ name: "Rachel Kowalski", route: "cfc" }), 201],
    });
    await show(<AdultStaffApplicationsPage />);
    expect(await screen.findByText("No applications in progress")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Add applicant" })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rachel Kowalski");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Officer (CFC)" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add applicant" }));
    await waitFor(() => expect(calls(fetch, "POST", "/applications/uniformed")).toHaveLength(1));
    expect(bodyOf(calls(fetch, "POST", "/applications/uniformed")[0])).toEqual({
      name: "Rachel Kowalski",
      route: "cfc",
    });
    expect(toast.success).toHaveBeenCalledWith("Rachel Kowalski added.");
  });

  it("won't add an applicant without a name", async () => {
    const fetch = stubApi({ "GET /applications/uniformed": [adults()] });
    await show(<AdultStaffApplicationsPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Add applicant" }))[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "   ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add applicant" }));
    expect(await within(dialog).findByText("Enter their name")).toBeTruthy();
    expect(calls(fetch, "POST", "/applications/uniformed")).toHaveLength(0);
  });

  it("only shows the Region board to officer applicants", async () => {
    stubApi({
      "GET /applications/uniformed": [
        adults({
          applications: [adultApp(), adultApp({ id: 6, name: "Rachel Kowalski", route: "cfc", total: 2 })],
        }),
      ],
    });
    await show(<AdultStaffApplicationsPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Expand application for Daniel Okafor" })
    );
    expect(screen.queryByText("Step 3 – Region interview")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Expand application for Rachel Kowalski" }));
    expect(screen.getByText("Step 3 – Region interview")).toBeTruthy();
    expect(screen.getByText(/Development Officer contacts the applicant/)).toBeTruthy();
  });

  it("switching an SNCO to officer saves the route and adds the Region board", async () => {
    const fetch = stubApi({
      "GET /applications/uniformed": [adults({ applications: [adultApp()] })],
      "PATCH /applications/5": [adultApp({ route: "cfc", total: 2 })],
    });
    await show(<AdultStaffApplicationsPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Expand application for Daniel Okafor" })
    );
    await userEvent.click(screen.getByRole("radio", { name: "Officer (CFC)" }));
    await waitFor(() => expect(screen.getByText("Step 3 – Region interview")).toBeTruthy());
    expect(bodyOf(calls(fetch, "PATCH", "/applications/5")[0])).toEqual({ route: "cfc" });
    expect(screen.getByText("0 of 2 done")).toBeTruthy();
  });

  it("shows when the CIC is due once they're appointed", async () => {
    stubApi({
      "GET /applications/uniformed": [adults({ applications: [adultApp({ cicDueBy: "2027-10-24" })] })],
    });
    await show(<AdultStaffApplicationsPage />);
    expect(await screen.findByText("CIC by 24 Oct 2027")).toBeTruthy();
  });

  it("an error body where the list was expected doesn't crash the page", async () => {
    stubApi({ "GET /applications/uniformed": [{ detail: "Database unavailable" }, 500] });
    await show(<AdultStaffApplicationsPage />);
    expect(await screen.findByText("Database unavailable")).toBeTruthy();
  });
});
