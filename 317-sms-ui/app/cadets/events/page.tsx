"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, CalendarDays, Users, ChevronDown, ChevronRight, Ban } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type EventCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

type CadetEvent = {
  id: number;
  title: string;
  cadet_count: number;
  cadets: EventCadet[];
};

type BannedCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  events: { event_id: number; event_title: string }[];
};

const FLIGHT_COLOURS: Record<string, string> = {
  Alpha:   "bg-blue-100 text-blue-700 border-blue-200",
  Bravo:   "bg-red-100 text-red-700 border-red-200",
  Charlie: "bg-green-100 text-green-700 border-green-200",
  Delta:   "bg-yellow-100 text-yellow-700 border-yellow-200",
};

function flightClass(flight: string | null) {
  if (!flight) return "bg-muted text-muted-foreground border-muted";
  return FLIGHT_COLOURS[flight] ?? "bg-muted text-muted-foreground border-muted";
}

function EventCard({ event }: { event: CadetEvent }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardHeader className="flex flex-row items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">{event.title}</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
            <Users className="h-3 w-3" />
            {event.cadet_count}
          </Badge>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          }
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="p-0 border-t">
          {event.cadets.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground italic">No matched cadets.</p>
          ) : (
            <div className="divide-y">
              {event.cadets.map((c) => (
                <button
                  key={c.cin}
                  type="button"
                  onClick={() => router.push(`/cadets/${c.cin}`)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {c.first_name[0]}{c.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-muted-foreground">CIN {c.cin}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.rank && (
                      <Badge variant="secondary" className="hidden text-[11px] sm:inline-flex">
                        {c.rank}
                      </Badge>
                    )}
                    {c.flight && (
                      <Badge className={cn("hidden text-[11px] border sm:inline-flex", flightClass(c.flight))}>
                        {c.flight}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function CadetEventListPage() {
  const { data: session } = useSession();

  const [events, setEvents] = useState<CadetEvent[]>([]);
  const [bans, setBans] = useState<BannedCadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session?.id_token) return;
    const headers = { Authorization: `Bearer ${session.id_token}` };
    setLoading(true);
    Promise.all([
      apiFetch(`${API_BASE}/cadet-events`, { headers }).then((r) => r.json()),
      apiFetch(`${API_BASE}/bans`, { headers }).then((r) => r.json()),
    ])
      .then(([evts, bannedCadets]) => {
        setEvents(evts);
        setBans(bannedCadets);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session?.id_token]);

  const filtered = events.filter((e) => {
    const q = search.toLowerCase();
    if (!q) return true;
    if (e.title.toLowerCase().includes(q)) return true;
    return e.cadets.some(
      (c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        String(c.cin).includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Event List</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""} recorded`}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>
      </div>

      {/* Banned cadets banner */}
      {bans.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-800">
            <Ban className="h-4 w-4 shrink-0" />
            <p className="text-sm font-semibold">{bans.length} cadet{bans.length !== 1 ? "s" : ""} currently banned from events</p>
          </div>
          <div className="space-y-2">
            {bans.map((b) => (
              <div key={b.cin} className="rounded-md border border-red-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-red-900">
                  {b.rank ? `${b.rank} ` : ""}{b.first_name} {b.last_name}
                </p>
                {b.events.length > 0 ? (
                  <p className="mt-0.5 text-xs text-red-700">
                    On: {b.events.map((e) => e.event_title).join(", ")}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-red-500 italic">Not registered on any events</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by event name or cadet…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {search ? `No events match "${search}"` : "No events found. Run the cadet event scraper to populate this list."}
        </p>
      )}

      {/* Event list */}
      {!loading && !error && (
        <div className="space-y-2">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
