// @vitest-environment jsdom
// Editing a leadership sheet keeps it on its bank task, or moves it to
// another, so the session planner's "who has led what" stays right.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssessmentEditor } from "@/components/assessments/assessment-editor";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const DETAIL = (fields: Record<string, unknown>) => ({
  id: 17,
  assessment_type: "Blue Leadership",
  uploaded: false,
  is_mine: true,
  editable: true,
  cadet: { cin: 42, first_name: "Amy", last_name: "Able", rank: "Cpl" },
  fields: {
    scores: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3])),
    date_iso: "2026-10-01",
    debriefing_notes: "",
    ...fields,
  },
});

const TASKS = [
  { id: 1, number: "1", name: "Bridge the Gap", duration_minutes: 15, led: null },
  { id: 2, number: "2", name: "Spider's Web", duration_minutes: 15, led: null },
];

function api(fields: Record<string, unknown>, save: () => Response = () => json({ status: "success" })) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PUT") return save();
    if (url.includes("/detail")) return json(DETAIL(fields));
    if (url.includes("/assessments/leadership/tasks")) return json(TASKS);
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const putBody = (fetchMock: ReturnType<typeof api>) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  return call ? JSON.parse(String(call[1]!.body)) : undefined;
};

function renderEditor(onSaved = vi.fn()) {
  renderWithQuery(
    <AssessmentEditor
      assessmentId={17}
      assessmentType="Blue Leadership"
      token="tok"
      onSaved={onSaved}
      onCancel={vi.fn()}
    />
  );
  return onSaved;
}

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Editing a leadership sheet", () => {
  it("keeps the task it was on, and leaves itself out of the cadet's history", async () => {
    const fetchMock = api({ task_id: 2, exercise_no: "2", exercise_name: "Spider's Web" });
    const onSaved = renderEditor();

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Task" })).toHaveTextContent("2. Spider's Web")
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("cin=42&except_assessment=17"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Save & regenerate PDF" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody(fetchMock)).toMatchObject({ task_id: 2, exercise_no: "2", exercise_name: "Spider's Web" });
  });

  it("moves the sheet to another task", async () => {
    const fetchMock = api({ task_id: 2, exercise_no: "2", exercise_name: "Spider's Web" });
    renderEditor();

    await userEvent.click(await screen.findByRole("combobox", { name: "Task" }));
    await userEvent.click(await screen.findByRole("option", { name: "1. Bridge the Gap" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & regenerate PDF" }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toMatchObject({ task_id: 1, exercise_name: "Bridge the Gap" })
    );
  });

  it("an old typed sheet saves as typed, with no task", async () => {
    const fetchMock = api({ exercise_no: "9", exercise_name: "Egg drop" });
    renderEditor();

    expect(await screen.findByLabelText("Exercise Name")).toHaveValue("Egg drop");
    await userEvent.click(screen.getByRole("button", { name: "Save & regenerate PDF" }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toMatchObject({ task_id: null, exercise_no: "9", exercise_name: "Egg drop" })
    );
  });

  it("shows the API's reason when the save is refused", async () => {
    api({ task_id: 2, exercise_no: "2", exercise_name: "Spider's Web" }, () =>
      json({ detail: "That task isn't in the bank" }, 404)
    );
    const onSaved = renderEditor();
    await screen.findByRole("combobox", { name: "Task" });
    await userEvent.click(screen.getByRole("button", { name: "Save & regenerate PDF" }));

    expect(await screen.findByText("That task isn't in the bank")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
