"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Ruler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { useReference } from "@/lib/reference";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Issuance = {
  id: number;
  itemCategory: string;
  lastGiven: string;
  sizeGiven: string | null;
};

/**
 * "What size did we last give them?" without leaving the order. Shared by the
 * uniform orders page for cadets and staff alike; loads on first open so a page
 * of orders doesn't fire one request per card. Items on this order are listed
 * first, since those are the sizes the QM is about to pick.
 */
export function PreviousSizesPopover({
  issuancesUrl,
  recordHref,
  name,
  itemTypes = [],
}: {
  /** The issuances API route, e.g. /api/stores/issuances/1234. */
  issuancesUrl: string;
  /** Their full record's uniform tab, when they have one to link to. */
  recordHref?: string;
  name: string;
  itemTypes?: string[];
}) {
  const { issuanceCategoryByItem } = useReference();
  const [issuances, setIssuances] = useState<Issuance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch(issuancesUrl);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorDetail(data) ?? "Couldn't load their sizes.");
      // An error body where a list was expected is still a failure, not "no sizes".
      if (!Array.isArray(data)) throw new Error("Couldn't load their sizes.");
      setIssuances(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load their sizes.");
    }
  }

  // Sizes are recorded per category, not per item type ("Slacks" and
  // "Trousers" share one), so map the order's items before matching.
  const onOrder = new Set(itemTypes.map((t) => issuanceCategoryByItem?.[t] ?? t));
  const sorted = [...(issuances ?? [])].sort(
    (a, b) =>
      Number(onOrder.has(b.itemCategory)) - Number(onOrder.has(a.itemCategory)) ||
      a.itemCategory.localeCompare(b.itemCategory)
  );

  return (
    <Popover
      onOpenChange={(open) => {
        // Fetch on first open, and again after a failure so reopening retries.
        if (open && (issuances === null || error)) load();
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8" aria-label={`Previous sizes for ${name}`}>
          <Ruler data-icon="inline-start" />
          Sizes
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Last issued to {name}</p>
        </div>
        <div className="max-h-64 overflow-y-auto px-3 py-2 text-sm">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : issuances === null ? (
            <p className="text-muted-foreground flex items-center gap-2">
              <Spinner /> Loading…
            </p>
          ) : sorted.length === 0 ? (
            <p className="text-muted-foreground">Nothing recorded as issued yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sorted.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3">
                  <span className={cn(onOrder.has(i.itemCategory) ? "font-medium" : "text-muted-foreground")}>
                    {i.itemCategory}
                  </span>
                  <span className="text-right tabular-nums">
                    {i.sizeGiven || "—"}
                    <span className="text-muted-foreground ml-2 text-xs">{formatDate(i.lastGiven)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {recordHref && (
          <div className="border-t px-3 py-2">
            <Link href={recordHref} className="flex items-center gap-1 text-sm font-medium hover:underline">
              Open uniform record <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
