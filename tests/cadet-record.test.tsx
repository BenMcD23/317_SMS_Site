// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ cin: "42" }),
  useSearchParams: () => new URLSearchParams(),
}));

import CadetRecordPage from "@/app/cadets/[cin]/page";
import { setPersonalDataHidden } from "@/lib/privacy";

afterEach(() => window.localStorage.clear());

const DAY = 86_400_000;
const isoIn = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const CADET = {
  cin: 42,
  first_name: "Amy",
  last_name: "Able",
  email: "amy@example.com",
  phone_number: "07700 900123",
  date_of_birth: "2012-05-01T00:00:00",
  rank: "Cpl",
  flight: "B",
  classification: null,
  banned: false,
  qualifications: [
    { id: 1, qualification_name: "Activity First Aid", achieved_date: null, expires_date: isoIn(20) },
    { id: 2, qualification_name: "Blue Radio", achieved_date: null, expires_date: isoIn(-5) },
    { id: 3, qualification_name: "Blue Leadership", achieved_date: null, expires_date: isoIn(400) },
  ],
  events: [],
  assessments: [],
};

function respond(cadet: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/cadets/42")
        ? new Response(JSON.stringify(cadet), { status })
        : // The attendance and uniform cards load their own data; empty is fine here.
          new Response("[]", { status: 200 })
    )
  );
}

describe("cadet record", () => {
  it("names the qualifications that have lapsed or are about to, soonest first", async () => {
    respond(CADET);
    render(<CadetRecordPage />);
    await screen.findByText("1 qualification expired · 1 expiring within 60 days");
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toMatch(/^Blue Radio — expired/);
    expect(items[1]).toMatch(/^Activity First Aid — expires/);
    // Not lapsing, so not listed.
    expect(items.join()).not.toContain("Blue Leadership");
  });

  it("shows no expiry warning when nothing is close to lapsing", async () => {
    respond({ ...CADET, qualifications: [CADET.qualifications[2]] });
    render(<CadetRecordPage />);
    await screen.findByRole("heading", { name: "Amy Able" });
    expect(screen.queryByText(/expir/)).not.toBeInTheDocument();
  });

  it("makes the email and mobile tappable", async () => {
    respond(CADET);
    render(<CadetRecordPage />);
    expect(await screen.findByRole("link", { name: "amy@example.com" })).toHaveAttribute(
      "href",
      "mailto:amy@example.com"
    );
    expect(screen.getByRole("link", { name: "07700 900123" })).toHaveAttribute("href", "tel:07700900123");
  });

  it("drops email, mobile, date of birth and age entirely when personal data is hidden, but not the name", async () => {
    act(() => setPersonalDataHidden(true));
    respond(CADET);
    render(<CadetRecordPage />);
    expect(await screen.findByRole("heading", { name: "Amy Able" })).toBeInTheDocument();
    expect(screen.queryByText(/amy@example\.com|07700|2012/)).not.toBeInTheDocument();
    // The fields go with their labels, and leave no placeholder behind.
    for (const label of ["Email", "Mobile", "Date of Birth", "Age"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Hidden/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit email" })).not.toBeInTheDocument();
    // Everything else is still there.
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("B Flight")).toBeInTheDocument();
  });

  it("gives the edit pencils a name, so they can be found without hovering", async () => {
    respond({ ...CADET, email: null });
    render(<CadetRecordPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit email" }));
    expect(screen.getByRole("button", { name: "Save email" })).toBeInTheDocument();
    // No address, so nothing to link.
    expect(screen.queryByRole("link", { name: /mailto/ })).not.toBeInTheDocument();
  });

  it("spells out the flight", async () => {
    respond(CADET);
    render(<CadetRecordPage />);
    expect(await screen.findAllByText(/B Flight/)).not.toHaveLength(0);
  });

  it("shows the API's reason when the cadet can't be loaded", async () => {
    respond({ detail: "Cadet not found" }, 404);
    render(<CadetRecordPage />);
    expect(await screen.findByText("Cadet not found")).toBeInTheDocument();
  });
});
