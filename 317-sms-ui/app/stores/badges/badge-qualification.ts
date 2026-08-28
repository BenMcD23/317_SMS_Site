/**
 * Checks a badge being ordered against what the cadet has actually earned.
 *
 * The QM orders badges from the catalog in `badge-types.ts`, but the record of
 * what a cadet is entitled to lives in Bader — scraped into either their
 * classification (First Class → Master) or their qualification list. This module
 * is the bridge: it maps a built badge name onto the backend's badge-type
 * catalog (`/cadets/{cin}/badge-qualifications`) and reports whether the cadet
 * holds it.
 *
 * Kept out of `badge-types.ts` so the catalog stays a plain data file — this is
 * the only place that knows how the two naming schemes line up.
 */

import { formatDate } from "@/lib/format";

import { parseBadgeName } from "./badge-types";

// ─── Backend payload ──────────────────────────────────────────────────────────

export type HeldLevel = {
  level: string;
  date_achieved: string | null;
};

export type CadetBadgeType = {
  key: string;
  name: string;
  kind: "leveled" | "boolean";
  /** Every rung of the ladder, highest first. */
  levels: string[];
  /** Only the rungs the cadet has a qualification for, highest first. */
  levels_held: HeldLevel[];
  /** Highest level held, or null. */
  level: string | null;
  date_achieved: string | null;
};

export type CadetQualifications = {
  cin: number;
  classification: string | null;
  /** The classification ladder, lowest → highest. */
  classification_order: string[];
  badges: CadetBadgeType[];
  qualifications: { name: string; date_achieved: string | null }[];
};

// ─── Catalog ↔ qualification mapping ──────────────────────────────────────────

/** Badge category id (badge-types.ts) → badge-type key in the backend catalog. */
const QUAL_KEY_BY_CATEGORY: Record<string, string> = {
  leadership: "leadership",
  music: "music",
  shooting: "shooting",
  radio: "radio",
  cyber: "cyber",
  space: "space",
  "road-marching": "road_marching",
  "first-aid": "first_aid",
  dofe: "duke_of_edinburgh",
  flying: "flying",
};

/** Classification badge name → the classification it requires. */
const CLASSIFICATION_BY_BADGE: Record<string, string> = {
  "First Class": "First Class Cadet",
  Leading: "Leading Cadet",
  Senior: "Senior Cadet",
  Master: "Master Air Cadet",
};

/** Catalog level label → the backend's level slug. */
const LEVEL_SLUGS: Record<string, string> = {
  Blue: "blue",
  Bronze: "bronze",
  Silver: "silver",
  Gold: "gold",
  "Gold (Nijmegen)": "nijmegen",
};

const LEVEL_LABELS: Record<string, string> = {
  blue: "Blue",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  nijmegen: "Nijmegen",
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
  yes: "Held",
};

function levelLabel(slug: string): string {
  return LEVEL_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function achievedSuffix(date: string | null): string {
  return date ? ` (${formatDate(date)})` : "";
}

// ─── The check ────────────────────────────────────────────────────────────────

export type BadgeQualStatus =
  /** Holds exactly the qualification being ordered. */
  | "held"
  /** Holds a higher level of the same badge — no lower-level record, but they
   *  clearly passed through it, so this isn't a red flag. */
  | "higher"
  /** Tracked, but the cadet holds nothing at or above this level. */
  | "missing"
  /** Nothing to check against (core badges, or a level Bader doesn't record). */
  | "untracked";

export type BadgeQualCheck = {
  status: BadgeQualStatus;
  /** Short chip text. */
  label: string;
  /** One line of context — which level they hold, or why it can't be checked. */
  detail: string;
};

/**
 * Does `badgeName` (as built by `buildBadgeName`) match something the cadet has
 * earned? `quals` is the payload from `/cadets/{cin}/badge-qualifications`;
 * pass null while it's still loading and callers get "untracked".
 */
export function checkBadgeQualification(
  badgeName: string,
  quals: CadetQualifications | null
): BadgeQualCheck {
  if (!quals) {
    return { status: "untracked", label: "Not checked", detail: "No qualification data loaded." };
  }

  const { category, subType, level } = parseBadgeName(badgeName);

  if (category?.id === "classification" && subType) {
    return checkClassification(subType, quals);
  }

  // Core badges (squadron number, ATC, TRF) are issued to everyone — there is
  // no qualification behind them.
  if (category?.id === "core") {
    return {
      status: "untracked",
      label: "No qualification",
      detail: "Core badges aren't tied to a qualification.",
    };
  }

  const key = category ? QUAL_KEY_BY_CATEGORY[category.id] : undefined;
  const badge = key ? quals.badges.find((b) => b.key === key) : undefined;
  if (!badge || !level) {
    return {
      status: "untracked",
      label: "Not checked",
      detail: "No qualification is tracked for this badge.",
    };
  }

  const slug = LEVEL_SLUGS[level];
  const wantedIndex = slug ? badge.levels.indexOf(slug) : -1;
  if (wantedIndex === -1) {
    return {
      status: "untracked",
      label: "Not checked",
      detail: `Bader doesn't record a ${level} ${badge.name} qualification.`,
    };
  }

  const exact = badge.levels_held.find((h) => h.level === slug);
  if (exact) {
    return {
      status: "held",
      label: "Qualified",
      detail: `Holds ${levelLabel(slug)} ${badge.name}${achievedSuffix(exact.date_achieved)}.`,
    };
  }

  // `levels` is highest-first, so a smaller index is a higher level.
  const higher = badge.levels_held.find((h) => badge.levels.indexOf(h.level) < wantedIndex);
  if (higher) {
    return {
      status: "higher",
      label: "Higher held",
      detail:
        `No ${levelLabel(slug)} ${badge.name} recorded, but holds ` +
        `${levelLabel(higher.level)}${achievedSuffix(higher.date_achieved)}.`,
    };
  }

  return {
    status: "missing",
    label: "Not qualified",
    detail: badge.level
      ? `Only holds ${levelLabel(badge.level)} ${badge.name}${achievedSuffix(badge.date_achieved)}.`
      : `No ${badge.name} qualification recorded.`,
  };
}

function checkClassification(badgeName: string, quals: CadetQualifications): BadgeQualCheck {
  const required = CLASSIFICATION_BY_BADGE[badgeName];
  const wantedRank = required ? quals.classification_order.indexOf(required) : -1;
  if (wantedRank === -1) {
    return {
      status: "untracked",
      label: "Not checked",
      detail: "No classification is tracked for this badge.",
    };
  }

  // A cadet with no classification recorded hasn't passed First Class yet, so
  // they rank below every rung.
  const heldRank = quals.classification
    ? quals.classification_order.indexOf(quals.classification)
    : -1;

  if (heldRank === wantedRank) {
    return { status: "held", label: "Qualified", detail: `Classified as ${quals.classification}.` };
  }
  if (heldRank > wantedRank) {
    return {
      status: "higher",
      label: "Higher held",
      detail: `Classified as ${quals.classification} — above ${required}.`,
    };
  }
  return {
    status: "missing",
    label: "Not qualified",
    detail: quals.classification
      ? `Classified as ${quals.classification}, not ${required}.`
      : `No classification recorded — ${required} not passed.`,
  };
}
