/** One line of a uniform order being written: shared by the New Order dialog and "Add item" on an order. */
export type DraftItem = {
  itemType: string;
  size: string;
  needSizing: boolean;
  sizingDetails: string;
};

export function emptyDraftItem(): DraftItem {
  return { itemType: "", size: "", needSizing: false, sizingDetails: "" };
}

// C Flight initial kitting: 1 of each standard item, gendered variants chosen on add.

/** What C Flight initial kitting gives a new cadet, one of each. */
export const KIT_ITEMS: Record<"male" | "female", string[]> = {
  male: ["Beret", "Brassard", "Jumper", "Wedgewood Male", "Working Blue Male", "Tie", "Belt", "Trousers"],
  female: [
    "Beret",
    "Brassard",
    "Jumper",
    "Wedgewood Female",
    "Working Blue Female",
    "Tie",
    "Belt",
    "Slacks",
    "Skirts",
  ],
};
