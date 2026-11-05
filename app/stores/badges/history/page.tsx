"use client";

import Link from "next/link";
import { Award } from "lucide-react";

import { DataTable, dataTableColumns } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { StockChangesTable } from "@/components/stock-changes-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { badgeHistoryStatus, type BadgeHistoryRow } from "@/lib/badges-given";
import { formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

const col = dataTableColumns<BadgeHistoryRow>();

const columns = col.columns([
  col.accessor("timestamp", {
    header: "When",
    sortFn: "text",
    cell: ({ getValue }) => (
      <span className="text-muted-foreground whitespace-nowrap">{formatTimestamp(getValue())}</span>
    ),
  }),
  col.accessor("cadetName", {
    header: "Who",
    sortFn: "text",
    cell: ({ row }) =>
      row.original.cadetCin != null ? (
        <Link href={`/cadets/${row.original.cadetCin}`} className="font-medium hover:underline">
          {row.original.cadetName}
        </Link>
      ) : (
        <span className="font-medium">{row.original.cadetName}</span>
      ),
  }),
  col.accessor("badgeName", {
    header: "Badge",
    sortFn: "text",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex flex-col">
          <span className={cn(r.action === "given" && !r.current && "text-muted-foreground line-through")}>
            {r.badgeName}
          </span>
          {/* The When column is hidden on a phone, so the time goes here. */}
          <span className="text-muted-foreground text-xs sm:hidden">{formatTimestamp(r.timestamp)}</span>
        </div>
      );
    },
  }),
  col.accessor("action", {
    header: "What happened",
    sortFn: "text",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex flex-col">
          <span className={cn(r.current ? "font-medium" : "text-muted-foreground")}>
            {badgeHistoryStatus(r)}
          </span>
          {r.by && <span className="text-muted-foreground text-xs">By {r.by}</span>}
        </div>
      );
    },
  }),
]);

export default function BadgeHistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Badge history"
        description="Badges given out and taken back, and how the grid's counts changed, newest first."
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
          <StockChangesTable kind="badge" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GivenOut() {
  const { data, isPending, error } = useApiQuery<BadgeHistoryRow[]>(
    ["stores", "badges", "history"],
    "/stores/badges/history?limit=300"
  );
  // An error body where a list was expected is a failure, not "nothing given".
  const rows = Array.isArray(data) ? data : [];

  if (error) return <ErrorAlert title="Couldn't load the badge history" message={error.message} />;
  if (isPending) return <ListSkeleton rows={8} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No badges given out yet"
        description="Badges marked as given on the badge orders page show here."
      />
    );
  }
  return (
    <DataTable
      label="Badges given out"
      data={rows}
      columns={columns}
      rowKey={(r) => r.id}
      initialSort={{ id: "timestamp", desc: true }}
      columnClassName={{ timestamp: "hidden sm:table-cell" }}
    />
  );
}
