// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordLessonDialog } from "@/components/classifications/record-dialog";
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
  cadet(1, "Fresh"),
  cadet(2, "HadOne", { subjects: { nav: { lessons: [1], taught: false, passed: false } } }),
  cadet(3, "Passed", { subjects: { nav: { lessons: [], taught: false, passed: true } } }),
  cadet(4, "Junior", { classification: null }),
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api(response: () => Response = () => json({ status: "success", action: "marked", changed: 1 })) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof api>) {
  return JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
}

async function openOn(subject: string) {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecordLessonDialog subjects={SUBJECTS} roster={ROSTER} />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole("button", { name: "Record a lesson" }));
  await user.click(screen.getByRole("combobox", { name: "Subject" }));
  await user.click(await screen.findByRole("option", { name: subject }));
  return user;
}

const listed = () =>
  within(screen.getByRole("list", { name: "Cadets" }))
    .queryAllByRole("checkbox")
    .map((c) => c.closest("label")!.textContent);

beforeEach(() => {
  // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Record a lesson", () => {
  it("lists only the cadets who still need that lesson", async () => {
    api();
    const user = await openOn("Basic Navigation");
    // Lesson 1: HadOne has had it, Passed has passed, Junior isn't on Leading yet.
    expect(listed()).toEqual(["Fresh, SamA"]);

    await user.click(screen.getByRole("radio", { name: "Lesson 2" }));
    expect(listed()).toEqual(["Fresh, SamA", "HadOne, SamA"]);
  });

  it("'Show every cadet' finds someone the short list left out", async () => {
    api();
    const user = await openOn("Basic Navigation");
    await user.click(screen.getByRole("button", { name: "Someone missing? Show every cadet" }));
    expect(listed()).toHaveLength(4);
    await user.type(screen.getByRole("textbox", { name: "Search cadets" }), "jun");
    expect(listed()).toEqual(["Junior, SamA"]);
  });

  it("records the lesson for the ticked cadets and closes", async () => {
    const fetchMock = api();
    const user = await openOn("Basic Navigation");
    await user.click(screen.getByRole("radio", { name: "Lesson 2" }));
    await user.click(screen.getByRole("button", { name: "Tick all" }));
    await user.click(screen.getByRole("button", { name: "Record for 2 cadets" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Basic Navigation lesson 2 recorded for 2 cadets.")
    );
    expect(bodyOf(fetchMock)).toEqual({
      cadet_cins: [1, 2],
      lessons: [{ key: "nav", part: 2 }],
      completed: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("badge theory has no lesson to pick, and is open to every cadet", async () => {
    const fetchMock = api();
    const user = await openOn("Blue Radio");
    expect(screen.queryByRole("radio", { name: /Lesson/ })).toBeNull();
    expect(listed()).toHaveLength(4);

    await user.click(screen.getByRole("checkbox", { name: /Junior/ }));
    await user.click(screen.getByRole("button", { name: "Record for 1 cadet" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Blue Radio recorded for 1 cadet."));
    expect(bodyOf(fetchMock).lessons).toEqual([{ key: "radio", part: 1 }]);
  });

  it("can't save until a cadet is ticked", async () => {
    api();
    await openOn("Basic Navigation");
    expect(screen.getByRole("button", { name: "Record for 0 cadets" })).toBeDisabled();
  });

  it("everyone done says so instead of an empty box", async () => {
    api();
    const user = await openOn("Basic Navigation");
    await user.click(screen.getByRole("radio", { name: "Lesson 1" }));
    await user.type(screen.getByRole("textbox", { name: "Search cadets" }), "hadone");
    // HadOne has had lesson 1, so searching the short list for them finds nobody.
    expect(screen.getByText("No cadets match.")).toBeVisible();
    await user.clear(screen.getByRole("textbox", { name: "Search cadets" }));
    await user.click(screen.getByRole("checkbox", { name: /Fresh/ }));
    expect(screen.getByRole("button", { name: "Record for 1 cadet" })).toBeEnabled();
  });

  it("with nobody left needing the lesson, it says so", async () => {
    api();
    const user = userEvent.setup();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <RecordLessonDialog subjects={SUBJECTS} roster={[ROSTER[1], ROSTER[2]]} />
      </QueryClientProvider>
    );
    await user.click(screen.getByRole("button", { name: "Record a lesson" }));
    await user.click(screen.getByRole("combobox", { name: "Subject" }));
    await user.click(await screen.findByRole("option", { name: "Basic Navigation" }));
    expect(screen.getByText("Everyone on this subject has had this lesson.")).toBeVisible();
  });

  it("a refused save stays open with the API's reason", async () => {
    api(() => json({ detail: "No matching cadets found." }, 400));
    const user = await openOn("Basic Navigation");
    await user.click(screen.getByRole("checkbox", { name: /Fresh/ }));
    await user.click(screen.getByRole("button", { name: "Record for 1 cadet" }));
    expect(await screen.findByText("No matching cadets found.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
