"use client";

import Link from "next/link";
import { History } from "lucide-react";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { StockChangesTable } from "@/components/stock-changes-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatTimestamp } from "@/lib/format";
import {
  ISSUANCE_STATUS_LABELS,
  issuanceRecordHref,
  issuanceStatus,
  type RecentIssuance,
} from "@/lib/issuance-history";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

const STATUS_ORDER = { current: 0, replaced: 1, undone: 2 } as const;

const col = dataTableColumns<RecentIssuance>();

const columns = col.columns([
  col.accessor("recordedAt", {
    header: "Recorded",
    sortFn: "text",
    cell: ({ getValue }) => (
      <span className="text-muted-foreground whitespace-nowrap">{formatTimestamp(getValue())}</span>
    ),
  }),
  col.accessor("subjectName", {
    header: "Who",
    sortFn: "text",
    cell: ({ row }) => {
      const href = issuanceRecordHref(row.original);
      return href ? (
        <Link href={href} className="font-medium hover:underline">
          {row.original.subjectName}
        </Link>
      ) : (
        <span className="font-medium">{row.original.subjectName}</span>
      );
    },
  }),
  col.accessor("itemCategory", {
    header: "Item",
    sortFn: "text",
    cell: ({ row }) => {
      const e = row.original;
      return (
        <div className="flex flex-col">
          <div className={cn("flex flex-col", e.undoneAt && "text-muted-foreground line-through")}>
            <span>
              {e.itemCategory}
              {e.sizeGiven && ` · ${e.sizeGiven}`}
            </span>
            {/* The date given can be back-dated, so it isn't always the date recorded. */}
            <span className="text-muted-foreground text-xs">Given {formatDate(e.lastGiven)}</span>
          </div>
          {/* The Status column is hidden on a phone, so say it here when it isn't plain "On record". */}
          {issuanceStatus(e) !== "current" && (
            <span className="text-muted-foreground text-xs sm:hidden">
              {ISSUANCE_STATUS_LABELS[issuanceStatus(e)]}
            </span>
          )}
        </div>
      );
    },
  }),
  col.accessor((e) => e.recordedBy ?? "", {
    id: "by",
    header: "By",
    sortFn: "text",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.recordedBy ?? "—"}
        {row.original.orderItemId && <span className="block text-xs">From an order</span>}
      </span>
    ),
  }),
  col.accessor((e) => STATUS_ORDER[issuanceStatus(e)], {
    id: "status",
    header: "Status",
    sortFn: "basic",
    cell: ({ row }) => {
      const e = row.original;
      const status = issuanceStatus(e);
      return (
        <span className={cn(status === "current" ? "font-medium" : "text-muted-foreground")}>
          {ISSUANCE_STATUS_LABELS[status]}
          {e.undoneAt && (
            <span className="text-muted-foreground block text-xs">
              {e.undoneBy ? `${e.undoneBy}, ` : ""}
              {formatDate(e.undoneAt)}
            </span>
          )}
        </span>
      );
    },
  }),
]);

export default function UniformHistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Uniform history"
        description="What went out and how the stock changed, newest first. Undo a give from the person's Uniform tab."
      />
      <Tabs defaultValue="given" className="gap-6">
        <TabsList>
          <TabsTrigger value="given">Given out</TabsTrigger>
          <TabsTrigger value="stock">Stock changes</TabsTrigger>
        </TabsList>
        <TabsContent value="given">
          <GivenOut />
        </TabsContent>
        <TabsContent value="stock">
          <StockChangesTable kind="uniform" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GivenOut() {
  const { data, isPending, error } = useApiQuery<RecentIssuance[]>(
    ["stores", "issuances", "recent"],
    "/stores/issuances/recent?limit=200"
  );
  // An error body where a list was expected is a failure, not "nothing given".
  const entries = Array.isArray(data) ? data : [];

  if (error) return <ErrorAlert title="Couldn't load the history" message={error.message} />;
  if (isPending) return <ListSkeleton rows={8} />;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing given out yet"
        description="Uniform marked as given, from an order or a Uniform tab, shows here."
      />
    );
  }
  return (
    <DataTable
      label="Uniform history"
      data={entries}
      columns={columns}
      rowKey={(e) => e.id}
      initialSort={{ id: "recordedAt", desc: true }}
      columnClassName={{
        recordedAt: "hidden sm:table-cell",
        by: "hidden md:table-cell",
        status: "hidden sm:table-cell",
      }}
    />
  );
}
