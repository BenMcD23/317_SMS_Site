// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TheoryProgress } from "@/components/classifications/progress";
import type { CadetProgress, TheorySubject } from "@/lib/theory";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const SUBJECTS: TheorySubject[] = [
  { key: "radio", name: "Blue Radio", category: "Badges", parts: 1 },
  { key: "nav", name: "Basic Navigation", category: "Leading", parts: 3 },
  { key: "pof", name: "Principles of Flight", category: "Leading", parts: 3 },
];

function cadet(cin: number, last: string, over: Partial<CadetProgress> = {}): CadetProgress {
  return {
    cin,
    first_name: "Sam",
    last_name: last,
    rank: null,
    flight: "A",
    classification: "First Class Cadet",
    subjects: {},
    ...over,
  };
}

const ROSTER = [
  cadet(1, "Halfway", { subjects: { nav: { lessons: [1, 2], taught: false, passed: false } } }),
  cadet(2, "Ready", { flight: "B", subjects: { nav: { lessons: [1, 2, 3], taught: true, passed: false } } }),
  cadet(3, "Done", {
    classification: "Leading Cadet",
    subjects: {
      nav: { lessons: [], taught: false, passed: true },
      pof: { lessons: [], taught: false, passed: true },
    },
  }),
  cadet(4, "Junior", { classification: null }),
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api({
  progress = () => json(ROSTER),
  mark = () => json({ status: "success", action: "marked", changed: 1 }),
}: { progress?: () => Response; mark?: () => Response } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST" ? mark() : progress()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TheoryProgress subjects={SUBJECTS} />
    </QueryClientProvider>
  );
}

const posts = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init!.body)));

describe("Progress tab", () => {
  it("opens on the Leading subjects with each cadet's lessons, hiding who's passed or not on them", async () => {
    api();
    renderTab();

    expect(
      await screen.findByRole("button", { name: "Sam Halfway, Basic Navigation: Lessons 1, 2 of 3" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sam Ready, Basic Navigation: Taught, exam to sit" })
    ).toBeVisible();
    expect(screen.getByRole("columnheader", { name: /^Basic Navigation,\s?1 to sit exam$/ })).toBeVisible();
    expect(screen.queryByText("Done, Sam")).toBeNull();
    expect(screen.queryByText("Junior, Sam")).toBeNull();
  });

  it("Everyone shows the cadets who've passed, with no menu to open on a passed subject", async () => {
    api();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Halfway, Sam");

    await user.click(screen.getByRole("radio", { name: "Everyone" }));
    expect(screen.getByText("Done, Sam")).toBeVisible();
    expect(screen.getByRole("img", { name: "Sam Done, Basic Navigation: Passed" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Sam Done/ })).toBeNull();
  });

  it("switching to Badges shows badge theory, open to every cadet", async () => {
    api();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Halfway, Sam");

    await user.click(screen.getByRole("radio", { name: "Badges" }));
    expect(screen.getByRole("columnheader", { name: "Blue Radio" })).toBeVisible();
    expect(screen.getByText("Junior, Sam")).toBeVisible();
  });

  it("narrows by flight and by name", async () => {
    api();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Halfway, Sam");

    await user.click(screen.getByRole("radio", { name: "B Flight" }));
    expect(screen.queryByText("Halfway, Sam")).toBeNull();
    expect(screen.getByText("Ready, Sam")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search cadets" }), "half");
    expect(screen.getByText("Halfway, Sam")).toBeVisible();
    expect(screen.queryByText("Ready, Sam")).toBeNull();
  });

  it("ticking a lesson in a cell records it and reloads the progress", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: /Sam Halfway, Basic Navigation/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Lesson 3" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(posts(fetchMock)[0]).toEqual({
      cadet_cins: [1],
      lessons: [{ key: "nav", part: 3 }],
      completed: true,
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => !i?.method).length).toBe(2));
  });

  it("unticking a lesson clears it, and 'Clear all lessons' clears the subject", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: /Sam Halfway, Basic Navigation/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Lesson 1" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(posts(fetchMock)[0]).toMatchObject({ lessons: [{ key: "nav", part: 1 }], completed: false });

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Sam Ready, Basic Navigation/ }));
    await user.click(await screen.findByRole("button", { name: "Clear all lessons" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(2));
    expect(posts(fetchMock)[1]).toEqual({ cadet_cins: [2], lessons: [{ key: "nav" }], completed: false });
  });

  it("a refused save shows the API's reason", async () => {
    api({ mark: () => json({ detail: "No matching cadets found." }, 400) });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: /Sam Halfway, Basic Navigation/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Lesson 3" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No matching cadets found."));
  });

  it("a 500 shows an error instead of crashing", async () => {
    api({ progress: () => json({ detail: "Database unavailable" }, 500) });
    renderTab();
    expect(await screen.findByText("Couldn't load progress")).toBeVisible();
    expect(screen.getByText("Database unavailable")).toBeVisible();
  });

  it("an error body where the roster should be doesn't crash the table", async () => {
    api({ progress: () => json({ detail: "odd" }) });
    renderTab();
    expect(await screen.findByText("No cadets on the roster")).toBeVisible();
  });

  it("everyone filtered out says why", async () => {
    api({ progress: () => json([ROSTER[2], ROSTER[3]]) });
    renderTab();
    const empty = await screen.findByText("Nobody here");
    expect(within(empty.parentElement!.parentElement!).getByText(/Try Everyone/)).toBeVisible();
  });
});
