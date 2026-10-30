// @vitest-environment jsdom
import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantUsageView, type AssistantUsage } from "@/components/assistant/assistant-usage";
import { setPersonalDataHidden } from "@/lib/privacy";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "ci.mcdonald@317atc.co.uk", name: "Ben" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));

const USAGE: AssistantUsage = {
  days: 30,
  questions: 12,
  people: 3,
  per_day: [{ date: "2026-10-30", questions: 12 }],
  by_person: [{ email: "s.hughes@example.com", questions: 8 }],
  tools: [
    { tool: "attendance", calls: 9 },
    { tool: "aggregate", calls: 4 },
  ],
  fallback: 2,
  thumbs_up: 5,
  thumbs_down: 1,
  rated_down: [
    {
      date: "2026-10-30T19:00:00",
      email: "s.hughes@example.com",
      question: "How many NCOs?",
      answer: "Seven.",
    },
  ],
};

function stub(status: number, body: unknown) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function show(days = "30") {
  await act(async () => {
    renderWithQuery(<AssistantUsageView days={days} />);
  });
}

beforeEach(() => setPersonalDataHidden(false));

describe("AssistantUsageView", () => {
  it("shows the figures, the answers marked bad, the tools and who asks", async () => {
    const fetchMock = stub(200, USAGE);
    await show("90");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/assistant\/usage\?days=90$/);
    expect(await screen.findByText("Good answers")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    const bad = screen.getByRole("heading", { name: "Answers marked bad" }).parentElement!;
    expect(within(bad).getByText("How many NCOs?")).toBeInTheDocument();
    expect(within(bad).getByText("Seven.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "What it looked up" })).toHaveTextContent("attendance9");
    expect(screen.getByRole("table", { name: "Who asks" })).toHaveTextContent("s.hughes@example.com");
  });

  it("'Hide personal data' takes the emails off", async () => {
    setPersonalDataHidden(true);
    stub(200, USAGE);
    await show();
    await screen.findByText("Good answers");
    expect(screen.queryByText(/s\.hughes@example\.com/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Who asks" })).not.toBeInTheDocument();
  });

  it("nothing asked says so", async () => {
    stub(200, { ...USAGE, questions: 0, rated_down: [], tools: [], by_person: [] });
    await show();
    expect(
      await screen.findByText(/Nobody asked the assistant anything in the last 30 days/)
    ).toBeInTheDocument();
  });

  it("no bad answers says so", async () => {
    stub(200, { ...USAGE, rated_down: [], thumbs_down: 0 });
    await show();
    expect(await screen.findByText("None in this period.")).toBeInTheDocument();
  });

  it("a refusal or a failure shows its reason", async () => {
    stub(403, { detail: "Owner access required" });
    await show();
    expect(await screen.findByText("Owner access required")).toBeInTheDocument();
  });
});
