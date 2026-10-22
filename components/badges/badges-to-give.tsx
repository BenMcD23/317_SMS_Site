"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ChevronRight } from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";
import { type BadgeToGive, countByStage, TO_GIVE_STAGE_INFO } from "@/lib/badge-orders";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { SectionHeading } from "@/components/section-heading";

const TONE_CLASS = {
  ready: "border-success/40 bg-success/10 text-success",
  waiting: "",
  action: "border-warning/40 bg-warning/10 text-warning",
} as const;

/**
 * Quick view of every badge ordered for a cadet but not yet handed over, for
 * the dashboard: on parade night staff can see who to give what without
 * opening each order. Ready-to-give first (the API sorts it that way); long
 * lists collapse so the rest of the dashboard stays in reach, and printing
 * shows the lot.
 */
export function BadgesToGive({ limit = 8 }: { limit?: number }) {
  const { data, isLoading, error } = useApiQuery<BadgeToGive[]>(
    ["badges", "to-give"],
    "/stores/badges/to-give"
  );
  const [open, setOpen] = useState(false);
  // An error body where the list should be would otherwise crash the map.
  const badges = Array.isArray(data) ? data : [];
  const counts = countByStage(badges);
  const ready = counts.notified + counts.in_hand;

  const row = (b: BadgeToGive, extra?: string) => {
    const info = TO_GIVE_STAGE_INFO[b.stage] ?? { label: b.stage, tone: "waiting" as const };
    return (
      <li key={b.itemId} className={cn("flex", extra)}>
        <Link
          href="/stores/badges/orders"
          className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{b.cadetName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {b.badgeName} · ordered {formatDate(b.orderedAt)}
            </span>
          </span>
          <Badge
            variant={info.tone === "waiting" ? "secondary" : "outline"}
            className={TONE_CLASS[info.tone]}
          >
            {info.label}
          </Badge>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </Link>
      </li>
    );
  };

  const shown = open ? badges : badges.slice(0, limit);
  const hidden = open ? [] : badges.slice(limit);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="to-give-heading">
      <SectionHeading
        title={<span id="to-give-heading">Badges to give out</span>}
        description={
          badges.length > 0 ? `${ready} ready to hand over · ${badges.length} waiting in all` : undefined
        }
        actions={
          <Button asChild variant="ghost" size="sm" className="no-print">
            <Link href="/stores/badges/orders">
              Badge orders
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorAlert title="Couldn't load the badges to give out" message={error.message} />
      ) : badges.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="Every badge has been given out"
          description="Badges ordered for cadets show here until they're marked as given."
        />
      ) : (
        <>
          <ul className="bg-card divide-y overflow-hidden rounded-lg border">
            {shown.map((b) => row(b))}
            {hidden.map((b) => row(b, "print-only"))}
          </ul>
          {badges.length > limit && (
            <Button
              variant="ghost"
              size="sm"
              className="no-print self-start"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Show fewer" : `Show all ${badges.length}`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
