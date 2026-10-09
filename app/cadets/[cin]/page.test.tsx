// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CadetPage from "@/app/cadets/[cin]/page";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
let tab = "overview";
vi.mock("next/navigation", () => ({
  useParams: () => ({ cin: "111" }),
  useSearchParams: () => new URLSearchParams(`tab=${tab}`),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const CADET = {
  cin: 111,
  first_name: "Zoë",
  last_name: "Ó Briain",
  email: null,
  phone_number: null,
  date_of_birth: null,
  rank: "Cdt",
  flight: "A",
  classification: "Leading Cadet",
  banned: false,
  qualifications: [],
  events: [],
  assessments: [],
  allergies: [],
  dietary: [],
  joined_on: "2024-03-27",
  classification_dates: { "First Class Cadet": "2024-08-30", "Leading Cadet": "2025-07-16" },
  flights: [
    {
      id: 1,
      date: "2025-08-06",
      activity: "powered",
      aircraft: "Tutor",
      category: "AEF",
      duty: "Blue ATP",
      sortie: null,
      unit: null,
      minutes: 25,
    },
  ],
  flying_blue_stages: [
    { stage: 1, name: "Blue aviation (ATP ground school)", done: true },
    { stage: 2, name: "Blue PTT (simulator)", done: true },
    { stage: 3, name: "Flight in a Grob Tutor or Viking", done: true },
  ],
};

function renderWith(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/cadets/111") ? Response.json(body) : Response.json([])
    )
  );
  render(<CadetPage />);
}

describe("cadet page — Volunteer Portal data alongside everything else", () => {
  it("shows when they joined and when they reached their classification", async () => {
    tab = "overview";
    renderWith(CADET);
    expect(await screen.findByText("since 16 Jul 2025")).toBeTruthy();
    const joined = screen.getByText("Joined 317").parentElement!;
    expect(joined.textContent).toContain("27 Mar 2024");
  });

  it("shows the flying record on the Qualifications tab", async () => {
    tab = "qualifications";
    renderWith(CADET);
    const flights = await screen.findByRole("list", { name: "Flights" });
    expect(within(flights).getByText(/Tutor/)).toBeTruthy();
    expect(screen.getByText(/all stages done/)).toBeTruthy();
  });

  it("copes with a cadet never synced from the portal", async () => {
    tab = "qualifications";
    // An API from before the sync, or a cadet it hasn't reached: no portal fields at all.
    const portalFields = ["joined_on", "classification_dates", "flights", "flying_blue_stages"];
    const unsynced = Object.fromEntries(Object.entries(CADET).filter(([k]) => !portalFields.includes(k)));
    renderWith(unsynced);
    expect(await screen.findByText("No flights recorded on the Volunteer Portal.")).toBeTruthy();
  });
});
