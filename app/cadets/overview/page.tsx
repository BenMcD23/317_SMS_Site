"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { FlightFilter } from "@/components/flight-filter";
import { cn } from "@/lib/utils";
import { flightBadgeClass, cadetInitials, flightsIn, flightLabel } from "@/lib/cadet-format";
import { Search, ChevronRight, Users } from "lucide-react";

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

export default function CadetsPage() {
  const router = useRouter();

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
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead className="hidden sm:table-cell">CIN</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.cin}
                  className="cursor-pointer"
                  onClick={() => router.push(`/cadets/${c.cin}`)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                          {cadetInitials(c.first_name, c.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        {/* A real link, so the row works from the keyboard and
                            opens in a new tab with a middle-click. */}
                        <Link
                          href={`/cadets/${c.cin}`}
                          className="font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.last_name}, {c.first_name}
                        </Link>
                        <span className="text-muted-foreground text-xs tabular-nums sm:hidden">{c.cin}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
                    {c.cin}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.rank ?? "—"}</TableCell>
                  <TableCell>
                    {c.flight ? (
                      <Badge variant="outline" className={cn(flightBadgeClass(c.flight))}>
                        {c.flight}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-8 pr-4">
                    <ChevronRight className="text-muted-foreground/50 size-4" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
