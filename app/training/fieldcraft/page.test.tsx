// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import FieldcraftPage from "@/app/training/fieldcraft/page";
import { workingOn, type FieldcraftCadet, type FieldcraftGrid } from "@/lib/fieldcraft";
import { renderWithQuery } from "@/tests/render-with-query";

const LEVELS = [
  {
    level: "Blue",
    lessons: [
      { lesson_id: 1, level: "Blue", reference: "Intro", title: "Introduction" },
      { lesson_id: 2, level: "Blue", reference: "Lesson 2", title: "Packing" },
    ],
  },
  { level: "Bronze", lessons: [{ lesson_id: 12, level: "Bronze", reference: "Lesson 4", title: "Moving" }] },
];

const cadet = (
  cin: number,
  last: string,
  done: Record<string, string | null>,
  extra = {}
): FieldcraftCadet => ({
  cin,
  first_name: "Cdt",
  last_name: last,
  rank: null,
  flight: cin % 2 ? "A" : "B",
  classification: null,
  synced: true,
  done,
  ...extra,
});

const GRID: FieldcraftGrid = {
  synced_at: "2026-11-04T20:10:02",
  levels: LEVELS,
  cadets: [
    cadet(1, "Adams", { "1": "2026-05-16" }), // part-way through Blue
    cadet(2, "Brown", { "1": "2026-05-16", "2": null }), // Blue done, onto Bronze
    cadet(3, "Cole", {}), // synced, nothing yet
    cadet(4, "Ó Briain", { "1": null, "2": null, "12": "2026-06-01" }), // all done
    cadet(5, "Evans", {}, { synced: false }), // never synced
  ],
};

function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(String(url).endsWith("/cadets/fieldcraft") ? body : {}), { status })
    )
  );
}

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("workingOn", () => {
  it.each([
    [1, 0, true], // started Blue
    [3, 0, true], // Blue is where everyone starts
    [2, 0, false], // finished Blue
    [1, 1, false], // Bronze waits until Blue is done
    [2, 1, true],
    [4, 1, false],
    [5, 0, false], // no portal record: unknown, so not listed as to-do
  ])("cadet %i on level %i → %s", (cin, i, expected) => {
    expect(
      workingOn(
        GRID.cadets.find((c) => c.cin === cin)!,
        LEVELS,
        i
      )
    ).toBe(expected);
  });
});

describe("Fieldcraft page", () => {
  it("lists who's working on Blue, with how many still need each lesson", async () => {
    respond(GRID);
    renderWithQuery(<FieldcraftPage />);
    await screen.findByRole("table");
    expect(names()).toEqual(["Adams, CdtA", "Cole, CdtA"]);
    const [, intro, packing] = screen.getAllByRole("columnheader");
    expect(intro.textContent).toContain("1 need it");
    expect(packing.textContent).toContain("2 need it");
    expect(screen.getAllByLabelText("Introduction: done")).toHaveLength(1);
    expect(screen.getByText(/1 cadet has no portal record yet/)).toBeTruthy();
    expect(screen.getByText(/last synced/)).toBeTruthy();
  });

  it("moves to Bronze and shows everyone synced on request", async () => {
    respond(GRID);
    renderWithQuery(<FieldcraftPage />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("radio", { name: "Bronze" }));
    expect(names()).toEqual(["Brown, CdtB"]);
    await userEvent.click(screen.getByRole("radio", { name: "Everyone" }));
    expect(names()).toEqual(["Adams, CdtA", "Brown, CdtB", "Cole, CdtA", "Ó Briain, CdtB"]);
  });

  it("says how to get data when nothing has been synced", async () => {
    respond({ synced_at: null, levels: [], cadets: [cadet(5, "Evans", {}, { synced: false })] });
    renderWithQuery(<FieldcraftPage />);
    expect(await screen.findByText("No fieldcraft synced yet")).toBeTruthy();
  });

  it("shows the error when the API fails", async () => {
    respond({ detail: "boom" }, 500);
    renderWithQuery(<FieldcraftPage />);
    expect(await screen.findByText("Couldn't load fieldcraft")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
