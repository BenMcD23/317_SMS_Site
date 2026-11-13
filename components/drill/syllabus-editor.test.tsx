// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SyllabusEditor } from "@/components/drill/syllabus-editor";
import type { DrillStage } from "@/lib/drill";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const STAGES: DrillStage[] = [
  {
    id: 1,
    name: "Stage 1",
    test_name: "5x5 drill test",
    max_score: 25,
    pass_mark: 15,
    lessons: [
      { id: 11, name: "Turns" },
      { id: 12, name: "Saluting" },
    ],
  },
  { id: 2, name: "Colour party", test_name: null, max_score: null, pass_mark: null, lessons: [] },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function api(write: () => Response = () => json({}), syllabus: () => Response = () => json(STAGES)) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    !init?.method || init.method === "GET" ? syllabus() : write()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const writes = (f: ReturnType<typeof api>) =>
  f.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => [
      init!.method,
      new URL(url).pathname,
      init!.body ? JSON.parse(String(init!.body)) : null,
    ]);

describe("Drill syllabus", () => {
  it("shows each stage's test the way a tester reads it", async () => {
    api();
    renderWithQuery(<SyllabusEditor canEdit />);
    expect(await screen.findByText("5x5 drill test · out of 25 · pass mark 15")).toBeTruthy();
    expect(screen.getByText("No test")).toBeTruthy();
    expect(screen.getByText("No lessons yet.")).toBeTruthy();
  });

  it("isn't editable by anyone but staff", async () => {
    api();
    renderWithQuery(<SyllabusEditor canEdit={false} />);
    await screen.findByText("Turns");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("moves a lesson down by sending the new order", async () => {
    const f = api();
    renderWithQuery(<SyllabusEditor canEdit />);
    await userEvent.click(await screen.findByRole("button", { name: "Move Turns down" }));
    await waitFor(() =>
      expect(writes(f)).toEqual([["PUT", "/drill/stages/1/lessons-order", { ids: [12, 11] }]])
    );
    // The first can't go higher, the last can't go lower.
    expect((screen.getByRole("button", { name: "Move Turns up" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Move Colour party down" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("a lesson with records can't be deleted, and the API's reason is shown", async () => {
    api(() =>
      json({ detail: "Cadets have records for this lesson, so it can't be deleted. Rename it instead." }, 409)
    );
    renderWithQuery(<SyllabusEditor canEdit />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Saluting" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /Delete|Confirm|Yes/ })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Rename it instead"))
    );
  });

  it("adds a lesson to a stage", async () => {
    const f = api(() => json({ id: 13, name: "Dismissing" }));
    renderWithQuery(<SyllabusEditor canEdit />);
    const stage = (await screen.findByText("Stage 1")).closest("li")!;
    await userEvent.click(within(stage).getByRole("button", { name: "Add lesson" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add lesson" }));
    expect(await within(dialog).findByText("Enter the lesson's name")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Lesson"), "  Dismissing ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add lesson" }));
    await waitFor(() =>
      expect(writes(f)).toEqual([["POST", "/drill/stages/1/lessons", { name: "Dismissing" }]])
    );
  });

  it("a new stage starts as a 5x5 out of 25 and checks the pass mark against it", async () => {
    const f = api(() => json({ ...STAGES[1], id: 3 }));
    renderWithQuery(<SyllabusEditor canEdit />);
    await userEvent.click(await screen.findByRole("button", { name: "Add stage" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Test") as HTMLInputElement).value).toBe("5x5 drill test");
    expect((within(dialog).getByLabelText("Maximum score") as HTMLInputElement).value).toBe("25");
    await userEvent.type(within(dialog).getByLabelText("Stage name"), "Stage 5");
    await userEvent.type(within(dialog).getByLabelText("Pass mark"), "30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add stage" }));
    expect(await within(dialog).findByText("Can't be more than the maximum score")).toBeTruthy();
    await userEvent.clear(within(dialog).getByLabelText("Pass mark"));
    await userEvent.type(within(dialog).getByLabelText("Pass mark"), "15");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add stage" }));
    await waitFor(() =>
      expect(writes(f)).toEqual([
        [
          "POST",
          "/drill/stages",
          { name: "Stage 5", test_name: "5x5 drill test", max_score: 25, pass_mark: 15 },
        ],
      ])
    );
  });

  it("an empty syllabus says what to do", async () => {
    api(undefined, () => json([]));
    renderWithQuery(<SyllabusEditor canEdit />);
    expect(await screen.findByText("Add the first stage of the drill syllabus.")).toBeTruthy();
  });

  it("an API error is shown as one", async () => {
    api(undefined, () => json({ detail: "boom" }, 500));
    renderWithQuery(<SyllabusEditor canEdit />);
    expect(await screen.findByText("Couldn't load the syllabus")).toBeTruthy();
  });
});
