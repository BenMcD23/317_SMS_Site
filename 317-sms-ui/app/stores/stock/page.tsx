"use client";

import { useState, useEffect } from "react";
import { Package, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { StockItem } from "@/lib/stores-types";

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

const BOXES = ["A", "B", "C", "D", "E", "F", "G"];
const SECTIONS = ["1", "2", "3"];

interface ItemFormState {
  itemType: string;
  size: string;
  box: string;
  section: string;
  quantity: number;
}

const emptyForm: ItemFormState = {
  itemType: "",
  size: "",
  box: "A",
  section: "1",
  quantity: 1,
};

export default function StockPage() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchStock();
  }, []);

  async function fetchStock() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stores/stock");
      if (!res.ok) throw new Error("Failed to fetch stock");
      const data = await res.json();
      setStock(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(emptyForm);
    setAddOpen(true);
  }

  function openEdit(item: StockItem) {
    setEditTarget(item);
    setForm({
      itemType: item.itemType,
      size: item.size,
      box: item.box,
      section: item.section,
      quantity: item.quantity,
    });
    setEditOpen(true);
  }

  async function handleAdd() {
    if (!form.itemType || !form.size || !form.box || !form.section) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to add item");
      const created = await res.json();
      setStock((prev) => [...prev, created]);
      setAddOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/stores/stock/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to update item");
      const updated = await res.json();
      setStock((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditOpen(false);
      setEditTarget(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/stores/stock/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete item");
      setStock((prev) => prev.filter((i) => i.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const totalCount = stock.reduce((sum, i) => sum + i.quantity, 0);

  // Group items by box then section
  function getItemsForBoxSection(box: string, section: string) {
    return stock.filter((i) => i.box === box && i.section === section);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Stock</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading..." : `${totalCount} items across ${stock.length} lines`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Item
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
        <div className="py-12 text-center text-sm text-muted-foreground">Loading stock...</div>
      )}

      {/* Tabs */}
      {!loading && (
        <Tabs defaultValue="A">
          <TabsList className="mb-4 flex flex-wrap gap-1 h-auto">
            {BOXES.map((box) => (
              <TabsTrigger key={box} value={box}>
                Box {box}
              </TabsTrigger>
            ))}
          </TabsList>

          {BOXES.map((box) => (
            <TabsContent key={box} value={box}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {SECTIONS.map((section) => {
                  const items = getItemsForBoxSection(box, section);
                  return (
                    <Card key={section}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Section {section}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {items.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No items</p>
                        ) : (
                          <ul className="space-y-2">
                            {items.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{item.itemType}</p>
                                  <p className="text-xs text-muted-foreground">{item.size}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <Badge variant="secondary" className="text-xs">
                                    qty: {item.quantity}
                                  </Badge>
                                  {deleteConfirm === item.id ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleDelete(item.id)}
                                      >
                                        Confirm
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setDeleteConfirm(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={() => openEdit(item)}
                                        aria-label="Edit item"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => setDeleteConfirm(item.id)}
                                        aria-label="Remove item"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Stock Item</DialogTitle>
          </DialogHeader>
          <ItemForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting || !form.itemType || !form.size}>
              {submitting ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Stock Item</DialogTitle>
          </DialogHeader>
          <ItemForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={submitting || !form.itemType || !form.size}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemForm({
  form,
  setForm,
}: {
  form: ItemFormState;
  setForm: React.Dispatch<React.SetStateAction<ItemFormState>>;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="itemType">Item Type</Label>
        <Select
          value={form.itemType}
          onValueChange={(v) => setForm((f) => ({ ...f, itemType: v }))}
        >
          <SelectTrigger id="itemType">
            <SelectValue placeholder="Select item type" />
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

      <div className="space-y-1.5">
        <Label htmlFor="size">Size</Label>
        <Input
          id="size"
          value={form.size}
          onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
          placeholder="e.g. 95/36 or 74"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="box">Box</Label>
          <Select
            value={form.box}
            onValueChange={(v) => setForm((f) => ({ ...f, box: v }))}
          >
            <SelectTrigger id="box">
              <SelectValue placeholder="Box" />
            </SelectTrigger>
            <SelectContent>
              {BOXES.map((b) => (
                <SelectItem key={b} value={b}>
                  Box {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="section">Section</Label>
          <Select
            value={form.section}
            onValueChange={(v) => setForm((f) => ({ ...f, section: v }))}
          >
            <SelectTrigger id="section">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  Section {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quantity">Quantity</Label>
        <Input
          id="quantity"
          type="number"
          min={0}
          value={form.quantity}
          onChange={(e) =>
            setForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 0 }))
          }
        />
      </div>
    </div>
  );
}

