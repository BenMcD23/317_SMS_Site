"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { flightBadgeClass, cadetInitials } from "@/lib/cadet-format";
import { ChevronRight, Users } from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

export default function CadetsPage() {
  const router = useRouter();

  const { data: cadets = [], isLoading: loading, error } = useApiQuery<Cadet[]>(
    ["cadets"],
    "/cadets"
  );

  const columns = useMemo<ColumnDef<Cadet>[]>(
    () => [
      {
        id: "name",
        accessorFn: (c) => `${c.last_name}, ${c.first_name}`,
        header: "Name",
        enableHiding: false,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">
                  {cadetInitials(c.first_name, c.last_name)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">
                {c.last_name}, {c.first_name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "cin",
        header: "CIN",
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "rank",
        header: "Rank",
        filterFn: "equalsString",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string | null>() ?? "—"}</span>
        ),
      },
      {
        accessorKey: "flight",
        header: "Flight",
        filterFn: "equalsString",
        cell: ({ getValue }) => {
          const flight = getValue<string | null>();
          return flight ? (
            <Badge variant="outline" className={cn(flightBadgeClass(flight))}>
              {flight}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "chevron",
        header: "",
        enableHiding: false,
        cell: () => <ChevronRight className="size-4 text-muted-foreground/50" />,
      },
    ],
    []
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        title="Cadets"
        description={loading ? "Loading…" : `${cadets.length} cadets on strength`}
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load cadets" />

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={cadets}
          searchPlaceholder="Search by name, rank, flight or CIN…"
          facets={[
            { columnId: "rank", title: "Rank" },
            { columnId: "flight", title: "Flight" },
          ]}
          onRowClick={(c) => router.push(`/cadets/${c.cin}`)}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No cadets found</EmptyTitle>
                <EmptyDescription>
                  Adjust your filters, or run the cadet scraper to populate this list.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      )}
    </div>
  );
}
