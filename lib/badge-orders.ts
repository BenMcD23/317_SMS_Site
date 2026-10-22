/**
 * Reasons an order can't be completed yet, empty when it's ready. An order is
 * done once every badge has been given to the cadet — whether the badge came
 * through the order list or straight from stock isn't a completion concern.
 */
export function completeOrderBlockers(order: { items: { givenAt?: string | null }[] }): string[] {
  const notGiven = order.items.filter((i) => !i.givenAt);
  if (notGiven.length === 0) return [];
  return [`${notGiven.length} badge${notGiven.length !== 1 ? "s" : ""} not yet given`];
}

/** A badge ordered for a cadet but not yet given to them, from /stores/badges/to-give. */
export interface BadgeToGive {
  orderId: string;
  itemId: string;
  badgeName: string;
  cadetName: string;
  cadetCin: number;
  orderedAt: string;
  stage: BadgeToGiveStage;
}

/** How far along an ungiven badge is, furthest first — the API's order too. */
export const TO_GIVE_STAGES = ["notified", "in_hand", "on_order", "queued", "not_ordered"] as const;
export type BadgeToGiveStage = (typeof TO_GIVE_STAGES)[number];

/**
 * The words for each stage, and whether it's a badge staff can hand over now
 * ("ready"), one waiting on the supplier, or one nobody has ordered yet — the
 * last is the one that needs someone to act.
 */
export const TO_GIVE_STAGE_INFO: Record<
  BadgeToGiveStage,
  { label: string; tone: "ready" | "waiting" | "action" }
> = {
  notified: { label: "Cadet told to collect", tone: "ready" },
  in_hand: { label: "In stores", tone: "ready" },
  on_order: { label: "On order", tone: "waiting" },
  queued: { label: "On the order list", tone: "waiting" },
  not_ordered: { label: "Not ordered yet", tone: "action" },
};

/** How many badges sit at each stage, every stage present (zero or not). */
export function countByStage(badges: BadgeToGive[]): Record<BadgeToGiveStage, number> {
  const counts = Object.fromEntries(TO_GIVE_STAGES.map((s) => [s, 0])) as Record<BadgeToGiveStage, number>;
  for (const b of badges) if (b.stage in counts) counts[b.stage] += 1;
  return counts;
}
