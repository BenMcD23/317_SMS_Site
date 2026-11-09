"use client";

import { useState } from "react";
import { CheckCircle2, Link2 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { FlightFilter, type FlightChoice } from "@/components/flight-filter";
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@/components/order-disclosure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { flightBadgeClass, flightsIn } from "@/lib/cadet-format";
import { formatShortDate } from "@/lib/format";
import { personName } from "@/lib/session-planner";
import { lessonName, TRAINING_KEYS, type CatchUp } from "@/lib/training";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

function ranText(c: CatchUp): string {
  return c.ran.map((r) => `${formatShortDate(r.date)} (${r.flights.join(", ")})`).join(" · ");
}

/**
 * The Catch-ups tab: each lesson the programme has run (through an accepted
 * programme link), and who in the flights it ran for still has no QR scan
 * for it. "Was in" means they were at that night, so it's the scan that was
 * missed rather than the lesson: worth asking before teaching it again.
 */
export function CatchUps() {
  const query = useApiQuery<CatchUp[]>(TRAINING_KEYS.catchUps, "/training/catch-ups");
  const [flight, setFlight] = useState<FlightChoice>("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = query.data ?? [];

  const flights = flightsIn(rows.flatMap((r) => r.missing));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (query.isLoading) return <OrderListSkeleton rows={4} />;
  if (query.error) return <ErrorAlert message={query.error.message} title="Couldn't load the catch-ups" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title="No lessons on the programme to catch up on"
        description="Catch-ups come from programme activities linked to lessons. Link them on the Programme links tab."
      >
        <Button asChild variant="outline">
          <Link href="/training/links">Programme links</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Cadets in the flights a lesson ran for, over the last year, who haven&apos;t scanned its QR code.
      </p>
      <FlightFilter flights={flights} value={flight} onChange={setFlight} />
      <OrderList>
        {rows.map((c) => {
          const key = `${c.subject_key}:${c.part}`;
          const missing = c.missing.filter((m) => !flight || m.flight?.trim() === flight);
          const name = lessonName(c.name, c.part, c.parts);
          return (
            <OrderDisclosure
              key={key}
              open={open.has(key)}
              onToggle={() => toggle(key)}
              label={`catch-ups for ${name}`}
              title={name}
              meta={`Ran ${ranText(c)}`}
              muted={missing.length === 0}
              aside={
                <span className="text-sm tabular-nums">
                  {missing.length === 0 ? "Everyone's had it" : `${missing.length} to catch up`}
                </span>
              }
            >
              {missing.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="text-success size-4" aria-hidden />
                  Nobody{flight ? ` in ${flight} Flight` : ""} still needs it.
                </p>
              ) : (
                <ul className="divide-y">
                  {missing.map((m) => (
                    <li key={m.cin} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                      <Link href={`/cadets/${m.cin}`} className="hover:underline">
                        {personName(m)}
                      </Link>
                      {m.flight && (
                        <Badge
                          variant="outline"
                          className={cn("px-1.5 text-[11px]", flightBadgeClass(m.flight))}
                        >
                          {m.flight}
                        </Badge>
                      )}
                      {m.was_in && (
                        <span className="text-muted-foreground text-xs">
                          Was in that night: missed the scan?
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </OrderDisclosure>
          );
        })}
      </OrderList>
    </div>
  );
}
