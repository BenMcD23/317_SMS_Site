// @vitest-environment jsdom
import Link from "next/link";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { DataTable, dataTableColumns } from "@/components/data-table";

type Row = { id: number; name: string; rank: string | null };
const RANKS = ["Cadet", "Cpl", "Sgt"];

const col = dataTableColumns<Row>();
const columns = col.columns([
  col.accessor("name", {
    header: "Name",
    sortFn: "text",
    cell: ({ row }) => <Link href={`/r/${row.original.id}`}>{row.original.name}</Link>,
  }),
  col.accessor("rank", {
    header: "Rank",
    sortFn: (a, b) => RANKS.indexOf(a.original.rank ?? "") - RANKS.indexOf(b.original.rank ?? ""),
    cell: ({ getValue }) => getValue() ?? "—",
  }),
]);

const ROWS: Row[] = [
  { id: 1, name: "Cole", rank: "Sgt" },
  { id: 2, name: "Able", rank: "Cadet" },
  { id: 3, name: "Baker", rank: "Cpl" },
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getByRole("link").textContent);

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(<DataTable label="People" data={ROWS} columns={columns} rowKey={(r) => r.id} {...props} />);
}

beforeEach(() => router.push.mockClear());

describe("DataTable", () => {
  it("keeps the order it was given until a heading is clicked", () => {
    renderTable();
    expect(names()).toEqual(["Cole", "Able", "Baker"]);
  });

  it("sorts by a heading, reverses on a second click, and says so to screen readers", async () => {
    renderTable();
    const heading = screen.getByRole("columnheader", { name: /Name/ });

    await userEvent.click(within(heading).getByRole("button"));
    expect(names()).toEqual(["Able", "Baker", "Cole"]);
    expect(heading).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(within(heading).getByRole("button"));
    expect(names()).toEqual(["Cole", "Baker", "Able"]);
    expect(heading).toHaveAttribute("aria-sort", "descending");
  });

  // Ranks are a ladder, not words: alphabetical would put Cpl before Cadet.
  it("uses a column's own comparator", async () => {
    renderTable();
    await userEvent.click(within(screen.getByRole("columnheader", { name: /Rank/ })).getByRole("button"));
    expect(names()).toEqual(["Able", "Baker", "Cole"]);
  });

  it("starts sorted when asked", () => {
    renderTable({ initialSort: { id: "name", desc: true } });
    expect(names()).toEqual(["Cole", "Baker", "Able"]);
  });

  it("opens a row's record when the row is clicked", async () => {
    renderTable({ rowHref: (r) => `/r/${r.id}` });
    await userEvent.click(screen.getAllByRole("cell")[1]);
    expect(router.push).toHaveBeenCalledWith("/r/1");
  });

  it("leaves a click on the row's own link to the link, so it isn't navigated twice", async () => {
    renderTable({ rowHref: (r) => `/r/${r.id}` });
    await userEvent.click(screen.getByRole("link", { name: "Able" }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("renders a header and no rows for an empty list rather than crashing", () => {
    renderTable({ data: [] });
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("is labelled so it can be found and announced", () => {
    renderTable();
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
  });
});
