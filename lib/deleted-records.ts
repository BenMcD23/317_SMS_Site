/** A row of `/stores/deleted`: a stores record kept when it was deleted. */
export type DeletedRecord = {
  id: number;
  kind: DeletedKind;
  /** What it was, written by the API ("Uniform order for Amy Adams: Beret, Tie"). */
  label: string;
  deletedAt: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  restoredId: number | null;
};

/** Mirrors KINDS in the API's core/stores_archive.py. */
export type DeletedKind = "uniform_order" | "badge_order" | "logs_form_entry" | "badge_order_list_entry";

/** Where a restored record shows up again, so the page can link straight to it. */
export const DELETED_KIND_PAGES: Record<DeletedKind, { href: string; name: string }> = {
  uniform_order: { href: "/stores/uniform/orders", name: "Uniform orders" },
  badge_order: { href: "/stores/badges/orders", name: "Badge orders" },
  logs_form_entry: { href: "/stores/uniform/orders", name: "Uniform orders" },
  badge_order_list_entry: { href: "/stores/badges/orders", name: "Badge orders" },
};

/** The page for a kind, or undefined for one the site doesn't know yet. */
export function deletedKindPage(kind: string): { href: string; name: string } | undefined {
  return DELETED_KIND_PAGES[kind as DeletedKind];
}
