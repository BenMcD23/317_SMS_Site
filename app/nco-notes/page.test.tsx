// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/tests/render-with-query";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const SESSION = vi.hoisted(() => ({
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ cin: "1" }) }));

import NcoNotesPage from "@/app/nco-notes/page";
import NcoNotesProfilePage from "@/app/nco-notes/[cin]/page";
import { API_BASE } from "@/lib/config";
import type { NcoNote } from "@/lib/nco-notes";

function note(overrides: Partial<NcoNote>): NcoNote {
  return {
    id: 1,
    cadet_cin: 1,
    cadet_name: "Cpl Amy Able",
    body: "Sharp on drill",
    note_date: "2026-11-04T00:00:00",
    source: "typed",
    author_name: "Sam Staff",
    is_mine: true,
    can_edit: true,
    can_delete: true,
    appraisal_id: null,
    appraisal_date: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

const OVERVIEW = {
  ncos: [
    {
      cin: 1,
      name: "Cpl Amy Able",
      rank: "Cpl",
      first_name: "Amy",
      last_name: "Able",
      flight: "A",
      open_notes: 2,
      last_note_date: "2026-11-04T00:00:00",
      last_appraisal_date: null,
    },
    {
      cin: 2,
      name: "Sgt Ben Baker",
      rank: "Sgt",
      first_name: "Ben",
      last_name: "Baker",
      flight: "B",
      open_notes: 0,
      last_note_date: null,
      last_appraisal_date: null,
    },
  ],
  recent: [
    note({ id: 1, source: "voice", updated_at: "2026-11-05T10:00:00" }),
    note({
      id: 2,
      cadet_cin: 2,
      cadet_name: "Sgt Ben Baker",
      body: "Quiet with his section",
      author_name: "Sarah Hughes",
      is_mine: false,
      can_edit: false,
      can_delete: false,
    }),
    note({ id: 3, cadet_cin: null, cadet_name: "Cpl Old Leaver", body: "Gone now" }),
  ],
  voice_available: true,
};

const PROFILE = {
  nco: { cin: 1, name: "Cpl Amy Able", rank: "Cpl", first_name: "Amy", last_name: "Able", flight: "A" },
  notes: [
    note({ id: 1, body: "Waiting one" }),
    note({
      id: 4,
      body: "Used one",
      appraisal_id: 7,
      appraisal_date: "2026-06-01T00:00:00",
      can_edit: false,
    }),
  ],
  open_notes: 1,
  appraisals: [{ id: 7, appraisal_date: "2026-06-01T00:00:00", next_review_date: "2026-12-01T00:00:00" }],
  next_review_date: "2026-12-01T00:00:00",
};

let routes: Record<string, () => Response>;
let calls: { path: string; method: string; body: unknown }[];

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  calls = [];
  routes = { "GET /nco-notes": json(OVERVIEW), "GET /nco-notes/ncos/1": json(PROFILE) };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API_BASE, "");
      const method = init.method ?? "GET";
      calls.push({ path, method, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
      return (routes[`${method} ${path}`] ?? json({ ok: true }))();
    })
  );
});

describe("NCO notes overview", () => {
  it("lists each NCO with what's waiting for their appraisal, linking to their profile", async () => {
    renderWithQuery(<NcoNotesPage />);
    const amy = await screen.findByRole("link", { name: /Cpl Amy Able.*2 notes for the next appraisal/ });
    expect(amy).toHaveAttribute("href", "/nco-notes/1");
    expect(
      screen.getByRole("link", { name: /Sgt Ben Baker.*Nothing noted since the last appraisal/ })
    ).toBeInTheDocument();
  });

  it("shows the latest notes, with actions only on the viewer's own", async () => {
    renderWithQuery(<NcoNotesPage />);
    const mine = (await screen.findByText("Sharp on drill")).closest("li")!;
    expect(within(mine).getByText("Spoken")).toBeInTheDocument();
    expect(within(mine).getByText("(edited)")).toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Edit" })).toBeInTheDocument();

    const theirs = screen.getByText("Quiet with his section").closest("li")!;
    expect(within(theirs).getByText("Sarah Hughes")).toBeInTheDocument();
    expect(within(theirs).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(theirs).queryByRole("button", { name: "Delete" })).toBeNull();

    // A note about someone who has left keeps their name but has no profile to open.
    expect(screen.getByText("Cpl Old Leaver (left)")).toBeInTheDocument();
  });

  it("deletes a note after confirming", async () => {
    renderWithQuery(<NcoNotesPage />);
    const mine = (await screen.findByText("Sharp on drill")).closest("li")!;
    fireEvent.click(within(mine).getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.path === "/nco-notes/1")).toBe(true)
    );
    expect(toast.success).toHaveBeenCalledWith("Note deleted");
  });

  it("moves a misheard note to the right NCO", async () => {
    renderWithQuery(<NcoNotesPage />);
    const mine = (await screen.findByText("Sharp on drill")).closest("li")!;
    fireEvent.click(within(mine).getByRole("button", { name: "Edit" }));
    const body = await screen.findByLabelText("Note");
    fireEvent.change(body, { target: { value: "Sharp on drill, and helped a recruit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: "/nco-notes/1",
      body: { body: "Sharp on drill, and helped a recruit" },
    });
  });

  it("an edit that empties the note is caught before it's sent", async () => {
    renderWithQuery(<NcoNotesPage />);
    const mine = (await screen.findByText("Sharp on drill")).closest("li")!;
    fireEvent.click(within(mine).getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Write something, or delete the note")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("says when there are no notes yet", async () => {
    routes["GET /nco-notes"] = json({ ...OVERVIEW, recent: [] });
    renderWithQuery(<NcoNotesPage />);
    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
  });

  it("explains an empty NCO team rather than showing an empty form", async () => {
    routes["GET /nco-notes"] = json({ ncos: [], recent: [], voice_available: false });
    renderWithQuery(<NcoNotesPage />);
    expect(await screen.findByText("No NCOs on the roster")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save note" })).toBeNull();
  });

  it("shows the API's reason when it turns the page away", async () => {
    routes["GET /nco-notes"] = json({ detail: "Staff only" }, 403);
    renderWithQuery(<NcoNotesPage />);
    expect(await screen.findByText("Could not load the notes")).toBeInTheDocument();
    expect(screen.getByText("Staff only")).toBeInTheDocument();
  });
});

describe("an NCO's profile", () => {
  it("splits the notes into what the next appraisal gets and what earlier ones used", async () => {
    renderWithQuery(<NcoNotesProfilePage />);
    expect(await screen.findByRole("heading", { name: "Since the last appraisal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Used in the appraisal of 1 Jun 2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open appraisal" })).toHaveAttribute("href", "/nco-appraisals/7");
    expect(screen.getByRole("link", { name: /Write appraisal/ })).toHaveAttribute(
      "href",
      "/nco-appraisals/new?cin=1"
    );
    expect(screen.getByText("For the next appraisal").nextSibling).toHaveTextContent("1");
    // A used note can be removed but not reworded.
    const used = screen.getByText("Used one").closest("li")!;
    expect(within(used).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(used).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("says when nothing has been noted yet", async () => {
    routes["GET /nco-notes/ncos/1"] = json({
      ...PROFILE,
      notes: [],
      open_notes: 0,
      appraisals: [],
      next_review_date: null,
    });
    renderWithQuery(<NcoNotesProfilePage />);
    expect(await screen.findByText("Nothing noted yet")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows why a profile can't be opened, e.g. a cadet who isn't an NCO", async () => {
    routes["GET /nco-notes/ncos/1"] = json({ detail: "Cara Cadet isn't in the NCO team" }, 400);
    renderWithQuery(<NcoNotesProfilePage />);
    expect(await screen.findByText("Cara Cadet isn't in the NCO team")).toBeInTheDocument();
  });

  it("still works when the team list fails, filing notes against this NCO", async () => {
    routes["GET /nco-notes"] = json({ detail: "boom" }, 500);
    renderWithQuery(<NcoNotesProfilePage />);
    fireEvent.change(await screen.findByLabelText("What did you see?"), { target: { value: "Good brief" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")).toMatchObject({
        body: { cadet_cin: 1, body: "Good brief" },
      })
    );
  });
});
