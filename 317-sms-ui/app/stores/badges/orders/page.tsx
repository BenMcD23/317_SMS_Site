"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Award, ShoppingCart, ChevronDown, ChevronUp, Plus, Trash2, X,
  StickyNote, ArrowUpDown, PackageCheck, CheckCircle2, RotateCcw, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BadgeOrder, BadgeOrderItem, QmNote, BadgeGrid, BadgeItem, BadgeCell } from "@/lib/stores-types";
import { BADGE_CATEGORIES, BadgeCategory, buildBadgeName } from "../badge-types";
import { CadetSearchInput } from "@/components/cadet-search";
import { cn } from "@/lib/utils";

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

type StockMatch = { item: BadgeItem; cell: BadgeCell };

function BadgePicker({
  category, subType, level, onCategory, onSubType, onLevel,
}: {
  category: BadgeCategory | null;
  subType: string | null;
  level: string | null;
  onCategory: (c: BadgeCategory | null) => void;
  onSubType: (s: string | null) => void;
  onLevel: (l: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Select
        value={category?.id ?? ""}
        onValueChange={(v) => onCategory(BADGE_CATEGORIES.find((c) => c.id === v) ?? null)}
      >
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Badge type…" /></SelectTrigger>
        <SelectContent>
          {BADGE_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {category && (category.subTypes || category.items) && (
        <Select value={subType ?? ""} onValueChange={(v) => onSubType(v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={category.subTypes ? "Sub-type…" : "Badge…"} />
          </SelectTrigger>
          <SelectContent>
            {(category.subTypes ?? category.items ?? []).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category?.levels && (!category.subTypes || subType) && (
        <Select value={level ?? ""} onValueChange={(v) => onLevel(v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Level…" /></SelectTrigger>
          <SelectContent>
            {category.levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default function BadgeOrdersPage() {
  const { data: session } = useSession();
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

  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  // New order dialog
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newCadetCin, setNewCadetCin] = useState<number | null>(null);
  const [newCadetName, setNewCadetName] = useState("");
  const [newBadgeNames, setNewBadgeNames] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<BadgeCategory | null>(null);
  const [newSubType, setNewSubType] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add badge to existing order (inline)
  const [addingToOrderId, setAddingToOrderId] = useState<string | null>(null);
  const [addCategory, setAddCategory] = useState<BadgeCategory | null>(null);
  const [addSubType, setAddSubType] = useState<string | null>(null);
  const [addLevel, setAddLevel] = useState<string | null>(null);

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

  // Sort + search
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [searchQuery, setSearchQuery] = useState("");

  // Generic confirm dialog
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
      const [ordersRes, gridRes] = await Promise.all([
        fetch("/api/stores/badges/orders"),
        fetch("/api/stores/badges"),
      ]);
      if (!ordersRes.ok || !gridRes.ok) throw new Error("Failed to fetch data");
      setOrders(await ordersRes.json());
      setGrid(await gridRes.json());
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

  async function doRemoveFromStock(match: StockMatch) {
    const { item } = match;
    try {
      const newQty = item.quantity - 1;
      if (newQty <= 0) {
        const res = await fetch(`/api/stores/badges/items/${item.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to remove from stock");
        setGrid((prev) =>
          prev
            ? { ...prev, cells: prev.cells.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== item.id) })) }
            : prev
        );
      } else {
        const res = await fetch(`/api/stores/badges/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: newQty }),
        });
        if (!res.ok) throw new Error("Failed to update stock");
        const updated = await res.json();
        setGrid((prev) =>
          prev
            ? { ...prev, cells: prev.cells.map((c) => ({ ...c, items: c.items.map((i) => (i.id === updated.id ? updated : i)) })) }
            : prev
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleRemoveFromStock(match: StockMatch) {
    openConfirm(
      `Remove one "${match.item.name}" from badge stock?`,
      () => doRemoveFromStock(match)
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

  function handleDeleteOrderItem(orderId: string, itemId: string, badgeName: string) {
    openConfirm(
      `Remove "${badgeName}" from this order?`,
      () => {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return;
        patchOrder(orderId, { items: order.items.filter((i) => i.id !== itemId) });
      }
    );
  }

  function handleDeleteQmNote(orderId: string, item: BadgeOrderItem, noteId: string) {
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
    setNewBadgeNames([]);
    setNewCategory(null); setNewSubType(null); setNewLevel(null);
    setNewOrderOpen(true);
  }

  function handleAddBadgeToNew() {
    if (!currentBadgeName) return;
    setNewBadgeNames((prev) => [...prev, currentBadgeName]);
    setNewCategory(null); setNewSubType(null); setNewLevel(null);
  }

  async function handleCreateOrder() {
    if (!newCadetCin || newBadgeNames.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/badges/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadetCin: newCadetCin,
          items: newBadgeNames.map((badgeName) => ({ badgeName })),
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
    setAddCategory(null); setAddSubType(null); setAddLevel(null);
  }

  async function handleAddToOrder(orderId: string) {
    if (!addBadgeName) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const newItem: BadgeOrderItem = { id: "", badgeName: addBadgeName, qmNotes: [], givenAt: null, givenBy: null, readyToCollect: null };
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
          <h1 className="text-3xl font-bold">Badge Orders</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading..." : `${filteredOrders.length} order${filteredOrders.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <Button onClick={openNewOrder} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b min-w-max">
          {(["active", "completed"] as const).map((tab) => {
            const count = tab === "active" ? activeOrders.length : completedOrders.length;
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
                {tab === "active" ? "Active Orders" : "Completed Orders"}
                {!loading && (
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold min-w-[18px]",
                    activeTab === tab ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2">
        <Input
          placeholder="Search by cadet name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9"
        />
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5"
          onClick={() => setSortOrder((s) => (s === "oldest" ? "newest" : "oldest"))}>
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && <div className="py-12 text-center text-sm text-muted-foreground">Loading orders...</div>}

      {!loading && orders.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No badge orders yet. Create one with the button above.
        </p>
      )}

      {!loading && orders.length > 0 && filteredOrders.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {searchQuery.trim()
            ? "No orders match your search."
            : activeTab === "active" ? "No active orders." : "No completed orders."}
        </p>
      )}

      {!loading && activeTab === "completed" && completedOrders.length > 0 && (
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
                      <Badge variant="secondary" className="text-xs">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => toggleExpand(order.id)}>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="pt-4 space-y-3">
                    <ul className="space-y-2">
                      {order.items.map((orderItem) => {
                        const stockMatch = findBadgeStockMatch(orderItem.badgeName);
                        const isAddingNoteHere = addingNoteItemId === orderItem.id;

                        return (
                          <li key={orderItem.id} className="rounded-md border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="text-sm font-medium">{orderItem.badgeName}</p>

                                {!isCompleted && (
                                  stockMatch ? (
                                    <p className="text-xs font-medium text-green-600 dark:text-green-400">
                                      In Stock: {stockMatch.cell.label ?? `Row ${stockMatch.cell.row + 1} Col ${stockMatch.cell.col + 1}`} (×{stockMatch.item.quantity})
                                    </p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Out of Stock</p>
                                  )
                                )}
                              </div>

                              {!isCompleted && (
                                <div className="flex shrink-0 flex-col gap-1.5 items-end w-36">
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    disabled={!stockMatch}
                                    onClick={() => stockMatch && handleRemoveFromStock(stockMatch)}>
                                    Remove from Stock
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-blue-700 border-blue-300 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20 disabled:opacity-40"
                                    disabled={markingAsReady === orderItem.id || !!orderItem.readyToCollect || !!orderItem.givenAt}
                                    onClick={() => handleMarkItemAsReady(order.id, orderItem.id)}>
                                    <Bell className="h-3 w-3 mr-1" />
                                    {orderItem.readyToCollect ? "Notified" : "Ready to Collect"}
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20 disabled:opacity-40"
                                    disabled={markingAsGiven === orderItem.id || !!orderItem.givenAt}
                                    onClick={() => handleMarkItemAsGiven(order, orderItem)}>
                                    <PackageCheck className="h-3 w-3 mr-1" />
                                    Mark as Given
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="h-7 w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleDeleteOrderItem(order.id, orderItem.id, orderItem.badgeName)}>
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Ready to collect stamp */}
                            {orderItem.readyToCollect && !orderItem.givenAt && (
                              <div className="flex items-center gap-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2.5 py-1.5">
                                <Bell className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />
                                <p className="text-xs text-blue-700 dark:text-blue-400">
                                  Cadet notified {formatTimestamp(orderItem.readyToCollect)}
                                </p>
                              </div>
                            )}

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
                                            onClick={() => handleDeleteQmNote(order.id, orderItem, note.id)}>
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

                    {/* Add badge to existing order */}
                    {!isCompleted && (
                      isAddingHere ? (
                        <div className="rounded-md border border-dashed p-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Add badge to order</p>
                          <BadgePicker
                            category={addCategory}
                            subType={addSubType}
                            level={addLevel}
                            onCategory={(c) => { setAddCategory(c); setAddSubType(null); setAddLevel(null); }}
                            onSubType={(s) => { setAddSubType(s); setAddLevel(null); }}
                            onLevel={setAddLevel}
                          />
                          {addBadgeName && (
                            <p className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium">{addBadgeName}</p>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 px-3 text-xs"
                              disabled={!addBadgeName}
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
                          Add Badge to Order
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
          <DialogHeader><DialogTitle>New Badge Order</DialogTitle></DialogHeader>
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
              <Label>Badges</Label>

              {newBadgeNames.length > 0 && (
                <ul className="space-y-1">
                  {newBadgeNames.map((name, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                      <span>{name}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground"
                        onClick={() => setNewBadgeNames((prev) => prev.filter((_, i) => i !== idx))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-md border border-dashed p-3 space-y-2">
                <BadgePicker
                  category={newCategory}
                  subType={newSubType}
                  level={newLevel}
                  onCategory={(c) => { setNewCategory(c); setNewSubType(null); setNewLevel(null); }}
                  onSubType={(s) => { setNewSubType(s); setNewLevel(null); }}
                  onLevel={setNewLevel}
                />
                {currentBadgeName && (
                  <p className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium">{currentBadgeName}</p>
                )}
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                  disabled={!currentBadgeName}
                  onClick={handleAddBadgeToNew}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Badge
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder}
              disabled={submitting || !newCadetCin || newBadgeNames.length === 0}>
              {submitting ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Given Dialog */}
      <Dialog open={markGivenOpen} onOpenChange={setMarkGivenOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Mark as Given</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{markGivenItem?.badgeName}</span> will be recorded as issued to{" "}
              <span className="font-medium">{markGivenOrder?.cadetName}</span>.
            </p>
            <p className="text-muted-foreground">This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkGivenOpen(false)}>Cancel</Button>
            <Button className="bg-green-700 hover:bg-green-800 text-white"
              onClick={confirmMarkAsGiven} disabled={markingAsGiven !== null}>
              <PackageCheck className="mr-2 h-4 w-4" />
              Mark as Given
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Are you sure?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmMessage}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
