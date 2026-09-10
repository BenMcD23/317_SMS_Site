// Attendance shapes and presentation shared by the per-person card and the
// squadron-wide page. The present/authorised/absent rule itself lives in the
// backend (core/attendance.py) and arrives as `state` — never re-derive it from
// the status text here, or the two views will drift apart.

export type AttendanceState = "present" | "authorised" | "absent";

export type StateCounts = Record<AttendanceState, number>;

export const STATE_LABEL: Record<AttendanceState, string> = {
  present: "Attended",
  authorised: "Authorised absence",
  absent: "Absent",
};

/** Badge classes per state. Green / amber / red, and every badge also carries
 *  its status text, so colour is never the only signal. */
export const STATE_BADGE: Record<AttendanceState, string> = {
  present: "border-success/40 bg-success/10 text-success",
  authorised: "border-warning/40 bg-warning/15 text-warning",
  absent: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** One letter per state, for grids too tight for the full word. Always paired
 *  with the label as a tooltip so the letter isn't the only signal either. */
export const STATE_LETTER: Record<AttendanceState, string> = {
  present: "P",
  authorised: "A",
  absent: "X",
};

export const EMPTY_COUNTS: StateCounts = { present: 0, authorised: 0, absent: 0 };

/** Tally a set of records by state — the counting side of `STATE_*`, shared by
 *  every view that shows a rate next to a register. */
export function countStates(states: AttendanceState[]): StateCounts {
  const counts = { present: 0, authorised: 0, absent: 0 };
  for (const state of states) counts[state] += 1;
  return counts;
}

export function addCounts(a: StateCounts, b: StateCounts): StateCounts {
  return {
    present: a.present + b.present,
    authorised: a.authorised + b.authorised,
    absent: a.absent + b.absent,
  };
}

export const totalOf = (c: StateCounts) => c.present + c.authorised + c.absent;

/** Turnout as a whole percentage, or null when there is nothing to divide by. */
export function rateOf(counts: StateCounts): number | null {
  const total = totalOf(counts);
  return total ? Math.round((counts.present / total) * 100) : null;
}

/** Turnout ignoring excused absences — the fairer read on an individual. */
export function rateExcludingAuthorised(counts: StateCounts): number | null {
  const base = counts.present + counts.absent;
  return base ? Math.round((counts.present / base) * 100) : null;
}
