"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { FlightFilter } from "@/components/flight-filter";
import { flightLabel, flightsIn } from "@/lib/cadet-format";
import { cn } from "@/lib/utils";

export type PickableCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  flight: string | null;
};

/**
 * Tick-list of cadets with search, a flight filter and select-all. Shared by
 * the Audit and Theory pages, which both start "pick some cadets" — usually a
 * whole flight, so the flight filter plus "Select all" makes that two taps
 * instead of ticking twenty boxes.
 */
export function CadetMultiPicker({
  cadets,
  loading,
  selected,
  onChange,
}: {
  cadets: PickableCadet[];
  loading: boolean;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [search, setSearch] = useState("");
  const [flight, setFlight] = useState("");

  const filtered = cadets.filter((c) => {
    if (flight && c.flight?.trim() !== flight) return false;
    const q = search.toLowerCase();
    return (
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      String(c.cin).includes(q)
    );
  });
  const narrowed = !!search || !!flight;

  function toggle(cin: number) {
    const next = new Set(selected);
    if (next.has(cin)) next.delete(cin);
    else next.add(cin);
    onChange(next);
  }

  return (
    <Card className="flex flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm">
          Select cadets
          <span className="text-muted-foreground ml-2 text-xs font-normal">{selected.size} selected</span>
        </CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-2 border-t px-3 py-2">
        <InputGroup>
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search cadets…"
            aria-label="Search cadets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <FlightFilter flights={flightsIn(cadets)} value={flight} onChange={setFlight} />
      </div>
      {/* Grows with the card beside it on desktop instead of stopping at a fixed
          height and leaving a blank panel under seven names. */}
      <div className="h-72 min-h-72 overflow-y-auto border-t md:h-auto md:flex-1 md:basis-0">
        {loading ? (
          <div className="flex flex-col gap-1.5 p-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            {cadets.length === 0 ? "No cadets on the roster." : "No cadets match."}
          </p>
        ) : (
          <div className="divide-y">
            {filtered.map((c) => (
              <label
                key={c.cin}
                className={cn(
                  "hover:bg-muted/50 flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                  selected.has(c.cin) && "bg-muted/30"
                )}
              >
                <Checkbox checked={selected.has(c.cin)} onCheckedChange={() => toggle(c.cin)} />
                <span className="min-w-0 truncate font-medium">
                  {c.last_name}, {c.first_name}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">{c.cin}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 border-t px-4 py-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-50"
          disabled={filtered.length === 0}
          onClick={() => onChange(new Set([...selected, ...filtered.map((c) => c.cin)]))}
        >
          {flight && !search
            ? `Select all of ${flightLabel(flight)}`
            : `Select all${narrowed ? " shown" : ""}`}
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs"
            onClick={() => onChange(new Set())}
          >
            Clear selection
          </button>
        )}
      </div>
    </Card>
  );
}
