// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeavingProcessCard } from "@/components/oc/leaving-process-card";
import { ParentEmailsCard } from "@/components/oc/parent-emails-card";
import type { LeavingCadet } from "@/lib/leaving";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "oc@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const cadet = (over: Partial<LeavingCadet> = {}): LeavingCadet => ({
  cin: 1,
  name: "Gone Away",
  rank: "Cdt",
  flight: "B",
  parentEmails: ["mum@x.co", "dad@x.co"],
  lastAttended: "2026-08-03T00:00:00",
  gapDays: 63,
  weeksAbsent: 9,
  status: "flagged",
  daysLeft: null,
  returned: false,
  notifiedAt: null,
  notifiedBy: null,
  adjRequestedAt: null,
  ...over,
});

type Routes = Record<string, [unknown, number?]>;
// Keys are "METHOD /path"; the first match wins.
function stubApi(routes: Routes) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const hit = Object.entries(routes).find(([key]) => {
      const [m, path] = key.split(" ");
      return m === method && String(url).endsWith(path);
    });
    const [body, status] = hit?.[1] ?? [{ detail: "not stubbed" }, 404];
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(body), { status: status ?? 200 })
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const called = (fetch: ReturnType<typeof stubApi>, method: string, path: string) =>
  fetch.mock.calls.some(([url, init]) => (init?.method ?? "GET") === method && String(url).endsWith(path));

async function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
  for (let i = 0; i < 4; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

const leaving = (cadets: LeavingCadet[], adjutantConfigured = true) => ({
  "GET /leaving-process": [{ currentParadeNight: "2026-10-05T00:00:00", adjutantConfigured, cadets }] as [
    unknown,
  ],
});

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe("LeavingProcessCard", () => {
  it("lists lapsed cadets with weeks absent and what's next", async () => {
    stubApi(leaving([cadet(), cadet({ cin: 2, name: "Other One", status: "waiting", daysLeft: 6 })]));
    await show(<LeavingProcessCard />);
    expect(screen.getByRole("button", { name: "Gone Away" })).toBeTruthy();
    expect(screen.getAllByText("9 wks")).toHaveLength(2);
    expect(screen.getByText("Parents not contacted")).toBeTruthy();
    expect(screen.getByText("6 days left")).toBeTruthy();
  });

  it("says so when nobody has missed eight weeks", async () => {
    stubApi(leaving([]));
    await show(<LeavingProcessCard />);
    expect(screen.getByText(/Nobody has missed eight weeks/)).toBeTruthy();
  });

  it("an error body shows a message instead of crashing", async () => {
    stubApi({ "GET /leaving-process": [{ detail: "OC access required" }, 403] });
    await show(<LeavingProcessCard />);
    expect(screen.getByText("OC access required")).toBeTruthy();
  });

  it("copies the parents' addresses as a semicolon list", async () => {
    stubApi(leaving([cadet()]));
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy parent emails" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("mum@x.co;dad@x.co"));
    expect(toast.success).toHaveBeenCalledWith("Copied parent emails");
  });

  it("a blocked clipboard is a toast, not a crash", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    stubApi(leaving([cadet()]));
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy parent emails" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("a cadet with no parent email can't be copied and says where to add one", async () => {
    stubApi(leaving([cadet({ parentEmails: [] })]));
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    expect((screen.getByRole("button", { name: "Copy parent emails" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText(/No parent email on file/)).toBeTruthy();
    // The usual fix is Bader's next of kin, which the cadet scraper reads.
    expect(screen.getByText(/next of kin on Bader and run the Cadet Records Scraper/)).toBeTruthy();
  });

  it("marks the parents notified, and removal stays locked while the notice runs", async () => {
    const fetch = stubApi({ ...leaving([cadet()]), "POST /leaving-process/1/notified": [{ ok: true }] });
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    expect((screen.getByRole("button", { name: "Request removal" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.click(screen.getByRole("button", { name: /I've sent it/ }));
    await waitFor(() => expect(called(fetch, "POST", "/leaving-process/1/notified")).toBe(true));
    expect(toast.success).toHaveBeenCalled();
  });

  it("a refused notify shows the API's message", async () => {
    stubApi({
      ...leaving([cadet()]),
      "POST /leaving-process/1/notified": [{ detail: "already notified" }, 409],
    });
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    fireEvent.click(screen.getByRole("button", { name: /I've sent it/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("already notified"));
  });

  it("requests removal from the adjutant only after confirming, once notice is up", async () => {
    const ready = cadet({ status: "start_leaving", daysLeft: 0, notifiedAt: "2026-09-20T00:00:00" });
    const fetch = stubApi({ ...leaving([ready]), "POST /leaving-process/1/request-adj": [{ ok: true }] });
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    fireEvent.click(screen.getByRole("button", { name: "Request removal" }));
    expect(called(fetch, "POST", "/leaving-process/1/request-adj")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(called(fetch, "POST", "/leaving-process/1/request-adj")).toBe(true));
    expect(toast.success).toHaveBeenCalledWith("Adjutant emailed");
  });

  it("without an adjutant address configured the request button is disabled and explains why", async () => {
    const ready = cadet({ status: "start_leaving", daysLeft: 0, notifiedAt: "2026-09-20T00:00:00" });
    stubApi(leaving([ready], false));
    await show(<LeavingProcessCard />);
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    expect((screen.getByRole("button", { name: "Request removal" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText(/No adjutant email is configured/)).toBeTruthy();
  });

  it("a cadet who came back offers cancel and no removal", async () => {
    const back = cadet({ returned: true, status: "start_leaving", notifiedAt: "2026-09-20T00:00:00" });
    stubApi(leaving([back]));
    await show(<LeavingProcessCard />);
    expect(screen.getByText("Back on parade")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gone Away" }));
    expect((screen.getByRole("button", { name: "Request removal" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByRole("button", { name: "Cancel process" })).toBeTruthy();
  });

  it("an already-requested cadet shows when the adjutant was asked", async () => {
    stubApi(
      leaving([
        cadet({
          status: "start_leaving",
          notifiedAt: "2026-09-01T00:00:00",
          adjRequestedAt: "2026-10-01T00:00:00",
        }),
      ])
    );
    await show(<LeavingProcessCard />);
    expect(screen.getByText("Adjutant asked")).toBeTruthy();
  });
});

const PARENTS = {
  bcc: "mum@x.co;dad@x.co",
  count: 2,
  missing: 1,
  cadets: [
    { cin: 1, name: "Gone Away", flight: "B", parentEmails: ["mum@x.co", "dad@x.co"] },
    { cin: 2, name: "No Parents", flight: null, parentEmails: [] },
  ],
};

describe("ParentEmailsCard", () => {
  it("shows the BCC string, copies it, and counts cadets with none", async () => {
    stubApi({ "GET /oc/parent-emails": [PARENTS] });
    await show(<ParentEmailsCard />);
    expect(
      (screen.getByLabelText("Parent emails, separated by semicolons") as HTMLTextAreaElement).value
    ).toBe("mum@x.co;dad@x.co");
    expect(screen.getByText("1 cadet has no parent email")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("mum@x.co;dad@x.co"));
  });

  it("with no addresses on file the copy button is disabled", async () => {
    stubApi({ "GET /oc/parent-emails": [{ bcc: "", count: 0, missing: 2, cadets: [] }] });
    await show(<ParentEmailsCard />);
    expect((screen.getByRole("button", { name: "Copy all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an error body shows a message instead of crashing", async () => {
    stubApi({ "GET /oc/parent-emails": [{ detail: "OC access required" }, 403] });
    await show(<ParentEmailsCard />);
    expect(screen.getByText("OC access required")).toBeTruthy();
  });

  it("saves one cadet's addresses and surfaces the API's complaint about a typo", async () => {
    const fetch = stubApi({
      "GET /oc/parent-emails": [PARENTS],
      "PUT /oc/parent-emails/2": [{ cin: 2, parentEmails: ["new@x.co"] }],
      "PUT /oc/parent-emails/1": [{ detail: "'nope' is not an email address" }, 400],
    });
    await show(<ParentEmailsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Edit emails" }));

    fireEvent.change(screen.getByLabelText("Parent emails for No Parents"), {
      target: { value: "new@x.co" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save No Parents" }));
    await waitFor(() => expect(called(fetch, "PUT", "/oc/parent-emails/2")).toBe(true));
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ emails: "new@x.co" });

    fireEvent.change(screen.getByLabelText("Parent emails for Gone Away"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Gone Away" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("'nope' is not an email address"));
  });

  it("Save stays disabled until a row is changed", async () => {
    stubApi({ "GET /oc/parent-emails": [PARENTS] });
    await show(<ParentEmailsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Edit emails" }));
    expect((screen.getByRole("button", { name: "Save Gone Away" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
