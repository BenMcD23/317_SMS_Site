"use client";

import { useState, useEffect, useMemo } from "react";
import { Award, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BadgeGrid, BadgeItem } from "@/lib/stores-types";
import { BadgeGridView } from "./components/BadgeGridView";
import { BADGE_CATEGORIES, BadgeCategory, buildBadgeName, parseBadgeName } from "./badge-types";

export default function BadgeStockPage() {
  const [grid, setGrid] = useState<BadgeGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // Add badge dialog
  const [addBadgeOpen, setAddBadgeOpen] = useState(false);
  const [addItemCellId, setAddItemCellId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);

  // Edit badge dialog
  const [editBadgeOpen, setEditBadgeOpen] = useState(false);
  const [editItem, setEditItem] = useState<BadgeItem | null>(null);
  const [editCellId, setEditCellId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editCategory, setEditCategory] = useState<BadgeCategory | null>(null);
  const [editSubType, setEditSubType] = useState<string | null>(null);
  const [editLevel, setEditLevel] = useState<string | null>(null);

  // Add row/col confirm dialogs
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stores/badges");
      if (!res.ok) throw new Error("Failed to load badge stock");
      setGrid(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRow() {
    if (!grid) return;
    try {
      const res = await fetch("/api/stores/badges/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numRows: grid.config.numRows + 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      setGrid(await res.json());
      setAddRowOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleAddCol() {
    if (!grid) return;
    try {
      const res = await fetch("/api/stores/badges/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numCols: grid.config.numCols + 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      setGrid(await res.json());
      setAddColOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function openAddBadge(cellId?: number) {
    setAddItemCellId(cellId ?? (grid?.cells[0]?.id ?? null));
    setSelectedCategory(null);
    setSelectedSubType(null);
    setSelectedLevel(null);
    setAddQuantity(1);
    setAddBadgeOpen(true);
  }

  function closeAddBadge() {
    setAddBadgeOpen(false);
    setAddItemCellId(null);
    setSelectedCategory(null);
    setSelectedSubType(null);
    setSelectedLevel(null);
    setAddQuantity(1);
  }

  const badgeName = selectedCategory
    ? buildBadgeName(selectedCategory, selectedSubType, selectedLevel)
    : null;

  async function handleAddItem() {
    if (addItemCellId === null || !badgeName) return;
    try {
      const res = await fetch(`/api/stores/badges/cells/${addItemCellId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: badgeName, quantity: addQuantity }),
      });
      if (!res.ok) throw new Error("Failed");
      const item = await res.json();
      setGrid((prev) =>
        prev
          ? {
              ...prev,
              cells: prev.cells.map((c) =>
                c.id === addItemCellId ? { ...c, items: [...c.items, item] } : c
              ),
            }
          : prev
      );
      closeAddBadge();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  const editBadgeName = editCategory
    ? buildBadgeName(editCategory, editSubType, editLevel)
    : null;

  function openEditBadge(item: BadgeItem, cellId: number) {
    const parsed = parseBadgeName(item.name);
    setEditItem(item);
    setEditCellId(cellId);
    setEditQuantity(item.quantity);
    setEditCategory(parsed.category);
    setEditSubType(parsed.subType);
    setEditLevel(parsed.level);
    setEditBadgeOpen(true);
  }

  function closeEditBadge() {
    setEditBadgeOpen(false);
    setEditItem(null);
    setEditCellId(null);
    setEditQuantity(1);
    setEditCategory(null);
    setEditSubType(null);
    setEditLevel(null);
  }

  async function handleEditItem() {
    if (!editItem || !editBadgeName) return;
    try {
      const res = await fetch(`/api/stores/badges/items/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editBadgeName, quantity: editQuantity, cellId: editCellId }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setGrid((prev) => {
        if (!prev) return prev;
        // Remove from old cell, add to new cell
        const newCells = prev.cells.map((c) => ({
          ...c,
          items: c.items.filter((i) => i.id !== editItem.id),
        }));
        return {
          ...prev,
          cells: newCells.map((c) =>
            c.id === updated.cellId
              ? { ...c, items: [...c.items, { id: updated.id, name: updated.name, quantity: updated.quantity }] }
              : c
          ),
        };
      });
      closeEditBadge();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleDeleteItem(itemId: number) {
    try {
      const res = await fetch(`/api/stores/badges/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setGrid((prev) =>
        prev
          ? {
              ...prev,
              cells: prev.cells.map((c) => ({
                ...c,
                items: c.items.filter((i) => i.id !== itemId),
              })),
            }
          : prev
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  const totalItems = grid?.cells.reduce((s, c) => s + c.items.reduce((q, i) => q + i.quantity, 0), 0) ?? 0;

  const [searchQuery, setSearchQuery] = useState("");
  const isSearching = searchQuery.trim() !== "";

  const searchResults = useMemo(() => {
    if (!grid || !isSearching) return [];
    const q = searchQuery.trim().toLowerCase();
    const results: { item: BadgeItem; cellId: number; cellLabel: string }[] = [];
    for (const cell of grid.cells) {
      for (const item of cell.items) {
        if (item.name.toLowerCase().includes(q)) {
          results.push({
            item,
            cellId: cell.id,
            cellLabel: cell.label ?? `Row ${cell.row + 1} Col ${cell.col + 1}`,
          });
        }
      }
    }
    return results;
  }, [grid, searchQuery, isSearching]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4 sm:block">
          <div>
            <h1 className="text-3xl font-bold">Badge Stock</h1>
            <p className="text-muted-foreground">
              {loading
                ? "Loading..."
                : `${totalItems} badge${totalItems !== 1 ? "s" : ""} across ${grid?.cells.length ?? 0} section${(grid?.cells.length ?? 0) !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:hidden">
            <Award className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:flex">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <Button
            size="sm"
            onClick={() => openAddBadge()}
            disabled={loading || !grid?.cells.length}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Badge
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddRowOpen(true)} disabled={loading}>
            <Plus className="mr-1 h-4 w-4" />
            Add Row
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddColOpen(true)} disabled={loading}>
            <Plus className="mr-1 h-4 w-4" />
            Add Col
          </Button>
        </div>
      </div>

      {/* Search */}
      {!loading && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search badges…"
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading badge stock…</div>
      )}

      {/* Search results */}
      {!loading && isSearching && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery.trim()}&rdquo;
          </p>
          {searchResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No badges match your search.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {searchResults.map(({ item, cellLabel }) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{cellLabel}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-xs px-1.5">×{item.quantity}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && !isSearching && grid && (
        <BadgeGridView
          grid={grid}
          onAddItem={(cellId) => openAddBadge(cellId)}
          onEditItem={openEditBadge}
          onDeleteItem={handleDeleteItem}
        />
      )}

      {/* Add Badge dialog */}
      <Dialog open={addBadgeOpen} onOpenChange={(o) => { if (!o) closeAddBadge(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Badge</DialogTitle></DialogHeader>
          <div className="space-y-3">

            {/* Section picker — only shown when >1 section exists */}
            {grid && grid.cells.length > 1 && (
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Select
                  value={addItemCellId !== null ? String(addItemCellId) : ""}
                  onValueChange={(v) => setAddItemCellId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose section…" />
                  </SelectTrigger>
                  <SelectContent>
                    {grid.cells.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.label ?? `Row ${c.row + 1}, Col ${c.col + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Badge type */}
            <div className="space-y-1.5">
              <Label>Badge type</Label>
              <Select
                value={selectedCategory?.id ?? ""}
                onValueChange={(v) => {
                  const cat = BADGE_CATEGORIES.find((c) => c.id === v) ?? null;
                  setSelectedCategory(cat);
                  setSelectedSubType(null);
                  setSelectedLevel(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sub-type */}
            {selectedCategory && (selectedCategory.subTypes || selectedCategory.items) && (
              <div className="space-y-1.5">
                <Label>
                  {selectedCategory.subTypes ? "Sub-type" : "Badge"}
                </Label>
                <Select
                  value={selectedSubType ?? ""}
                  onValueChange={(v) => { setSelectedSubType(v); setSelectedLevel(null); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedCategory.subTypes ?? selectedCategory.items ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Level */}
            {selectedCategory?.levels && (
              !selectedCategory.subTypes || selectedSubType
            ) && (
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Select
                  value={selectedLevel ?? ""}
                  onValueChange={setSelectedLevel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level…" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCategory.levels.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="add-badge-qty">Quantity</Label>
              <Input
                id="add-badge-qty"
                type="number"
                min={1}
                value={addQuantity}
                onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-28"
              />
            </div>

            {/* Preview */}
            {badgeName && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
                {badgeName}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAddBadge}>Cancel</Button>
            <Button
              onClick={handleAddItem}
              disabled={!badgeName || addItemCellId === null}
            >
              Add Badge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Badge dialog */}
      <Dialog open={editBadgeOpen} onOpenChange={(o) => { if (!o) closeEditBadge(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Badge</DialogTitle></DialogHeader>
          <div className="space-y-3">

            {/* Section picker */}
            {grid && grid.cells.length > 1 && (
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Select
                  value={editCellId !== null ? String(editCellId) : ""}
                  onValueChange={(v) => setEditCellId(Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Choose section…" /></SelectTrigger>
                  <SelectContent>
                    {grid.cells.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.label ?? `Row ${c.row + 1}, Col ${c.col + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Badge type */}
            <div className="space-y-1.5">
              <Label>Badge type</Label>
              <Select
                value={editCategory?.id ?? ""}
                onValueChange={(v) => {
                  const cat = BADGE_CATEGORIES.find((c) => c.id === v) ?? null;
                  setEditCategory(cat);
                  setEditSubType(null);
                  setEditLevel(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                <SelectContent>
                  {BADGE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sub-type */}
            {editCategory && (editCategory.subTypes || editCategory.items) && (
              <div className="space-y-1.5">
                <Label>{editCategory.subTypes ? "Sub-type" : "Badge"}</Label>
                <Select
                  value={editSubType ?? ""}
                  onValueChange={(v) => { setEditSubType(v); setEditLevel(null); }}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(editCategory.subTypes ?? editCategory.items ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Level */}
            {editCategory?.levels && (!editCategory.subTypes || editSubType) && (
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Select value={editLevel ?? ""} onValueChange={setEditLevel}>
                  <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
                  <SelectContent>
                    {editCategory.levels.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-badge-qty">Quantity</Label>
              <Input
                id="edit-badge-qty"
                type="number"
                min={1}
                value={editQuantity}
                onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-28"
              />
            </div>

            {/* Preview */}
            {editBadgeName && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium">{editBadgeName}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditBadge}>Cancel</Button>
            <Button onClick={handleEditItem} disabled={!editBadgeName || editCellId === null}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Row confirm */}
      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Add Row</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add a new row to the grid? Current size: {grid?.config.numRows} row{(grid?.config.numRows ?? 1) !== 1 ? "s" : ""} × {grid?.config.numCols} col{(grid?.config.numCols ?? 1) !== 1 ? "s" : ""}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRowOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRow}>Add Row</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Col confirm */}
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Add Column</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add a new column to the grid? Current size: {grid?.config.numRows} row{(grid?.config.numRows ?? 1) !== 1 ? "s" : ""} × {grid?.config.numCols} col{(grid?.config.numCols ?? 1) !== 1 ? "s" : ""}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCol}>Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
