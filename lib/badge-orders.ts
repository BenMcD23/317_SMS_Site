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
