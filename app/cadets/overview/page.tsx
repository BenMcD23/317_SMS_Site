"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { FlightFilter } from "@/components/flight-filter";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { cn } from "@/lib/utils";
import { flightBadgeClass, flightsIn, flightLabel, RANK_ORDER } from "@/lib/cadet-format";
import { Search, UserX, Users } from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";
import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  /** When the scraper first stopped finding them on SMS; null while they're on it. */
  missing_since?: string | null;
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

function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** Cadets the scraper no longer finds on SMS. Nothing is deleted automatically
 *  (a misread page mustn't cost anyone their records), so staff remove them here. */
function NotOnSms({ cadets }: { cadets: Cadet[] }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const isStaff = session?.role === "staff";

  function remove(c: Cadet) {
    const name = `${c.first_name} ${c.last_name}`;
    confirm(
      `Remove ${name} and all their records? Their stores orders are kept for the stock insights. They won't be added back by the scraper.`,
      async () => {
        if (!session?.id_token) return;
        try {
          await apiRequest(
            session.id_token,
            `${API_BASE}/cadets/${c.cin}`,
            { method: "DELETE" },
            `Couldn't remove ${name}.`
          );
          toast.success(`${name} removed.`);
          queryClient.invalidateQueries({ queryKey: ["cadets"] });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Couldn't remove ${name}.`);
        }
      }
    );
  }

  return (
    <Alert>
      <UserX />
      <AlertTitle>
        {cadets.length === 1 ? "1 cadet isn't" : `${cadets.length} cadets aren't`} on SMS any more
      </AlertTitle>
      <AlertDescription>
        <ul className="flex w-full flex-col gap-2">
          {cadets.map((c) => {
            const days = daysSince(c.missing_since!);
            return (
              <li key={c.cin} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/cadets/${c.cin}`} className="text-foreground font-medium hover:underline">
                    {c.first_name} {c.last_name}
                  </Link>{" "}
                  hasn&apos;t been seen on SMS for {days} day{days === 1 ? "" : "s"} (since{" "}
                  {formatDate(c.missing_since)})
                </span>
                {isStaff && (
                  <Button size="sm" variant="outline" onClick={() => remove(c)}>
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
      {confirmDialog}
    </Alert>
  );
}

export default function CadetsPage() {
  const { data: cadets = [], isLoading: loading, error } = useApiQuery<Cadet[]>(["cadets"], "/cadets");
  const [search, setSearch] = useState("");
  const [flight, setFlight] = useState("");

  const notOnSms = cadets.filter((c) => c.missing_since);
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

      {notOnSms.length > 0 && <NotOnSms cadets={notOnSms} />}

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
