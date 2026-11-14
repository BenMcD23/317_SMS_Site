// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SquadDialog } from "@/components/drill/squad-dialog";
import type { DrillCadet, DrillStage } from "@/lib/drill";

const SESSION = {
  data: { id_token: "tok", role: "snco", user: { email: "snco@317atc.co.uk" } },
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
    test_name: null,
    max_score: null,
    pass_mark: null,
    lessons: [{ id: 11, name: "Turns" }],
  },
];
const cadet = (cin: number, name: string, flight: string): DrillCadet => ({
  cin,
  name,
  rank: null,
  flight,
  lessons: {},
  tests: [],
  stages: {},
  current: 1,
  ready_for_test: [],
});
const CADETS = [cadet(1, "Siân Ó Briain", "A"), cadet(2, "Tom Able", "B")];

// Radix Select reaches for these, which jsdom doesn't have.
beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

function setup(reply: Response) {
  const fetchMock = vi.fn(async () => reply);
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  render(<SquadDialog open onOpenChange={onOpenChange} stages={STAGES} cadets={CADETS} onSaved={onSaved} />);
  return { fetchMock, onSaved, onOpenChange };
}

describe("Mark a squad", () => {
  it("says what's missing instead of sending half a request", async () => {
    const { fetchMock } = setup(new Response("{}"));
    await userEvent.click(screen.getByRole("button", { name: /Save for 0 cadets/ }));
    expect(screen.getByText("Pick the lesson you taught.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an API refusal keeps the dialog open with the reason", async () => {
    const { onOpenChange } = setup(
      new Response(JSON.stringify({ detail: "Not on the roster: 2" }), { status: 404 })
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Lesson" }));
    await userEvent.click(await screen.findByRole("option", { name: "Turns" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Able/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save for 1 cadet" }));
    expect(await screen.findByText("Not on the roster: 2")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("marks the ticked cadets taught by default", async () => {
    const { fetchMock, onSaved } = setup(new Response(JSON.stringify({ changed: 1 })));
    await userEvent.click(screen.getByRole("combobox", { name: "Lesson" }));
    await userEvent.click(await screen.findByRole("option", { name: "Turns" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Siân/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save for 1 cadet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/drill/lessons/11/mark");
    expect(JSON.parse(String(init.body))).toEqual({ cins: [1], passed: false });
    expect(toast.success).toHaveBeenCalledWith("1 cadet updated");
  });
});
