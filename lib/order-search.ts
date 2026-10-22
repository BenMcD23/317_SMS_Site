/**
 * Search for the uniform and badge orders pages, shared so both boxes match
 * the same way. A query can name a cadet or an item: a cadet match keeps the
 * whole order, an item match keeps only the items that matched — searching
 * "Beret" is asking "who's waiting on a beret?", so the rest of each order is
 * noise.
 */
export type OrderSearchResult<O, I> = {
  order: O;
  /** The items to show — every item, or just the ones the query matched. */
  items: I[];
  /** True when `items` is a subset because the order matched by item, not by cadet. */
  itemFiltered: boolean;
};

// The item type comes from the orders, so the `itemName` callback is typed without annotation.
type ItemOf<O extends { items: unknown[] }> = O["items"][number];

export function searchOrders<O extends { cadetName: string; items: unknown[] }>(
  orders: O[],
  query: string,
  itemName: (item: ItemOf<O>) => string
): OrderSearchResult<O, ItemOf<O>>[] {
  const q = query.trim().toLowerCase();
  if (!q) return orders.map((order) => ({ order, items: order.items, itemFiltered: false }));

  const results: OrderSearchResult<O, ItemOf<O>>[] = [];
  for (const order of orders) {
    if ((order.cadetName ?? "").toLowerCase().includes(q)) {
      results.push({ order, items: order.items, itemFiltered: false });
      continue;
    }
    const items = (order.items as ItemOf<O>[]).filter((i) => (itemName(i) ?? "").toLowerCase().includes(q));
    if (items.length > 0) results.push({ order, items, itemFiltered: items.length < order.items.length });
  }
  return results;
}
