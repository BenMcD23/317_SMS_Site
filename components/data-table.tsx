"use client";

import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * The feature set every `DataTable` runs with. Module scope on purpose:
 * TanStack Table v9 rebuilds its row models when `features` changes identity.
 */
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic },
});

/** Column builder typed for `DataTable`: `const col = dataTableColumns<Cadet>()`. */
export function dataTableColumns<T extends RowData>() {
  return createColumnHelper<typeof features, T>();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each column has its own value type
type Columns<T extends RowData> = ColumnDef<typeof features, T, any>[];

/**
 * A sortable table over rows already in memory — the cadet list, stock, the
 * OC's dashboards. Sorting lives here so every list sorts the same way
 * (click a heading; again to reverse) and announces it with `aria-sort`.
 *
 * `rowHref` makes the whole row open a record. The cell should still render a
 * real `<Link>` so it works from the keyboard and opens in a new tab.
 * `columnClassName` (by column id) hides columns on a phone
 * (`"hidden sm:table-cell"`) or sets widths.
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  rowKey,
  rowHref,
  initialSort,
  columnClassName = {},
  label,
}: {
  data: T[];
  columns: Columns<T>;
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string;
  initialSort?: { id: string; desc?: boolean };
  columnClassName?: Record<string, string>;
  label: string;
}) {
  const router = useRouter();
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => String(rowKey(row)),
    enableSortingRemoval: false,
    initialState: initialSort ? { sorting: [{ id: initialSort.id, desc: !!initialSort.desc }] } : undefined,
  });

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table aria-label={label}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    className={columnClassName[header.column.id]}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "hover:text-foreground focus-visible:ring-ring/50 -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2",
                          sorted && "text-foreground"
                        )}
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const href = rowHref?.(row.original);
            return (
              <TableRow
                key={row.id}
                className={cn(href && "cursor-pointer")}
                onClick={
                  href
                    ? (e) => {
                        // A click on the row's own link is the link's to handle.
                        if ((e.target as HTMLElement).closest("a, button")) return;
                        router.push(href);
                      }
                    : undefined
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={columnClassName[cell.column.id]}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
