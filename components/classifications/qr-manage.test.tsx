// @vitest-environment jsdom
// Adding sections and QR codes beside the built-in syllabus: what's sent, what
// the page shows back, and the rules that keep printed codes safe.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonQrCodes } from "@/components/classifications/qr-codes";
import type { CustomSubject, LessonCode, TheorySection } from "@/lib/theory";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/config", async (original) => ({
  ...(await original<typeof import("@/lib/config")>()),
  PORTAL_URL: "https://portal.test",
}));

const SECTIONS: TheorySection[] = [
  { id: null, name: "Badges", built_in: true, can_add: true, subjects: 1 },
  { id: null, name: "Leading", built_in: true, can_add: false, subjects: 1 },
  { id: 7, name: "Fieldcraft", built_in: false, can_add: true, subjects: 1 },
  { id: 8, name: "Drill", built_in: false, can_add: true, subjects: 0 },
];

const SHELTER: CustomSubject = {
  key: "custom_shelter",
  name: "Shelter Building",
  category: "Fieldcraft",
  parts: 2,
  active: true,
  codes: [
    { part: 1, code: "shelter1" },
    { part: 2, code: "shelter2" },
  ],
  used: true,
};
const COOKING: CustomSubject = {
  key: "custom_cooking",
  name: "Camp Cooking",
  category: "Fieldcraft",
  parts: 1,
  active: false,
  codes: [{ part: 1, code: "cooking1" }],
  used: false,
};

const nav = { key: "nav", name: "Basic Navigation", category: "Leading", parts: 3 };
const CODES: LessonCode[] = [
  {
    key: "radio",
    name: "Blue Radio",
    category: "Badges",
    parts: 1,
    part: 1,
    code: "radio001",
    custom: false,
  },
  { ...nav, part: 1, code: "navone01", custom: false },
  { ...nav, part: 2, code: "navtwo02", custom: false },
  { ...nav, part: 3, code: "navthr03", custom: false },
  { ...SHELTER, part: 1, code: "shelter1", custom: true },
  { ...SHELTER, part: 2, code: "shelter2", custom: true },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Write = (url: string, init: RequestInit) => Response | undefined;

function renderPage(write?: Write) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== "GET") return write?.(url, init) ?? json({}, 200);
    if (url.includes("/cadets/theory/sections")) return json(SECTIONS);
    if (url.includes("/cadets/theory/subjects")) return json([SHELTER, COOKING]);
    return json(CODES);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LessonQrCodes />
    </QueryClientProvider>
  );
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof renderPage>) =>
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

describe("QR code sections", () => {
  it("lists the syllabus first, then badges, then sections staff added, empty ones too", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
        "Leading",
        "Badges",
        "Fieldcraft",
        "Drill",
      ])
    );
  });

  it("says the classification syllabus is fixed, with no edit buttons on it", async () => {
    renderPage();
    expect(await screen.findByText(/The classification syllabus/)).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Basic Navigation" });
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("adds a section", async () => {
    const fetchMock = renderPage(() =>
      json({ id: 9, name: "Survival", built_in: false, can_add: true, subjects: 0 }, 201)
    );
    await userEvent.click(await screen.findByRole("button", { name: "Add section" }));
    await userEvent.type(screen.getByLabelText("Name"), "Survival");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add section" }));
    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([
        {
          url: expect.stringContaining("/cadets/theory/sections"),
          method: "POST",
          body: { name: "Survival" },
        },
      ])
    );
    expect(toast.success).toHaveBeenCalledWith("Survival added");
  });

  it("shows the API's reason when a section name is taken", async () => {
    renderPage(() => json({ detail: "There's already a section called “Badges”" }, 409));
    await userEvent.click(await screen.findByRole("button", { name: "Add section" }));
    await userEvent.type(screen.getByLabelText("Name"), "badges");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add section" }));
    expect(await screen.findByText("There's already a section called “Badges”")).toBeInTheDocument();
  });

  it("an empty added section can be deleted; one with codes only renamed", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: "Fieldcraft" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename it" }));
    expect(screen.queryByRole("button", { name: "Delete section" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("radio", { name: "Drill" }));
    expect(screen.getByText("No QR codes in Drill yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rename or delete it" }));
    expect(screen.getByRole("button", { name: "Delete section" })).toBeInTheDocument();
  });
});

describe("Adding QR codes", () => {
  it("makes codes for a subject in the section being looked at", async () => {
    const fetchMock = renderPage(() =>
      json({ ...SHELTER, key: "custom_knots", name: "Knots", used: false }, 201)
    );
    await userEvent.click(await screen.findByRole("radio", { name: "Fieldcraft" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Add QR codes" })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("What's taught"), "Knots");
    const lessons = within(dialog).getByLabelText("Lessons");
    await userEvent.clear(lessons);
    await userEvent.type(lessons, "2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make codes" }));

    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([
        {
          url: expect.stringContaining("/cadets/theory/subjects"),
          method: "POST",
          body: { name: "Knots", section: "Fieldcraft", parts: 2, active: true },
        },
      ])
    );
  });

  it("only offers sections codes can go in", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add QR codes" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Section" }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Badges", "Fieldcraft", "Drill"]);
  });

  it("won't make codes with no name, and says what to do", async () => {
    const fetchMock = renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add QR codes" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make codes" }));
    expect(await screen.findByText("Give it a name")).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
  });

  it("an added subject can be given more lessons but not fewer", async () => {
    const fetchMock = renderPage(() => json({ ...SHELTER, parts: 3 }));
    await userEvent.click(await screen.findByRole("radio", { name: "Fieldcraft" }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit Shelter Building" }));
    const dialog = screen.getByRole("dialog");
    const lessons = within(dialog).getByLabelText("Lessons");
    await userEvent.clear(lessons);
    await userEvent.type(lessons, "1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("At least 2: those codes may be printed")).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);

    await userEvent.clear(lessons);
    await userEvent.type(lessons, "3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(writes(fetchMock)[0]).toMatchObject({
        url: expect.stringContaining("/cadets/theory/subjects/custom_shelter"),
        method: "PUT",
        body: { name: "Shelter Building", section: "Fieldcraft", parts: 3, active: true },
      })
    );
  });

  it("a subject with lessons recorded can be retired but not deleted", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: "Fieldcraft" }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit Shelter Building" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("switch", { name: "In use" }));
    expect(within(dialog).getByText(/Retired: its codes stop working/)).toBeInTheDocument();
  });

  it("retired subjects are listed at the bottom of their section, to bring back", async () => {
    const fetchMock = renderPage(() => json({ ...COOKING, active: true }));
    await userEvent.click(await screen.findByRole("radio", { name: "Fieldcraft" }));
    const retired = await screen.findByRole("heading", { name: "Retired" });
    const list = retired.parentElement!;
    expect(within(list).getByText(/Camp Cooking/)).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("switch", { name: "In use" })).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole("switch", { name: "In use" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(fetchMock)[0].body).toMatchObject({ active: true }));
  });

  it("built-in subjects have no edit button", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: "Badges" }));
    await screen.findByRole("heading", { name: "Blue Radio" });
    expect(screen.queryByRole("button", { name: "Edit Blue Radio" })).not.toBeInTheDocument();
  });
});
