"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Package,
  Pencil,
  Trash2,
  Plus,
  Search,
  FolderPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type DeleteBoxConfirm = { box: string; stage: 1 | 2 };
type DeleteSectionConfirm = { box: string; section: string; stage: 1 | 2 };

export default function StockPage() {
  const [structure, setStructure] = useState<Record<string, string[]>>({});
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchName, setSearchName] = useState("");
  const [searchSize, setSearchSize] = useState("");

  // Item dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null);

  // Box management
  const [addBoxOpen, setAddBoxOpen] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const [deleteBoxConfirm, setDeleteBoxConfirm] = useState<DeleteBoxConfirm | null>(null);

  // Section management
  const [addSectionState, setAddSectionState] = useState<{ box: string; value: string } | null>(null);
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<DeleteSectionConfirm | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

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
      setStructure(structData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const boxes = useMemo(() => Object.keys(structure).sort(), [structure]);
  const totalCount = stock.reduce((sum, i) => sum + i.quantity, 0);

  const isSearching = searchName.trim() !== "";

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

  function getItemsForBoxSection(box: string, section: string) {
    return stock.filter((i) => i.box === box && i.section === section);
  }

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
      // If the edit merged into an existing item, remove the old row and update the target
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
    if (!name || structure[name] !== undefined) return;
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-box", box: name }),
      });
      if (!res.ok) throw new Error("Failed to add box");
      setStructure(await res.json());
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
      setStructure(await res.json());
      setStock((prev) => prev.filter((i) => i.box !== box));
      setDeleteBoxConfirm(null);
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
      setStructure(await res.json());
      setAddSectionState(null);
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
      setStructure(await res.json());
      setStock((prev) => prev.filter((i) => !(i.box === box && i.section === section)));
      setDeleteSectionConfirm(null);
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

      {/* Tabbed layout — hidden when searching */}
      {!loading && !isSearching && (
        boxes.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No boxes yet. Click &ldquo;Add Box&rdquo; to get started.
          </div>
        ) : (
          <Tabs defaultValue={boxes[0]}>
            <TabsList className="mb-4 flex flex-wrap gap-1 h-auto">
              {boxes.map((box) => (
                <TabsTrigger key={box} value={box}>Box {box}</TabsTrigger>
              ))}
            </TabsList>

            {boxes.map((box) => {
              const sections = structure[box] ?? [];
              const boxQty = stock.filter((i) => i.box === box).reduce((s, i) => s + i.quantity, 0);

              return (
                <TabsContent key={box} value={box} className="space-y-4">
                  {/* Box toolbar */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {boxQty} item{boxQty !== 1 ? "s" : ""} across {sections.length} section{sections.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      {addSectionState?.box === box ? (
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-32 text-sm"
                            placeholder="Section name"
                            value={addSectionState.value}
                            onChange={(e) => setAddSectionState({ box, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddSection(box, addSectionState.value);
                              if (e.key === "Escape") setAddSectionState(null);
                            }}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => handleAddSection(box, addSectionState.value)}
                            disabled={!addSectionState.value.trim()}
                          >
                            Add
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setAddSectionState(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setAddSectionState({ box, value: "" })}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add Section
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteBoxConfirm({ box, stage: 1 })}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete Box
                      </Button>
                    </div>
                  </div>

                  {/* Sections grid */}
                  {sections.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                      No sections yet. Click &ldquo;Add Section&rdquo; above.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {sections.map((section) => {
                        const items = getItemsForBoxSection(box, section);
                        const isDelConfirm =
                          deleteSectionConfirm?.box === box &&
                          deleteSectionConfirm?.section === section;
                        const sectionQty = items.reduce((s, i) => s + i.quantity, 0);

                        return (
                          <Card key={section}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Section {section}</CardTitle>
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    title="Add item to this section"
                                    onClick={() => openAdd(box, section)}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    title="Delete section"
                                    onClick={() => setDeleteSectionConfirm({ box, section, stage: 1 })}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {/* Delete section inline confirm */}
                              {isDelConfirm && (
                                <div className={`mt-2 rounded-md border p-2 text-xs ${deleteSectionConfirm.stage === 2 ? "border-destructive/50 bg-destructive/10" : "border-destructive/30 bg-destructive/5"}`}>
                                  <p className="mb-2 font-medium text-destructive">
                                    {deleteSectionConfirm.stage === 1
                                      ? `Delete Section ${section}? (${items.length} line${items.length !== 1 ? "s" : ""}, ${sectionQty} items)`
                                      : "This cannot be undone. All items will be removed."}
                                  </p>
                                  <div className="flex gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-6 px-2 text-xs"
                                      onClick={() =>
                                        deleteSectionConfirm.stage === 1
                                          ? setDeleteSectionConfirm({ box, section, stage: 2 })
                                          : handleDeleteSection(box, section)
                                      }
                                    >
                                      {deleteSectionConfirm.stage === 1 ? "Continue" : "Delete"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => setDeleteSectionConfirm(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </CardHeader>
                            <CardContent>
                              {items.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No items</p>
                              ) : (
                                <ul className="space-y-2">
                                  {items.map((item) => (
                                    <li key={item.id} className="flex items-center justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{item.itemType}</p>
                                        <p className="text-xs text-muted-foreground">{item.size}</p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <Badge variant="secondary" className="text-xs">
                                          qty: {item.quantity}
                                        </Badge>
                                        {deleteItemConfirm === item.id ? (
                                          <>
                                            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
                                              onClick={() => handleDeleteItem(item.id)}>
                                              Confirm
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                              onClick={() => setDeleteItemConfirm(null)}>
                                              Cancel
                                            </Button>
                                          </>
                                        ) : (
                                          <>
                                            <Button size="icon" variant="ghost" className="h-7 w-7"
                                              onClick={() => openEdit(item)} aria-label="Edit">
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="icon" variant="ghost"
                                              className="h-7 w-7 text-destructive hover:text-destructive"
                                              onClick={() => setDeleteItemConfirm(item.id)} aria-label="Remove">
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
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Add Item */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Stock Item</DialogTitle></DialogHeader>
          <ItemForm form={form} setForm={setForm} boxes={boxes} structure={structure} />
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
          <ItemForm form={form} setForm={setForm} boxes={boxes} structure={structure} />
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
            {newBoxName.trim() && structure[newBoxName.trim().toUpperCase()] !== undefined && (
              <p className="text-xs text-destructive">Box {newBoxName.trim().toUpperCase()} already exists.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddBoxOpen(false); setNewBoxName(""); }}>Cancel</Button>
            <Button onClick={handleAddBox} disabled={!newBoxName.trim() || structure[newBoxName.trim().toUpperCase()] !== undefined}>
              Add Box
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Box — two-stage dialog */}
      <Dialog open={!!deleteBoxConfirm} onOpenChange={(open) => !open && setDeleteBoxConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {deleteBoxConfirm?.stage === 1 ? `Delete Box ${deleteBoxConfirm.box}?` : "Are you absolutely sure?"}
            </DialogTitle>
          </DialogHeader>
          {deleteBoxConfirm && (
            <p className="text-sm text-muted-foreground">
              {deleteBoxConfirm.stage === 1 ? (
                <>
                  Box <strong>{deleteBoxConfirm.box}</strong> contains{" "}
                  {(structure[deleteBoxConfirm.box] ?? []).length} section{(structure[deleteBoxConfirm.box] ?? []).length !== 1 ? "s" : ""} and{" "}
                  {stock.filter((i) => i.box === deleteBoxConfirm.box).reduce((s, i) => s + i.quantity, 0)} total items.
                </>
              ) : (
                <span className="font-medium text-destructive">
                  This cannot be undone. All stock in Box {deleteBoxConfirm.box} will be permanently deleted.
                </span>
              )}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBoxConfirm(null)}>Cancel</Button>
            {deleteBoxConfirm?.stage === 1 ? (
              <Button variant="destructive"
                onClick={() => setDeleteBoxConfirm({ box: deleteBoxConfirm.box, stage: 2 })}>
                Continue
              </Button>
            ) : (
              <Button variant="destructive"
                onClick={() => deleteBoxConfirm && handleDeleteBox(deleteBoxConfirm.box)}>
                Delete Box {deleteBoxConfirm?.box}
              </Button>
            )}
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
