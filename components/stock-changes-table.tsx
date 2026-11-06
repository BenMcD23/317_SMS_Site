"use client";

import { useState } from "react";
import { ChevronDown, History, PackageSearch } from "lucide-react";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatTimestamp } from "@/lib/format";
import { signedChange, stockActionLabel, type StockChange } from "@/lib/stock-changes";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

const col = dataTableColumns<StockChange>();

const columns = col.columns([
  col.accessor("changedAt", {
    header: "When",
    sortFn: "text",
    cell: ({ getValue }) => (
      <span className="text-muted-foreground whitespace-nowrap">{formatTimestamp(getValue())}</span>
    ),
  }),
  col.accessor((c) => `${c.itemName} ${c.size ?? ""}`, {
    id: "item",
    header: "Item",
    sortFn: "text",
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex flex-col">
          <span className="font-medium">
            {c.itemName}
            {c.size && ` · ${c.size}`}
          </span>
          {c.location && <span className="text-muted-foreground text-xs">{c.location}</span>}
          {/* The Change column is hidden on a phone, so the count goes here. */}
          <span className="text-muted-foreground text-xs tabular-nums sm:hidden">
            {[signedChange(c.change), c.quantityAfter === null ? "gone" : `now ${c.quantityAfter}`]
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
      );
    },
  }),
  col.accessor("action", {
    header: "What happened",
    sortFn: "text",
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex min-w-0 flex-col wrap-anywhere">
          <span>{stockActionLabel(c.action)}</span>
          {c.note && <span className="text-muted-foreground text-xs">{c.note}</span>}
          {/* "By" is hidden on a phone, so say it here instead. */}
          {c.changedBy && <span className="text-muted-foreground text-xs md:hidden">By {c.changedBy}</span>}
        </div>
      );
    },
  }),
  col.accessor("change", {
    header: "Change",
    sortFn: "basic",
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex flex-col text-right tabular-nums">
          <span className={cn("font-medium", c.change === 0 && "text-muted-foreground")}>
            {signedChange(c.change) || "—"}
          </span>
          <span className="text-muted-foreground text-xs">
            {c.quantityAfter === null ? "Gone" : `Now ${c.quantityAfter}`}
          </span>
        </div>
      );
    },
  }),
  col.accessor((c) => c.changedBy ?? "", {
    id: "by",
    header: "By",
    sortFn: "text",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.changedBy ?? "—"}</span>,
  }),
]);

/**
 * Every change to a stock count, newest first, for one side of the stores.
 * Shown inside `StockChangesPanel` at the top of each stock page.
 */
export function StockChangesTable({ kind }: { kind: "uniform" | "badge" }) {
  const { data, isPending, error } = useApiQuery<StockChange[]>(
    ["stores", "stock-changes", kind],
    `/stores/stock/changes?kind=${kind}&limit=300`
  );
  // An error body where a list was expected is a failure, not "no changes".
  const changes = Array.isArray(data) ? data : [];

  if (error) return <ErrorAlert title="Couldn't load the stock changes" message={error.message} />;
  if (isPending) return <ListSkeleton rows={8} />;
  if (changes.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="No stock changes yet"
        description={`Adding, counting, moving or taking ${kind === "badge" ? "badges" : "uniform"} for an order shows here.`}
      />
    );
  }
  return (
    <DataTable
      label="Stock changes"
      data={changes}
      columns={columns}
      rowKey={(c) => c.id}
      initialSort={{ id: "changedAt", desc: true }}
      columnClassName={{
        changedAt: "hidden sm:table-cell",
        change: "hidden sm:table-cell",
        by: "hidden md:table-cell",
        action: "whitespace-normal",
      }}
    />
  );
}

/**
 * "Stock changes", folded away at the top of the uniform and badge stock
 * pages: the log is for when a count looks wrong, not something to read every
 * visit. It loads only when opened, and again on each opening, so it includes
 * whatever was just changed on the page below.
 */
export function StockChangesPanel({ kind }: { kind: "uniform" | "badge" }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between sm:w-auto sm:self-start">
          <span className="flex items-center gap-2">
            <History className="text-muted-foreground size-4" />
            Stock changes
          </span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <StockChangesTable kind={kind} />
      </CollapsibleContent>
    </Collapsible>
  );
}
