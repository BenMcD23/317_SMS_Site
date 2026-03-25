"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
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
import { Order, OrderItem, StockItem } from "@/lib/stores-types";

const ITEM_TYPES = [
  "Wedgewood Male",
  "Wedgewood Female",
  "Working Blue Male",
  "Working Blue Female",
  "Jumper",
  "Trousers",
  "Slacks",
  "Skirts",
];

type DraftItem = { itemType: string; size: string; needSizing: boolean };

function emptyDraftItem(): DraftItem {
  return { itemType: "", size: "", needSizing: false };
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // New order dialog
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newCadetName, setNewCadetName] = useState("");
  const [newItems, setNewItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [submitting, setSubmitting] = useState(false);

  // Edit size dialog
  const [editSizeOpen, setEditSizeOpen] = useState(false);
  const [editSizeOrderId, setEditSizeOrderId] = useState<string | null>(null);
  const [editSizeItemId, setEditSizeItemId] = useState<string | null>(null);
  const [editSizeValue, setEditSizeValue] = useState("");

  // Add item to existing order (inline per order)
  const [addingToOrderId, setAddingToOrderId] = useState<string | null>(null);
  const [addItemDraft, setAddItemDraft] = useState<DraftItem>(emptyDraftItem());

  useEffect(() => {
    fetchAll();
  }, []);

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
    return stock.find((s) => s.itemType === itemType && s.size === size);
  }

  async function handleRemoveFromStock(stockItem: StockItem) {
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

  async function handleDeleteOrder(orderId: string) {
    try {
      const res = await fetch(`/api/stores/orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete order");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setExpandedIds((prev) => { const n = new Set(prev); n.delete(orderId); return n; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleDeleteOrderItem(orderId: string, itemId: string) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const updatedItems = order.items.filter((i) => i.id !== itemId);
    await patchOrder(orderId, { items: updatedItems });
  }

  function openEditSize(orderId: string, item: OrderItem) {
    setEditSizeOrderId(orderId);
    setEditSizeItemId(item.id);
    setEditSizeValue(item.size);
    setEditSizeOpen(true);
  }

  async function handleSaveEditSize() {
    if (!editSizeOrderId || !editSizeItemId) return;
    const order = orders.find((o) => o.id === editSizeOrderId);
    if (!order) return;
    await patchOrder(editSizeOrderId, {
      items: order.items.map((i) =>
        i.id === editSizeItemId ? { ...i, size: editSizeValue } : i
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

  function openNewOrder() {
    setNewCadetName("");
    setNewItems([emptyDraftItem()]);
    setNewOrderOpen(true);
  }

  async function handleCreateOrder() {
    const validItems = newItems.filter((i) => i.itemType);
    if (!newCadetName.trim() || validItems.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadetName: newCadetName.trim(), items: validItems }),
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
    setAddItemDraft(emptyDraftItem());
  }

  async function handleAddToOrder(orderId: string) {
    if (!addItemDraft.itemType) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    // id will be assigned server-side by the PATCH route
    await patchOrder(orderId, {
      items: [...order.items, addItemDraft as unknown as OrderItem],
    });
    setAddingToOrderId(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading..." : `${orders.length} order${orders.length !== 1 ? "s" : ""}`}
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

      {/* Error */}
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

      {/* Orders list */}
      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => {
            const expanded = expandedIds.has(order.id);
            const needSizingCount = order.items.filter((i) => i.needSizing).length;
            const isAddingHere = addingToOrderId === order.id;

            return (
              <Card key={order.id}>
                {/* Summary row */}
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="font-semibold">{order.cadetName}</p>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(order.timestamp)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {needSizingCount > 0 && (
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

                {/* Expanded details */}
                {expanded && (
                  <CardContent className="pt-4 space-y-3">
                    <ul className="space-y-2">
                      {order.items.map((orderItem) => {
                        const stockMatch = findStockMatch(orderItem.itemType, orderItem.size);
                        const inStock = stockMatch && stockMatch.quantity > 0;

                        return (
                          <li key={orderItem.id} className="rounded-md border bg-muted/30 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium">{orderItem.itemType}</p>
                                  {orderItem.needSizing && (
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs">
                                      Need Sizing
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">Size: {orderItem.size || "—"}</p>
                                <div className="mt-1.5">
                                  {stockMatch ? (
                                    inStock ? (
                                      <p className="text-xs font-medium text-green-600 dark:text-green-400">
                                        Box {stockMatch.box} Section {stockMatch.section} (qty: {stockMatch.quantity})
                                      </p>
                                    ) : (
                                      <p className="text-xs font-medium text-destructive">Out of Stock</p>
                                    )
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Not in stock</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col gap-1.5 items-end">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                  onClick={() => openEditSize(order.id, orderItem)}>
                                  Edit Size
                                </Button>
                                {stockMatch && inStock && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleRemoveFromStock(stockMatch)}>
                                    Remove from Stock
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost"
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteOrderItem(order.id, orderItem.id)}>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Add item to existing order */}
                    {isAddingHere ? (
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
                          <div className="w-28">
                            <Input className="h-8 text-sm" placeholder="Size"
                              value={addItemDraft.size}
                              onChange={(e) => setAddItemDraft((d) => ({ ...d, size: e.target.value }))} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Checkbox id={`ns-add-${order.id}`} checked={addItemDraft.needSizing}
                              onCheckedChange={(c) => setAddItemDraft((d) => ({ ...d, needSizing: !!c }))} />
                            <Label htmlFor={`ns-add-${order.id}`} className="text-xs cursor-pointer whitespace-nowrap">
                              Need Sizing
                            </Label>
                          </div>
                        </div>
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
                    )}

                    {/* Delete order */}
                    <div className="flex justify-end pt-1">
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteOrder(order.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Order
                      </Button>
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
              <Label htmlFor="cadetName">Cadet Name</Label>
              <Input id="cadetName" value={newCadetName}
                onChange={(e) => setNewCadetName(e.target.value)}
                placeholder="e.g. Cdt Smith" />
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
                    <div className="w-24">
                      <Input className="h-8 text-sm" placeholder="Size" value={item.size}
                        onChange={(e) => setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, size: e.target.value } : it))} />
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => setNewItems((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove item">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5 px-0.5">
                    <Checkbox id={`ns-new-${idx}`} checked={item.needSizing}
                      onCheckedChange={(c) => setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, needSizing: !!c } : it))} />
                    <Label htmlFor={`ns-new-${idx}`} className="text-xs cursor-pointer">Need Sizing</Label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder}
              disabled={submitting || !newCadetName.trim() || newItems.filter((i) => i.itemType).length === 0}>
              {submitting ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Size Dialog */}
      <Dialog open={editSizeOpen} onOpenChange={setEditSizeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Size</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="editSize">Size</Label>
            <Input id="editSize" value={editSizeValue}
              onChange={(e) => setEditSizeValue(e.target.value)}
              placeholder="e.g. 95/36"
              onKeyDown={(e) => e.key === "Enter" && handleSaveEditSize()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSizeOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEditSize} disabled={!editSizeValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
