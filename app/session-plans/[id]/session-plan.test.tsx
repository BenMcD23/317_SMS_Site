// @vitest-environment jsdom
import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "nco" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SessionPlanDetailPage from "@/app/session-plans/[id]/page";

// What the API sends an NCO: names, never addresses.
const PLAN = {
  id: 1,
  session_name: "Map reading",
  session_ic: "Nina Corporal",
  session_date: "2026-05-06T00:00:00",
  status: "approved",
  author_name: "Nina Corporal",
  author_email: "",
  created_at: "2026-05-01T19:00:00",
  updated_at: "2026-05-02T19:00:00",
  submitted_at: "2026-05-01T20:00:00",
  aim: "Read a grid ref",
  participants: "",
  rooming: "",
  equipment: "",
  situation: "s",
  mission: "m",
  execution: "e",
  any_questions: "",
  check_understanding: "",
  timetable: [],
  notes: "",
  feedback: {},
  amendment_note: null,
  reviewed_at: "2026-05-02T19:00:00",
  reviewed_by: "Sam Staff",
  attachments: [],
  comments: [],
  is_author: true,
  can_review: false,
  can_edit: false,
};

describe("session plan history", () => {
  it("names the author and reviewer when the API sends no email addresses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(PLAN), { status: 200 }))
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = Promise.resolve({ id: "1" });
    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <Suspense>
            <SessionPlanDetailPage params={params} />
          </Suspense>
        </QueryClientProvider>
      );
    });
    expect(await screen.findByText(/Approved by Sam Staff/)).toBeInTheDocument();
    // Created and Submitted both say who, by name.
    expect(screen.getAllByText(/· Nina Corporal$/)).toHaveLength(2);
  });
});
