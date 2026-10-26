// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FlyingPaperworkPage from "@/app/cadets/flying/page";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const cadet = (
  cin: number,
  first: string,
  last: string,
  ticks: Partial<Record<string, boolean>> = {},
  onEvent = true
) => ({
  cin,
  first_name: first,
  last_name: last,
  rank: "Cdt",
  flight: "A",
  on_event: onEvent,
  updated_at: null,
  updated_by: null,
  tg21: false,
  tg23: false,
  av_med: false,
  ...ticks,
});

const EVENTS = [
  {
    id: 1,
    bader_event_id: "100",
    title: "11 AEF Flying Day",
    category: "RAFAC Air Experience Flying (AEF)",
    date_from: "2026-11-01T08:00:00",
    date_to: "2026-11-01T17:00:00",
    on_bader: true,
    has_ticks: true,
    cadets: [
      cadet(1, "Amy", "Able", { tg21: true, tg23: true, av_med: true }),
      cadet(2, "Bob", "Baker"),
      cadet(3, "Cat", "Cole", { tg21: true }, false),
    ],
  },
  {
    id: 2,
    bader_event_id: "200",
    title: "632 VGS Gliding",
    category: "RAFAC Gliding",
    date_from: null,
    date_to: null,
    on_bader: false,
    has_ticks: false,
    cadets: [],
  },
];

type Reply = (url: string, init?: RequestInit) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubApi(reply: Reply) {
  // A fresh Response per call — a body can only be read once.
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(reply(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const listThen =
  (write: Reply): Reply =>
  (url, init) =>
    !init?.method || init.method === "GET" ? json(EVENTS) : write(url, init);

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("Flying paperwork page", () => {
  it("lists each event with its cadets, what's ticked and how many are done", async () => {
    stubApi(listThen(() => json({})));
    renderWithQuery(<FlyingPaperworkPage />);

    const aef = (await screen.findByText("11 AEF Flying Day")).closest("[data-slot=card]") as HTMLElement;
    expect(within(aef).getByText("AEF")).toBeTruthy();
    expect(within(aef).getByText("1 Nov 2026")).toBeTruthy();
    // Cat has left the event, so only Amy and Bob count — and Amy's done.
    expect(within(aef).getByText("1/2 complete")).toBeTruthy();
    expect(within(aef).getByText(/No longer on the event/)).toBeTruthy();
    expect(
      within(aef).getByRole("checkbox", { name: "AV Med for Amy Able" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(
      within(aef).getByRole("checkbox", { name: "TG 21 for Bob Baker" }).getAttribute("aria-checked")
    ).toBe("false");

    const gliding = screen.getByText("632 VGS Gliding").closest("[data-slot=card]") as HTMLElement;
    expect(within(gliding).getByText("Gliding")).toBeTruthy();
    expect(within(gliding).getByText("No longer on Bader")).toBeTruthy();
    expect(within(gliding).getByText("No date")).toBeTruthy();
    expect(within(gliding).getByText("No matched cadets on this event.")).toBeTruthy();
  });

  it("ticking a form saves just that form for that cadet", async () => {
    const fetchMock = stubApi(listThen(() => json(cadet(2, "Bob", "Baker", { tg23: true }))));
    renderWithQuery(<FlyingPaperworkPage />);

    const box = await screen.findByRole("checkbox", { name: "TG 23 for Bob Baker" });
    await userEvent.click(box);

    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toMatch(/\/flying-paperwork\/1\/cadets\/2$/);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ tg23: true });
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
  });

  it("a failed save puts the tick back and says why", async () => {
    stubApi(listThen(() => json({ detail: "That cadet isn't on this flying event" }, 404)));
    renderWithQuery(<FlyingPaperworkPage />);

    const box = await screen.findByRole("checkbox", { name: "TG 21 for Bob Baker" });
    await userEvent.click(box);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That cadet isn't on this flying event"));
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("closing asks first, then deletes the event and drops its card", async () => {
    const fetchMock = stubApi(listThen(() => json({ ok: true })));
    renderWithQuery(<FlyingPaperworkPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Close 11 AEF Flying Day" }));
    // Still on Bader, so the confirm warns it'll be picked up again.
    expect(screen.getByText(/next event scrape will start tracking it again/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByText("11 AEF Flying Day")).toBeNull());
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toMatch(/\/flying-paperwork\/1$/);
    expect(init?.method).toBe("DELETE");
    expect(toast.success).toHaveBeenCalledWith("Closed 11 AEF Flying Day");
  });

  it("a failed close keeps the card", async () => {
    stubApi(listThen(() => json({ detail: "Flying event not found" }, 404)));
    renderWithQuery(<FlyingPaperworkPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Close 632 VGS Gliding" }));
    expect(screen.queryByText(/start tracking it again/)).toBeNull(); // already off Bader
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Flying event not found"));
    expect(screen.getByText("632 VGS Gliding")).toBeTruthy();
  });

  it("no flying events shows how they get here", async () => {
    stubApi(() => json([]));
    renderWithQuery(<FlyingPaperworkPage />);
    expect(await screen.findByText("No flying events")).toBeTruthy();
  });

  it("an error body shows the error instead of crashing", async () => {
    stubApi(() => json({ detail: "Staff access required" }, 403));
    renderWithQuery(<FlyingPaperworkPage />);
    expect(await screen.findByText("Could not load flying paperwork")).toBeTruthy();
    // ...and not "no flying events", which would read as everything being done.
    expect(screen.queryByText("No flying events")).toBeNull();
  });
});
