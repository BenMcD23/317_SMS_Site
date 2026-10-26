"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Trash2,
  X,
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
import { CountTabs } from "@/components/count-tabs";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BadgeOrder,
  BadgeOrderItem,
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
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@/components/order-disclosure";
import { ExitCollapse, useExitCollapse } from "@/components/exit-collapse";
import { GivenStamp } from "@/components/given-stamp";
import { StockHistory } from "@/components/stock-history";
import { QmNotes } from "@/components/qm-notes";
import { ReadyStamp } from "@/components/ready-stamp";
import { MarkGivenDialog } from "@/components/mark-given-dialog";
import { useOrderWorkflow } from "@/lib/use-order-workflow";
import { useBadgeGrid } from "@/lib/badge-grid";
import { useApiQuery } from "@/lib/use-api-query";
import Link from "next/link";
import { formatTimestamp } from "@/lib/format";
import { completeOrderBlockers } from "@/lib/badge-orders";
import { searchOrders } from "@/lib/order-search";
import { cn } from "@/lib/utils";

type StockMatch = { item: BadgeItem; cell: BadgeCell };

/** An order list entry resolved back to the order item it was created from. */
type OrderItemRef = { order: BadgeOrder; item: BadgeOrderItem };

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

const BADGE_ORDERS_KEY = ["stores", "badges", "orders"];
const ORDER_LIST_KEY = ["stores", "badges", "order-lists"];
const NO_ENTRIES: BadgeOrderListEntry[] = [];

export default function BadgeOrdersPage() {
  const { data: session } = useSession();
  const { gainedWhereOptions } = useReference();
  const token = (session as { id_token?: string } | null)?.id_token ?? null;
  const currentUser =
    (session as { user?: { name?: string; email?: string } } | null)?.user?.name ??
    (session as { user?: { name?: string; email?: string } } | null)?.user?.email ??
    "Unknown";

  const [activeTab, setActiveTab] = useState<"active" | "completed" | "orderlist">("active");

  // Generic confirm dialog
  const { confirm: openConfirm, confirmDialog } = useConfirm();

  // Orders leaving the current tab (deleted, completed, reopened) collapse out
  const { isLeaving, exit } = useExitCollapse();

  const workflow = useOrderWorkflow<BadgeOrderItem, BadgeOrder>({
    basePath: "/api/stores/badges/orders",
    queryKey: BADGE_ORDERS_KEY,
    tabOf: (order) => (order.completed ? "completed" : "active"),
    activeTab,
    currentUser,
    confirm: openConfirm,
    exit,
  });
  const {
    orders,
    setOrders,
    setError,
    expandedIds,
    setExpandedIds,
    toggleExpand,
    markingAsReady,
    removingStock,
  } = workflow;
  const { query: gridQuery, grid, setGrid } = useBadgeGrid();

  // Order list — each entry moves queued -> ordered -> received on its own
  const orderListQuery = useApiQuery<BadgeOrderListEntry[]>(ORDER_LIST_KEY, "/api/stores/badges/order-lists");
  const orderListEntries = orderListQuery.data ?? NO_ENTRIES;
  // The page waits for all three: matching a badge to the grid needs the grid.
  const error = workflow.error ?? gridQuery.error?.message ?? orderListQuery.error?.message ?? null;
  const loading = !error && (workflow.loading || gridQuery.isPending || orderListQuery.isPending);
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

  // Mark as given
  const [markingAsGiven, setMarkingAsGiven] = useState<string | null>(null);
  const [undoingGiven, setUndoingGiven] = useState<string | null>(null);
  const [markGivenOpen, setMarkGivenOpen] = useState(false);
  const [markGivenOrder, setMarkGivenOrder] = useState<BadgeOrder | null>(null);
  const [markGivenItem, setMarkGivenItem] = useState<BadgeOrderItem | null>(null);

  // Sort + search
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [searchQuery, setSearchQuery] = useState("");

  // Jumping from an order list entry back to the order item it came from
  const [pendingJumpItemId, setPendingJumpItemId] = useState<string | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);

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

  function findBadgeStockMatch(badgeName: string): StockMatch | undefined {
    if (!grid) return undefined;
    for (const cell of grid.cells) {
      const item = cell.items.find((i) => i.name === badgeName && i.quantity > 0);
      if (item) return { item, cell };
    }
    return undefined;
  }

  async function doStockAction(
    order: BadgeOrder,
    orderItem: BadgeOrderItem,
    action: "remove" | "return",
    match?: StockMatch
  ) {
    // The answer carries the whole grid back, so the counts can't drift.
    const data = await workflow.stockAction<{ order: BadgeOrder; badges: BadgeGrid }>(
      order.id,
      orderItem.id,
      {
        action,
        itemId: match?.item.id,
      }
    );
    if (data) setGrid(data.badges);
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

  const { replaceOrder, patchOrder } = workflow;
  const handleDeleteOrder = workflow.deleteOrder;
  const handleDeleteOrderItem = (orderId: string, itemId: string, badgeName: string) =>
    workflow.deleteItem(orderId, itemId, `"${badgeName}"`);
  const handleCompleteOrder = workflow.completeOrder;
  const handleReopenOrder = workflow.reopenOrder;

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
      await giveCall(markGivenOrder.id, markGivenItem.id, "mark-given", "Failed to mark as given");
    } finally {
      setMarkingAsGiven(null);
    }
  }

  // mark-given / undo-given answer with the updated order and record the step in
  // the item's history, which a plain PATCH of `givenAt` would not.
  async function giveCall(
    orderId: string,
    itemId: string,
    verb: "mark-given" | "undo-given",
    failure: string
  ) {
    const updated = await workflow.itemAction<BadgeOrder>(
      orderId,
      itemId,
      verb,
      { by: currentUser },
      failure
    );
    if (updated) replaceOrder(updated);
  }

  function handleUndoGiven(order: BadgeOrder, item: BadgeOrderItem) {
    openConfirm(
      `Undo giving ${item.badgeName} to ${order.cadetName}? It goes back to waiting. The history keeps both.`,
      async () => {
        setUndoingGiven(item.id);
        try {
          await giveCall(order.id, item.id, "undo-given", "Failed to undo");
        } finally {
          setUndoingGiven(null);
        }
      }
    );
  }

  const handleMarkItemAsReady = workflow.markReady;

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

  async function refreshOrderListEntries() {
    await orderListQuery.refetch();
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
            className="h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
            className="border-success/40 text-success hover:bg-success/10 hover:text-success h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
            disabled={markingReceivedId === entry.id}
            onClick={() => handleMarkEntryReceived(entry.id)}
          >
            <Inbox className="mr-1.5 h-3 w-3" />
            {markingReceivedId === entry.id ? "Marking..." : "Mark as Received"}
          </Button>
        )}

        {ref && (
          <QmNotes
            notes={notes}
            editable={canEditNotes}
            itemLabel={entry.badgeName}
            onAdd={(content) => workflow.addNote(ref.order.id, ref.item.id, content)}
            onDelete={(noteId) => workflow.deleteNote(ref.order.id, ref.item.id, noteId)}
          />
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

  const sortedOrders = [...(activeTab === "active" ? activeOrders : completedOrders)].sort((a, b) => {
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sortOrder === "oldest" ? diff : -diff;
  });
  const filteredOrders = searchOrders(sortedOrders, searchQuery, (i) => i.badgeName);
  const allExpanded =
    filteredOrders.length > 0 && filteredOrders.every(({ order }) => expandedIds.has(order.id));

  function toggleExpandAll() {
    workflow.toggleExpandAll(filteredOrders.map(({ order }) => order.id));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
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

      <CountTabs
        value={activeTab}
        onValueChange={setActiveTab}
        loading={loading}
        tabs={[
          { value: "active", label: "Active", count: activeOrders.length },
          { value: "orderlist", label: "Order List", count: toOrderEntries.length },
          { value: "completed", label: "Completed", count: completedOrders.length },
        ]}
      />

      {/* Search + Sort */}
      {activeTab !== "orderlist" && (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by cadet or badge..."
            aria-label="Search by cadet or badge"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // Full width on a phone so the buttons drop to their own row.
            className="h-9 basis-full sm:flex-1 sm:basis-0"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={filteredOrders.length === 0}
            onClick={toggleExpandAll}
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            )}
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
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

      {loading && <OrderListSkeleton />}

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

      {/* Orders list */}
      {!loading && activeTab !== "orderlist" && filteredOrders.length > 0 && (
        <OrderList>
          {filteredOrders.map(({ order, items: visibleItems, itemFiltered }) => {
            const expanded = expandedIds.has(order.id);
            const isCompleted = !!order.completed;
            const isAddingHere = addingToOrderId === order.id;
            const completeBlockers = completeOrderBlockers(order);

            return (
              <ExitCollapse key={order.id} id={order.id} leaving={isLeaving(order.id)}>
                <OrderDisclosure
                  open={expanded}
                  onToggle={() => toggleExpand(order.id)}
                  label={`order for ${order.cadetName}`}
                  muted={isCompleted}
                  title={
                    <Link href={`/cadets/${order.cadetCin}?tab=qualifications`} className="hover:underline">
                      {order.cadetName}
                    </Link>
                  }
                  meta={formatTimestamp(order.timestamp)}
                  aside={
                    <>
                      {/* The name links here too, but only looks like a link on
                          hover; checking what they already hold is the usual
                          first step, so it gets a visible button. */}
                      <Button size="sm" variant="outline" className="h-8" asChild>
                        <Link
                          href={`/cadets/${order.cadetCin}?tab=qualifications`}
                          aria-label={`Qualifications held by ${order.cadetName}`}
                        >
                          <Award data-icon="inline-start" />
                          Held
                        </Link>
                      </Button>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {itemFiltered && `${visibleItems.length} of `}
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </Badge>
                    </>
                  }
                >
                  {itemFiltered && (
                    <p className="text-muted-foreground text-xs">
                      Showing {visibleItems.length} of {order.items.length} badges matching your search.
                    </p>
                  )}
                  <ul className="space-y-2">
                    {visibleItems.map((orderItem) => {
                      const stockMatch = findBadgeStockMatch(orderItem.badgeName);
                      const removedFromStock = isRemovedFromStock(orderItem.stockEvents);
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
                          {/* On a phone the actions wrap under the item instead
                                  of taking a fixed column beside it. */}
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                              {orderItem.qualHeld != null &&
                                (orderItem.qualHeld ? (
                                  <p className="text-success flex items-center gap-1 text-xs font-medium">
                                    <Check className="h-3 w-3" />
                                    Qualification is held
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-destructive flex items-center gap-1 text-xs font-medium">
                                      <X className="h-3 w-3" />
                                      Qualification not held
                                    </p>
                                    {orderItem.qualStages && (
                                      <p className="text-muted-foreground text-xs">
                                        Missing{" "}
                                        {orderItem.qualStages
                                          .filter((s) => !s.done)
                                          .map((s) => `stage ${s.stage}: ${s.name}`)
                                          .join("; ")}
                                      </p>
                                    )}
                                  </>
                                ))}
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
                              <div className="flex flex-wrap gap-1.5 sm:w-40 sm:shrink-0 sm:flex-col sm:items-stretch">
                                {removedFromStock ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
                                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
                                    className="h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
                                    className="h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
                                    className="h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
                                  className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
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
                                  className="border-success/40 text-success hover:bg-success/10 hover:text-success h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full"
                                  disabled={markingAsGiven === orderItem.id || !!orderItem.givenAt}
                                  onClick={() => handleMarkItemAsGiven(order, orderItem)}
                                >
                                  <PackageCheck className="mr-1 h-3 w-3" />
                                  Mark as Given
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive h-8 text-xs sm:h-7 sm:w-full"
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

                          <ReadyStamp readyToCollect={orderItem.readyToCollect} givenAt={orderItem.givenAt} />

                          {/* Given stamp: the hand-over, an Undo while the order is open, and the history */}
                          <GivenStamp
                            givenAt={orderItem.givenAt}
                            givenBy={orderItem.givenBy}
                            events={orderItem.givenEvents}
                            itemLabel={orderItem.badgeName}
                            undoing={undoingGiven === orderItem.id}
                            onUndo={
                              !isCompleted && orderItem.givenAt
                                ? () => handleUndoGiven(order, orderItem)
                                : undefined
                            }
                          />

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

                          <QmNotes
                            notes={orderItem.qmNotes}
                            editable={!isCompleted}
                            itemLabel={orderItem.badgeName}
                            onAdd={(content) => workflow.addNote(order.id, orderItem.id, content)}
                            onDelete={(noteId) => workflow.deleteNote(order.id, orderItem.id, noteId)}
                          />
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
                </OrderDisclosure>
              </ExitCollapse>
            );
          })}
        </OrderList>
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
      <MarkGivenDialog
        open={markGivenOpen}
        onOpenChange={setMarkGivenOpen}
        busy={markingAsGiven !== null}
        onConfirm={confirmMarkAsGiven}
      >
        <p>
          <span className="font-medium">{markGivenItem?.badgeName}</span> will be recorded as issued to{" "}
          <span className="font-medium">{markGivenOrder?.cadetName}</span>.
        </p>
      </MarkGivenDialog>

      {/* Confirm Dialog */}
      {confirmDialog}
    </div>
  );
}
