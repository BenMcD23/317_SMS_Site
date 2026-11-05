// Shared formatting for cadet data — keep flight/rank presentation consistent.

export const RANK_ORDER = ["Cadet", "Cpl", "Sgt", "FS", "CWO"];

// Flights use the chart hues, never the status colours: B Flight in the
// destructive red read as "something's wrong with these cadets".
const ALPHA = "border-chart-1/40 bg-chart-1/10 text-chart-1";
const BRAVO = "border-chart-5/40 bg-chart-5/10 text-chart-5";
const CHARLIE = "border-chart-3/40 bg-chart-3/10 text-chart-3";
const DELTA = "border-chart-4/40 bg-chart-4/15 text-chart-4";
const NO_FLIGHT = "border-border bg-muted text-muted-foreground";

// Flights are whatever the Bader scraper brings in: usually a letter ("A",
// "C"), with "NCO" for the NCOs' own flight. Nothing here lists them, so a
// squadron that gains or loses a flight needs no change to the site.
const NATO = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];

/**
 * Where a flight sits in the alphabet: "A" and "Alpha" are 0, "B" and "Bravo"
 * 1, and so on. -1 for anything that isn't a flight name ("NCO", "Unknown"), so
 * those get neutral colours rather than borrowing a real flight's.
 */
export function flightIndex(flight: string | null | undefined): number {
  const f = (flight ?? "").trim().replace(/\s+flight$/i, "");
  if (/^[A-Za-z]$/.test(f)) return f.toUpperCase().charCodeAt(0) - 65;
  return NATO.indexOf(f.toLowerCase());
}

/** Squadron order: NCO flight first, then A, B, C... and anything unrecognised last, alphabetically. */
export function compareFlights(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "NCO") return -1;
  if (b === "NCO") return 1;
  const ia = flightIndex(a);
  const ib = flightIndex(b);
  if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
  if (ia >= 0 !== ib >= 0) return ia >= 0 ? -1 : 1;
  return a.localeCompare(b);
}

/** The distinct flights in `flights`, in squadron order. */
export function sortFlights(flights: Iterable<string>): string[] {
  return [...new Set(flights)].sort(compareFlights);
}

// The four flight looks cycle by letter, so a fifth flight repeats the first
// look rather than going without one; the label beside it tells them apart.
const FLIGHT_BADGE_CLASSES = [ALPHA, BRAVO, CHARLIE, DELTA];

export function flightBadgeClass(flight: string | null | undefined): string {
  if (!flight) return NO_FLIGHT;
  const i = flightIndex(flight);
  return i < 0 ? NO_FLIGHT : FLIGHT_BADGE_CLASSES[i % FLIGHT_BADGE_CLASSES.length];
}

// Classification steps up in the same order as the dashboard chart, so the
// colour progression reads as progression rather than arbitrary tags. It
// deepens in the squadron navy up to a solid badge for Master Air Cadet — the
// top award was red before, the same colour as an error.
const CLASSIFICATION_BADGE_CLASSES: Record<string, string> = {
  "Junior Cadet": "border-border bg-muted text-muted-foreground",
  "First Class Cadet": "border-primary/25 bg-primary/5 text-primary",
  "Leading Cadet": "border-primary/40 bg-primary/10 text-primary",
  "Senior Cadet": "border-primary/60 bg-primary/20 text-primary",
  "Master Air Cadet": "border-primary bg-primary text-primary-foreground",
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

/** The flights present in a roster, in squadron order (NCO, then A, B, C... as many as there are). */
export function flightsIn(cadets: Array<{ flight: string | null }>): string[] {
  return sortFlights(cadets.map((c) => c.flight?.trim()).filter((f): f is string => !!f));
}

/** "A Flight" for the letter the API stores; anything already spelled out is left alone. */
export function flightLabel(flight: string): string {
  return /flight$/i.test(flight.trim()) ? flight.trim() : `${flight.trim()} Flight`;
}

/**
 * Compares two "First Last" display names by surname, then first name. The API
 * only sends the joined name, so the surname is the last word; multi-word
 * first names still sort correctly because the remainder breaks ties.
 */
export function compareByLastName(a: string, b: string): number {
  const split = (name: string) => {
    const words = name.trim().split(/\s+/);
    return { last: words.pop() ?? "", first: words.join(" ") };
  };
  const x = split(a);
  const y = split(b);
  return x.last.localeCompare(y.last) || x.first.localeCompare(y.first);
}
