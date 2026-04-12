"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ShelfStructure, ShelfBox, StockItem } from "@/lib/stores-types";
import { BoxDetailView } from "../components/BoxDetailView";

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

export default function BoxPage() {
  const params = useParams();
  const router = useRouter();
  const boxLabel = String(params.box).toUpperCase();

  const [shelfStructure, setShelfStructure] = useState<ShelfStructure | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockItem | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyForm(boxLabel));
  const [submitting, setSubmitting] = useState(false);
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null);
  const [deleteBoxConfirm, setDeleteBoxConfirm] = useState(false);

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

  const selectedBox: ShelfBox | null = useMemo(
    () => shelfStructure?.boxes.find((b) => b.label === boxLabel) ?? null,
    [shelfStructure, boxLabel]
  );

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

  // ── Item CRUD ──────────────────────────────────────────────────────────────

  function openAdd(box = boxLabel, section = "") {
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

  async function handleDeleteBox(box: string) {
    try {
      const res = await fetch("/api/stores/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-box", box }),
      });
      if (!res.ok) throw new Error("Failed to delete box");
      router.push("/stores/stock");
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

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!selectedBox) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Box {boxLabel} not found.{" "}
        <button className="underline" onClick={() => router.push("/stores/stock")}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-16">
      {/* Edit toggle */}
      <div className="flex justify-end">
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={() => setEditMode((m) => !m)}
        >
          {editMode ? "Done Editing" : "Edit Arrangement"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <BoxDetailView
        box={selectedBox}
        stock={stock}
        onBack={() => router.push("/stores/stock")}
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
    </div>
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
