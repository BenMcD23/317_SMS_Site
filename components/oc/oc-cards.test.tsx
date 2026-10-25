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

const NO_SAVED_EMAIL: [unknown] = [{ subject: null, body: null }];

describe("ParentEmailsCard", () => {
  it("lists only flagged cadets, not everyone on file or those already contacted", async () => {
    stubApi({
      ...leaving([
        cadet({ cin: 1, name: "Gone Away", parentEmails: ["mum@x.co", "dad@x.co"] }),
        cadet({ cin: 2, name: "Already Told", status: "waiting", parentEmails: ["told@x.co"] }),
        cadet({ cin: 3, name: "Came Back", returned: true, parentEmails: ["back@x.co"] }),
        cadet({ cin: 4, name: "Ready Out", status: "start_leaving", parentEmails: ["out@x.co"] }),
      ]),
      "GET /oc/leaving-email": NO_SAVED_EMAIL,
    });
    await show(<ParentEmailsCard />);
    expect(screen.getByText("Gone Away")).toBeTruthy();
    expect(screen.getByText("mum@x.co;dad@x.co")).toBeTruthy();
    for (const other of ["Already Told", "Came Back", "Ready Out"])
      expect(screen.queryByText(other)).toBeNull();
  });

  it("Open in Gmail goes to the OC's account with this cadet's parents and name filled in", async () => {
    stubApi({ ...leaving([cadet({ name: "Zoë Ó Briain" })]), "GET /oc/leaving-email": NO_SAVED_EMAIL });
    await show(<ParentEmailsCard />);
    const link = screen.getByRole("link", { name: "Open email to Zoë Ó Briain's parents in Gmail" });
    const url = new URL(link.getAttribute("href")!);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("authuser")).toBe("oc@317atc.co.uk");
    expect(url.searchParams.get("bcc")).toBe("mum@x.co,dad@x.co");
    expect(url.searchParams.get("su")).toContain("Zoë Ó Briain");
    expect(url.searchParams.get("body")).toContain("Zoë Ó Briain hasn't been on parade for around 9 weeks");
    expect(url.searchParams.get("body")).not.toContain("{{");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("uses the OC's saved message, with the cadet's name put in", async () => {
    stubApi({
      ...leaving([cadet({ name: "Gone Away" })]),
      "GET /oc/leaving-email": [{ subject: "About {{cadet_name}}", body: "Hello, re {{ cadet_name }}." }],
    });
    await show(<ParentEmailsCard />);
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
      "Hello, re {{ cadet_name }}."
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy message for Gone Away" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Subject: About Gone Away\n\nHello, re Gone Away.")
    );
  });

  it("saves an edited message to the API", async () => {
    const fetch = stubApi({
      ...leaving([cadet()]),
      "GET /oc/leaving-email": NO_SAVED_EMAIL,
      "PUT /oc/leaving-email": [{ subject: "S", body: "B {{ cadet_name }}" }],
    });
    await show(<ParentEmailsCard />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "S" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "B {{ cadet_name }}" } });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(called(fetch, "PUT", "/oc/leaving-email")).toBe(true));
    const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ subject: "S", body: "B {{ cadet_name }}" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved your message"));
  });

  it("a failed save says so and a blank message can't be saved", async () => {
    stubApi({
      ...leaving([cadet()]),
      "GET /oc/leaving-email": NO_SAVED_EMAIL,
      "PUT /oc/leaving-email": [{ detail: "Message too long" }, 422],
    });
    await show(<ParentEmailsCard />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "  " } });
    expect((screen.getByRole("button", { name: "Save message" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Message too long"));
  });

  it("resets to the standard message only after confirming", async () => {
    const fetch = stubApi({
      ...leaving([cadet()]),
      "GET /oc/leaving-email": [{ subject: "S", body: "Mine" }],
      "DELETE /oc/leaving-email": [{ subject: null, body: null }],
    });
    await show(<ParentEmailsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Use standard message" }));
    expect(called(fetch, "DELETE", "/oc/leaving-email")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: /confirm|yes|continue|ok/i }));
    await waitFor(() => expect(called(fetch, "DELETE", "/oc/leaving-email")).toBe(true));
  });

  it("if the saved message can't be loaded it says so and still offers the standard one", async () => {
    stubApi({ ...leaving([cadet()]), "GET /oc/leaving-email": [{ detail: "Database down" }, 500] });
    await show(<ParentEmailsCard />);
    expect(screen.getByText(/Database down/)).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toContain("{{ cadet_name }}");
    expect(screen.getByRole("link", { name: /Open email to Gone Away/ })).toBeTruthy();
  });

  it("copies every flagged cadet's parents once, and counts cadets with none", async () => {
    stubApi({
      ...leaving([
        cadet({ cin: 1, name: "A One", parentEmails: ["mum@x.co", "dad@x.co"] }),
        cadet({ cin: 2, name: "B Two", parentEmails: ["MUM@x.co"] }),
        cadet({ cin: 3, name: "No Parents", parentEmails: [] }),
      ]),
      "GET /oc/leaving-email": NO_SAVED_EMAIL,
    });
    await show(<ParentEmailsCard />);
    expect(screen.getByText("1 cadet has no parent email")).toBeTruthy();
    // No address, nothing to open or copy for that cadet.
    expect(screen.queryByRole("link", { name: /No Parents/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy all parent emails" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("mum@x.co;dad@x.co"));
  });

  it("with nobody flagged it says so instead of offering to send", async () => {
    stubApi({ ...leaving([]), "GET /oc/leaving-email": NO_SAVED_EMAIL });
    await show(<ParentEmailsCard />);
    expect(screen.getByText(/Nobody is waiting to be contacted/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy all parent emails" })).toBeNull();
  });

  it("an error body shows a message instead of crashing", async () => {
    stubApi({ "GET /leaving-process": [{ detail: "OC access required" }, 403] });
    await show(<ParentEmailsCard />);
    expect(screen.getByText("OC access required")).toBeTruthy();
  });

  it("saves one cadet's addresses and surfaces the API's complaint about a typo", async () => {
    const fetch = stubApi({
      ...leaving([
        cadet({ cin: 1, name: "Gone Away" }),
        cadet({ cin: 2, name: "No Parents", flight: null, parentEmails: [] }),
      ]),
      "GET /oc/leaving-email": NO_SAVED_EMAIL,
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
    stubApi({ ...leaving([cadet()]), "GET /oc/leaving-email": NO_SAVED_EMAIL });
    await show(<ParentEmailsCard />);
    fireEvent.click(screen.getByRole("button", { name: "Edit emails" }));
    expect((screen.getByRole("button", { name: "Save Gone Away" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
