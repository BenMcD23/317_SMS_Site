"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { FlightFilter } from "@/components/flight-filter";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { cn } from "@/lib/utils";
import { flightBadgeClass, flightsIn, flightLabel, RANK_ORDER } from "@/lib/cadet-format";
import { Search, Users } from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

const col = dataTableColumns<Cadet>();

/** Cadet first, CWO last; anything the scraper hasn't seen before goes after. */
function rankIndex(rank: string | null): number {
  const i = rank ? RANK_ORDER.indexOf(rank) : -1;
  return i === -1 ? RANK_ORDER.length : i;
}

const columns = col.columns([
  col.accessor((c) => `${c.last_name}, ${c.first_name}`, {
    id: "name",
    header: "Name",
    sortFn: "text",
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex min-w-0 flex-col">
          {/* A real link, so the row works from the keyboard and opens in a
              new tab with a middle-click. */}
          <Link href={`/cadets/${c.cin}`} className="font-medium hover:underline">
            {c.last_name}, {c.first_name}
          </Link>
          <span className="text-muted-foreground text-xs tabular-nums sm:hidden">{c.cin}</span>
        </div>
      );
    },
  }),
  col.accessor("cin", {
    header: "CIN",
    sortFn: "basic",
    cell: ({ getValue }) => <span className="text-muted-foreground tabular-nums">{getValue()}</span>,
  }),
  col.accessor("rank", {
    header: "Rank",
    sortFn: (a, b) => rankIndex(a.original.rank) - rankIndex(b.original.rank),
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ?? "—"}</span>,
  }),
  col.accessor((c) => c.flight?.trim() ?? "", {
    id: "flight",
    header: "Flight",
    sortFn: "text",
    cell: ({ getValue }) => {
      const flight = getValue();
      return flight ? (
        <Badge variant="outline" className={cn("min-w-6", flightBadgeClass(flight))}>
          {flight}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
]);

export default function CadetsPage() {
  const { data: cadets = [], isLoading: loading, error } = useApiQuery<Cadet[]>(["cadets"], "/cadets");
  const [search, setSearch] = useState("");
  const [flight, setFlight] = useState("");

  const filtered = cadets.filter((c) => {
    if (flight && c.flight?.trim() !== flight) return false;
    const q = search.toLowerCase();
    return (
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      String(c.cin).includes(q) ||
      c.rank?.toLowerCase().includes(q) ||
      c.flight?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Cadets"
        description={
          loading
            ? "Loading…"
            : filtered.length === cadets.length
              ? `${cadets.length} cadet${cadets.length === 1 ? "" : "s"} on strength`
              : `Showing ${filtered.length} of ${cadets.length} cadets`
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="sm:flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by name, rank, flight or CIN…"
            aria-label="Search cadets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <FlightFilter flights={flightsIn(cadets)} value={flight} onChange={setFlight} />
      </div>

      <ErrorAlert message={error?.message ?? null} title="Could not load cadets" />

      {loading && <ListSkeleton rows={8} />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title="No cadets found"
          description={
            search
              ? `Nothing matches "${search}"${flight ? ` in ${flightLabel(flight)}` : ""}.`
              : flight
                ? `No cadets in ${flightLabel(flight)}.`
                : "Run the cadet scraper to populate this list."
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <DataTable
          label="Cadets"
          data={filtered}
          columns={columns}
          rowKey={(c) => c.cin}
          rowHref={(c) => `/cadets/${c.cin}`}
          initialSort={{ id: "name" }}
          columnClassName={{ cin: "hidden sm:table-cell", flight: "w-20" }}
        />
      )}
    </div>
  );
}
