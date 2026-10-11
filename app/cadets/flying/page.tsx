"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CalendarDays, Plane, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";
import { useConfirm } from "@/components/confirm-dialog";
import { API_BASE } from "@/lib/config";
import { apiFetch, apiRequest, loadError } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Form = "tg21" | "tg23" | "av_med";

// The forms every cadet on a flying event needs, in the order they're done.
const FORMS: { key: Form; label: string }[] = [
  { key: "tg21", label: "TG 21" },
  { key: "tg23", label: "TG 23" },
  { key: "av_med", label: "AV Med" },
];

type FlyingCadet = {
  cin: number;
  first_name: string | null;
  last_name: string | null;
  rank: string | null;
  flight: string | null;
  on_event: boolean;
  updated_at: string | null;
  updated_by: string | null;
} & Record<Form, boolean>;

type FlyingEvent = {
  id: number;
  bader_event_id: string;
  title: string;
  category: string;
  date_from: string | null;
  date_to: string | null;
  on_bader: boolean;
  has_ticks: boolean;
  cadets: FlyingCadet[];
};

// Bader's category names are long; the card only needs to say which kind.
function categoryLabel(category: string): string {
  return /gliding/i.test(category) ? "Gliding" : "AEF";
}

function cadetName(c: FlyingCadet): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || `CIN ${c.cin}`;
}

function isComplete(c: FlyingCadet): boolean {
  return FORMS.every((f) => c[f.key]);
}

function FlyingEventCard({
  event,
  onTick,
  onClose,
}: {
  event: FlyingEvent;
  onTick: (cadet: FlyingCadet, form: Form, value: boolean) => void;
  onClose: () => void;
}) {
  // Cadets who've left the event only stay because something was ticked for
  // them, so they don't count toward what's still outstanding.
  const onEvent = event.cadets.filter((c) => c.on_event);
  const complete = onEvent.filter(isComplete).length;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 border-b px-4 py-3">
        <Plane className="text-muted-foreground size-4 shrink-0" />
        {/* basis keeps the title readable on a phone; the badges wrap under it */}
        <div className="min-w-0 flex-1 basis-48">
          <CardTitle className="text-sm font-medium">{event.title}</CardTitle>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <CalendarDays className="size-3" />
            {formatDate(event.date_from, "No date")}
          </p>
        </div>
        <Badge variant="secondary">{categoryLabel(event.category)}</Badge>
        {!event.on_bader && (
          <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning">
            No longer on Bader
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "tabular-nums",
            onEvent.length > 0 &&
              complete === onEvent.length &&
              "border-success/40 bg-success/10 text-success"
          )}
        >
          {complete}/{onEvent.length} complete
        </Badge>
        <Button size="sm" variant="outline" onClick={onClose} aria-label={`Close ${event.title}`}>
          <Trash2 data-icon="inline-start" />
          Close
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {event.cadets.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-sm">No matched cadets on this event.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Cadet</TableHead>
                  {FORMS.map((f) => (
                    <TableHead key={f.key} className="w-20 text-center">
                      {f.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.cadets.map((cadet) => (
                  <TableRow key={cadet.cin} className={cn(!cadet.on_event && "opacity-60")}>
                    <TableCell className="pl-4">
                      <Link href={`/cadets/${cadet.cin}`} className="font-medium hover:underline">
                        {cadetName(cadet)}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {[cadet.rank, cadet.flight && `${cadet.flight} Flight`].filter(Boolean).join(" · ") ||
                          `CIN ${cadet.cin}`}
                      </p>
                      {!cadet.on_event && <p className="text-warning text-xs">No longer on the event</p>}
                    </TableCell>
                    {FORMS.map((f) => (
                      <TableCell key={f.key} className="text-center">
                        <Checkbox
                          checked={cadet[f.key]}
                          onCheckedChange={(v) => onTick(cadet, f.key, v === true)}
                          aria-label={`${f.label} for ${cadetName(cadet)}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FlyingPaperworkPage() {
  const { data: session } = useSession();
  const token = session?.id_token;

  const [events, setEvents] = useState<FlyingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch(`${API_BASE}/flying-paperwork`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        // An error body is `{detail}`, not a list.
        if (!res.ok) throw await loadError(res);
        setEvents(await res.json());
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const patchCadet = useCallback((eventId: number, cin: number, change: Partial<FlyingCadet>) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const cadets = e.cadets.map((c) => (c.cin === cin ? { ...c, ...change } : c));
        return { ...e, cadets, has_ticks: cadets.some((c) => FORMS.some((f) => c[f.key])) };
      })
    );
  }, []);

  async function tick(event: FlyingEvent, cadet: FlyingCadet, form: Form, value: boolean) {
    if (!token) return;
    // Ticked straight away so a row of boxes can be clicked through quickly;
    // put back if the save fails.
    patchCadet(event.id, cadet.cin, { [form]: value });
    try {
      const saved = await apiRequest<FlyingCadet>(
        token,
        `${API_BASE}/flying-paperwork/${event.id}/cadets/${cadet.cin}`,
        { method: "PATCH", body: { [form]: value } },
        "Could not save that tick."
      );
      patchCadet(event.id, cadet.cin, saved);
    } catch (e) {
      patchCadet(event.id, cadet.cin, { [form]: !value });
      toast.error(e instanceof Error ? e.message : "Could not save that tick.");
    }
  }

  function close(event: FlyingEvent) {
    const message = [
      `Close "${event.title}" and delete its paperwork record? This can't be undone.`,
      event.on_bader ? "It's still on Bader, so the next event scrape will start tracking it again." : "",
    ]
      .filter(Boolean)
      .join(" ");
    confirm(message, async () => {
      if (!token) return;
      try {
        await apiRequest(token, `${API_BASE}/flying-paperwork/${event.id}`, { method: "DELETE" });
        setEvents((prev) => prev.filter((e) => e.id !== event.id));
        toast.success(`Closed ${event.title}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not close the event.");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Flying paperwork"
        description="TG 21, TG 23 and AV Med for every cadet on an AEF or gliding event. Events with nothing ticked drop off once they leave Bader; anything ticked stays until it's closed here."
      />

      <ErrorAlert message={error} title="Could not load flying paperwork" />

      {loading && <ListSkeleton rows={4} />}

      {!loading && !error && events.length === 0 && (
        <EmptyState
          icon={Plane}
          title="No flying events"
          description="AEF and gliding events show up here after the cadet event scraper runs."
        />
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-4">
          {events.map((event) => (
            <FlyingEventCard
              key={event.id}
              event={event}
              onTick={(cadet, form, value) => tick(event, cadet, form, value)}
              onClose={() => close(event)}
            />
          ))}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
