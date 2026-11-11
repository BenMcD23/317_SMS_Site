// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = vi.hoisted(() => ({
  data: { id_token: "tok", role: "staff" },
  status: "authenticated",
  update: () => Promise.resolve(null),
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import { AppraisalForm } from "@/components/nco-appraisals/appraisal-form";
import { API_BASE } from "@/lib/config";
import { createAppraisal, emptyDraft, type AppraisalDraft } from "@/lib/nco-appraisals";
import type { NcoNote } from "@/lib/nco-notes";

function note(id: number, body: string, date: string, extra: Partial<NcoNote> = {}): NcoNote {
  return {
    id,
    body,
    cadet_cin: 1,
    cadet_name: "Cpl Amy Able",
    note_date: date,
    source: "typed",
    author_name: "Sam Staff",
    is_mine: true,
    can_edit: true,
    can_delete: true,
    appraisal_id: null,
    appraisal_date: null,
    created_at: null,
    updated_at: null,
    ...extra,
  };
}

const NCO = {
  cin: 1,
  rank: "Cpl",
  first_name: "Amy",
  last_name: "Able",
  flight: "A",
  email: null,
  nco_name: "Cpl Amy Able",
  age: "16",
  attendance: "90%",
  last_appraisal_id: null,
  last_appraisal_date: null,
  next_review_date: null,
  appraisal_count: 0,
  reminder_id: null,
};

let profile: () => Response;

beforeEach(() => {
  profile = () =>
    new Response(
      JSON.stringify({
        notes: [
          note(3, "Led colour party", "2026-11-04T00:00:00", { source: "voice" }),
          note(2, "Late, warned SNCO", "2026-10-28T00:00:00"),
          note(1, "Already used", "2026-05-01T00:00:00", { appraisal_id: 9 }),
        ],
      }),
      { status: 200 }
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url === `${API_BASE}/nco-notes/ncos/1` ? profile() : new Response("{}")))
  );
});

// Every draft the form hands back, so a test can read what it would save.
const drafts = vi.fn<(draft: AppraisalDraft) => void>();

function Harness({ locked, start }: { locked?: boolean; start?: Partial<AppraisalDraft> }) {
  const [draft, setDraft] = useState<AppraisalDraft>({ ...emptyDraft(), cadet_id: 1, ...start });
  const update = (next: AppraisalDraft) => {
    drafts(next);
    setDraft(next);
  };
  return <AppraisalForm draft={draft} setDraft={update} ncos={[NCO]} token="tok" lockedNco={locked} />;
}

describe("staff notes on a new appraisal", () => {
  it("offers the notes since the last appraisal and adds the ticked ones to the points", async () => {
    renderWithQuery(<Harness />);
    expect(await screen.findByLabelText(/Led colour party/)).toBeChecked();
    // A note an earlier appraisal used isn't offered again.
    expect(screen.queryByText("Already used")).toBeNull();

    fireEvent.click(screen.getByLabelText(/Late, warned SNCO/));
    fireEvent.change(screen.getByLabelText("Points to make"), { target: { value: "Good attender." } });
    fireEvent.click(screen.getByRole("button", { name: "Add 1 note to the points" }));

    expect(screen.getByLabelText("Points to make")).toHaveValue(
      "Good attender.\n- 4 Nov 2026: Led colour party"
    );
    expect(drafts.mock.calls.at(-1)?.[0].note_ids).toEqual([3]);
    expect(screen.getByText(/1 added/)).toBeInTheDocument();
  });

  it("sends the used notes with the save, so they're marked used", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(init.body as string));
        return new Response("{}");
      })
    );
    await createAppraisal("tok", { ...emptyDraft(), cadet_id: 1, note_ids: [3, 2] });
    expect(calls[0]).toMatchObject({ cadet_id: 1, note_ids: [3, 2] });
  });

  it("points to the notes page when there's nothing waiting", async () => {
    profile = () => new Response(JSON.stringify({ notes: [] }), { status: 200 });
    renderWithQuery(<Harness />);
    expect(await screen.findByText(/No staff notes since the last appraisal/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add some" })).toHaveAttribute("href", "/nco-notes/1");
  });

  it("still lets staff write the appraisal when the notes won't load", async () => {
    profile = () => new Response(JSON.stringify({ detail: "boom" }), { status: 500 });
    renderWithQuery(<Harness />);
    expect(await screen.findByText(/Couldn't load the staff notes/)).toBeInTheDocument();
    expect(screen.getByLabelText("Points to make")).toBeEnabled();
  });

  it("isn't offered when editing a saved appraisal", () => {
    renderWithQuery(<Harness locked />);
    expect(screen.queryByText(/Staff notes since the last appraisal/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("isn't offered before an NCO is chosen", () => {
    renderWithQuery(<Harness start={{ cadet_id: null }} />);
    expect(screen.queryByText(/Staff notes since the last appraisal/)).toBeNull();
  });
});
