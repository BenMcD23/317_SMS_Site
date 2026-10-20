// @vitest-environment jsdom
// The Recruits list and a recruit's own page: adding a recruit and getting
// their link, following progress, extending a link, and the PDFs once the
// parent has submitted.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RecruitsPage from "@/app/recruits/page";
import RecruitPage from "@/app/recruits/[id]/page";
import type { Recruit, RecruitDetail } from "@/lib/recruits";
import { setPersonalDataHidden } from "@/lib/privacy";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useParams: () => ({ id: "7" }) }));

const STEPS = ["cadet", "contact", "history", "parent", "consent", "medical", "about", "sign"];

const recruit = (over: Partial<Recruit> = {}): Recruit => ({
  id: 7,
  cadetFirstName: "Erin",
  cadetLastName: "Walsh",
  parentName: "Siobhán Walsh",
  parentEmail: "siobhan@example.com",
  status: "in_progress",
  progress: {
    done: 3,
    total: 8,
    steps: STEPS.map((key, i) => ({ key, label: `Step ${key}`, done: i < 3 })),
  },
  link: "https://www.317atc.co.uk/enrol/abc123",
  expiresAt: new Date(Date.now() + 5 * 86_400_000 + 3_600_000).toISOString(),
  expired: false,
  createdAt: "2026-10-10T18:00:00",
  createdBy: "staff@317atc.co.uk",
  openedAt: "2026-10-11T09:00:00",
  lastSavedAt: "2026-10-11T09:20:00",
  submittedAt: null,
  ...over,
});

const OPTIONS = {
  ethnicities: [{ key: "white_irish", label: "Irish", group: "White" }],
  conditions: [{ key: "asthma", label: "Asthma" }],
  allergies: [{ key: "nut", label: "Nut" }],
  diets: [{ key: "vegetarian", label: "Vegetarian" }],
  accommodation: [{ key: "female", label: "Shared female" }],
  organisations: [{ key: "scouts", label: "Scouts" }],
  consents: [{ key: "photo", label: "Images used to promote the RAF Air Cadets" }],
  steps: STEPS.map((key) => ({ key, label: key })),
  cadetSignsFromAge: 16,
};

const address = {
  property: "",
  street: "",
  area: "",
  town: "",
  county: "",
  country: "",
  postcode: "",
  mobile: "",
  homePhone: "",
  email: "",
  email2: "",
};

const detail = (over: Partial<RecruitDetail> = {}): RecruitDetail => ({
  ...recruit(),
  data: {
    cadet: {
      fullName: "Erin Walsh",
      dob: "2013-04-12",
      religion: "",
      gender: "female",
      genderOther: "",
      pronoun: "she",
      ethnicity: "white_irish",
      externalAgency: false,
    },
    contact: { ...address, town: "Failsworth", postcode: "M35 0AA" },
    history: { scouts: true, other: "" },
    nok: {
      ...address,
      title: "Mrs",
      fullName: "Siobhán Walsh",
      relationship: "Mother",
      hasParentalResponsibility: true,
    },
    extra: { ...address, title: "", fullName: "", relationship: "" },
    consent: { photo: false, accommodationTypes: [] },
    medical: {
      has: true,
      conditions: ["asthma"],
      ehcPlan: false,
      ehcCopy: null,
      details: [],
      allergies: { nut: { autoInjector: true, severity: "severe" } },
      allergyOther: "",
      diet: [],
      dietOther: "",
    },
    about: { school: "Failsworth School", heardFrom: "", reason: "" },
    signer: { forename: "Siobhán", surname: "Walsh" },
  },
  missing: { medical: ["Details of each condition"] },
  options: OPTIONS,
  parentSignature: null,
  cadetSignature: null,
  hasHealthDeclaration: true,
  ...over,
});

const PDF = "%PDF-1.7";

type Routes = Record<string, [unknown, number?]>;
// Keys are "METHOD /path"; a path ending matches, and the first match wins.
function stubApi(routes: Routes) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const hit = Object.entries(routes).find(([key]) => {
      const [m, path] = key.split(" ");
      return m === method && String(url).split("?")[0].endsWith(path);
    });
    const [body, status] = hit?.[1] ?? [{ detail: "not stubbed" }, 404];
    // A PDF stands in as raw text: jsdom's Blob isn't one Node's Response accepts.
    if (body === PDF)
      return Promise.resolve(new Response(PDF, { headers: { "Content-Type": "application/pdf" } }));
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), { status: status ?? 200 })
    );
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

let clipboard: string[];
beforeEach(() => {
  clipboard = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t: string) => (clipboard.push(t), Promise.resolve()) },
  });
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
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
  toast.success.mockReset();
  toast.error.mockReset();
  router.push.mockReset();
});

describe("Recruits list", () => {
  it("lists recruits with their progress and status", async () => {
    stubApi({
      "GET /recruits": [
        [recruit(), recruit({ id: 8, cadetFirstName: "Oscar", cadetLastName: "Lee", expired: true })],
      ],
    });
    await show(<RecruitsPage />);
    expect(await screen.findByRole("link", { name: "Erin Walsh" })).toBeTruthy();
    expect(screen.getAllByText("Siobhán Walsh")).toHaveLength(2);
    expect(screen.getAllByText("3 of 8")).toHaveLength(2);
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Link expired")).toBeTruthy();
  });

  it("shows an empty state with no recruits", async () => {
    stubApi({ "GET /recruits": [[]] });
    await show(<RecruitsPage />);
    expect(await screen.findByText("No recruits yet")).toBeTruthy();
  });

  it("shows the API's error instead of an empty list when loading fails", async () => {
    stubApi({ "GET /recruits": [{ detail: "Staff access required" }, 403] });
    await show(<RecruitsPage />);
    expect(await screen.findByText("Staff access required")).toBeTruthy();
    expect(screen.queryByText("No recruits yet")).toBeNull();
  });

  it("adding a recruit sends their details and copies the new link", async () => {
    const fetch = stubApi({ "GET /recruits": [[]], "POST /recruits": [recruit(), 201] });
    await show(<RecruitsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add recruit" }));
    fireEvent.change(screen.getByLabelText("Cadet's first name"), { target: { value: "Erin" } });
    fireEvent.change(screen.getByLabelText("Cadet's last name"), { target: { value: "Walsh" } });
    fireEvent.change(screen.getByLabelText("Parent or guardian's name"), {
      target: { value: "Siobhán Walsh" },
    });
    fireEvent.change(screen.getByLabelText("Parent or guardian's email"), {
      target: { value: "siobhan@example.com" },
    });
    const dialogButtons = screen.getAllByRole("button", { name: "Add recruit" });
    await act(async () => fireEvent.click(dialogButtons[dialogButtons.length - 1]));

    await waitFor(() => expect(calls(fetch, "POST", "/recruits")).toHaveLength(1));
    expect(JSON.parse(calls(fetch, "POST", "/recruits")[0][1]!.body as string)).toEqual({
      cadetFirstName: "Erin",
      cadetLastName: "Walsh",
      parentName: "Siobhán Walsh",
      parentEmail: "siobhan@example.com",
    });
    await waitFor(() => expect(clipboard).toEqual(["https://www.317atc.co.uk/enrol/abc123"]));
    expect(toast.success.mock.calls[0][0]).toContain("link is copied");
  });

  it("won't add a recruit with a bad email, and says what to do", async () => {
    const fetch = stubApi({ "GET /recruits": [[]] });
    await show(<RecruitsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add recruit" }));
    for (const [label, value] of [
      ["Cadet's first name", "Erin"],
      ["Cadet's last name", "Walsh"],
      ["Parent or guardian's name", "Siobhán"],
      ["Parent or guardian's email", "siobhan"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    const buttons = screen.getAllByRole("button", { name: "Add recruit" });
    await act(async () => fireEvent.click(buttons[buttons.length - 1]));
    expect(await screen.findByText("Enter an email address, like name@example.com")).toBeTruthy();
    expect(calls(fetch, "POST", "/recruits")).toHaveLength(0);
  });

  it("keeps the dialog open with the API's message when adding fails", async () => {
    stubApi({
      "GET /recruits": [[]],
      "POST /recruits": [{ detail: "Enter the parent's email address." }, 422],
    });
    await show(<RecruitsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add recruit" }));
    for (const [label, value] of [
      ["Cadet's first name", "Erin"],
      ["Cadet's last name", "Walsh"],
      ["Parent or guardian's name", "Siobhán"],
      ["Parent or guardian's email", "s@example.com"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    const buttons = screen.getAllByRole("button", { name: "Add recruit" });
    await act(async () => fireEvent.click(buttons[buttons.length - 1]));
    expect(await screen.findByText("Enter the parent's email address.")).toBeTruthy();
    expect(clipboard).toEqual([]);
  });
});

describe("A recruit's page", () => {
  afterEach(() => window.localStorage.clear());

  it("drops contact, date of birth, ethnicity and medical answers when personal data is hidden", async () => {
    act(() => setPersonalDataHidden(true));
    stubApi({ "GET /recruits/7": [detail()] });
    await show(<RecruitPage />);
    expect(await screen.findByRole("heading", { name: /Erin Walsh/ })).toBeTruthy();
    expect(screen.getByText("Mrs Siobhán Walsh")).toBeTruthy();
    expect(screen.getByText("Failsworth School")).toBeTruthy();
    for (const text of [/M35 0AA/, /12 Apr 2013/, "Irish", "Asthma", /Nut, severe/, /siobhan@example\.com/]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    // The rows go with their labels, and the header loses the address cleanly.
    for (const label of ["Date of birth", "Ethnicity", "Address", "Gender"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText("Parent: Siobhán Walsh")).toBeTruthy();
  });

  it("drops the filled-in PDFs while personal data is hidden, and opens on the answers", async () => {
    act(() => setPersonalDataHidden(true));
    stubApi({
      "GET /recruits/7/pdf": [PDF],
      "GET /recruits/7": [detail({ status: "submitted", submittedAt: "2026-10-12T20:00:00", missing: {} })],
    });
    await show(<RecruitPage />);
    expect(await screen.findByRole("tab", { name: "Answers", selected: true })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "3822A consent" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "3822H health" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
    // Whole sections that are personal throughout go with their headings.
    expect(screen.queryByRole("heading", { name: "Medical, allergies and diet" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Cadet's contact details" })).toBeNull();
    expect(screen.queryByText(/Hidden|Nothing filled in yet/)).toBeNull();
  });

  it("shows the link to send, its expiry and what's still missing", async () => {
    stubApi({ "GET /recruits/7": [detail()] });
    await show(<RecruitPage />);
    expect(await screen.findByRole("heading", { name: /Erin Walsh/ })).toBeTruthy();
    expect((screen.getByLabelText("Joining-form link") as HTMLInputElement).value).toBe(
      "https://www.317atc.co.uk/enrol/abc123"
    );
    expect(screen.getByText(/The link expires in 5 days/)).toBeTruthy();
    expect(screen.getByText("Still needed: Details of each condition")).toBeTruthy();
    // No PDFs until it's submitted.
    expect(screen.queryByRole("tab", { name: "3822A consent" })).toBeNull();
    // The answers so far are readable while the parent is still going.
    expect(screen.getByText("Failsworth School")).toBeTruthy();
    expect(screen.getByText("Nut, severe, auto-injector")).toBeTruthy();
  });

  it("copies the link", async () => {
    stubApi({ "GET /recruits/7": [detail()] });
    await show(<RecruitPage />);
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Copy link" })));
    expect(clipboard).toEqual(["https://www.317atc.co.uk/enrol/abc123"]);
    expect(toast.success).toHaveBeenCalledWith("Link copied.");
  });

  it("says when the link couldn't be copied rather than claiming it was", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    stubApi({ "GET /recruits/7": [detail()] });
    await show(<RecruitPage />);
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Copy link" })));
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("an expired link says so and can be extended", async () => {
    const fetch = stubApi({
      "GET /recruits/7": [detail({ expired: true, expiresAt: "2026-10-01T18:00:00" })],
      "POST /recruits/7/extend": [recruit()],
    });
    await show(<RecruitPage />);
    expect(await screen.findByText(/The link expired on/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Extend 14 days" })));
    expect(calls(fetch, "POST", "/recruits/7/extend")).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith("Link extended for another 14 days.");
  });

  it("shows the API's message when extending fails", async () => {
    stubApi({
      "GET /recruits/7": [detail()],
      "POST /recruits/7/extend": [{ detail: "This form has already been submitted." }, 409],
    });
    await show(<RecruitPage />);
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Extend 14 days" })));
    expect(toast.error).toHaveBeenCalledWith("This form has already been submitted.");
  });

  it("once submitted, drops the link and opens on the filled 3822A", async () => {
    const fetch = stubApi({
      "GET /recruits/7/pdf": [PDF],
      "GET /recruits/7": [
        detail({
          status: "submitted",
          submittedAt: "2026-10-12T20:00:00",
          missing: {},
          parentSignature: "data:image/png;base64,iVBORw0KGgo=",
        }),
      ],
    });
    await show(<RecruitPage />);
    expect(await screen.findByRole("tab", { name: "3822A consent" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "3822H health" })).toBeTruthy();
    expect(screen.queryByLabelText("Joining-form link")).toBeNull();
    await waitFor(() => expect(calls(fetch, "GET", "/recruits/7/pdf?form=3822A")).toHaveLength(1));
    await waitFor(() => expect(screen.getByTitle("3822A Erin Walsh")).toBeTruthy());
    expect(calls(fetch, "GET", "/recruits/7/pdf?form=3822A")).toHaveLength(1);
  });

  it("has no 3822H tab when the parent answered no to medical", async () => {
    stubApi({
      "GET /recruits/7/pdf": [PDF],
      "GET /recruits/7": [
        detail({ status: "submitted", submittedAt: "2026-10-12T20:00:00", hasHealthDeclaration: false }),
      ],
    });
    await show(<RecruitPage />);
    expect(await screen.findByRole("tab", { name: "3822A consent" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "3822H health" })).toBeNull();
  });

  it("shows why a PDF couldn't be drawn", async () => {
    stubApi({
      "GET /recruits/7/pdf": [{ detail: "The form hasn't been submitted yet." }, 409],
      "GET /recruits/7": [detail({ status: "submitted", submittedAt: "2026-10-12T20:00:00" })],
    });
    await show(<RecruitPage />);
    expect(await screen.findByText("The form hasn't been submitted yet.")).toBeTruthy();
  });

  it("reopens a submitted form for the parent to correct, after confirming", async () => {
    const fetch = stubApi({
      "GET /recruits/7/pdf": [PDF],
      "GET /recruits/7": [detail({ status: "submitted", submittedAt: "2026-10-12T20:00:00" })],
      "POST /recruits/7/reopen": [recruit()],
    });
    await show(<RecruitPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Reopen for changes" }));
    expect(calls(fetch, "POST", "/recruits/7/reopen")).toHaveLength(0);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm" })));
    await waitFor(() => expect(calls(fetch, "POST", "/recruits/7/reopen")).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledWith("Form reopened. Let the parent know what to change.");
  });

  it("only offers to reopen a form that has been submitted", async () => {
    stubApi({ "GET /recruits/7": [detail()] });
    await show(<RecruitPage />);
    await screen.findByRole("button", { name: "Delete" });
    expect(screen.queryByRole("button", { name: "Reopen for changes" })).toBeNull();
  });

  it("deletes only after confirming, then goes back to the list", async () => {
    const fetch = stubApi({ "GET /recruits/7": [detail()], "DELETE /recruits/7": [null, 204] });
    await show(<RecruitPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(calls(fetch, "DELETE", "/recruits/7")).toHaveLength(0);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm" })));
    await waitFor(() => expect(calls(fetch, "DELETE", "/recruits/7")).toHaveLength(1));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/recruits"));
  });

  it("a missing recruit shows the API's message", async () => {
    stubApi({ "GET /recruits/7": [{ detail: "Recruit not found." }, 404] });
    await show(<RecruitPage />);
    expect(await screen.findByText("Recruit not found.")).toBeTruthy();
  });
});
