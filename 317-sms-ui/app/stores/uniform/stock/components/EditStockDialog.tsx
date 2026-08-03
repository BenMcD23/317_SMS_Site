"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ShelfStructure, StockItem } from "@/lib/stores-types";
import { ITEM_TYPES, NO_SIZE_ITEMS } from "@/lib/stores-items";
import { SizeCombobox } from "@/components/size-combobox";

interface EditStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItem | null;
  shelfStructure: ShelfStructure;
  onSuccess: (updated: StockItem) => void;
}

// Shared by the box detail view and the search results view so the
// item-edit form and PATCH logic live in one place.
export function EditStockDialog({
  open,
  onOpenChange,
  item,
  shelfStructure,
  onSuccess,
}: EditStockDialogProps) {
  const [itemType, setItemType] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [box, setBox] = useState("");
  const [section, setSection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setItemType(item.itemType);
      setSize(item.size);
      setQuantity(item.quantity);
      setBox(item.box);
      setSection(item.section);
      setSubmitError(null);
    }
  }, [item]);

  const needsSize = itemType !== "" && !NO_SIZE_ITEMS.has(itemType);

  const boxOptions = useMemo(
    () => shelfStructure.boxes.map((b) => b.label),
    [shelfStructure]
  );

  const sectionOptions = useMemo(() => {
    if (!box) return [];
    return shelfStructure.boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];
  }, [box, shelfStructure]);

  const isValid =
    itemType !== "" && (!needsSize || size !== "") && quantity >= 0 && box !== "" && section !== "";

  function handleItemTypeChange(v: string) {
    setItemType(v);
    setSize(NO_SIZE_ITEMS.has(v) ? "N/A" : (NO_SIZE_ITEMS.has(itemType) ? "" : size));
  }

  function handleBoxChange(v: string) {
    setBox(v);
    setSection("");
  }

  function handleClose() {
    setSubmitting(false);
    setSubmitError(null);
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!item || !isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/stores/stock/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType,
          size: needsSize ? size : "N/A",
          box,
          section,
          quantity,
        }),
      });
      if (!res.ok) throw new Error("Failed to update item");
      const updated = await res.json();
      onSuccess(updated);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Stock Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item Type</Label>
            <Select value={itemType} onValueChange={handleItemTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select item type" />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsSize && (
            <div className="space-y-1.5">
              <Label>Size</Label>
              <SizeCombobox
                itemType={itemType}
                value={size}
                onChange={setSize}
                placeholder="e.g. 95/36 or 74"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Box</Label>
              <Select value={box} onValueChange={handleBoxChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Box" />
                </SelectTrigger>
                <SelectContent>
                  {boxOptions.map((b) => (
                    <SelectItem key={b} value={b}>Box {b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection} disabled={!box || sectionOptions.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={sectionOptions.length === 0 ? "No sections" : "Section"} />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.map((s) => (
                    <SelectItem key={s} value={s}>Section {s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editstock-qty">Quantity</Label>
            <Input
              id="editstock-qty"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
              className="w-28"
            />
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !isValid}>
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
