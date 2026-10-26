// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import TextRecipientsPage from "@/app/texts/recipients/page";
import { setPersonalDataHidden } from "@/lib/privacy";
import { renderWithQuery } from "@/tests/render-with-query";

afterEach(() => window.localStorage.clear());

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
    renderWithQuery(<TextRecipientsPage />);
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
    renderWithQuery(<TextRecipientsPage />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Search recipients" }), "zzz");
    expect(screen.getByText(/Nobody matches/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("names whose row each edit and remove button is for", async () => {
    respond(RECIPIENTS);
    renderWithQuery(<TextRecipientsPage />);
    expect(await screen.findByRole("button", { name: "Edit Jack Brown" })).toBeInTheDocument();
    // No account, so no full name — the surname still tells the rows apart.
    expect(screen.getByRole("button", { name: "Remove Jones" })).toBeInTheDocument();
  });

  it("drops the number column, export and edit when personal data is hidden", async () => {
    act(() => setPersonalDataHidden(true));
    respond(RECIPIENTS);
    renderWithQuery(<TextRecipientsPage />);
    expect(await screen.findByText("Jack Brown")).toBeInTheDocument();
    expect(screen.queryByText(/0\d{10}/)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Phone number" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    // The edit form and the CSV both carry the numbers.
    expect(screen.queryByRole("button", { name: "Edit Jack Brown" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export CSV/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Jones" })).toBeEnabled();
  });

  it("won't find anyone by a hidden number, which would give it away", async () => {
    act(() => setPersonalDataHidden(true));
    respond(RECIPIENTS);
    renderWithQuery(<TextRecipientsPage />);
    const search = await screen.findByRole("textbox", { name: "Search recipients" });
    expect(search).toHaveAttribute("placeholder", "Search by name or greeting…");
    await userEvent.type(search, "07700 900019");
    expect(screen.queryByText("Jack Brown")).not.toBeInTheDocument();
  });

  it("shows the empty state, not a search box, when the list fails to load", async () => {
    respond({ detail: "boom" }, 500);
    renderWithQuery(<TextRecipientsPage />);
    expect(await screen.findByText("No recipients yet")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search recipients" })).not.toBeInTheDocument();
  });
});
