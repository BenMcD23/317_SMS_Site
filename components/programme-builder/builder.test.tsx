// @vitest-environment jsdom
// The programme builder: staff see the bank, the grid and every control; NCOs
// read it and comment; comments, checks, suggestions and publishing call the
// API; an email's link opens its thread; and a failing API says so.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProgrammeBuilder } from "@/components/programme-builder/builder";
import type { BankItem, Person, Programme, Slot, Suggestion, Thread } from "@/lib/programme-builder";
import { renderWithQuery } from "@/tests/render-with-query";

const sessions = {
  staff: {
    data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
    status: "authenticated",
  },
  nco: {
    data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk" } },
    status: "authenticated",
  },
};
let session = sessions.staff;
vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
  usePathname: () => "/programme/2026-12",
}));

const slot = (over: Partial<Slot>): Slot => ({
  id: 1,
  night_id: 10,
  period: 1,
  flights: ["A"],
  title: "Drill",
  category: "drill",
  bank_item_id: null,
  room_id: 1,
  instructor: "Sgt Hughes",
  people: [],
  subject_key: null,
  part: null,
  notes: null,
  headcount: 8,
  open_comments: 0,
  ...over,
});

const THREAD: Thread = {
  id: 50,
  parent_id: null,
  night_id: 10,
  slot_id: 1,
  quote: "Mon 7 Dec · 1st half · A Flight: Drill",
  author: { name: "CI Sam Staff", key: "staff:3000", email: null },
  body: "@[Cpl Nina Corporal](cadet:1) can you take this?",
  mentions: [{ key: "cadet:1", name: "Cpl Nina Corporal" }],
  assignee: { key: "cadet:1", name: "Cpl Nina Corporal" },
  created_at: "2026-11-25T10:00:00",
  edited_at: null,
  resolved_at: null,
  resolved_by: null,
  can_edit: false,
  can_delete: true,
  replies: [
    {
      id: 51,
      parent_id: 50,
      night_id: 10,
      slot_id: 1,
      quote: null,
      author: { name: "Cpl Nina Corporal", key: "cadet:1", email: null },
      body: "Yes, happy to.",
      mentions: [],
      assignee: null,
      created_at: "2026-11-25T11:00:00",
      edited_at: null,
      resolved_at: null,
      resolved_by: null,
      can_edit: true,
      can_delete: true,
    },
  ],
};

function programme(over: Partial<Programme> = {}): Programme {
  return {
    month: "2026-12",
    name: "December 2026 programme",
    status: "draft",
    notes: null,
    can_edit: true,
    updated_at: "2026-11-25T12:00:00",
    updated_by: "Sam Staff",
    published_at: null,
    published_by: null,
    flights: [
      { key: "C", label: "C Flight (Probationary)", expected: 5 },
      { key: "A", label: "A Flight", expected: 8 },
      { key: "B", label: "B Flight", expected: 7 },
    ],
    rooms: [
      { id: 1, name: "Drill hall", capacity: 80, notes: null, position: 1, active: true },
      { id: 2, name: "Classroom 1", capacity: 20, notes: null, position: 2, active: true },
    ],
    nights: [
      {
        id: 10,
        date: "2026-12-07",
        uniform: "No.3 SD",
        duty_nco: "Cpl Ó Briain",
        notes: null,
        slots: [
          slot({
            open_comments: 1,
            people: [{ key: "staff:3001", name: "Sgt Sarah Hughes", kind: "staff" }],
          }),
          slot({
            id: 2,
            title: "Quiz night",
            period: null,
            flights: ["A", "B"],
            category: "social",
            room_id: 1,
          }),
        ],
      },
    ],
    issues: [
      {
        severity: "clash",
        code: "room_double_booked",
        message: "Drill hall has Drill and Quiz night in the 1st half on Mon 7 Dec",
        night_id: 10,
        slot_ids: [1, 2],
        fix: { slot_id: 2, room_id: 2, label: "Move Quiz night to Classroom 1" },
      },
      {
        severity: "info",
        code: "no_duty_nco",
        message: "No duty NCO on Mon 14 Dec",
        night_id: 11,
        slot_ids: [],
        fix: null,
      },
    ],
    comments: [THREAD],
    history: [
      {
        at: "2026-11-25T12:00:00",
        by: "Sam Staff",
        summary: "Added Drill for A Flight, 1st half, Mon 7 Dec",
      },
    ],
    ...over,
  };
}

const BANK: BankItem[] = [
  {
    id: 5,
    title: "Volleyball",
    category: "sport",
    whole_night: false,
    room_id: null,
    instructor: null,
    subject_key: null,
    part: null,
    notes: null,
    active: true,
    times_run: 4,
    last_run: "2026-10-05",
  },
];
const PEOPLE: Person[] = [
  {
    key: "staff:3001",
    name: "Sgt Sarah Hughes",
    kind: "staff",
    flight: null,
    mentionable: true,
    email: null,
    away: [],
  },
  {
    key: "cadet:1",
    name: "Cpl Nina Corporal",
    kind: "nco",
    flight: "A",
    mentionable: true,
    email: null,
    away: [],
  },
];
const SUGGESTIONS: Suggestion[] = [
  {
    night_id: 10,
    date: "2026-12-07",
    period: 2,
    flight: "C",
    options: [
      {
        kind: "bank",
        bank_item_id: 5,
        title: "Volleyball",
        category: "sport",
        room_id: null,
        score: 20,
        reason: "No sport for C Flight this month yet",
      },
    ],
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api({
  month = programme() as Programme | Response,
  write = (): Response => json(programme()),
} = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== "GET") return write();
    if (url.includes("/programme-builder/months/2026-12/suggestions")) return json(SUGGESTIONS);
    if (url.includes("/programme-builder/months/2026-12"))
      return month instanceof Response ? month : json(month);
    if (url.includes("/programme-builder/bank")) return json(BANK);
    if (url.includes("/programme-builder/people")) return json(PEOPLE);
    if (url.includes("/cadets/theory/lessons")) return json([]);
    return json({ detail: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function writes(fetchMock: ReturnType<typeof api>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => ({
      url: String(url).replace(/^https?:\/\/[^/]+/, ""),
      method: init!.method,
      body: init!.body ? JSON.parse(String(init!.body)) : undefined,
    }));
}

beforeEach(() => {
  session = sessions.staff;
  search = new URLSearchParams();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("ProgrammeBuilder for staff", () => {
  it("shows the month, its nights, sessions, the bank and the controls", async () => {
    api();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    expect(await screen.findByRole("heading", { name: "December 2026 programme" })).toBeInTheDocument();
    const night = screen.getByRole("region", { name: "Mon 7 Dec" });
    expect(within(night).getByText("No.3 SD · Duty NCO Cpl Ó Briain")).toBeInTheDocument();
    expect(within(night).getByRole("button", { name: "Drill (clash)" })).toBeInTheDocument();
    expect(within(night).getByRole("button", { name: "Quiz night (clash)" })).toBeInTheDocument();
    expect(within(night).getByRole("button", { name: "Comment on Drill, 1 open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/api/programme/2026-12/pdf");
    expect(await screen.findByRole("button", { name: "Place Volleyball" })).toBeInTheDocument();
  });

  it("offers the top suggestion in an empty cell and adds it in one tap", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Add Volleyball to C Flight, 2nd half, Mon 7 Dec: No sport for C Flight this month yet",
      })
    );
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toEqual({
      url: "/programme-builder/months/2026-12/slots",
      method: "POST",
      body: { night_id: 10, bank_item_id: 5, period: 2, flights: ["C"], room_id: null },
    });
    expect(toast.success).toHaveBeenCalledWith("Volleyball added.");
  });

  it("applies a check's fix and fills the gaps after asking", async () => {
    const fetchMock = api({ write: () => json({ filled: 1, programme: programme() }) });
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("button", { name: "Move Quiz night to Classroom 1" }));
    await waitFor(() =>
      expect(writes(fetchMock)[0]).toEqual({
        url: "/programme-builder/slots/2",
        method: "PATCH",
        body: { room_id: 2 },
      })
    );
    await user.click(await screen.findByRole("button", { name: "Fill the gaps" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes(fetchMock)[1].url).toBe("/programme-builder/months/2026-12/fill"));
  });

  it("opens a session to change it and saves only through the API", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("button", { name: "Drill (clash)" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Drill" });
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Squad Drill");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      url: "/programme-builder/slots/1",
      method: "PATCH",
      body: { title: "Squad Drill", night_id: 10, period: 1, flights: ["A"], people: ["staff:3001"] },
    });
  });

  it("won't save a session without a name and says what to do", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("button", { name: "Drill (clash)" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Drill" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Give the session a name")).toBeInTheDocument();
    expect(writes(fetchMock)).toHaveLength(0);
  });

  it("publishes to the website and the record, warning about clashes first", async () => {
    const fetchMock = api({ write: () => json({ programme: programme({ status: "published" }) }) });
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("1 clash")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Tell everyone" }));
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(writes(fetchMock)[0]).toEqual({
        url: "/programme-builder/months/2026-12/publish",
        method: "POST",
        body: { website: true, record: true, notify: true },
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Published. The website updates in a few minutes.");
  });

  it("leads with clashes and folds the notes away until asked", async () => {
    api();
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    expect(await screen.findByText(/Drill hall has Drill and Quiz night/)).toBeInTheDocument();
    expect(screen.queryByText("No duty NCO on Mon 14 Dec")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 1 note" }));
    expect(screen.getByText("No duty NCO on Mon 14 Dec")).toBeInTheDocument();
  });

  it("shows the API's own message when a change is refused", async () => {
    api({ write: () => json({ detail: "That room isn't in the list" }, 422) });
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("button", { name: "Move Quiz night to Classroom 1" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That room isn't in the list"));
  });
});

describe("ProgrammeBuilder for NCOs", () => {
  beforeEach(() => {
    session = sessions.nco;
  });

  it("reads the programme with no way to change it", async () => {
    api({ month: programme({ can_edit: false }) });
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    expect(await screen.findByRole("heading", { name: "December 2026 programme" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add a session/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change Mon/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Session bank")).not.toBeInTheDocument();
  });

  it("opens a session's details and comments on it with a mention", async () => {
    const fetchMock = api({ month: programme({ can_edit: false }) });
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("button", { name: "Drill (clash)" }));
    const details = await screen.findByRole("dialog", { name: "Drill" });
    expect(within(details).getByText("Sgt Hughes, Sgt Sarah Hughes")).toBeInTheDocument();
    await user.click(within(details).getByRole("button", { name: "Comment" }));
    const box = await screen.findByRole("combobox", { name: "Comment on Mon 7 Dec · 1st half · Drill" });
    await user.type(box, "@sarah");
    await user.keyboard("{Enter}");
    await user.type(box, "can I have the hall?");
    const composer = box.closest("div.flex.flex-col") as HTMLElement;
    await user.click(within(composer.parentElement!).getByRole("button", { name: "Comment" }));
    await waitFor(() =>
      expect(writes(fetchMock)[0]).toEqual({
        url: "/programme-builder/months/2026-12/comments",
        method: "POST",
        body: { body: "@[Sgt Sarah Hughes](staff:3001) can I have the hall?", assign: false, slot_id: 1 },
      })
    );
  });

  it("resolves a thread and replies to one", async () => {
    const fetchMock = api({ month: programme({ can_edit: false }) });
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    await user.click(await screen.findByRole("tab", { name: /Comments/ }));
    const thread = await screen.findByRole("listitem", { name: "Comment by CI Sam Staff" });
    expect(within(thread).getByText("Assigned to Cpl Nina Corporal")).toBeInTheDocument();
    expect(within(thread).getByText("@Cpl Nina Corporal")).toBeInTheDocument();
    await user.click(within(thread).getByRole("button", { name: "Reply" }));
    await user.type(within(thread).getByRole("combobox", { name: "Reply to CI Sam Staff" }), "Done");
    await user.click(within(thread).getByRole("button", { name: "Reply" }));
    await user.click(within(thread).getByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2));
    expect(writes(fetchMock).map((w) => [w.method, w.url, w.body])).toEqual([
      ["POST", "/programme-builder/months/2026-12/comments", { body: "Done", parent_id: 50 }],
      ["POST", "/programme-builder/comments/50/resolve", undefined],
    ]);
  });

  it("opens straight on the thread an email linked to, with its reply box ready", async () => {
    search = new URLSearchParams("comment=50&reply=1");
    api({ month: programme({ can_edit: false }) });
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    const thread = await screen.findByRole("listitem", { name: "Comment by CI Sam Staff" });
    expect(thread.className).toContain("ring-2");
    expect(within(thread).getByRole("combobox", { name: "Reply to CI Sam Staff" })).toHaveFocus();
  });
});

describe("ProgrammeBuilder when the API fails", () => {
  it("says it couldn't load and offers the way back", async () => {
    api({ month: json({ detail: "There's no programme for that month yet" }, 404) });
    const user = userEvent.setup();
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    expect(await screen.findByText("There's no programme for that month yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to programmes" }));
    expect(router.push).toHaveBeenCalledWith("/programme");
  });

  it("copes with a server error body where a programme was expected", async () => {
    api({ month: json({ detail: "Internal Server Error" }, 500) });
    renderWithQuery(<ProgrammeBuilder month="2026-12" />);
    expect(await screen.findByText("Internal Server Error")).toBeInTheDocument();
  });
});
