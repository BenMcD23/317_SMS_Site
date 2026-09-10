// Shared formatting for cadet data — keep flight/rank presentation consistent.

export const FLIGHT_ORDER = ["NCO", "A", "B", "C"];
export const RANK_ORDER = ["Cadet", "Cpl", "Sgt", "FS", "CWO"];

const FLIGHT_BADGE_CLASSES: Record<string, string> = {
  Alpha:   "border-chart-1/40 bg-chart-1/10 text-chart-1",
  Bravo:   "border-destructive/40 bg-destructive/10 text-destructive",
  Charlie: "border-success/40 bg-success/10 text-success",
  Delta:   "border-warning/40 bg-warning/15 text-warning",
};

export function flightBadgeClass(flight: string | null | undefined): string {
  if (!flight) return "border-border bg-muted text-muted-foreground";
  return FLIGHT_BADGE_CLASSES[flight] ?? "border-border bg-muted text-muted-foreground";
}

export function cadetInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}
