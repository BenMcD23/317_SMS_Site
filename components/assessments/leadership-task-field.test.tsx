// @vitest-environment jsdom
import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeadershipTaskField, type LeadershipExercise } from "@/components/assessments/leadership-task-field";
import type { PickerTask } from "@/lib/session-planner";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

const TASKS: PickerTask[] = [
  { id: 1, number: "1", name: "Bridge the Gap", duration_minutes: 15, led: "passed" },
  { id: 2, number: "2", name: "Spider's Web", duration_minutes: 15, led: "failed" },
  { id: 3, number: null, name: "Stretcher Carry", duration_minutes: 20, led: null },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function api(answer: () => Response = () => json(TASKS)) {
  // Typed with the URL so the tests can read which one was asked for.
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => answer());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const BLANK: LeadershipExercise = { taskId: null, exerciseNo: "", exerciseName: "" };

/** The field with its value held in state, as the pages do, reporting each change. */
function Harness({
  initial = BLANK,
  onChange,
  exceptAssessment,
}: {
  initial?: LeadershipExercise;
  onChange: (v: LeadershipExercise) => void;
  exceptAssessment?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <LeadershipTaskField
      idPrefix="t"
      cin={42}
      cadetName="Amy"
      exceptAssessment={exceptAssessment}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

beforeEach(() => {
  // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Leadership task picker", () => {
  it("asks for the cadet's own history, and fills the number and name from the bank", async () => {
    const fetchMock = api();
    const onChange = vi.fn();
    renderWithQuery(<Harness onChange={onChange} />);

    await userEvent.click(await screen.findByRole("combobox", { name: "Task" }));
    await userEvent.click(await screen.findByRole("option", { name: "Stretcher Carry" }));

    expect(onChange).toHaveBeenLastCalledWith({ taskId: 3, exerciseNo: "", exerciseName: "Stretcher Carry" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/assessments/leadership/tasks?cin=42");
    // A task picked from the bank needs no typing.
    expect(screen.queryByLabelText("Exercise Name")).not.toBeInTheDocument();
  });

  it("marks the tasks the cadet has led and warns when one of them is picked", async () => {
    api();
    renderWithQuery(<Harness onChange={vi.fn()} />);

    await userEvent.click(await screen.findByRole("combobox", { name: "Task" }));
    expect(screen.getByRole("option", { name: "1. Bridge the Gap (led, passed)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "2. Spider's Web (led, not passed)" }));

    expect(
      screen.getByText(
        /Amy has already led this task \(led, not passed\)\. A re-assessment should be on another task\./
      )
    ).toBeInTheDocument();
  });

  it("'Not in the bank' gives the typed number and name boxes", async () => {
    api();
    const onChange = vi.fn();
    renderWithQuery(<Harness onChange={onChange} />);

    await userEvent.click(await screen.findByRole("combobox", { name: "Task" }));
    await userEvent.click(screen.getByRole("option", { name: "Not in the bank" }));
    await userEvent.type(screen.getByLabelText("Exercise Name"), "Swamp");

    expect(onChange).toHaveBeenLastCalledWith({ taskId: null, exerciseNo: "", exerciseName: "Swamp" });
  });

  it("an old typed exercise opens on 'Not in the bank' with its text kept", async () => {
    api();
    renderWithQuery(
      <Harness initial={{ taskId: null, exerciseNo: "9", exerciseName: "Egg drop" }} onChange={vi.fn()} />
    );
    expect(await screen.findByRole("combobox", { name: "Task" })).toHaveTextContent("Not in the bank");
    expect(screen.getByLabelText("Exercise Name")).toHaveValue("Egg drop");
  });

  it("an empty bank falls back to typing the exercise", async () => {
    api(() => json([]));
    renderWithQuery(<Harness onChange={vi.fn()} />);
    expect(await screen.findByLabelText("Exercise No.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Task" })).not.toBeInTheDocument();
  });

  it.each([
    ["the API errors", () => json({ detail: "Boom" }, 500)],
    ["there's no signal", () => Promise.reject(new TypeError("Failed to fetch")) as unknown as Response],
  ])("when %s, it says so and lets the exercise be typed", async (_, answer) => {
    api(answer);
    renderWithQuery(<Harness onChange={vi.fn()} />);
    expect(
      await screen.findByText("Couldn't load the task bank, so type the exercise in.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Exercise Name")).toBeInTheDocument();
  });

  it("a sheet on a task that's since been retired still shows it", async () => {
    api();
    renderWithQuery(
      <Harness initial={{ taskId: 99, exerciseNo: "8", exerciseName: "Pipeline" }} onChange={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Task" })).toHaveTextContent("8. Pipeline (retired)")
    );
  });

  it("when editing, leaves the sheet itself out of the cadet's history", async () => {
    const fetchMock = api();
    renderWithQuery(<Harness onChange={vi.fn()} exceptAssessment={17} />);
    await screen.findByRole("combobox", { name: "Task" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("cin=42&except_assessment=17");
  });
});
