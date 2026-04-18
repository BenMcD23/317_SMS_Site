export type BadgeLevel = "Blue" | "Bronze" | "Silver" | "Gold" | "Gold (Nijmegen)";

export interface BadgeCategory {
  id: string;
  name: string;
  /** Fixed item names — no level selection */
  items?: string[];
  /** Sub-types that each take a level */
  subTypes?: string[];
  /** Levels directly on the category (no sub-types) */
  levels?: BadgeLevel[];
  /** Name prefix used when building the final badge string, e.g. "Leadership" */
  prefix?: string;
}

export const BADGE_CATEGORIES: BadgeCategory[] = [
  {
    id: "core",
    name: "Core Badges",
    items: ["Squadron Num", "ATC", "TRF"],
  },
  {
    id: "classification",
    name: "Classification Badges",
    items: ["First Class", "Leading", "Senior", "Master"],
  },
  {
    id: "leadership",
    name: "Leadership Badges",
    prefix: "Leadership",
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "music",
    name: "Music Badges",
    subTypes: [
      "Bugler / Non-Valved Trumpeter",
      "Bandsman",
      "Piper",
      "Drummer",
      "Marksmanship",
    ],
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "shooting",
    name: "Shooting Badges",
    subTypes: [
      "Shooting",
      "Trained Shot",
      "Marksman",
      "Advanced Marksman",
      "Competition Marksman",
    ],
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "radio",
    name: "Radio Badges",
    prefix: "Radio",
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "cyber",
    name: "Cyber Badges",
    prefix: "Cyber",
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "road-marching",
    name: "Road Marching Badges",
    prefix: "Road Marching",
    levels: ["Bronze", "Silver", "Gold (Nijmegen)"],
  },
  {
    id: "first-aid",
    name: "First Aid Badges",
    prefix: "First Aid",
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "dofe",
    name: "DofE Badges",
    prefix: "DofE",
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
  {
    id: "flying",
    name: "Flying Badge",
    prefix: "Flying",
    levels: ["Blue", "Bronze", "Silver", "Gold"],
  },
];

/** Parse a badge name string back into category/subType/level */
export function parseBadgeName(name: string): {
  category: BadgeCategory | null;
  subType: string | null;
  level: string | null;
} {
  for (const cat of BADGE_CATEGORIES) {
    if (cat.items?.includes(name)) return { category: cat, subType: name, level: null };
  }
  const sep = name.indexOf(" \u2013 ");
  if (sep !== -1) {
    const left = name.slice(0, sep);
    const right = name.slice(sep + 3);
    for (const cat of BADGE_CATEGORIES) {
      if (cat.subTypes?.includes(left) && cat.levels?.includes(right as BadgeLevel))
        return { category: cat, subType: left, level: right };
      if (cat.prefix === left && cat.levels?.includes(right as BadgeLevel))
        return { category: cat, subType: null, level: right };
    }
  }
  return { category: null, subType: null, level: null };
}

/** Build the final badge name string from selections */
export function buildBadgeName(
  category: BadgeCategory,
  subType: string | null,
  level: string | null
): string | null {
  if (category.items) {
    return subType ?? null;
  }
  if (category.subTypes) {
    if (!subType || !level) return null;
    return `${subType} – ${level}`;
  }
  if (category.levels) {
    if (!level) return null;
    return `${category.prefix} – ${level}`;
  }
  return null;
}
