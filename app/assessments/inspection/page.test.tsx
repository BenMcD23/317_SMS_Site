// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = {
  data: { id_token: "tok", role: "snco", user: { email: "snco@317atc.co.uk", name: "Dev SNCO" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/assessments/inspection",
}));

import InspectionPage from "@/app/assessments/inspection/page";
import { renderWithQuery } from "@/tests/render-with-query";

const LOCAL_KEY = "assessment_draft_inspection_snco@317atc.co.uk";
const CADETS = [
  { cin: 101, first_name: "Zoë", last_name: "Ünal", rank: "Cpl", flight: "A" },
  { cin: 102, first_name: "Ben", last_name: "Baker", rank: null, flight: "A" },
];

const PAST_COMMENTS = [
  { region: "Shoes", type: "fault", text: "Uppers", count: 5 },
  { region: "Shoes", type: "positive", text: "Well bulled", count: 1 },
  { region: "Trousers", type: "fault", text: "Press", count: 3 },
];

type Draft = { status: number; body?: unknown } | "offline";

/** Fake API. `draft` is what GET /assessment-drafts/inspection answers; `save` what a PUT
 *  answers. Every call is recorded so tests can check what was sent. */
function api({ draft = { status: 404 } as Draft, save = { status: 200 } as Draft } = {}) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    if (path === "/assessment-drafts/inspection") {
      const answer = method === "GET" ? draft : method === "PUT" ? save : { status: 200 };
      if (answer === "offline") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
    }
    if (path === "/cadets") return new Response(JSON.stringify(CADETS));
    if (path === "/inspections/comments") return new Response(JSON.stringify(PAST_COMMENTS));
    return new Response(JSON.stringify([]));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function calls(fetch: ReturnType<typeof api>, method: string) {
  return fetch.mock.calls.filter(
    ([url, init]) =>
      new URL(url).pathname === "/assessment-drafts/inspection" && (init?.method ?? "GET") === method
  );
}

async function recordCadet(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("combobox", { name: /Search cadet/ }));
  await user.click(await screen.findByRole("option", { name }));
  await user.click(screen.getByRole("button", { name: "Submit cadet" }));
  return user;
}

async function recordedList() {
  return (await screen.findByText(/^Recorded \(/)).nextElementSibling as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  // cmdk measures with ResizeObserver and scrolls items into view.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});

describe("inspection sheet: saving to the server", () => {
  it("recording a cadet saves the whole sheet to the server", async () => {
    const fetch = api();
    renderWithQuery(<InspectionPage />);
    await recordCadet(/Zoë Ünal/);

    await waitFor(() => expect(calls(fetch, "PUT")).toHaveLength(1));
    const sent = JSON.parse(String(calls(fetch, "PUT")[0][1]!.body));
    expect(Object.keys(sent.data.marks)).toEqual(["101"]);
    expect(sent.data.order).toEqual([101]);
    expect(sent.saved_at).toEqual(expect.any(String));
    expect(await screen.findByText(/^Saved to the server at \d\d:\d\d$/)).toBeInTheDocument();
  });

  it("each cadet saves again, so a failed save is made good by the next", async () => {
    const fetch = api();
    renderWithQuery(<InspectionPage />);
    await recordCadet(/Zoë Ünal/);
    await recordCadet(/Ben Baker/);

    await waitFor(() => expect(calls(fetch, "PUT")).toHaveLength(2));
    const second = JSON.parse(String(calls(fetch, "PUT")[1][1]!.body));
    expect(Object.keys(second.data.marks).sort()).toEqual(["101", "102"]);
    expect(second.data.order).toEqual([102, 101]);
  });

  it.each([
    ["the server refuses it", { status: 500 }],
    ["there's no signal", "offline"],
  ] as [string, Draft][])(
    "when %s, it says the sheet is on this phone only and keeps it there",
    async (_, save) => {
      api({ save });
      renderWithQuery(<InspectionPage />);
      await recordCadet(/Zoë Ünal/);

      expect(await screen.findByText(/Saved on this phone only/)).toBeInTheDocument();
      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}").marks).toHaveProperty("101")
      );
    }
  );

  it("removing a cadet saves the sheet without them", async () => {
    const fetch = api();
    renderWithQuery(<InspectionPage />);
    let user = await recordCadet(/Zoë Ünal/);
    user = await recordCadet(/Ben Baker/);
    await user.click(screen.getByRole("button", { name: "Remove Zoë Ünal" }));

    await waitFor(() => expect(calls(fetch, "PUT")).toHaveLength(3));
    expect(Object.keys(JSON.parse(String(calls(fetch, "PUT")[2][1]!.body)).data.marks)).toEqual(["102"]);
  });

  it("removing the last cadet clears the server's copy rather than saving an empty sheet", async () => {
    // An empty sheet left on the server would only come back as nothing.
    const fetch = api();
    renderWithQuery(<InspectionPage />);
    const user = await recordCadet(/Zoë Ünal/);
    await user.click(screen.getByRole("button", { name: "Remove Zoë Ünal" }));

    await waitFor(() => expect(calls(fetch, "DELETE")).toHaveLength(1));
    expect(calls(fetch, "PUT")).toHaveLength(1);
  });

  it("clearing the draft clears the server's copy too", async () => {
    const fetch = api();
    renderWithQuery(<InspectionPage />);
    const user = await recordCadet(/Zoë Ünal/);
    await user.click(screen.getByRole("button", { name: /Clear draft/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Clear draft" })
    );

    await waitFor(() => expect(calls(fetch, "DELETE")).toHaveLength(1));
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it("a clear the server didn't get is sent again next time, instead of the sheet coming back", async () => {
    const fetch = api();
    fetch.mockImplementation(async (url, init) => {
      const path = new URL(url).pathname;
      if (path === "/assessment-drafts/inspection" && init?.method === "DELETE")
        throw new TypeError("offline");
      if (path === "/assessment-drafts/inspection" && (init?.method ?? "GET") === "GET")
        return new Response("{}", { status: 404 });
      if (path === "/cadets") return new Response(JSON.stringify(CADETS));
      if (path === "/inspections/comments") return new Response(JSON.stringify(PAST_COMMENTS));
      return new Response("[]");
    });
    const first = renderWithQuery(<InspectionPage />);
    const user = await recordCadet(/Zoë Ünal/);
    await user.click(screen.getByRole("button", { name: /Clear draft/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Clear draft" })
    );
    await waitFor(() => expect(localStorage.getItem(`${LOCAL_KEY}:clear_pending`)).toBe("1"));
    first.unmount();

    // Next visit, with signal: the clear goes first and nothing is restored.
    const again = api({ draft: { status: 200, body: { data: { date: "2026-11-04", marks: { 101: {} } } } } });
    renderWithQuery(<InspectionPage />);
    await waitFor(() => expect(calls(again, "DELETE")).toHaveLength(1));
    expect(calls(again, "GET")).toHaveLength(0);
    expect(screen.queryByText(/^Restored/)).not.toBeInTheDocument();
  });
});

describe("inspection sheet: restoring after a reload", () => {
  const serverSheet = {
    date: "2026-11-04",
    uniform: "blues",
    marks: { 101: { score: "8", comments: [], absent: null } },
    order: [101],
  };
  const SERVER_SAVED_AT = "2026-11-04T19:40:00.000Z";

  it("a phone with nothing saved gets the server's sheet back", async () => {
    api({ draft: { status: 200, body: { data: serverSheet, saved_at: SERVER_SAVED_AT, updated_at: "x" } } });
    renderWithQuery(<InspectionPage />);

    expect(await screen.findByText("Restored your marking session from the server.")).toBeInTheDocument();
    expect(within(await recordedList()).getByText(/Zoë Ünal/)).toBeInTheDocument();
    expect(within(await recordedList()).getByText("8/10")).toBeInTheDocument();
  });

  it("a newer sheet on the phone is kept over an older one on the server", async () => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        ...serverSheet,
        marks: { 102: { score: "6", comments: [] } },
        order: [102],
      })
    );
    localStorage.setItem(`${LOCAL_KEY}:saved_at`, "2026-11-04T19:50:00.000Z");
    const fetch = api({
      draft: { status: 200, body: { data: serverSheet, saved_at: SERVER_SAVED_AT, updated_at: "x" } },
    });
    renderWithQuery(<InspectionPage />);

    await waitFor(() => expect(calls(fetch, "GET")).toHaveLength(1));
    expect(await screen.findByText("Restored your unsaved marking session.")).toBeInTheDocument();
    expect(within(await recordedList()).getByText(/Ben Baker/)).toBeInTheDocument();
    expect(within(await recordedList()).queryByText(/Zoë Ünal/)).not.toBeInTheDocument();
  });

  it.each([
    ["errors", { status: 500 }],
    ["can't be reached", "offline"],
  ] as [string, Draft][])("when the server %s, the phone's own sheet still comes back", async (_, draft) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(serverSheet));
    api({ draft });
    renderWithQuery(<InspectionPage />);

    expect(await screen.findByText("Restored your unsaved marking session.")).toBeInTheDocument();
    expect(within(await recordedList()).getByText(/Zoë Ünal/)).toBeInTheDocument();
  });

  it("nothing saved anywhere starts an empty sheet", async () => {
    api();
    renderWithQuery(<InspectionPage />);
    expect(await screen.findByText("Search for a cadet above to start marking.")).toBeInTheDocument();
    expect(screen.queryByText(/^Restored/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Recorded \(/)).not.toBeInTheDocument();
  });
});

describe("inspection sheet: comment quick picks", () => {
  async function openRegion(user: ReturnType<typeof userEvent.setup>, cadet: RegExp, region: string) {
    await user.click(await screen.findByRole("combobox", { name: /Search cadet/ }));
    await user.click(await screen.findByRole("option", { name: cadet }));
    await user.click(screen.getByTitle(region));
    return screen.findByRole("dialog");
  }

  it("offers the region's past faults and adds one with a tap", async () => {
    api();
    renderWithQuery(<InspectionPage />);
    const user = userEvent.setup();
    const pop = await openRegion(user, /Zoë Ünal/, "Shoes");

    const picks = await within(pop).findByRole("group", { name: "Quick picks" });
    expect(
      within(picks)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["Uppers"]);
    await user.click(within(picks).getByRole("button", { name: "Uppers" }));

    // Now on the cadet, so it leaves the picks.
    expect(within(pop).getByText("Uppers").closest("li")).not.toBeNull();
    expect(within(pop).queryByRole("group", { name: "Quick picks" })).toBeNull();

    // Positive shows the praise instead.
    await user.click(within(pop).getByRole("radio", { name: /Positive/ }));
    expect(within(pop).getByRole("button", { name: "Well bulled" })).toBeInTheDocument();
  });

  it("a comment typed for one cadet is a pick for the next before the sheet is sent", async () => {
    api();
    renderWithQuery(<InspectionPage />);
    const user = userEvent.setup();
    let pop = await openRegion(user, /Zoë Ünal/, "Shoes");
    await user.type(within(pop).getByRole("textbox"), "Scuffed toecaps");
    await user.click(within(pop).getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Submit cadet" }));

    pop = await openRegion(user, /Ben Baker/, "Shoes");
    await user.type(within(pop).getByRole("textbox"), "scuff");
    const picks = within(pop).getByRole("group", { name: "Quick picks" });
    expect(
      within(picks)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["Scuffed toecaps"]);
  });
});
