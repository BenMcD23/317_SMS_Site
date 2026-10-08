// Shared formatting for cadet data — keep flight/rank presentation consistent.

export const FLIGHT_ORDER = ["NCO", "A", "B", "C"];
export const RANK_ORDER = ["Cadet", "Cpl", "Sgt", "FS", "CWO"];

const ALPHA = "border-chart-1/40 bg-chart-1/10 text-chart-1";
const BRAVO = "border-destructive/40 bg-destructive/10 text-destructive";
const CHARLIE = "border-success/40 bg-success/10 text-success";
const DELTA = "border-warning/40 bg-warning/15 text-warning";
const NO_FLIGHT = "border-border bg-muted text-muted-foreground";

// Flights are stored as the letter ("A", "C" — see FLIGHT_ORDER and the API's
// kit-flight query); the spelled-out names are kept so either form colours.
const FLIGHT_BADGE_CLASSES: Record<string, string> = {
  A: ALPHA,
  B: BRAVO,
  C: CHARLIE,
  D: DELTA,
  Alpha: ALPHA,
  Bravo: BRAVO,
  Charlie: CHARLIE,
  Delta: DELTA,
};

export function flightBadgeClass(flight: string | null | undefined): string {
  if (!flight) return NO_FLIGHT;
  return FLIGHT_BADGE_CLASSES[flight.trim()] ?? NO_FLIGHT;
}

// Classification steps up in the same order as the dashboard chart, so the
// colour progression reads as progression rather than arbitrary tags.
const CLASSIFICATION_BADGE_CLASSES: Record<string, string> = {
  "Junior Cadet": "border-border bg-muted text-muted-foreground",
  "First Class Cadet": "border-chart-1/40 bg-chart-1/10 text-chart-1",
  "Leading Cadet": "border-success/40 bg-success/10 text-success",
  "Senior Cadet": "border-warning/40 bg-warning/15 text-warning",
  "Master Air Cadet": "border-destructive/40 bg-destructive/10 text-destructive",
};

export function classificationBadgeClass(classification: string | null | undefined): string {
  return (
    CLASSIFICATION_BADGE_CLASSES[classification || "Junior Cadet"] ??
    "border-border bg-muted text-muted-foreground"
  );
}

export function cadetInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

/** The flights present in a roster, in squadron order (NCO, A, B, C, then anything unexpected). */
export function flightsIn(cadets: Array<{ flight: string | null }>): string[] {
  const present = new Set(cadets.map((c) => c.flight?.trim()).filter((f): f is string => !!f));
  const known = FLIGHT_ORDER.filter((f) => present.has(f));
  const extra = [...present].filter((f) => !FLIGHT_ORDER.includes(f)).sort();
  return [...known, ...extra];
}

/** "A Flight" for the letter the API stores; anything already spelled out is left alone. */
export function flightLabel(flight: string): string {
  return /flight$/i.test(flight.trim()) ? flight.trim() : `${flight.trim()} Flight`;
}
