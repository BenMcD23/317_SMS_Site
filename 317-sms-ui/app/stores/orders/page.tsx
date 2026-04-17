"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { ShoppingCart, ChevronDown, ChevronUp, Plus, Trash2, X, StickyNote, ArrowUpDown, PackageCheck, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Order, OrderItem, QmNote, StockItem } from "@/lib/stores-types";
import { ITEM_TYPES, NO_SIZE_ITEMS } from "@/lib/stores-items";
import { SizeCombobox } from "@/components/size-combobox";
import { CadetSearchInput } from "@/components/cadet-search";
import { cn } from "@/lib/utils";

type DraftItem = {
  itemType: string;
  size: string;
  needSizing: boolean;
  sizingDetails: string;
};

function emptyDraftItem(): DraftItem {
  return { itemType: "", size: "", needSizing: false, sizingDetails: "" };
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const token = (session as { id_token?: string } | null)?.id_token ?? null;
  const currentUser =
    (session as { user?: { name?: string; email?: string } } | null)?.user?.name ??
    (session as { user?: { name?: string; email?: string } } | null)?.user?.email ??
    "Unknown";

  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Tab
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  // New order dialog
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newCadetCin, setNewCadetCin] = useState<number | null>(null);
  const [newCadetName, setNewCadetName] = useState("");
  const [newItems, setNewItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [submitting, setSubmitting] = useState(false);

  // Edit size dialog — also handles needSizing + sizingDetails
  const [editSizeOpen, setEditSizeOpen] = useState(false);
  const [editSizeOrderId, setEditSizeOrderId] = useState<string | null>(null);
  const [editSizeItemId, setEditSizeItemId] = useState<string | null>(null);
  const [editSizeItemType, setEditSizeItemType] = useState("");
  const [editSizeValue, setEditSizeValue] = useState("");
  const [editNeedSizing, setEditNeedSizing] = useState(false);
  const [editSizingDetails, setEditSizingDetails] = useState("");

  // Add item to existing order (inline per order)
  const [addingToOrderId, setAddingToOrderId] = useState<string | null>(null);
  const [addItemDraft, setAddItemDraft] = useState<DraftItem>(emptyDraftItem());

  // QM note adding
  const [addingNoteItemId, setAddingNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Mark as given
  const [markingAsGiven, setMarkingAsGiven] = useState<string | null>(null);
  const [markGivenOpen, setMarkGivenOpen] = useState(false);
  const [markGivenOrder, setMarkGivenOrder] = useState<Order | null>(null);
  const [markGivenItem, setMarkGivenItem] = useState<OrderItem | null>(null);

  // Sort and search
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [searchQuery, setSearchQuery] = useState("");

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function openConfirm(message: string, action: () => void) {
    setConfirmMessage(message);
    setPendingAction(() => action);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    pendingAction?.();
    setConfirmOpen(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, stockRes] = await Promise.all([
        fetch("/api/stores/orders"),
        fetch("/api/stores/stock"),
      ]);
      if (!ordersRes.ok || !stockRes.ok) throw new Error("Failed to fetch data");
      setOrders(await ordersRes.json());
      setStock(await stockRes.json());
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

  function findStockMatch(itemType: string, size: string): StockItem | undefined {
    if (NO_SIZE_ITEMS.has(itemType)) {
      return stock.find((s) => s.itemType === itemType);
    }
    return stock.find((s) => s.itemType === itemType && s.size === size);
  }

  async function doRemoveFromStock(stockItem: StockItem) {
    try {
      const res = await fetch(`/api/stores/stock/${stockItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: stockItem.quantity - 1 }),
      });
      if (!res.ok) throw new Error("Failed to update stock");
      const updated = await res.json();
      setStock((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleRemoveFromStock(stockItem: StockItem) {
    openConfirm(
      `Remove one ${stockItem.itemType} (${stockItem.size}) from stock?`,
      () => doRemoveFromStock(stockItem)
    );
  }

  async function doDeleteOrder(orderId: string) {
    try {
      const res = await fetch(`/api/stores/orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete order");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setExpandedIds((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleDeleteOrder(orderId: string, cadetName: string) {
    openConfirm(
      `Delete the entire order for ${cadetName}? This cannot be undone.`,
      () => doDeleteOrder(orderId)
    );
  }

  function handleDeleteOrderItem(orderId: string, itemId: string, itemType: string) {
    openConfirm(
      `Remove ${itemType} from this order?`,
      () => {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return;
        patchOrder(orderId, { items: order.items.filter((i) => i.id !== itemId) });
      }
    );
  }

  function handleDeleteQmNote(orderId: string, item: OrderItem, noteId: string) {
    openConfirm(
      "Delete this QM note? This cannot be undone.",
      () => {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return;
        patchOrder(orderId, {
          items: order.items.map((i) =>
            i.id === item.id ? { ...i, qmNotes: (i.qmNotes ?? []).filter((n) => n.id !== noteId) } : i
          ),
        });
      }
    );
  }

  function openEditSize(orderId: string, item: OrderItem) {
    setEditSizeOrderId(orderId);
    setEditSizeItemId(item.id);
    setEditSizeItemType(item.itemType);
    setEditSizeValue(item.size);
    setEditNeedSizing(item.needSizing);
    setEditSizingDetails(item.sizingDetails ?? "");
    setEditSizeOpen(true);
  }

  async function handleSaveEditSize() {
    if (!editSizeOrderId || !editSizeItemId) return;
    const order = orders.find((o) => o.id === editSizeOrderId);
    if (!order) return;
    await patchOrder(editSizeOrderId, {
      items: order.items.map((i) =>
        i.id === editSizeItemId
          ? { ...i, size: editNeedSizing ? "" : editSizeValue, needSizing: editNeedSizing, sizingDetails: editSizingDetails }
          : i
      ),
    });
    setEditSizeOpen(false);
  }

  async function patchOrder(orderId: string, patch: Partial<Order>) {
    try {
      const res = await fetch(`/api/stores/orders/${orderId}`, {
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

  function handleCompleteOrder(orderId: string, cadetName: string) {
    openConfirm(
      `Mark the order for ${cadetName} as complete? It will move to Completed Orders.`,
      () => patchOrder(orderId, { completed: true })
    );
  }

  function handleReopenOrder(orderId: string, cadetName: string) {
    openConfirm(
      `Reopen the order for ${cadetName}? It will return to Active Orders.`,
      () => patchOrder(orderId, { completed: false })
    );
  }

  function openNewOrder() {
    setNewCadetCin(null);
    setNewCadetName("");
    setNewItems([emptyDraftItem()]);
    setNewOrderOpen(true);
  }

  async function handleCreateOrder() {
    const validItems = newItems.filter((i) => i.itemType);
    if (!newCadetCin || validItems.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadetCin: newCadetCin, items: validItems }),
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

  async function handleAddQmNote(orderId: string, item: OrderItem) {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const newNote: QmNote = {
      id: crypto.randomUUID(),
      content: noteText.trim(),
      timestamp: new Date().toISOString(),
      addedBy: currentUser,
    };
    const order = orders.find((o) => o.id === orderId);
    if (!order) { setSavingNote(false); return; }
    await patchOrder(orderId, {
      items: order.items.map((i) =>
        i.id === item.id ? { ...i, qmNotes: [...(i.qmNotes ?? []), newNote] } : i
      ),
    });
    setNoteText("");
    setSavingNote(false);
    setAddingNoteItemId(null);
  }

  async function doMarkItemAsGiven(order: Order, item: OrderItem) {
    setMarkingAsGiven(item.id);
    try {
      const res = await fetch(`/api/stores/issuances/${order.cadetCin}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          givenBy: currentUser,
          items: [{ itemType: item.itemType, sizeGiven: item.size || null, orderItemId: item.id }],
        }),
      });
      if (!res.ok) throw new Error("Failed to mark as given");
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMarkingAsGiven(null);
    }
  }

  function handleMarkItemAsGiven(order: Order, item: OrderItem) {
    setMarkGivenOrder(order);
    setMarkGivenItem(item);
    setMarkGivenOpen(true);
  }

  async function confirmMarkAsGiven() {
    if (!markGivenOrder || !markGivenItem) return;
    setMarkGivenOpen(false);
    await doMarkItemAsGiven(markGivenOrder, markGivenItem);
  }

  function startAddToOrder(orderId: string) {
    setAddingToOrderId(orderId);
    setAddItemDraft(emptyDraftItem());
  }

  async function handleAddToOrder(orderId: string) {
    if (!addItemDraft.itemType) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const newItem: OrderItem = { id: "", qmNotes: [], givenAt: null, givenBy: null, ...addItemDraft };
    await patchOrder(orderId, { items: [...order.items, newItem] });
    setAddingToOrderId(null);
  }

  const activeOrders = orders.filter((o) => !o.completed);
  const completedOrders = orders.filter((o) => !!o.completed);

  const filteredOrders = (activeTab === "active" ? activeOrders : completedOrders)
    .filter((o) =>
      searchQuery.trim() === "" ||
      o.cadetName.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
    .sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortOrder === "oldest" ? diff : -diff;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading..." : `${filteredOrders.length} order${filteredOrders.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <Button onClick={openNewOrder} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b min-w-max">
          {(["active", "completed"] as const).map((tab) => {
            const count = tab === "active" ? activeOrders.length : completedOrders.length;
            const label = tab === "active" ? "Active Orders" : "Completed Orders";
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5",
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                {!loading && (
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold min-w-[18px]",
                    activeTab === tab
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + Sort controls */}
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

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading orders...</div>
      )}

      {!loading && orders.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No orders yet. Create one with the button above.
        </p>
      )}

      {!loading && orders.length > 0 && filteredOrders.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {searchQuery.trim()
            ? "No orders match your search."
            : activeTab === "active"
              ? "No active orders."
              : "No completed orders."}
        </p>
      )}

      {/* Completed tab info */}
      {!loading && activeTab === "completed" && (
        <p className="text-xs text-muted-foreground text-center">
          Completed orders are automatically removed after 6 months.
        </p>
      )}

      {/* Orders list */}
      {!loading && filteredOrders.length > 0 && (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const expanded = expandedIds.has(order.id);
            const isCompleted = !!order.completed;
            const needSizingCount = order.items.filter((i) => i.needSizing).length;
            const isAddingHere = addingToOrderId === order.id;

            return (
              <Card key={order.id} className={isCompleted ? "opacity-80" : undefined}>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="font-semibold">{order.cadetName}</p>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(order.timestamp)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!isCompleted && needSizingCount > 0 && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs">
                          {needSizingCount} need sizing
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => toggleExpand(order.id)}
                        aria-label={expanded ? "Collapse" : "Expand"}>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="pt-4 space-y-3">
                    <ul className="space-y-2">
                      {order.items.map((orderItem) => {
                        const stockMatch = findStockMatch(orderItem.itemType, orderItem.size);
                        const inStock = stockMatch && stockMatch.quantity > 0;
                        const isAddingNoteHere = addingNoteItemId === orderItem.id;

                        return (
                          <li key={orderItem.id} className="rounded-md border bg-muted/30 p-3 space-y-2">
                            {/* Item header row */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="text-sm font-medium">{orderItem.itemType}</p>

                                {orderItem.needSizing ? (
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-orange-500 dark:text-orange-400">
                                      Needs Sizing
                                    </p>
                                    {orderItem.sizingDetails && (
                                      <div className="rounded-md border bg-muted/40 px-2.5 py-1.5">
                                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Sizing Details</p>
                                        <p className="text-xs text-foreground">{orderItem.sizingDetails}</p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Size: {orderItem.size || "—"}
                                  </p>
                                )}

                                {!isCompleted && (
                                  <div>
                                    {stockMatch ? (
                                      inStock ? (
                                        <p className="text-xs font-medium text-green-600 dark:text-green-400">
                                          Box {stockMatch.box} Section {stockMatch.section} (qty: {stockMatch.quantity})
                                        </p>
                                      ) : (
                                        <p className="text-xs font-medium text-destructive">Out of Stock</p>
                                      )
                                    ) : !orderItem.needSizing ? (
                                      <p className="text-xs text-muted-foreground">Not in stock</p>
                                    ) : null}
                                  </div>
                                )}
                              </div>

                              {!isCompleted && (
                                <div className="flex shrink-0 flex-col gap-1.5 items-end w-36">
                                  {!NO_SIZE_ITEMS.has(orderItem.itemType) && (
                                    <Button size="sm" variant="outline" className="h-7 w-full text-xs"
                                      onClick={() => openEditSize(order.id, orderItem)}>
                                      {orderItem.needSizing ? "Enter Size" : "Edit Size"}
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    disabled={!stockMatch || !inStock}
                                    onClick={() => stockMatch && handleRemoveFromStock(stockMatch)}>
                                    Remove from Stock
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20 disabled:opacity-40"
                                    disabled={markingAsGiven === orderItem.id || !!orderItem.givenAt || orderItem.needSizing || (!NO_SIZE_ITEMS.has(orderItem.itemType) && !orderItem.size)}
                                    onClick={() => handleMarkItemAsGiven(order, orderItem)}>
                                    <PackageCheck className="h-3 w-3 mr-1" />
                                    Mark as Given
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleDeleteOrderItem(order.id, orderItem.id, orderItem.itemType)}>
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Given stamp */}
                            {orderItem.givenAt && (
                              <div className="flex items-center gap-1.5 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-2.5 py-1.5">
                                <PackageCheck className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
                                <p className="text-xs text-green-700 dark:text-green-400">
                                  Given {formatTimestamp(orderItem.givenAt)}
                                  {orderItem.givenBy && <> · {orderItem.givenBy}</>}
                                </p>
                              </div>
                            )}

                            {/* QM Notes */}
                            <div className="space-y-1.5 border-t pt-2">
                              {(orderItem.qmNotes ?? []).length > 0 && (
                                <div className="space-y-1">
                                  {(orderItem.qmNotes ?? []).map((note) => (
                                    <div key={note.id} className="rounded bg-background border px-2.5 py-1.5 space-y-0.5">
                                      <p className="text-xs whitespace-pre-wrap">{note.content}</p>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] text-muted-foreground">
                                          {note.addedBy} · {formatTimestamp(note.timestamp)}
                                        </p>
                                        {!isCompleted && (
                                          <Button size="icon" variant="ghost"
                                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDeleteQmNote(order.id, orderItem, note.id)}
                                            aria-label="Delete note">
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!isCompleted && (
                                isAddingNoteHere ? (
                                  <div className="space-y-1.5">
                                    <textarea
                                      className="w-full rounded-md border bg-background px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                                      rows={3}
                                      placeholder="Type your note..."
                                      value={noteText}
                                      onChange={(e) => setNoteText(e.target.value)}
                                      autoFocus
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" className="h-7 px-3 text-xs"
                                        disabled={!noteText.trim() || savingNote}
                                        onClick={() => handleAddQmNote(order.id, orderItem)}>
                                        {savingNote ? "Saving..." : "Save Note"}
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                        onClick={() => { setAddingNoteItemId(null); setNoteText(""); }}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full"
                                    onClick={() => { setAddingNoteItemId(orderItem.id); setNoteText(""); }}>
                                    <StickyNote className="h-3 w-3 mr-1.5" />
                                    Add QM Note
                                  </Button>
                                )
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Add item to existing order (active only) */}
                    {!isCompleted && (
                      isAddingHere ? (
                        <div className="rounded-md border border-dashed p-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Add item to order</p>
                          <div className="flex gap-2 items-end flex-wrap">
                            <div className="flex-1 min-w-36">
                              <Select value={addItemDraft.itemType}
                                onValueChange={(v) => setAddItemDraft((d) => ({ ...d, itemType: v }))}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Item type" /></SelectTrigger>
                                <SelectContent>
                                  {ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {!NO_SIZE_ITEMS.has(addItemDraft.itemType) && (
                              <div className="w-28">
                                <SizeCombobox
                                  className="h-8 text-sm"
                                  itemType={addItemDraft.itemType}
                                  value={addItemDraft.size}
                                  disabled={addItemDraft.needSizing}
                                  onChange={(v) => setAddItemDraft((d) => ({ ...d, size: v }))}
                                />
                              </div>
                            )}
                            {!NO_SIZE_ITEMS.has(addItemDraft.itemType) && (
                              <div className="flex items-center gap-1.5">
                                <Checkbox id={`ns-add-${order.id}`} checked={addItemDraft.needSizing}
                                  onCheckedChange={(c) => setAddItemDraft((d) => ({ ...d, needSizing: !!c, size: !!c ? "" : d.size }))} />
                                <Label htmlFor={`ns-add-${order.id}`} className="text-xs cursor-pointer whitespace-nowrap">
                                  Need Sizing
                                </Label>
                              </div>
                            )}
                          </div>
                          {!NO_SIZE_ITEMS.has(addItemDraft.itemType) && addItemDraft.needSizing && (
                            <Input className="h-8 text-sm" placeholder="Sizing details (optional)"
                              value={addItemDraft.sizingDetails}
                              onChange={(e) => setAddItemDraft((d) => ({ ...d, sizingDetails: e.target.value }))} />
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 px-3 text-xs"
                              disabled={!addItemDraft.itemType}
                              onClick={() => handleAddToOrder(order.id)}>
                              Add
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                              onClick={() => setAddingToOrderId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                          onClick={() => startAddToOrder(order.id)}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add Item to Order
                        </Button>
                      )
                    )}

                    {/* Footer actions */}
                    <div className="flex justify-end gap-2 pt-1">
                      {isCompleted ? (
                        <Button size="sm" variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20"
                          onClick={() => handleReopenOrder(order.id, order.cadetName)}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Reopen Order
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="destructive"
                            onClick={() => handleDeleteOrder(order.id, order.cadetName)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Order
                          </Button>
                          <Button size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleCompleteOrder(order.id, order.cadetName)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Complete Order
                          </Button>
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

      {/* New Order Dialog */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cadet</Label>
              <CadetSearchInput
                token={token}
                selectedCin={newCadetCin}
                selectedName={newCadetName}
                onSelect={(cin, name) => { setNewCadetCin(cin || null); setNewCadetName(name); }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setNewItems((prev) => [...prev, emptyDraftItem()])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>

              {newItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No items added yet.</p>
              )}

              {newItems.map((item, idx) => (
                <div key={idx} className="space-y-1.5 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select value={item.itemType}
                        onValueChange={(v) => setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, itemType: v } : it))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Item type" /></SelectTrigger>
                        <SelectContent>
                          {ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {!NO_SIZE_ITEMS.has(item.itemType) && (
                      <div className="w-24">
                        <SizeCombobox
                          className="h-8 text-sm"
                          itemType={item.itemType}
                          value={item.size}
                          disabled={item.needSizing}
                          onChange={(v) => setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, size: v } : it))}
                        />
                      </div>
                    )}
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => setNewItems((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove item">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {!NO_SIZE_ITEMS.has(item.itemType) && (
                    <>
                      <div className="flex items-center gap-1.5 px-0.5">
                        <Checkbox id={`ns-new-${idx}`} checked={item.needSizing}
                          onCheckedChange={(c) => setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, needSizing: !!c, size: !!c ? "" : it.size } : it))} />
                        <Label htmlFor={`ns-new-${idx}`} className="text-xs cursor-pointer">Need Sizing</Label>
                      </div>
                      {item.needSizing && (
                        <Input className="h-8 text-sm" placeholder="Sizing details (optional)" value={item.sizingDetails}
                          onChange={(e) => setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, sizingDetails: e.target.value } : it))} />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder}
              disabled={submitting || !newCadetCin || newItems.filter((i) => i.itemType).length === 0}>
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
              <span className="font-medium">{markGivenItem?.itemType}</span> (size{" "}
              <span className="font-medium">{markGivenItem?.size}</span>) will be recorded as issued to{" "}
              <span className="font-medium">{markGivenOrder?.cadetName}</span>.
            </p>
            <p className="text-muted-foreground">
              This will update their uniform issuance record on their cadet profile. If an issuance record already exists for this item it will be overwritten. This cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkGivenOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-700 hover:bg-green-800 text-white"
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
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmMessage}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Size / Sizing Dialog */}
      <Dialog open={editSizeOpen} onOpenChange={setEditSizeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Size & Sizing Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-needs-sizing"
                checked={editNeedSizing}
                onCheckedChange={(c) => {
                  setEditNeedSizing(!!c);
                  if (!c) setEditSizingDetails("");
                }}
              />
              <Label htmlFor="edit-needs-sizing" className="cursor-pointer">Needs Sizing</Label>
            </div>

            {editNeedSizing ? (
              <div className="space-y-1.5">
                <Label htmlFor="editSizingDetails">Sizing Details</Label>
                <textarea
                  id="editSizingDetails"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                  placeholder="e.g. chest 96cm, height 175cm"
                  value={editSizingDetails}
                  onChange={(e) => setEditSizingDetails(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="editSize">Size</Label>
                <SizeCombobox
                  id="editSize"
                  itemType={editSizeItemType}
                  value={editSizeValue}
                  onChange={setEditSizeValue}
                  placeholder="e.g. 95/36"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEditSize()}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSizeOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveEditSize}
              disabled={editNeedSizing ? false : !editSizeValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
