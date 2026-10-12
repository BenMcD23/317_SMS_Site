// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClassificationDayPage from "@/app/cadets/classification-day/page";
import { canAccess } from "@/lib/access";
import type { PlannedCadet } from "@/lib/classification-day";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

const SUBJECTS = [
  { key: "acp_32_2", name: "Basic Navigation", category: "Leading" },
  { key: "jet_engine_propulsion", name: "Jet Engine Propulsion", category: "Senior/Master" },
];

const ATT = {
  nights: 10,
  present: 9,
  weekday_nights: 5,
  weekday_present: 5,
  last_present: "2026-10-07",
  likelihood: 1,
  flags: [],
};

function cadet(cin: number, last: string, over: Partial<PlannedCadet>): PlannedCadet {
  return {
    cin,
    first_name: "Sam",
    last_name: last,
    rank: "Cdt",
    flight: "A",
    classification: "Leading Cadet",
    kind: "lesson",
    lesson_key: "jet_engine_propulsion",
    lesson_name: "Jet Engine Propulsion",
    ready_exams: [],
    awaiting: null,
    attendance: ATT,
    ...over,
  };
}

const PLAN = {
  date: "2026-10-14",
  weekday: "Wednesday",
  cadets: [
    cadet(1, "Adenekan", {}),
    cadet(2, "Do", {
      kind: "exam",
      lesson_key: "acp_32_2",
      lesson_name: "Basic Navigation",
      ready_exams: ["acp_32_2"],
      classification: "First Class Cadet",
      flight: "B",
    }),
    cadet(3, "North", {
      attendance: {
        ...ATT,
        likelihood: 0.1,
        flags: [{ code: "weekday", message: "Rarely in on Wednesdays: 1 of 10 (10%)" }],
      },
    }),
    cadet(4, "Junior", { kind: "first_class", lesson_key: null, lesson_name: null, classification: null }),
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Answers /lessons and /classification-day; returns the mock so tests can see the URLs. */
function api(plan: () => Response = () => json(PLAN)) {
  const fetchMock = vi.fn(async (url: string) =>
    String(url).includes("/classification-day/lessons") ? json(SUBJECTS) : plan()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClassificationDayPage />
    </QueryClientProvider>
  );
}

const group = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("[data-slot=card]") as HTMLElement;

beforeEach(() => {
  // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Classification day page", () => {
  it("groups cadets into exams and lessons and flags the ones unlikely to be in", async () => {
    api();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Exams" })).toBeInTheDocument();
    expect(within(group("Exams")).getByText("Do, Sam")).toBeInTheDocument();
    expect(within(group("Exams")).getByRole("combobox", { name: "Move Sam Do" })).toHaveTextContent(
      "Basic Navigation exam"
    );

    const jep = group("Jet Engine Propulsion");
    expect(within(jep).getByText("Adenekan, Sam")).toBeInTheDocument();
    // Flagged, but still on the lesson.
    expect(within(jep).getByText("North, Sam")).toBeInTheDocument();
    expect(within(jep).getByText("Rarely in on Wednesdays: 1 of 10 (10%)")).toBeInTheDocument();
    expect(within(jep).getByText("10% likely in")).toBeInTheDocument();

    expect(within(group("Working towards First Class")).getByText("Junior, Sam")).toBeInTheDocument();
  });

  it("asks for the chosen night, and only the lessons picked as running", async () => {
    const fetchMock = api();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Exams" });

    const dateInput = screen.getByLabelText("Night");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-10-16");
    await user.click(screen.getByRole("button", { name: "Lessons running" }));
    await user.click(await screen.findByRole("checkbox", { name: "Jet Engine Propulsion" }));

    const last = String(fetchMock.mock.calls.at(-1)![0]);
    expect(last).toContain("date=2026-10-16");
    expect(last).toContain("offered=jet_engine_propulsion");
    expect(last).not.toContain("acp_32_2");
  });

  it("moving a cadet puts them in the new group, and undo puts them back", async () => {
    api();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Exams" });

    await user.click(screen.getByRole("combobox", { name: "Move Sam Adenekan" }));
    await user.click(await screen.findByRole("option", { name: "Float" }));
    expect(within(group("Float")).getByText("Adenekan, Sam")).toBeInTheDocument();
    expect(within(group("Jet Engine Propulsion")).queryByText("Adenekan, Sam")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Put Sam Adenekan back on their suggestion" }));
    expect(within(group("Jet Engine Propulsion")).getByText("Adenekan, Sam")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Float" })).toBeNull();
  });

  it("only offers the exams a cadet is ready for", async () => {
    api();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Exams" });

    await user.click(screen.getByRole("combobox", { name: "Move Sam Adenekan" }));
    expect(screen.queryByRole("option", { name: /exam$/ })).toBeNull();
  });

  it("'Flagged' narrows the list to cadets with an attendance flag", async () => {
    api();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Exams" });

    await user.click(screen.getByRole("radio", { name: "Flagged 1" }));
    expect(screen.getByText("North, Sam")).toBeInTheDocument();
    expect(screen.queryByText("Adenekan, Sam")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Exams" })).toBeNull();
  });

  it("copies the plan as rows that paste into a spreadsheet", async () => {
    api();
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    renderPage();
    await screen.findByRole("heading", { name: "Exams" });
    // user-event installs its own clipboard on setup; replace it after.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await user.click(screen.getByRole("button", { name: "Copy for Sheets" }));
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text.split("\n").slice(0, 2)).toEqual(["Exams", "Do, Sam\tBasic Navigation exam\t"]);
    expect(text).toContain("North, Sam\tJet Engine Propulsion\tRarely in on Wednesdays: 1 of 10 (10%)");
  });

  it("a 500 shows an error instead of crashing", async () => {
    api(() => json({ detail: "Database unavailable" }, 500));
    renderPage();
    expect(await screen.findByText("Couldn't load the plan")).toBeInTheDocument();
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
  });

  it("an empty roster says so", async () => {
    api(() => json({ ...PLAN, cadets: [] }));
    renderPage();
    expect(await screen.findByText("No cadets on the roster")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy for Sheets" })).toBeDisabled();
  });
});

describe("who can open it", () => {
  it.each([
    ["staff", true],
    ["snco", false],
    ["nco", false],
    [undefined, false],
  ])("%s → %s", (role, allowed) => {
    expect(canAccess(role, "/cadets/classification-day")).toBe(allowed);
  });
});
