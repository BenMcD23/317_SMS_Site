"use client";

import { useState, useEffect, useMemo } from "react";
import { Package, Plus, Search, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2 } from "lucide-react";
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
import { ShelfStructure, ShelfBox, StockItem } from "@/lib/stores-types";
import { ShelfView } from "./components/ShelfView";
import { BoxDetailView } from "./components/BoxDetailView";

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

interface ItemFormState {
  itemType: string;
  size: string;
  box: string;
  section: string;
  quantity: number;
}

function emptyForm(box = "", section = ""): ItemFormState {
  return { itemType: "", size: "", box, section, quantity: 1 };
}

export default function StockPage() {
  const [shelfStructure, setShelfStructure] = useState<ShelfStructure | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBoxLabel, setSelectedBoxLabel] = useState<string | null>(null);

  const [searchName, setSearchName] = useState("");
  const [searchSize, setSearchSize] = useState("");

  // Item dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null);

  // Box dialogs
  const [addBoxOpen, setAddBoxOpen] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const [deleteBoxConfirm, setDeleteBoxConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [stockRes, structRes] = await Promise.all([
        fetch("/api/stores/stock"),
        fetch("/api/stores/structure"),
      ]);
      if (!stockRes.ok || !structRes.ok) throw new Error("Failed to load data");
      const [stockData, structData] = await Promise.all([stockRes.json(), structRes.json()]);
      setStock(stockData);
      setShelfStructure(structData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Derived helpers
  const totalCount = stock.reduce((sum, i) => sum + i.quantity, 0);
  const isSearching = searchName.trim() !== "";

  const selectedBox: ShelfBox | null = useMemo(
    () => shelfStructure?.boxes.find((b) => b.label === selectedBoxLabel) ?? null,
    [shelfStructure, selectedBoxLabel]
  );

  // Compat map for ItemForm selects: { boxLabel: sectionLabels[] }
  const structureCompat = useMemo(
    () =>
      Object.fromEntries(
        shelfStructure?.boxes.map((b) => [b.label, b.sections.map((s) => s.label)]) ?? []
      ),
    [shelfStructure]
  );

  const boxLabels = useMemo(
    () => shelfStructure?.boxes.map((b) => b.label).sort() ?? [],
    [shelfStructure]
  );

  const searchResults = useMemo(() => {
    if (!searchName.trim()) return [];
    const name = searchName.toLowerCase();
    const size = searchSize.trim().toLowerCase();
    return stock.filter(
      (i) =>
        i.itemType.toLowerCase().includes(name) &&
        (size === "" || i.size.toLowerCase().includes(size))
    );
  }, [searchName, searchSize, stock]);

  // ── Item CRUD ──────────────────────────────────────────────────────────────

  function openAdd(box = "", section = "") {
    setForm(emptyForm(box, section));
    setAddOpen(true);
  }

  function openEdit(item: StockItem) {
    setEditTarget(item);
    setForm({ itemType: item.itemType, size: item.size, box: item.box, section: item.section, quantity: item.quantity });
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
      setStock((prev) =>
        prev.some((i) => i.id === created.id)
          ? prev.map((i) => (i.id === created.id ? created : i))
          : [...prev, created]
      );
      setAddOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
      setStock((prev) =>
        prev
          .filter((i) => i.id !== editTarget.id || i.id === updated.id)
          .map((i) => (i.id === updated.id ? updated : i))
      );
      setEditOpen(false);
      setEditTarget(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      const res = await fetch(`/api/stores/stock/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete item");
      setStock((prev) => prev.filter((i) => i.id !== id));
      setDeleteItemConfirm(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // ── Box management ─────────────────────────────────────────────────────────

  async function handleAddBox() {
    const name = newBoxName.trim().toUpperCase();
    if (!name || structureCompat[name] !== undefined) return;
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-box", box: name }),
      });
      if (!res.ok) throw new Error("Failed to add box");
      setShelfStructure(await res.json());
      setAddBoxOpen(false);
      setNewBoxName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleDeleteBox(box: string) {
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-box", box }),
      });
      if (!res.ok) throw new Error("Failed to delete box");
      setShelfStructure(await res.json());
      setStock((prev) => prev.filter((i) => i.box !== box));
      setSelectedBoxLabel(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // ── Section management ─────────────────────────────────────────────────────

  async function handleAddSection(box: string, sectionName: string) {
    const name = sectionName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-section", box, section: name }),
      });
      if (!res.ok) throw new Error("Failed to add section");
      setShelfStructure(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleDeleteSection(box: string, section: string) {
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-section", box, section }),
      });
      if (!res.ok) throw new Error("Failed to delete section");
      setShelfStructure(await res.json());
      setStock((prev) => prev.filter((i) => !(i.box === box && i.section === section)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEditMode((m) => !m)}
          >
            {editMode ? "Done Editing" : "Edit Arrangement"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddBoxOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Box
          </Button>
          <Button size="sm" onClick={() => openAdd()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by item name…"
            className="pl-9"
            value={searchName}
            onChange={(e) => { setSearchName(e.target.value); if (!e.target.value.trim()) setSearchSize(""); }}
          />
        </div>
        {isSearching && (
          <Input
            placeholder="Filter by size…"
            className="w-40"
            value={searchSize}
            onChange={(e) => setSearchSize(e.target.value)}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading stock…</div>
      )}

      {/* Search results */}
      {!loading && isSearching && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchName}{searchSize ? ` · size: ${searchSize}` : ""}&rdquo;
          </p>
          {searchResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No items match your search.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {searchResults.map((item) => (
                    <SearchResultRow
                      key={item.id}
                      item={item}
                      deleteConfirm={deleteItemConfirm}
                      onEdit={openEdit}
                      onDelete={handleDeleteItem}
                      onDeleteConfirm={setDeleteItemConfirm}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Main view — shelf or box detail */}
      {!loading && !isSearching && shelfStructure && (
        shelfStructure.boxes.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No boxes yet. Click &ldquo;Add Box&rdquo; to get started.
          </div>
        ) : selectedBox ? (
          <BoxDetailView
            box={selectedBox}
            stock={stock}
            onBack={() => setSelectedBoxLabel(null)}
            onStructureChange={setShelfStructure}
            onAddItem={openAdd}
            onEditItem={openEdit}
            onDeleteItem={handleDeleteItem}
            onDeleteSection={handleDeleteSection}
            onDeleteBox={handleDeleteBox}
            onAddSection={handleAddSection}
            deleteItemConfirm={deleteItemConfirm}
            onDeleteItemConfirm={setDeleteItemConfirm}
            deleteBoxConfirm={deleteBoxConfirm}
            onDeleteBoxConfirm={setDeleteBoxConfirm}
            editMode={editMode}
          />
        ) : (
          <ShelfView
            structure={shelfStructure}
            stock={stock}
            onSelectBox={setSelectedBoxLabel}
            onStructureChange={setShelfStructure}
            onAddBox={() => setAddBoxOpen(true)}
            editMode={editMode}
          />
        )
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Add Item */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Stock Item</DialogTitle></DialogHeader>
          <ItemForm form={form} setForm={setForm} boxes={boxLabels} structure={structureCompat} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting || !form.itemType || !form.size || !form.box || !form.section}>
              {submitting ? "Adding…" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Stock Item</DialogTitle></DialogHeader>
          <ItemForm form={form} setForm={setForm} boxes={boxLabels} structure={structureCompat} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting || !form.itemType || !form.size}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Box */}
      <Dialog open={addBoxOpen} onOpenChange={setAddBoxOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add New Box</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="newBox">Box Label</Label>
            <Input
              id="newBox"
              placeholder="e.g. H"
              value={newBoxName}
              onChange={(e) => setNewBoxName(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleAddBox()}
              maxLength={10}
            />
            {newBoxName.trim() && structureCompat[newBoxName.trim().toUpperCase()] !== undefined && (
              <p className="text-xs text-destructive">Box {newBoxName.trim().toUpperCase()} already exists.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddBoxOpen(false); setNewBoxName(""); }}>Cancel</Button>
            <Button onClick={handleAddBox} disabled={!newBoxName.trim() || structureCompat[newBoxName.trim().toUpperCase()] !== undefined}>
              Add Box
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Search result row ──────────────────────────────────────────────────────────

function SearchResultRow({
  item,
  deleteConfirm,
  onEdit,
  onDelete,
  onDeleteConfirm,
}: {
  item: StockItem;
  deleteConfirm: string | null;
  onEdit: (item: StockItem) => void;
  onDelete: (id: string) => void;
  onDeleteConfirm: (id: string | null) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.itemType}</p>
        <p className="text-xs text-muted-foreground">{item.size}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className="text-xs">Box {item.box} §{item.section}</Badge>
        <Badge variant="secondary" className="text-xs">qty: {item.quantity}</Badge>
        {deleteConfirm === item.id ? (
          <>
            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
              onClick={() => onDelete(item.id)}>Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => onDeleteConfirm(null)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(item)} aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDeleteConfirm(item.id)} aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

// ── Item form ──────────────────────────────────────────────────────────────────

function ItemForm({
  form,
  setForm,
  boxes,
  structure,
}: {
  form: ItemFormState;
  setForm: React.Dispatch<React.SetStateAction<ItemFormState>>;
  boxes: string[];
  structure: Record<string, string[]>;
}) {
  const sections = form.box ? (structure[form.box] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="itemType">Item Type</Label>
        <Select value={form.itemType} onValueChange={(v) => setForm((f) => ({ ...f, itemType: v }))}>
          <SelectTrigger id="itemType"><SelectValue placeholder="Select item type" /></SelectTrigger>
          <SelectContent>
            {ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="size">Size</Label>
        <Input id="size" value={form.size}
          onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
          placeholder="e.g. 95/36 or 74" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="box">Box</Label>
          <Select value={form.box} onValueChange={(v) => setForm((f) => ({ ...f, box: v, section: "" }))}>
            <SelectTrigger id="box"><SelectValue placeholder="Box" /></SelectTrigger>
            <SelectContent>
              {boxes.map((b) => <SelectItem key={b} value={b}>Box {b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="section">Section</Label>
          <Select value={form.section} onValueChange={(v) => setForm((f) => ({ ...f, section: v }))}
            disabled={!form.box || sections.length === 0}>
            <SelectTrigger id="section">
              <SelectValue placeholder={sections.length === 0 ? "No sections" : "Section"} />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quantity">Quantity</Label>
        <Input id="quantity" type="number" min={0} value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 0 }))} />
      </div>
    </div>
  );
}
