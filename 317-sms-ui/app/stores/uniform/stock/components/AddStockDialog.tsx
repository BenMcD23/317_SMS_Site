"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { ITEM_TYPES, ITEM_SIZES, NO_SIZE_ITEMS } from "@/lib/stores-items";

interface AddStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock: StockItem[];
  shelfStructure: ShelfStructure;
  onSuccess: () => void;
}

export function AddStockDialog({
  open,
  onOpenChange,
  stock,
  shelfStructure,
  onSuccess,
}: AddStockDialogProps) {
  const [itemType, setItemType] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [box, setBox] = useState("");
  const [section, setSection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [suggestionSource, setSuggestionSource] = useState<"exact" | "co-location" | null>(null);

  const userOverrode = useRef(false);

  const needsSize = itemType !== "" && !NO_SIZE_ITEMS.has(itemType);

  const sizeOptions = useMemo(() => {
    if (!itemType || NO_SIZE_ITEMS.has(itemType)) return [];
    return ITEM_SIZES[itemType] ?? [];
  }, [itemType]);

  const boxOptions = useMemo(
    () => shelfStructure.boxes.map((b) => b.label),
    [shelfStructure]
  );

  const sectionOptions = useMemo(() => {
    if (!box) return [];
    return shelfStructure.boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];
  }, [box, shelfStructure]);

  const isValid =
    itemType !== "" &&
    (!needsSize || size !== "") &&
    quantity >= 1 &&
    box !== "" &&
    section !== "";

  // Auto-suggestion
  useEffect(() => {
    const readyToSuggest = itemType !== "" && (!needsSize || size !== "");
    if (!readyToSuggest || userOverrode.current) return;

    const effectiveSize = needsSize ? size : "N/A";

    // Priority 1: exact match (same type + size)
    const exact = stock.find(
      (i) => i.itemType === itemType && i.size === effectiveSize
    );
    if (exact) {
      setBox(exact.box);
      setSection(exact.section);
      setSuggestionSource("exact");
      return;
    }

    // Priority 2: co-location (same type, any size)
    const sameType = stock.filter((i) => i.itemType === itemType);
    if (sameType.length > 0) {
      const freq = new Map<string, number>();
      for (const i of sameType) {
        const key = `${i.box}|||${i.section}`;
        freq.set(key, (freq.get(key) ?? 0) + i.quantity);
      }
      let bestKey = "";
      let bestCount = 0;
      for (const [key, count] of freq) {
        if (count > bestCount) { bestCount = count; bestKey = key; }
      }
      const [bestBox, bestSection] = bestKey.split("|||");
      setBox(bestBox);
      setSection(bestSection);
      setSuggestionSource("co-location");
      return;
    }

    // Priority 3: no match
    setBox("");
    setSection("");
    setSuggestionSource(null);
  }, [itemType, size, stock, needsSize]);

  // Reset section if it no longer exists in the selected box
  useEffect(() => {
    const sections =
      shelfStructure.boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];
    if (section !== "" && !sections.includes(section)) {
      setSection("");
    }
  }, [box, shelfStructure]);

  function handleItemTypeChange(val: string) {
    userOverrode.current = false;
    setItemType(val);
    setSize("");
    setBox("");
    setSection("");
    setSuggestionSource(null);
  }

  function handleSizeChange(val: string) {
    userOverrode.current = false;
    setSize(val);
    setBox("");
    setSection("");
    setSuggestionSource(null);
  }

  function handleBoxChange(val: string) {
    userOverrode.current = true;
    setBox(val);
    setSection("");
  }

  function handleSectionChange(val: string) {
    userOverrode.current = true;
    setSection(val);
  }

  function handleClose() {
    setItemType("");
    setSize("");
    setQuantity(1);
    setBox("");
    setSection("");
    setSubmitting(false);
    setSubmitError(null);
    setSuggestionSource(null);
    userOverrode.current = false;
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/stores/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType,
          size: needsSize ? size : "N/A",
          box,
          section,
          quantity,
        }),
      });
      if (!res.ok) throw new Error("Failed to add stock");
      onSuccess();
      handleClose();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  const showHint = suggestionSource !== null && !userOverrode.current;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item Type</Label>
            <Select value={itemType} onValueChange={handleItemTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select item type…" />
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
              <Select value={size} onValueChange={handleSizeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select size…" />
                </SelectTrigger>
                <SelectContent>
                  {sizeOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="addstock-qty">Quantity</Label>
            <Input
              id="addstock-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-28"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Box</Label>
              <Select value={box} onValueChange={handleBoxChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Box…" />
                </SelectTrigger>
                <SelectContent>
                  {boxOptions.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select
                value={section}
                onValueChange={handleSectionChange}
                disabled={!box || sectionOptions.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Section…" />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showHint && (
            <p className="text-xs text-muted-foreground">
              {suggestionSource === "exact"
                ? "Suggested: existing stock for this item and size — quantities will be merged."
                : "Suggested: co-located with other items of this type."}
            </p>
          )}

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? "Adding…" : "Add Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
