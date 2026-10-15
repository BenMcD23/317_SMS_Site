// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecordLessons } from "@/components/classifications/record";
import type { TheorySubject } from "@/lib/theory";

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
];
const CADETS = [
  { cin: 1, first_name: "Amy", last_name: "Adams", flight: "A" },
  { cin: 2, first_name: "Bob", last_name: "Brown", flight: "B" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api(mark: () => Response = () => json({ status: "success", action: "marked", changed: 2 })) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST" ? mark() : json(CADETS)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTab(subjects = SUBJECTS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RecordLessons subjects={subjects} />
    </QueryClientProvider>
  );
}

const body = (fetchMock: ReturnType<typeof api>) => {
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  return JSON.parse(String(post[1]!.body));
};

describe("Record tab", () => {
  it("lists classification subjects before badge theory", () => {
    api();
    renderTab();
    const legends = screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent);
    expect(legends.filter(Boolean)).toEqual(["Leading", "Badges"]);
  });

  it("needs a cadet and a lesson before it will save", async () => {
    api();
    const user = userEvent.setup();
    renderTab();
    const record = screen.getByRole("button", { name: "Record lessons" });
    expect(record).toBeDisabled();

    await user.click(await screen.findByRole("checkbox", { name: /Adams, Amy/ }));
    expect(record).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Basic Navigation Lesson 2" }));
    expect(record).toBeEnabled();
  });

  it("records the picked lessons for the picked cadets", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("checkbox", { name: /Adams, Amy/ }));
    await user.click(screen.getByRole("checkbox", { name: /Brown, Bob/ }));
    await user.click(screen.getByRole("button", { name: "Basic Navigation Lesson 1" }));
    await user.click(screen.getByRole("button", { name: "Basic Navigation Lesson 3" }));
    await user.click(screen.getByRole("button", { name: "Blue Radio Theory" }));
    await user.click(screen.getByRole("button", { name: "Record lessons" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(body(fetchMock)).toEqual({
      cadet_cins: [1, 2],
      lessons: [
        { key: "nav", part: 1 },
        { key: "nav", part: 3 },
        { key: "radio", part: 1 },
      ],
      completed: true,
    });
    expect(toast.success).toHaveBeenCalledWith("Recorded 2 cadets × 3 lessons.", {
      description: "2 lessons changed.",
    });
  });

  it("'Clear them' sends the same lessons to be cleared", async () => {
    const fetchMock = api(() => json({ status: "success", action: "cleared", changed: 0 }));
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("checkbox", { name: /Adams, Amy/ }));
    await user.click(screen.getByRole("button", { name: "Basic Navigation Lesson 2" }));
    await user.click(screen.getByRole("button", { name: "Clear them" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(body(fetchMock)).toMatchObject({ cadet_cins: [1], completed: false });
    expect(toast.success).toHaveBeenCalledWith("Cleared 1 cadet × 1 lesson.", {
      description: "They were already up to date.",
    });
  });

  it("a refused save shows the API's reason on the page", async () => {
    api(() => json({ detail: "Unknown subject: nav" }, 400));
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("checkbox", { name: /Adams, Amy/ }));
    await user.click(screen.getByRole("button", { name: "Basic Navigation Lesson 2" }));
    await user.click(screen.getByRole("button", { name: "Record lessons" }));
    expect(await screen.findByText("Unknown subject: nav")).toBeVisible();
    expect(screen.getByText("Couldn't save")).toBeVisible();
  });

  it("a roster that comes back as an error body leaves an empty picker, not a crash", async () => {
    vi.stubGlobal("fetch", async () => json({ detail: "nope" }));
    renderTab();
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: /Adams/ })).toBeNull());
    expect(screen.getByRole("button", { name: "Record lessons" })).toBeDisabled();
  });

  it("shows a placeholder until the subjects arrive", () => {
    api();
    renderTab([]);
    expect(screen.queryByRole("button", { name: /Lesson/ })).toBeNull();
  });
});
