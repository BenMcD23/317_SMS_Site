"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { flightLabel } from "@/lib/cadet-format";

/** "All" or one flight — the empty string is All. */
export type FlightChoice = string;

/**
 * One-tap flight narrowing for any cadet list. Shared by the cadet list and the
 * multi-cadet pickers so "just B Flight" works the same everywhere, instead of
 * typing "B" into a search box that also matches every surname with a B in it.
 * Renders nothing when there's only one flight to choose from.
 */
export function FlightFilter({
  flights,
  value,
  onChange,
  className,
}: {
  flights: string[];
  value: FlightChoice;
  onChange: (flight: FlightChoice) => void;
  className?: string;
}) {
  if (flights.length < 2) return null;
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Filter by flight"
      className={className}
      value={value || "all"}
      // Radix sends "" when the pressed item is clicked again; treat that as All
      // rather than leaving nothing pressed.
      onValueChange={(v) => onChange(v === "all" ? "" : v)}
    >
      <ToggleGroupItem value="all" className="px-3">
        All
      </ToggleGroupItem>
      {flights.map((f) => (
        <ToggleGroupItem key={f} value={f} aria-label={flightLabel(f)} className="px-3">
          {f}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
