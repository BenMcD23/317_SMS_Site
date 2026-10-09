// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import TextRecipientsPage from "@/app/texts/recipients/page";

const RECIPIENTS = [
  {
    key: "cadet:1",
    source: "cadet",
    rank: "Sgt",
    surname: "Brown",
    name: "Jack Brown",
    phone_number: "07700900019",
    cin: 1,
  },
  {
    key: "staff:2",
    source: "staff",
    rank: "CI",
    surname: "McDonald",
    name: "Ben McDonald",
    phone_number: "07700900999",
    cin: 2,
  },
  {
    key: "extra:3",
    source: "extra",
    rank: "Mrs",
    surname: "Jones",
    name: "",
    phone_number: "07123456789",
    cin: null,
  },
];

function respond(recipients: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/texts/recipients")
        ? new Response(JSON.stringify(recipients), { status })
        : new Response(JSON.stringify({}), { status: 200 })
    )
  );
}

const rows = () => screen.getAllByRole("row").slice(1);

describe("text recipients", () => {
  it("finds someone by name, by greeting, or by a number typed with spaces", async () => {
    respond(RECIPIENTS);
    render(<TextRecipientsPage />);
    const search = await screen.findByRole("textbox", { name: "Search recipients" });

    await userEvent.type(search, "mcdonald");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Ben McDonald")).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "mrs jones");
    expect(screen.getByText("Mrs Jones")).toBeInTheDocument();
    expect(rows()).toHaveLength(1);

    await userEvent.clear(search);
    await userEvent.type(search, "07700 900019");
    expect(screen.getByText("Jack Brown")).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it("says nobody matches rather than showing an empty table", async () => {
    respond(RECIPIENTS);
    render(<TextRecipientsPage />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Search recipients" }), "zzz");
    expect(screen.getByText(/Nobody matches/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("names whose row each edit and remove button is for", async () => {
    respond(RECIPIENTS);
    render(<TextRecipientsPage />);
    expect(await screen.findByRole("button", { name: "Edit Jack Brown" })).toBeInTheDocument();
    // No account, so no full name — the surname still tells the rows apart.
    expect(screen.getByRole("button", { name: "Remove Jones" })).toBeInTheDocument();
  });

  it("shows the empty state, not a search box, when the list fails to load", async () => {
    respond({ detail: "boom" }, 500);
    render(<TextRecipientsPage />);
    expect(await screen.findByText("No recipients yet")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search recipients" })).not.toBeInTheDocument();
  });
});
