// @vitest-environment jsdom
// The Programme links tab: filtering, suggesting, accepting one or all,
// changing a link, and the empty and error states.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProgrammeLinks } from "@/components/training/programme-links";
import type { ActivityLink } from "@/lib/training";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const row = (activity: string, over: Partial<ActivityLink> = {}): ActivityLink => ({
  activity,
  category: "lessons",
  nights: 2,
  last: "2026-10-12",
  flights: ["A"],
  state: "none",
  subject_key: null,
  subject_name: null,
  new_subject: null,
  part: null,
  source: null,
  ...over,
});

const ROWS: ActivityLink[] = [
  row("Drill", { state: "not_lesson", source: "staff" }),
  row("Flying Ops 1", { state: "suggested", new_subject: "Flying Ops", part: 1, source: "ai" }),
  row("Map Reading 2", {
    state: "linked",
    subject_key: "acp_32_2",
    subject_name: "Basic Navigation",
    part: 2,
    source: "staff",
  }),
  row("Old Course 1", { state: "suggested", subject_key: "gone", part: 1, broken: true, source: "rules" }),
  row("Rank System"),
];

const SUBJECTS = [{ key: "acp_32_2", name: "Basic Navigation", category: "Leading", parts: 3 }];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api({
  rows = ROWS as unknown,
  status = 200,
  write = () => json({ accepted: 1, created_subjects: ["Flying Ops"], skipped: [] }),
}: { rows?: unknown; status?: number; write?: () => Response } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== "GET") return write();
    if (url.includes("/cadets/theory/lessons")) return json(SUBJECTS);
    if (url.includes("/training/links")) return json(rows, status);
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => ({
      url: String(url),
      method: init!.method,
      body: init!.body ? JSON.parse(String(init!.body)) : undefined,
    }));

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const table = () => screen.findByRole("table", { name: "Programme activities" });

describe("Programme links", () => {
  it("opens on what's left to review: suggestions and activities with no link", async () => {
    api();
    renderWithQuery(<ProgrammeLinks />);
    const t = await table();
    expect(within(t).getByText("Flying Ops 1")).toBeInTheDocument();
    expect(within(t).getByText("New subject: Flying Ops, lesson 1")).toBeInTheDocument();
    expect(within(t).getByText("Rank System")).toBeInTheDocument();
    expect(within(t).getByText("Subject retired")).toBeInTheDocument();
    expect(within(t).queryByText("Drill")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "To review 3" })).toBeChecked();
  });

  it("filters to the lessons and to the activities that aren't lessons", async () => {
    api();
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("radio", { name: "Lessons 1" }));
    expect(screen.getByText("Basic Navigation, lesson 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Not lessons 1" }));
    expect(screen.getByText("Not a lesson")).toBeInTheDocument();
  });

  it("asks for suggestions for the activities with no link", async () => {
    const fetchMock = api({ write: () => json({ suggested: 1, ai: 1, rules: 0 }) });
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Suggest links for 1" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      method: "POST",
      url: expect.stringMatching(/\/links\/suggest$/),
    });
    expect(toast.success).toHaveBeenCalledWith("1 suggestion to review");
  });

  it("has nothing to suggest once every activity has a link or a suggestion", async () => {
    api({ rows: ROWS.filter((r) => r.state !== "none") });
    renderWithQuery(<ProgrammeLinks />);
    await table();
    expect(screen.getByRole("button", { name: "All suggested" })).toBeDisabled();
  });

  it("accepts one suggestion and says which subjects it added", async () => {
    const fetchMock = api();
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Accept the suggestion for Flying Ops 1" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0].body).toEqual({ activities: ["Flying Ops 1"] });
    expect(toast.success).toHaveBeenCalledWith("1 accepted. Added Flying Ops to the QR codes.");
  });

  it("accepts every suggestion at once and names any it skipped", async () => {
    const fetchMock = api({
      write: () =>
        json({
          accepted: 1,
          created_subjects: [],
          skipped: [
            { activity: "Old Course 1", reason: "The suggested lesson isn't in the catalogue any more" },
          ],
        }),
    });
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Accept all 2" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0].body).toEqual({ activities: ["Flying Ops 1", "Old Course 1"] });
    expect(toast.error).toHaveBeenCalledWith(
      "Old Course 1: The suggested lesson isn't in the catalogue any more"
    );
  });

  it("marks an activity as not a lesson", async () => {
    const fetchMock = api({ write: () => json(row("Rank System", { state: "not_lesson" })) });
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Change the link for Rank System" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save link" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Lesson" }));
    await userEvent.click(await screen.findByRole("option", { name: /Not a lesson/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      method: "PUT",
      body: { activity: "Rank System", subject_key: null, part: null },
    });
  });

  it("links an activity to a lesson from the catalogue", async () => {
    const fetchMock = api({ write: () => json(row("Rank System")) });
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Change the link for Rank System" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Lesson" }));
    await userEvent.click(await screen.findByRole("option", { name: "Basic Navigation, lesson 3" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0].body).toEqual({ activity: "Rank System", subject_key: "acp_32_2", part: 3 });
  });

  it("forgets a link so it can be suggested again", async () => {
    const fetchMock = api({ write: () => new Response(null, { status: 204 }) });
    renderWithQuery(<ProgrammeLinks />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Change the link for Flying Ops 1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Forget link" }));
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toMatchObject({
      method: "DELETE",
      url: expect.stringMatching(/\/training\/links\?activity=Flying%20Ops%201$/),
    });
  });

  it("tells staff to import the programme when there's none", async () => {
    api({ rows: [] });
    renderWithQuery(<ProgrammeLinks />);
    expect(await screen.findByText("No programme imported yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the programme" })).toHaveAttribute(
      "href",
      "/tools/programme-updater"
    );
  });

  it("shows the API's error, not a crash, when an error body comes back instead of a list", async () => {
    api({ rows: { detail: "Database is down" }, status: 500 });
    renderWithQuery(<ProgrammeLinks />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
