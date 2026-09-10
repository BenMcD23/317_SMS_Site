"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  X,
  StickyNote,
  ArrowUpDown,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  CheckCircle2,
  RotateCcw,
  Bell,
  ClipboardList,
  Copy,
  Check,
  Lock,
  ExternalLink,
  Truck,
  Inbox,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BadgeOrder,
  BadgeOrderItem,
  QmNote,
  BadgeGrid,
  BadgeItem,
  BadgeCell,
  BadgeOrderListEntry,
  isRemovedFromStock,
} from "@/lib/stores-types";
import {
  type BadgeCategory,
  type GainedWhereOption,
  buildBadgeName,
  gainedWhereLabel,
  useReference,
} from "@/lib/reference";
import { CadetSearchInput } from "@/components/cadet-search";
import { useConfirm } from "@/components/confirm-dialog";
import { StockHistory } from "@/components/stock-history";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

type StockMatch = { item: BadgeItem; cell: BadgeCell };

/** An order list entry resolved back to the order item it was created from. */
type OrderItemRef = { order: BadgeOrder; item: BadgeOrderItem };

/** Note composers are keyed so the one in an order and the one on the order list stay independent. */
function entryNoteKey(entryId: string) {
  return `list:${entryId}`;
}

function BadgePicker({
  category,
  subType,
  level,
  onCategory,
  onSubType,
  onLevel,
}: {
  category: BadgeCategory | null;
  subType: string | null;
  level: string | null;
  onCategory: (c: BadgeCategory | null) => void;
  onSubType: (s: string | null) => void;
  onLevel: (l: string | null) => void;
}) {
  const { badgeCategories } = useReference();
  return (
    <div className="space-y-2">
      <Select
        value={category?.id ?? ""}
        onValueChange={(v) => onCategory(badgeCategories.find((c) => c.id === v) ?? null)}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Badge type…" />
        </SelectTrigger>
        <SelectContent>
          {badgeCategories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {category && (category.subTypes || category.items) && (
        <Select value={subType ?? ""} onValueChange={(v) => onSubType(v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={category.subTypes ? "Sub-type…" : "Badge…"} />
          </SelectTrigger>
          <SelectContent>
            {(category.subTypes ?? category.items ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category?.levels && (!category.subTypes || subType) && (
        <Select value={level ?? ""} onValueChange={(v) => onLevel(v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Level…" />
          </SelectTrigger>
          <SelectContent>
            {category.levels.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

type GainedWhereState = {
  gainedWhere: string | null;
  gainedWhereDetail: string;
  gainedDateFrom: string;
  gainedDateTo: string;
};

function emptyGainedWhere(): GainedWhereState {
  return { gainedWhere: null, gainedWhereDetail: "", gainedDateFrom: "", gainedDateTo: "" };
}

function isGainedWhereComplete(g: GainedWhereState): boolean {
  if (!g.gainedWhere) return false;
  if (g.gainedWhere === "other" && !g.gainedWhereDetail.trim()) return false;
  if (!g.gainedDateFrom || !g.gainedDateTo) return false;
  return true;
}

function GainedWhereFields({
  value,
  onChange,
}: {
  value: GainedWhereState;
  onChange: (v: GainedWhereState) => void;
}) {
  const { gainedWhereOptions } = useReference();
  // Every option records the dates attended.
  const needsDates = !!value.gainedWhere;
  return (
    <div className="space-y-2">
      <Select
        value={value.gainedWhere ?? ""}
        onValueChange={(v) =>
          onChange({ ...value, gainedWhere: v, gainedWhereDetail: "", gainedDateFrom: "", gainedDateTo: "" })
        }
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Gained where…" />
        </SelectTrigger>
        <SelectContent>
          {gainedWhereOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.gainedWhere === "other" && (
        <Input
          className="h-8 text-sm"
          placeholder="What was it?"
          value={value.gainedWhereDetail}
          onChange={(e) => onChange({ ...value, gainedWhereDetail: e.target.value })}
        />
      )}

      {needsDates && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            className="h-8 text-sm"
            value={value.gainedDateFrom}
            max={value.gainedDateTo || undefined}
            onChange={(e) => onChange({ ...value, gainedDateFrom: e.target.value })}
          />
          <Input
            type="date"
            className="h-8 text-sm"
            value={value.gainedDateTo}
            min={value.gainedDateFrom || undefined}
            onChange={(e) => onChange({ ...value, gainedDateTo: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function gainedWhereSummary(
  options: GainedWhereOption[],
  g: {
    gainedWhere?: string | null;
    gainedWhereDetail?: string | null;
    gainedDateFrom?: string | null;
    gainedDateTo?: string | null;
  }
): string | null {
  const label = g.gainedWhere === "other" ? g.gainedWhereDetail : gainedWhereLabel(options, g.gainedWhere);
  if (!label) return null;
  if (g.gainedDateFrom && g.gainedDateTo) {
    return `${label} (${g.gainedDateFrom.slice(0, 10)} – ${g.gainedDateTo.slice(0, 10)})`;
  }
  return label;
}

type NewBadgeEntry = {
  badgeName: string;
  gainedWhere: string | null;
  gainedWhereDetail: string;
  gainedDateFrom: string;
  gainedDateTo: string;
};

export default function BadgeOrdersPage() {
  const { data: session } = useSession();
  const { gainedWhereOptions } = useReference();
  const token = (session as { id_token?: string } | null)?.id_token ?? null;
  const currentUser =
    (session as { user?: { name?: string; email?: string } } | null)?.user?.name ??
    (session as { user?: { name?: string; email?: string } } | null)?.user?.email ??
    "Unknown";

  const [orders, setOrders] = useState<BadgeOrder[]>([]);
  const [grid, setGrid] = useState<BadgeGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<"active" | "completed" | "orderlist">("active");

  // Order list — each entry moves queued -> ordered -> received on its own
  const [orderListEntries, setOrderListEntries] = useState<BadgeOrderListEntry[]>([]);
  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [markingOrderedId, setMarkingOrderedId] = useState<string | null>(null);
  const [markingReceivedId, setMarkingReceivedId] = useState<string | null>(null);
  const [showReceived, setShowReceived] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Order-list shortcuts from the order item itself — keyed by order item id,
  // separate from the Order List tab's own in-flight state (keyed by entry id).
  const [sendingToOrderedId, setSendingToOrderedId] = useState<string | null>(null);
  const [markingReceivedQuickId, setMarkingReceivedQuickId] = useState<string | null>(null);

  // New order dialog
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newCadetCin, setNewCadetCin] = useState<number | null>(null);
  const [newCadetName, setNewCadetName] = useState("");
  const [newBadges, setNewBadges] = useState<NewBadgeEntry[]>([]);
  const [newCategory, setNewCategory] = useState<BadgeCategory | null>(null);
  const [newSubType, setNewSubType] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<string | null>(null);
  const [newGainedWhere, setNewGainedWhere] = useState<GainedWhereState>(emptyGainedWhere());
  const [submitting, setSubmitting] = useState(false);

  // Add badge to existing order (inline)
  const [addingToOrderId, setAddingToOrderId] = useState<string | null>(null);
  const [addCategory, setAddCategory] = useState<BadgeCategory | null>(null);
  const [addSubType, setAddSubType] = useState<string | null>(null);
  const [addLevel, setAddLevel] = useState<string | null>(null);
  const [addGainedWhere, setAddGainedWhere] = useState<GainedWhereState>(emptyGainedWhere());

  // QM notes
  const [addingNoteItemId, setAddingNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Mark as given
  const [markingAsGiven, setMarkingAsGiven] = useState<string | null>(null);
  const [markGivenOpen, setMarkGivenOpen] = useState(false);
  const [markGivenOrder, setMarkGivenOrder] = useState<BadgeOrder | null>(null);
  const [markGivenItem, setMarkGivenItem] = useState<BadgeOrderItem | null>(null);
  const [markingAsReady, setMarkingAsReady] = useState<string | null>(null);

  // Remove from / add back to stock (order item id of the row whose call is in flight)
  const [removingStock, setRemovingStock] = useState<string | null>(null);

  // Sort + search
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [searchQuery, setSearchQuery] = useState("");

  // Jumping from an order list entry back to the order item it came from
  const [pendingJumpItemId, setPendingJumpItemId] = useState<string | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);

  // Generic confirm dialog
  const { confirm: openConfirm, confirmDialog } = useConfirm();

  useEffect(() => {
    fetchAll();
  }, []);

  // Runs once the target order has been switched to and expanded, so the row is in the DOM.
  useEffect(() => {
    if (!pendingJumpItemId) return;
    const el = document.getElementById(`badge-order-item-${pendingJumpItemId}`);
    setPendingJumpItemId(null);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightItemId(pendingJumpItemId);
  }, [pendingJumpItemId]);

  useEffect(() => {
    if (!highlightItemId) return;
    const timer = setTimeout(() => setHighlightItemId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightItemId]);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, gridRes, listsRes] = await Promise.all([
        fetch("/api/stores/badges/orders"),
        fetch("/api/stores/badges"),
        fetch("/api/stores/badges/order-lists"),
      ]);
      if (!ordersRes.ok || !gridRes.ok || !listsRes.ok) throw new Error("Failed to fetch data");
      setOrders(await ordersRes.json());
      setGrid(await gridRes.json());
      setOrderListEntries(await listsRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function findBadgeStockMatch(badgeName: string): StockMatch | undefined {
    if (!grid) return undefined;
    for (const cell of grid.cells) {
      const item = cell.items.find((i) => i.name === badgeName && i.quantity > 0);
      if (item) return { item, cell };
    }
    return undefined;
  }

  // The backend adjusts the grid count and appends to the item's stock history
  // together, so the count and the history can't disagree.
  async function doStockAction(
    order: BadgeOrder,
    orderItem: BadgeOrderItem,
    action: "remove" | "return",
    match?: StockMatch
  ) {
    setRemovingStock(orderItem.id);
    try {
      const res = await fetch(`/api/stores/badges/orders/${order.id}/items/${orderItem.id}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, itemId: match?.item.id, by: currentUser }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? "Failed to update stock");
      const updatedOrder: BadgeOrder = data.order;
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      setGrid(data.badges);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRemovingStock(null);
    }
  }

  function handleRemoveFromStock(order: BadgeOrder, orderItem: BadgeOrderItem, match: StockMatch) {
    openConfirm(`Remove one "${match.item.name}" from badge stock?`, () =>
      doStockAction(order, orderItem, "remove", match)
    );
  }

  function handleReturnToStock(order: BadgeOrder, orderItem: BadgeOrderItem) {
    openConfirm(`Put one "${orderItem.badgeName}" back into badge stock?`, () =>
      doStockAction(order, orderItem, "return")
    );
  }

  async function patchOrder(orderId: string, patch: Partial<BadgeOrder>) {
    try {
      const res = await fetch(`/api/stores/badges/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update order");
      const updated = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function doDeleteOrder(orderId: string) {
    try {
      const res = await fetch(`/api/stores/badges/orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete order");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setExpandedIds((prev) => {
        const n = new Set(prev);
        n.delete(orderId);
        return n;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleDeleteOrder(orderId: string, cadetName: string) {
    openConfirm(`Delete the entire order for ${cadetName}? This cannot be undone.`, () =>
      doDeleteOrder(orderId)
    );
  }

  function handleDeleteOrderItem(orderId: string, itemId: string, badgeName: string) {
    openConfirm(`Remove "${badgeName}" from this order?`, () => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      patchOrder(orderId, { items: order.items.filter((i) => i.id !== itemId) });
    });
  }

  function handleDeleteQmNote(orderId: string, item: BadgeOrderItem, noteId: string) {
    openConfirm("Delete this QM note? This cannot be undone.", () => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      patchOrder(orderId, {
        items: order.items.map((i) =>
          i.id === item.id ? { ...i, qmNotes: (i.qmNotes ?? []).filter((n) => n.id !== noteId) } : i
        ),
      });
    });
  }

  function handleCompleteOrder(orderId: string, cadetName: string) {
    openConfirm(`Mark the order for ${cadetName} as complete? It will move to Completed Orders.`, () =>
      patchOrder(orderId, { completed: true })
    );
  }

  function handleReopenOrder(orderId: string, cadetName: string) {
    openConfirm(`Reopen the order for ${cadetName}? It will return to Active Orders.`, () =>
      patchOrder(orderId, { completed: false })
    );
  }

  async function handleAddQmNote(orderId: string, item: BadgeOrderItem) {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const newNote: QmNote = {
      id: crypto.randomUUID(),
      content: noteText.trim(),
      timestamp: new Date().toISOString(),
      addedBy: currentUser,
    };
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      setSavingNote(false);
      return;
    }
    await patchOrder(orderId, {
      items: order.items.map((i) =>
        i.id === item.id ? { ...i, qmNotes: [...(i.qmNotes ?? []), newNote] } : i
      ),
    });
    setNoteText("");
    setSavingNote(false);
    setAddingNoteItemId(null);
  }

  function handleMarkItemAsGiven(order: BadgeOrder, item: BadgeOrderItem) {
    setMarkGivenOrder(order);
    setMarkGivenItem(item);
    setMarkGivenOpen(true);
  }

  async function confirmMarkAsGiven() {
    if (!markGivenOrder || !markGivenItem) return;
    setMarkGivenOpen(false);
    setMarkingAsGiven(markGivenItem.id);
    try {
      const now = new Date().toISOString();
      await patchOrder(markGivenOrder.id, {
        items: markGivenOrder.items.map((i) =>
          i.id === markGivenItem!.id ? { ...i, givenAt: now, givenBy: currentUser } : i
        ),
      });
    } finally {
      setMarkingAsGiven(null);
    }
  }

  async function handleMarkItemAsReady(orderId: string, itemId: string) {
    setMarkingAsReady(itemId);
    try {
      const res = await fetch(`/api/stores/badges/orders/${orderId}/items/${itemId}/mark-ready`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to mark as ready to collect");
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMarkingAsReady(null);
    }
  }

  const currentBadgeName = newCategory ? buildBadgeName(newCategory, newSubType, newLevel) : null;
  const addBadgeName = addCategory ? buildBadgeName(addCategory, addSubType, addLevel) : null;

  function openNewOrder() {
    setNewCadetCin(null);
    setNewCadetName("");
    setNewBadges([]);
    setNewCategory(null);
    setNewSubType(null);
    setNewLevel(null);
    setNewGainedWhere(emptyGainedWhere());
    setNewOrderOpen(true);
  }

  function handleAddBadgeToNew() {
    if (!currentBadgeName || !isGainedWhereComplete(newGainedWhere)) return;
    setNewBadges((prev) => [...prev, { badgeName: currentBadgeName, ...newGainedWhere }]);
    setNewCategory(null);
    setNewSubType(null);
    setNewLevel(null);
    setNewGainedWhere(emptyGainedWhere());
  }

  async function handleCreateOrder() {
    if (!newCadetCin || newBadges.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/badges/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadetCin: newCadetCin,
          items: newBadges.map((b) => ({
            badgeName: b.badgeName,
            gainedWhere: b.gainedWhere,
            gainedWhereDetail: b.gainedWhereDetail,
            gainedDateFrom: b.gainedDateFrom,
            gainedDateTo: b.gainedDateTo,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      const created = await res.json();
      setOrders((prev) => [created, ...prev]);
      setNewOrderOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function startAddToOrder(orderId: string) {
    setAddingToOrderId(orderId);
    setAddCategory(null);
    setAddSubType(null);
    setAddLevel(null);
    setAddGainedWhere(emptyGainedWhere());
  }

  // Order list entries only keep the id of the order item they were made from, so
  // resolve that back to the live order/item to link to it and to reach its QM notes.
  const orderItemRefs = useMemo(() => {
    const map = new Map<string, OrderItemRef>();
    for (const order of orders) {
      for (const item of order.items) map.set(item.id, { order, item });
    }
    return map;
  }, [orders]);

  function resolveEntry(entry: BadgeOrderListEntry): OrderItemRef | undefined {
    return entry.orderItemId ? orderItemRefs.get(entry.orderItemId) : undefined;
  }

  function goToOrderItem(ref: OrderItemRef) {
    setActiveTab(ref.order.completed ? "completed" : "active");
    setSearchQuery("");
    setExpandedIds((prev) => new Set(prev).add(ref.order.id));
    setAddingNoteItemId(null);
    setNoteText("");
    setPendingJumpItemId(ref.item.id);
  }

  const toOrderEntries = orderListEntries.filter((e) => !e.orderedAt);
  const orderedEntries = orderListEntries.filter((e) => !!e.orderedAt && !e.receivedAt);
  const receivedEntries = orderListEntries.filter((e) => !!e.receivedAt);

  function orderListEntryFor(itemId: string): BadgeOrderListEntry | undefined {
    return orderListEntries.find((e) => e.orderItemId === itemId);
  }

  function orderListStageFor(itemId: string): "none" | "toOrder" | "ordered" | "received" {
    const entry = orderListEntryFor(itemId);
    if (!entry) return "none";
    if (entry.receivedAt) return "received";
    if (entry.orderedAt) return "ordered";
    return "toOrder";
  }

  /** Reasons Complete Order is disabled for this order, empty when it's ready.
   * Every badge must be given, and every non-replacement badge must also have
   * been marked received — replacements skip that requirement, same as they
   * skip stock. */
  function completeOrderBlockers(order: BadgeOrder): string[] {
    const notGiven = order.items.filter((i) => !i.givenAt);
    const notReceived = order.items.filter((i) => !i.replacement && !orderListEntryFor(i.id)?.receivedAt);
    const blockers: string[] = [];
    if (notGiven.length > 0) {
      blockers.push(`${notGiven.length} badge${notGiven.length !== 1 ? "s" : ""} not yet given`);
    }
    if (notReceived.length > 0) {
      blockers.push(`${notReceived.length} badge${notReceived.length !== 1 ? "s" : ""} not yet received`);
    }
    return blockers;
  }

  async function refreshOrderListEntries() {
    const res = await fetch("/api/stores/badges/order-lists");
    if (res.ok) setOrderListEntries(await res.json());
  }

  // Raw calls shared by the Order List tab's own buttons and the order item's
  // "skip ahead" shortcuts below — both need the same create/advance requests,
  // just triggered from different places and chained differently.
  async function createOrderListEntry(item: BadgeOrderItem): Promise<BadgeOrderListEntry> {
    const res = await fetch("/api/stores/badges/order-lists/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderItemId: item.id, by: currentUser }),
    });
    if (!res.ok) throw new Error("Failed to add to order list");
    return res.json();
  }

  async function markEntryOrdered(entryId: string): Promise<BadgeOrderListEntry> {
    const res = await fetch(`/api/stores/badges/order-lists/entries/${entryId}/mark-ordered`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: currentUser }),
    });
    if (!res.ok) throw new Error("Failed to mark as ordered");
    return res.json();
  }

  async function markEntryReceived(entryId: string): Promise<BadgeOrderListEntry> {
    const res = await fetch(`/api/stores/badges/order-lists/entries/${entryId}/mark-received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: currentUser }),
    });
    if (!res.ok) throw new Error("Failed to mark as received");
    return res.json();
  }

  async function handleAddToOrderList(item: BadgeOrderItem) {
    setAddingToListId(item.id);
    try {
      await createOrderListEntry(item);
      await refreshOrderListEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingToListId(null);
    }
  }

  async function handleRemoveOrderListEntry(entryId: string) {
    try {
      const res = await fetch(`/api/stores/badges/order-lists/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove entry");
      await refreshOrderListEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleMarkEntryOrdered(entryId: string) {
    setMarkingOrderedId(entryId);
    try {
      await markEntryOrdered(entryId);
      await refreshOrderListEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMarkingOrderedId(null);
    }
  }

  async function handleMarkEntryReceived(entryId: string) {
    setMarkingReceivedId(entryId);
    try {
      await markEntryReceived(entryId);
      await refreshOrderListEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMarkingReceivedId(null);
    }
  }

  /** Straight from the order item to "ordered" — skips the to-order queue, but
   * still creates the entry first so added_by is stamped just like normal. */
  async function handleSendToOrdered(item: BadgeOrderItem) {
    setSendingToOrderedId(item.id);
    try {
      const entry = orderListEntryFor(item.id) ?? (await createOrderListEntry(item));
      if (!entry.orderedAt) await markEntryOrdered(entry.id);
      await refreshOrderListEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSendingToOrderedId(null);
    }
  }

  /** Straight from the order item to "received", from whatever stage it's
   * currently at — walks it through any skipped stages first so the audit
   * trail (added/ordered/received, each by whoever clicked) stays complete. */
  async function handleMarkReceivedQuick(item: BadgeOrderItem) {
    setMarkingReceivedQuickId(item.id);
    try {
      let entry = orderListEntryFor(item.id) ?? (await createOrderListEntry(item));
      if (!entry.orderedAt) entry = await markEntryOrdered(entry.id);
      if (!entry.receivedAt) await markEntryReceived(entry.id);
      await refreshOrderListEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMarkingReceivedQuickId(null);
    }
  }

  function handleCopyEntries(entries: BadgeOrderListEntry[], key: string) {
    const text = entries.map((e) => `${e.badgeName} — ${e.cadetName}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  /**
   * One row on the order list. The badge/cadet text links back to the order item the
   * entry was created from, and its QM notes are shown and editable inline so the
   * order list can be worked through without leaving the tab. `stage` decides which
   * action (if any) and audit lines are shown, matching where the entry currently sits
   * in the queued -> ordered -> received flow.
   */
  function renderOrderListEntry(entry: BadgeOrderListEntry, stage: "toOrder" | "ordered" | "received") {
    const ref = resolveEntry(entry);
    const notes = ref?.item.qmNotes ?? [];
    const canEditNotes = stage === "toOrder" && !!ref && !ref.order.completed;
    const noteKey = entryNoteKey(entry.id);
    const isAddingNoteHere = addingNoteItemId === noteKey;

    return (
      <li key={entry.id} className="bg-muted/30 space-y-2 rounded-md border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          {ref ? (
            <button
              type="button"
              onClick={() => goToOrderItem(ref)}
              className="group focus-visible:ring-ring min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2"
              title={`Go to ${ref.order.cadetName}'s order`}
            >
              <p className="text-sm">
                <span className="font-medium underline-offset-2 group-hover:underline">
                  {entry.badgeName}
                </span>
                <span className="text-muted-foreground"> — {entry.cadetName}</span>
                <ExternalLink className="text-muted-foreground ml-1.5 inline h-3 w-3 shrink-0 align-[-1px]" />
              </p>
              <p className="text-muted-foreground text-[10px]">
                Ordered {formatTimestamp(ref.order.timestamp)}
                {ref.order.completed && " · order completed"}
              </p>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{entry.badgeName}</span>
                <span className="text-muted-foreground"> — {entry.cadetName}</span>
              </p>
              <p className="text-muted-foreground text-[10px]">Original order no longer available</p>
            </div>
          )}

          {stage === "toOrder" && (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive h-6 w-6 shrink-0"
              onClick={() => handleRemoveOrderListEntry(entry.id)}
              aria-label="Remove from order list"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Audit trail — who queued, ordered, and received this badge */}
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[10px]">
            Added to list {formatTimestamp(entry.addedAt)}
            {entry.addedBy && <> · {entry.addedBy}</>}
          </p>
          {entry.orderedAt && (
            <p className="text-muted-foreground text-[10px]">
              Marked ordered {formatTimestamp(entry.orderedAt)}
              {entry.orderedBy && <> · {entry.orderedBy}</>}
            </p>
          )}
          {entry.receivedAt && (
            <p className="text-muted-foreground text-[10px]">
              Marked received {formatTimestamp(entry.receivedAt)}
              {entry.receivedBy && <> · {entry.receivedBy}</>}
            </p>
          )}
        </div>

        {stage === "toOrder" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs disabled:opacity-40"
            disabled={markingOrderedId === entry.id}
            onClick={() => handleMarkEntryOrdered(entry.id)}
          >
            <Truck className="mr-1.5 h-3 w-3" />
            {markingOrderedId === entry.id ? "Marking..." : "Mark as Ordered"}
          </Button>
        )}

        {stage === "ordered" && (
          <Button
            size="sm"
            variant="outline"
            className="border-success/40 text-success hover:bg-success/10 hover:text-success h-7 w-full text-xs disabled:opacity-40"
            disabled={markingReceivedId === entry.id}
            onClick={() => handleMarkEntryReceived(entry.id)}
          >
            <Inbox className="mr-1.5 h-3 w-3" />
            {markingReceivedId === entry.id ? "Marking..." : "Mark as Received"}
          </Button>
        )}

        {(notes.length > 0 || canEditNotes) && (
          <div className="space-y-1.5 border-t pt-2">
            {notes.map((note) => (
              <div key={note.id} className="bg-background space-y-0.5 rounded border px-2.5 py-1.5">
                <p className="text-xs whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-[10px]">
                    {note.addedBy} · {formatTimestamp(note.timestamp)}
                  </p>
                  {canEditNotes && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive h-5 w-5"
                      onClick={() => handleDeleteQmNote(ref!.order.id, ref!.item, note.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {canEditNotes &&
              (isAddingNoteHere ? (
                <div className="space-y-1.5">
                  <textarea
                    className="bg-background focus:ring-ring w-full resize-none rounded-md border px-3 py-1.5 text-xs focus:ring-1 focus:outline-none"
                    rows={3}
                    placeholder="Type your note..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs"
                      disabled={!noteText.trim() || savingNote}
                      onClick={() => handleAddQmNote(ref!.order.id, ref!.item)}
                    >
                      {savingNote ? "Saving..." : "Save Note"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setAddingNoteItemId(null);
                        setNoteText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-full px-2 text-xs"
                  onClick={() => {
                    setAddingNoteItemId(noteKey);
                    setNoteText("");
                  }}
                >
                  <StickyNote className="mr-1.5 h-3 w-3" />
                  Add QM Note
                </Button>
              ))}
          </div>
        )}
      </li>
    );
  }

  async function handleAddToOrder(orderId: string) {
    if (!addBadgeName || !isGainedWhereComplete(addGainedWhere)) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const newItem: BadgeOrderItem = {
      id: "",
      badgeName: addBadgeName,
      qmNotes: [],
      givenAt: null,
      givenBy: null,
      readyToCollect: null,
      gainedWhere: addGainedWhere.gainedWhere,
      gainedWhereDetail: addGainedWhere.gainedWhereDetail,
      gainedDateFrom: addGainedWhere.gainedDateFrom,
      gainedDateTo: addGainedWhere.gainedDateTo,
    };
    await patchOrder(orderId, { items: [...order.items, newItem] });
    setAddingToOrderId(null);
  }

  const activeOrders = orders.filter((o) => !o.completed);
  const completedOrders = orders.filter((o) => !!o.completed);

  const filteredOrders = (activeTab === "active" ? activeOrders : completedOrders)
    .filter(
      (o) => searchQuery.trim() === "" || o.cadetName.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
    .sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortOrder === "oldest" ? diff : -diff;
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Badge Orders"
        description={
          loading ? "Loading…" : `${filteredOrders.length} order${filteredOrders.length !== 1 ? "s" : ""}`
        }
        actions={
          <Button onClick={openNewOrder} size="sm">
            <Plus data-icon="inline-start" />
            New order
          </Button>
        }
      />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 border-b">
          {(["active", "orderlist", "completed"] as const).map((tab) => {
            const count =
              tab === "active"
                ? activeOrders.length
                : tab === "completed"
                  ? completedOrders.length
                  : toOrderEntries.length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4",
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
              >
                {tab === "active" ? "Active" : tab === "completed" ? "Completed" : "Order List"}
                {!loading && (
                  <span
                    className={cn(
                      "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      activeTab === tab ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + Sort */}
      {activeTab !== "orderlist" && (
        <div className="flex gap-2">
          <Input
            placeholder="Search by cadet name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setSortOrder((s) => (s === "oldest" ? "newest" : "oldest"))}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
          </Button>
        </div>
      )}

      <ErrorAlert message={error} />

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4" />
            </Card>
          ))}
        </div>
      )}

      {!loading && activeTab !== "orderlist" && orders.length === 0 && (
        <EmptyState
          icon={Award}
          title="No badge orders yet"
          description="Create one with the button above."
        />
      )}

      {!loading && activeTab !== "orderlist" && orders.length > 0 && filteredOrders.length === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {searchQuery.trim()
            ? "No orders match your search."
            : activeTab === "active"
              ? "No active orders."
              : "No completed orders."}
        </p>
      )}

      {!loading && activeTab === "completed" && completedOrders.length > 0 && (
        <p className="text-muted-foreground text-center text-xs">
          Completed orders are automatically removed after 6 months.
        </p>
      )}

      {/* Orders list */}
      {!loading && activeTab !== "orderlist" && filteredOrders.length > 0 && (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const expanded = expandedIds.has(order.id);
            const isCompleted = !!order.completed;
            const isAddingHere = addingToOrderId === order.id;
            const completeBlockers = completeOrderBlockers(order);

            return (
              <Card key={order.id} className={isCompleted ? "opacity-80" : undefined}>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="font-semibold">{order.cadetName}</p>
                      <p className="text-muted-foreground text-xs">{formatTimestamp(order.timestamp)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(order.id)}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="space-y-3 pt-4">
                    <ul className="space-y-2">
                      {order.items.map((orderItem) => {
                        const stockMatch = findBadgeStockMatch(orderItem.badgeName);
                        const removedFromStock = isRemovedFromStock(orderItem.stockEvents);
                        const isAddingNoteHere = addingNoteItemId === orderItem.id;
                        const orderListEntry = orderListEntryFor(orderItem.id);
                        const orderListStage = orderListStageFor(orderItem.id);

                        return (
                          <li
                            key={orderItem.id}
                            id={`badge-order-item-${orderItem.id}`}
                            className={cn(
                              "bg-muted/30 space-y-2 rounded-md border p-3 transition-colors",
                              highlightItemId === orderItem.id &&
                                "border-primary bg-primary/10 ring-primary/40 ring-2"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="text-sm font-medium">
                                  {orderItem.badgeName}
                                  {orderItem.replacement && (
                                    <Badge
                                      variant="outline"
                                      className="border-warning/40 bg-warning/10 text-warning ml-2"
                                    >
                                      Replacement (£2)
                                    </Badge>
                                  )}
                                </p>
                                {gainedWhereSummary(gainedWhereOptions, orderItem) && (
                                  <p className="text-muted-foreground text-xs">
                                    {gainedWhereSummary(gainedWhereOptions, orderItem)}
                                  </p>
                                )}

                                {!isCompleted &&
                                  (stockMatch ? (
                                    <p className="text-success text-xs font-medium">
                                      In Stock:{" "}
                                      {stockMatch.cell.label ??
                                        `Row ${stockMatch.cell.row + 1} Col ${stockMatch.cell.col + 1}`}{" "}
                                      (×{stockMatch.item.quantity})
                                    </p>
                                  ) : (
                                    <p className="text-muted-foreground text-xs">Out of Stock</p>
                                  ))}
                              </div>

                              {!isCompleted && (
                                <div className="flex w-36 shrink-0 flex-col items-end gap-1.5">
                                  {removedFromStock ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-full text-xs disabled:opacity-40"
                                      disabled={removingStock === orderItem.id}
                                      onClick={() => handleReturnToStock(order, orderItem)}
                                    >
                                      <PackagePlus className="mr-1 h-3 w-3" />
                                      Add Back to Stock
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive h-7 w-full text-xs disabled:opacity-40"
                                      disabled={removingStock === orderItem.id || !stockMatch}
                                      onClick={() =>
                                        stockMatch && handleRemoveFromStock(order, orderItem, stockMatch)
                                      }
                                    >
                                      <PackageMinus className="mr-1 h-3 w-3" />
                                      Remove from Stock
                                    </Button>
                                  )}
                                  {orderListStage === "none" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-full text-xs disabled:opacity-40"
                                      disabled={addingToListId === orderItem.id}
                                      onClick={() => handleAddToOrderList(orderItem)}
                                    >
                                      <ClipboardList className="mr-1 h-3 w-3" />
                                      Add to Order List
                                    </Button>
                                  )}
                                  {(orderListStage === "none" || orderListStage === "toOrder") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-full text-xs disabled:opacity-40"
                                      disabled={sendingToOrderedId === orderItem.id}
                                      onClick={() => handleSendToOrdered(orderItem)}
                                    >
                                      <Truck className="mr-1 h-3 w-3" />
                                      {sendingToOrderedId === orderItem.id
                                        ? "Sending..."
                                        : orderListStage === "toOrder"
                                          ? "Mark as Ordered"
                                          : "Send to Ordered"}
                                    </Button>
                                  )}
                                  {orderListStage !== "received" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-full text-xs disabled:opacity-40"
                                      disabled={markingReceivedQuickId === orderItem.id}
                                      onClick={() => handleMarkReceivedQuick(orderItem)}
                                    >
                                      <Inbox className="mr-1 h-3 w-3" />
                                      {markingReceivedQuickId === orderItem.id
                                        ? "Marking..."
                                        : "Mark as Received"}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary h-7 w-full text-xs disabled:opacity-40"
                                    disabled={
                                      markingAsReady === orderItem.id ||
                                      !!orderItem.readyToCollect ||
                                      !!orderItem.givenAt
                                    }
                                    onClick={() => handleMarkItemAsReady(order.id, orderItem.id)}
                                  >
                                    <Bell className="mr-1 h-3 w-3" />
                                    {orderItem.readyToCollect ? "Notified" : "Ready to Collect"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-success/40 text-success hover:bg-success/10 hover:text-success h-7 w-full text-xs disabled:opacity-40"
                                    disabled={markingAsGiven === orderItem.id || !!orderItem.givenAt}
                                    onClick={() => handleMarkItemAsGiven(order, orderItem)}
                                  >
                                    <PackageCheck className="mr-1 h-3 w-3" />
                                    Mark as Given
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive h-7 w-full text-xs"
                                    onClick={() =>
                                      handleDeleteOrderItem(order.id, orderItem.id, orderItem.badgeName)
                                    }
                                  >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Ready to collect stamp */}
                            {orderItem.readyToCollect && !orderItem.givenAt && (
                              <div className="bg-primary/10 border-primary/30 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
                                <Bell className="text-primary h-3 w-3 shrink-0" />
                                <p className="text-primary text-xs">
                                  Cadet notified {formatTimestamp(orderItem.readyToCollect)}
                                </p>
                              </div>
                            )}

                            {/* Given stamp */}
                            {orderItem.givenAt && (
                              <div className="bg-success/10 border-success/30 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
                                <PackageCheck className="text-success h-3 w-3 shrink-0" />
                                <p className="text-success text-xs">
                                  Given {formatTimestamp(orderItem.givenAt)}
                                  {orderItem.givenBy && <> · {orderItem.givenBy}</>}
                                </p>
                              </div>
                            )}

                            {/* Order list stamps — added/ordered/received, each its own line so
                                the audit trail reads the same as it does on the Order List tab */}
                            {orderListEntry && (
                              <div className="space-y-1">
                                <div className="bg-muted/50 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
                                  <ClipboardList className="text-muted-foreground h-3 w-3 shrink-0" />
                                  <p className="text-muted-foreground text-xs">
                                    Added to order list {formatTimestamp(orderListEntry.addedAt)}
                                    {orderListEntry.addedBy && <> · {orderListEntry.addedBy}</>}
                                  </p>
                                </div>
                                {orderListEntry.orderedAt && (
                                  <div className="bg-muted/50 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
                                    <Truck className="text-muted-foreground h-3 w-3 shrink-0" />
                                    <p className="text-muted-foreground text-xs">
                                      Marked ordered {formatTimestamp(orderListEntry.orderedAt)}
                                      {orderListEntry.orderedBy && <> · {orderListEntry.orderedBy}</>}
                                    </p>
                                  </div>
                                )}
                                {orderListEntry.receivedAt && (
                                  <div className="bg-success/10 border-success/30 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
                                    <Inbox className="text-success h-3 w-3 shrink-0" />
                                    <p className="text-success text-xs">
                                      Marked received {formatTimestamp(orderListEntry.receivedAt)}
                                      {orderListEntry.receivedBy && <> · {orderListEntry.receivedBy}</>}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Stock history */}
                            <StockHistory events={orderItem.stockEvents} />

                            <div className="space-y-1.5 border-t pt-2">
                              {(orderItem.qmNotes ?? []).length > 0 && (
                                <div className="space-y-1">
                                  {(orderItem.qmNotes ?? []).map((note) => (
                                    <div
                                      key={note.id}
                                      className="bg-background space-y-0.5 rounded border px-2.5 py-1.5"
                                    >
                                      <p className="text-xs whitespace-pre-wrap">{note.content}</p>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-muted-foreground text-[10px]">
                                          {note.addedBy} · {formatTimestamp(note.timestamp)}
                                        </p>
                                        {!isCompleted && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="text-muted-foreground hover:text-destructive h-5 w-5"
                                            onClick={() => handleDeleteQmNote(order.id, orderItem, note.id)}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isCompleted &&
                                (isAddingNoteHere ? (
                                  <div className="space-y-1.5">
                                    <textarea
                                      className="bg-background focus:ring-ring w-full resize-none rounded-md border px-3 py-1.5 text-xs focus:ring-1 focus:outline-none"
                                      rows={3}
                                      placeholder="Type your note..."
                                      value={noteText}
                                      onChange={(e) => setNoteText(e.target.value)}
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        className="h-7 px-3 text-xs"
                                        disabled={!noteText.trim() || savingNote}
                                        onClick={() => handleAddQmNote(order.id, orderItem)}
                                      >
                                        {savingNote ? "Saving..." : "Save Note"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => {
                                          setAddingNoteItemId(null);
                                          setNoteText("");
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 w-full px-2 text-xs"
                                    onClick={() => {
                                      setAddingNoteItemId(orderItem.id);
                                      setNoteText("");
                                    }}
                                  >
                                    <StickyNote className="mr-1.5 h-3 w-3" />
                                    Add QM Note
                                  </Button>
                                ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Add badge to existing order */}
                    {!isCompleted &&
                      (isAddingHere ? (
                        <div className="space-y-2 rounded-md border border-dashed p-3">
                          <p className="text-muted-foreground text-xs font-medium">Add badge to order</p>
                          <BadgePicker
                            category={addCategory}
                            subType={addSubType}
                            level={addLevel}
                            onCategory={(c) => {
                              setAddCategory(c);
                              setAddSubType(null);
                              setAddLevel(null);
                            }}
                            onSubType={(s) => {
                              setAddSubType(s);
                              setAddLevel(null);
                            }}
                            onLevel={setAddLevel}
                          />
                          {addBadgeName && (
                            <p className="bg-muted rounded-md px-3 py-1.5 text-xs font-medium">
                              {addBadgeName}
                            </p>
                          )}
                          {addBadgeName && (
                            <GainedWhereFields value={addGainedWhere} onChange={setAddGainedWhere} />
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-7 px-3 text-xs"
                              disabled={!addBadgeName || !isGainedWhereComplete(addGainedWhere)}
                              onClick={() => handleAddToOrder(order.id)}
                            >
                              Add
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setAddingToOrderId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-full text-xs"
                          onClick={() => startAddToOrder(order.id)}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add Badge to Order
                        </Button>
                      ))}

                    {/* Footer actions */}
                    <div className="flex justify-end gap-2 pt-1">
                      {isCompleted ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                          onClick={() => handleReopenOrder(order.id, order.cadetName)}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Reopen Order
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteOrder(order.id, order.cadetName)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Order
                          </Button>
                          {completeBlockers.length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {/* Complete Order is disabled below, which stops it from receiving
                                    hover/focus — this span is what the tooltip actually anchors to. */}
                                <span tabIndex={0} className="inline-flex">
                                  <Button
                                    size="sm"
                                    className="bg-success hover:bg-success/90 text-white disabled:pointer-events-none disabled:opacity-40"
                                    disabled
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Complete Order
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Can&apos;t complete — {completeBlockers.join(", ")}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-success hover:bg-success/90 text-white"
                              onClick={() => handleCompleteOrder(order.id, order.cadetName)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Complete Order
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Order List tab — each badge moves through its own To Order -> Ordered -> Received */}
      {!loading && activeTab === "orderlist" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-semibold">To Order</p>
                  <p className="text-muted-foreground text-xs">Badges queued for the next supplier order</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {toOrderEntries.length} badge{toOrderEntries.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {toOrderEntries.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No badges queued. Use &quot;Add to Order List&quot; on an order item.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {toOrderEntries.map((entry) => renderOrderListEntry(entry, "toOrder"))}
                  </ul>
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyEntries(toOrderEntries, "toOrder")}
                    >
                      {copiedKey === "toOrder" ? (
                        <Check className="text-success mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {copiedKey === "toOrder" ? "Copied" : "Copy List"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-semibold">Ordered</p>
                  <p className="text-muted-foreground text-xs">Sent to the supplier, awaiting delivery</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {orderedEntries.length} badge{orderedEntries.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {orderedEntries.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">Nothing on order.</p>
              ) : (
                <ul className="space-y-1.5">
                  {orderedEntries.map((entry) => renderOrderListEntry(entry, "ordered"))}
                </ul>
              )}
            </CardContent>
          </Card>

          {receivedEntries.length > 0 && (
            <Card className="opacity-80">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">Received</p>
                      <Badge className="border-success/40 bg-success/15 text-success text-xs">
                        <Lock className="mr-1 h-3 w-3" />
                        Complete
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">Delivered and closed out</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {receivedEntries.length} badge{receivedEntries.length !== 1 ? "s" : ""}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setShowReceived((s) => !s)}
                      aria-label={showReceived ? "Collapse" : "Expand"}
                    >
                      {showReceived ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {showReceived && (
                <CardContent className="space-y-3 pt-4">
                  <ul className="space-y-1.5">
                    {receivedEntries.map((entry) => renderOrderListEntry(entry, "received"))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* New Order Dialog */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Badge Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cadet</Label>
              <CadetSearchInput
                token={token}
                selectedCin={newCadetCin}
                selectedName={newCadetName}
                onSelect={(cin, name) => {
                  setNewCadetCin(cin || null);
                  setNewCadetName(name);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Badges</Label>

              {newBadges.length > 0 && (
                <ul className="space-y-1">
                  {newBadges.map((b, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block">{b.badgeName}</span>
                        <span className="text-muted-foreground block text-xs">
                          {gainedWhereSummary(gainedWhereOptions, b)}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground h-6 w-6"
                        onClick={() => setNewBadges((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 rounded-md border border-dashed p-3">
                <BadgePicker
                  category={newCategory}
                  subType={newSubType}
                  level={newLevel}
                  onCategory={(c) => {
                    setNewCategory(c);
                    setNewSubType(null);
                    setNewLevel(null);
                  }}
                  onSubType={(s) => {
                    setNewSubType(s);
                    setNewLevel(null);
                  }}
                  onLevel={setNewLevel}
                />
                {currentBadgeName && (
                  <p className="bg-muted rounded-md px-3 py-1.5 text-xs font-medium">{currentBadgeName}</p>
                )}
                {currentBadgeName && (
                  <GainedWhereFields value={newGainedWhere} onChange={setNewGainedWhere} />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!currentBadgeName || !isGainedWhereComplete(newGainedWhere)}
                  onClick={handleAddBadgeToNew}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Badge
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={submitting || !newCadetCin || newBadges.length === 0}
            >
              {submitting ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Given Dialog */}
      <Dialog open={markGivenOpen} onOpenChange={setMarkGivenOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Given</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{markGivenItem?.badgeName}</span> will be recorded as issued to{" "}
              <span className="font-medium">{markGivenOrder?.cadetName}</span>.
            </p>
            <p className="text-muted-foreground">This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkGivenOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-success hover:bg-success/90 text-white"
              onClick={confirmMarkAsGiven}
              disabled={markingAsGiven !== null}
            >
              <PackageCheck className="mr-2 h-4 w-4" />
              Mark as Given
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      {confirmDialog}
    </div>
  );
}
