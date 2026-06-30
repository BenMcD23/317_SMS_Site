export type Team = "staff" | "nco";

export interface Person {
  id: string;
  rank: string;
  name: string;
  image: string; // public path on the cadet site, e.g. /people/staff/foo.webp
}

export interface PeopleData {
  staff: Person[];
  ncos: Person[];
}

// Rank hierarchy (highest first) — must stay in sync with the cadet website's
// src/data/people.js, which sorts the public photo grids the same way.
export const STAFF_RANKS = [
  "Sqn Ldr",
  "Flt Lt",
  "Fg Off",
  "Plt Off",
  "WO",
  "FS",
  "Sgt",
  "Cpl",
  "CI",
];

export const NCO_RANKS = ["CWO", "MWO", "WO", "CFS", "FS", "Sgt", "Cpl", "Cdt"];

export function ranksForTeam(team: Team): string[] {
  return team === "staff" ? STAFF_RANKS : NCO_RANKS;
}

/** Sort by rank (per the team's order) then alphabetically by name. */
export function sortPeople(list: Person[], team: Team): Person[] {
  const order = ranksForTeam(team);
  const rankIndex = (rank: string) => {
    const i = order.indexOf(rank);
    return i === -1 ? order.length : i;
  };
  return [...list].sort((a, b) => {
    const r = rankIndex(a.rank) - rankIndex(b.rank);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });
}
