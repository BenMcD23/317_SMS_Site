"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Package, Search, FolderPlus, Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShelfStructure, StockItem } from "@/lib/stores-types";
import { ShelfView } from "./components/ShelfView";

export default function StockPage() {
  const router = useRouter();
  const [shelfStructure, setShelfStructure] = useState<ShelfStructure | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchName, setSearchName] = useState("");
  const [searchSize, setSearchSize] = useState("");

  const [addBoxOpen, setAddBoxOpen] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const [addAreaOpen, setAddAreaOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null);

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

  const totalCount = stock.reduce((sum, i) => sum + i.quantity, 0);
  const isSearching = searchName.trim() !== "";

  // All labels (for duplicate checking)
  const structureCompat = useMemo(
    () =>
      Object.fromEntries(
        shelfStructure?.boxes.map((b) => [b.label, b.sections.map((s) => s.label)]) ?? []
      ),
    [shelfStructure]
  );

  // Set of level-0 labels for search result badge
  const miscLabels = useMemo(
    () => new Set((shelfStructure?.boxes ?? []).filter((b) => b.shelfLevel === 0).map((b) => b.label)),
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

  async function handleAddArea() {
    const name = newAreaName.trim().toUpperCase();
    if (!name || structureCompat[name] !== undefined) return;
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-area", box: name }),
      });
      if (!res.ok) throw new Error("Failed to add area");
      setShelfStructure(await res.json());
      setAddAreaOpen(false);
      setNewAreaName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }


  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4 sm:block">
          <div>
            <h1 className="text-3xl font-bold">Stock</h1>
            <p className="text-muted-foreground">
              {loading ? "Loading..." : `${totalCount} items across ${stock.length} lines`}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:hidden">
            <Package className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:flex">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setAddBoxOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Box
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddAreaOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Area
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
            placeholder="Size…"
            className="w-24 sm:w-36"
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
                      isMisc={miscLabels.has(item.box)}
                      deleteConfirm={deleteItemConfirm}
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

      {/* Shelf + Other Areas view */}
      {!loading && !isSearching && shelfStructure && (
        <ShelfView
          structure={shelfStructure}
          stock={stock}
          onSelectBox={(label) => router.push(`/stores/stock/${label}`)}
          onStructureChange={(s) => setShelfStructure(s)}
          onAddBox={() => setAddBoxOpen(true)}
          editMode={editMode}
        />
      )}

      {/* Edit Arrangement — bottom centre */}
      {!loading && !isSearching && (
        <div className="flex justify-center pt-2">
          <Button
            variant={editMode ? "default" : "outline"}
            className="gap-2 px-6"
            onClick={() => setEditMode((m) => !m)}
          >
            {editMode ? (
              <>
                <Check className="h-4 w-4" />
                Done Editing
              </>
            ) : (
              <>
                <Settings2 className="h-4 w-4" />
                Edit Arrangement
              </>
            )}
          </Button>
        </div>
      )}

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

      {/* Add Area */}
      <Dialog open={addAreaOpen} onOpenChange={setAddAreaOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Misc Area</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="newArea">Area Label</Label>
            <Input
              id="newArea"
              placeholder="e.g. CUPBOARD"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleAddArea()}
              maxLength={20}
            />
            {newAreaName.trim() && structureCompat[newAreaName.trim().toUpperCase()] !== undefined && (
              <p className="text-xs text-destructive">{newAreaName.trim().toUpperCase()} already exists.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddAreaOpen(false); setNewAreaName(""); }}>Cancel</Button>
            <Button onClick={handleAddArea} disabled={!newAreaName.trim() || structureCompat[newAreaName.trim().toUpperCase()] !== undefined}>
              Add Area
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
  isMisc,
  deleteConfirm,
  onDelete,
  onDeleteConfirm,
}: {
  item: StockItem;
  isMisc: boolean;
  deleteConfirm: string | null;
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
        <Badge variant="outline" className="text-xs">
          {isMisc ? item.box : `Box ${item.box}`} §{item.section}
        </Badge>
        <Badge variant="secondary" className="text-xs">qty: {item.quantity}</Badge>
        {deleteConfirm === item.id ? (
          <>
            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
              onClick={() => onDelete(item.id)}>Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => onDeleteConfirm(null)}>Cancel</Button>
          </>
        ) : (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDeleteConfirm(item.id)} aria-label="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}
