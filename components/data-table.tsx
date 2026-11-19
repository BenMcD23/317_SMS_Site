"use client";

import { useState } from "react";
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
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { useListView } from "@/lib/list-view";
import { cn } from "@317/ui-common/lib/utils";
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
 *
 * `viewKey` remembers the sort in this browser (`lib/list-view.ts`), so the
 * list opens sorted the way it was left. Without it the sort starts from
 * `initialSort` every time.
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  rowKey,
  rowHref,
  initialSort,
  columnClassName = {},
  label,
  viewKey,
}: {
  data: T[];
  columns: Columns<T>;
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string;
  initialSort?: { id: string; desc?: boolean };
  columnClassName?: Record<string, string>;
  label: string;
  viewKey?: string;
}) {
  const router = useRouter();
  const defaultSorting: SortingState = initialSort ? [{ id: initialSort.id, desc: !!initialSort.desc }] : [];
  const [localSorting, setLocalSorting] = useState<SortingState>(defaultSorting);
  const [view, setView] = useListView(viewKey ?? "");
  // A remembered sort on a column the table no longer has is ignored.
  const columnIds = columns.map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey);
  const remembered = viewKey && view.sort && columnIds.includes(view.sort.id) ? [view.sort] : null;
  const sorting = viewKey ? (remembered ?? defaultSorting) : localSorting;
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => String(rowKey(row)),
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (!viewKey) return setLocalSorting(next);
      setView({ sort: next[0] ? { id: next[0].id, desc: !!next[0].desc } : undefined });
    },
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
