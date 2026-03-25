"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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
import { Order, StockItem } from "@/lib/stores-types";

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

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString("en-AU", {
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
  const [newNeedSizing, setNewNeedSizing] = useState(false);
  const [newItems, setNewItems] = useState<{ itemType: string; size: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Edit size dialog
  const [editSizeOpen, setEditSizeOpen] = useState(false);
  const [editSizeOrderId, setEditSizeOrderId] = useState<string | null>(null);
  const [editSizeItemId, setEditSizeItemId] = useState<string | null>(null);
  const [editSizeValue, setEditSizeValue] = useState("");

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
      if (!ordersRes.ok) throw new Error("Failed to fetch orders");
      if (!stockRes.ok) throw new Error("Failed to fetch stock");
      setOrders(await ordersRes.json());
      setStock(await stockRes.json());
    } catch (e: any) {
      setError(e.message);
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
    const newQty = stockItem.quantity - 1;
    try {
      const res = await fetch(`/api/stores/stock/${stockItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });
      if (!res.ok) throw new Error("Failed to update stock");
      const updated = await res.json();
      setStock((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDeleteOrder(orderId: string) {
    try {
      const res = await fetch(`/api/stores/orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete order");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openEditSize(orderId: string, itemId: string, currentSize: string) {
    setEditSizeOrderId(orderId);
    setEditSizeItemId(itemId);
    setEditSizeValue(currentSize);
    setEditSizeOpen(true);
  }

  async function handleSaveEditSize() {
    if (!editSizeOrderId || !editSizeItemId) return;
    const order = orders.find((o) => o.id === editSizeOrderId);
    if (!order) return;

    const updatedItems = order.items.map((item) =>
      item.id === editSizeItemId ? { ...item, size: editSizeValue } : item
    );

    try {
      const res = await fetch(`/api/stores/orders/${editSizeOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updatedItems }),
      });
      if (!res.ok) throw new Error("Failed to update order");
      const updated = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setEditSizeOpen(false);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openNewOrder() {
    setNewCadetName("");
    setNewNeedSizing(false);
    setNewItems([{ itemType: "", size: "" }]);
    setNewOrderOpen(true);
  }

  async function handleCreateOrder() {
    if (!newCadetName.trim() || newItems.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadetName: newCadetName.trim(),
          needSizing: newNeedSizing,
          items: newItems.filter((i) => i.itemType),
        }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      const created = await res.json();
      setOrders((prev) => [created, ...prev]);
      setNewOrderOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
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

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading orders...</div>
      )}

      {/* Empty */}
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
            return (
              <Card key={order.id}>
                {/* Summary row */}
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="font-semibold">{order.cadetName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(order.timestamp)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {order.needSizing && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs">
                          Need Sizing
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(order.id)}
                        aria-label={expanded ? "Collapse order" : "Expand order"}
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded details */}
                {expanded && (
                  <CardContent className="pt-4">
                    <ul className="space-y-3">
                      {order.items.map((orderItem) => {
                        const stockMatch = findStockMatch(orderItem.itemType, orderItem.size);
                        const inStock = stockMatch && stockMatch.quantity > 0;

                        return (
                          <li
                            key={orderItem.id}
                            className="rounded-md border bg-muted/30 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{orderItem.itemType}</p>
                                <p className="text-xs text-muted-foreground">
                                  Size: {orderItem.size}
                                </p>
                                {/* Stock location */}
                                <div className="mt-1.5">
                                  {stockMatch ? (
                                    inStock ? (
                                      <p className="text-xs font-medium text-green-600 dark:text-green-400">
                                        Box {stockMatch.box} Section {stockMatch.section}{" "}
                                        (qty: {stockMatch.quantity})
                                      </p>
                                    ) : (
                                      <p className="text-xs font-medium text-destructive">
                                        Out of Stock
                                      </p>
                                    )
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      Not in stock
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    openEditSize(order.id, orderItem.id, orderItem.size)
                                  }
                                >
                                  Edit Size
                                </Button>
                                {stockMatch && inStock && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleRemoveFromStock(stockMatch)}
                                  >
                                    Remove from Stock
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Delete order */}
                    <div className="mt-4 flex justify-end">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteOrder(order.id)}
                      >
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
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cadetName">Cadet Name</Label>
              <Input
                id="cadetName"
                value={newCadetName}
                onChange={(e) => setNewCadetName(e.target.value)}
                placeholder="e.g. Cdt Smith"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="needSizing"
                checked={newNeedSizing}
                onCheckedChange={(checked) => setNewNeedSizing(!!checked)}
              />
              <Label htmlFor="needSizing" className="cursor-pointer">
                Needs sizing
              </Label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setNewItems((prev) => [...prev, { itemType: "", size: "" }])
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>

              {newItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No items added yet.</p>
              )}

              {newItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Select
                      value={item.itemType}
                      onValueChange={(v) =>
                        setNewItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, itemType: v } : it))
                        )
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Item type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Input
                      className="h-9"
                      placeholder="Size"
                      value={item.size}
                      onChange={(e) =>
                        setNewItems((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, size: e.target.value } : it
                          )
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-muted-foreground"
                    onClick={() =>
                      setNewItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove item"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={
                submitting ||
                !newCadetName.trim() ||
                newItems.filter((i) => i.itemType).length === 0
              }
            >
              {submitting ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Size Dialog */}
      <Dialog open={editSizeOpen} onOpenChange={setEditSizeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Size</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="editSize">Size</Label>
            <Input
              id="editSize"
              value={editSizeValue}
              onChange={(e) => setEditSizeValue(e.target.value)}
              placeholder="e.g. 95/36"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSizeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditSize} disabled={!editSizeValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
