"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { flightBadgeClass, cadetInitials } from "@/lib/cadet-format";
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

type SubAppEvent = {
  id: number;
  title: string;
  cadet_count: number;
  cadets: EventCadet[];
};

type CadetEvent = {
  id: number;
  title: string;
  cadet_count: number;
  cadets: EventCadet[];
  sub_apps: SubAppEvent[];
};

type BannedCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  events: { event_id: number; event_title: string }[];
};

function CadetRow({ cadet, compact = false }: { cadet: EventCadet; compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/cadets/${cadet.cin}`)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "px-2 py-2" : "px-4 py-2.5",
      )}
    >
      <Avatar className={compact ? "size-6" : "size-7"}>
        <AvatarFallback className="text-[10px]">
          {cadetInitials(cadet.first_name, cadet.last_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>
          {cadet.first_name} {cadet.last_name}
        </p>
        <p className="text-xs text-muted-foreground">CIN {cadet.cin}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {cadet.rank && (
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {cadet.rank}
          </Badge>
        )}
        {cadet.flight && (
          <Badge variant="outline" className={cn("hidden sm:inline-flex", flightBadgeClass(cadet.flight))}>
            {cadet.flight}
          </Badge>
        )}
      </div>
    </button>
  );
}

function BannedCadetRow({
  cadet,
  formatBanEvent,
}: {
  cadet: BannedCadet;
  formatBanEvent: (e: { event_id: number; event_title: string }) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <p className="flex-1 text-sm font-medium">
          {cadet.rank ? `${cadet.rank} ` : ""}{cadet.first_name} {cadet.last_name}
        </p>
        {cadet.events.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {cadet.events.length} event{cadet.events.length !== 1 ? "s" : ""}
          </span>
        )}
        {expanded
          ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        }
      </button>
      {expanded && (
        <div className="divide-y border-t">
          {cadet.events.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Not registered on any events</p>
          ) : (
            cadet.events.map((e) => (
              <div key={e.event_id} className="flex items-center gap-2 px-3 py-1.5">
                <CalendarDays className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-xs">{formatBanEvent(e)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubAppCard({ subApp }: { subApp: SubAppEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-4 border-l-2 border-border pl-3">
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/40">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            {subApp.title}
          </span>
          <Badge variant="outline" className="shrink-0 gap-1">
            <Users className="size-3" />
            {subApp.cadet_count}
          </Badge>
          {expanded
            ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          }
        </div>
      </button>
      {expanded && (
        <div className="mt-1 divide-y border-t">
          {subApp.cadets.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matched cadets.</p>
          ) : (
            subApp.cadets.map((c) => <CadetRow key={c.cin} cadet={c} compact />)
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: CadetEvent }) {
  const [expanded, setExpanded] = useState(false);
  const totalCadets = event.cadet_count + event.sub_apps.reduce((sum, s) => sum + s.cadet_count, 0);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardHeader className="flex flex-row items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm font-medium">{event.title}</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1">
            <Users className="size-3" />
            {totalCadets}
          </Badge>
          {expanded
            ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          }
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="border-t p-0">
          {event.cadets.length === 0 && event.sub_apps.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matched cadets.</p>
          ) : (
            <>
              {event.cadets.length > 0 && (
                <div className="divide-y">
                  {event.cadets.map((c) => <CadetRow key={c.cin} cadet={c} />)}
                </div>
              )}
              {event.sub_apps.length > 0 && (
                <div className={cn("flex flex-col gap-1 pb-2", event.cadets.length > 0 && "border-t")}>
                  <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sub-applications
                  </p>
                  {event.sub_apps.map((sub) => (
                    <SubAppCard key={sub.id} subApp={sub} />
                  ))}
                </div>
              )}
            </>
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
    if (e.cadets.some(
      (c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        String(c.cin).includes(q)
    )) return true;
    return e.sub_apps.some(
      (sub) =>
        sub.title.toLowerCase().includes(q) ||
        sub.cadets.some(
          (c) =>
            c.first_name.toLowerCase().includes(q) ||
            c.last_name.toLowerCase().includes(q) ||
            String(c.cin).includes(q)
        )
    );
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Events"
        description={loading ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""} synced from Bader`}
      />

      {/* Banned cadets */}
      {bans.length > 0 && (() => {
        const subAppParent: Record<number, string> = {};
        for (const evt of events) {
          for (const sub of evt.sub_apps) {
            subAppParent[sub.id] = evt.title;
          }
        }
        const formatBanEvent = (e: { event_id: number; event_title: string }) => {
          const parent = subAppParent[e.event_id];
          return parent ? `${parent}, ${e.event_title}` : e.event_title;
        };
        return (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <Ban className="size-4 shrink-0" />
              <p className="text-sm font-semibold">
                {bans.length} cadet{bans.length !== 1 ? "s" : ""} currently banned from events
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {bans.map((b) => (
                <BannedCadetRow key={b.cin} cadet={b} formatBanEvent={formatBanEvent} />
              ))}
            </div>
          </div>
        );
      })()}

      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by event name or cadet…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>

      <ErrorAlert message={error} title="Could not load events" />

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>No events found</EmptyTitle>
            <EmptyDescription>
              {search ? `Nothing matches "${search}".` : "Run the cadet event scraper to populate this list."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-2">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
