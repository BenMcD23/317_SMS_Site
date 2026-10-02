"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SizeCombobox } from "@/components/size-combobox";
import { ShelfStructure, StockItem } from "@/lib/stores-types";
import { useReference } from "@/lib/reference";

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

  // True once the user has picked a box/section by hand, so auto-suggestion
  // stops overriding them until the item or size changes again.
  const [userOverrode, setUserOverrode] = useState(false);

  const { itemTypes, noSizeItems } = useReference();
  const needsSize = itemType !== "" && !noSizeItems.has(itemType);

  const boxOptions = useMemo(() => shelfStructure.boxes.map((b) => b.label), [shelfStructure]);

  const sectionOptions = useMemo(() => {
    if (!box) return [];
    return shelfStructure.boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];
  }, [box, shelfStructure]);

  const trimmedSize = size.trim();
  const isValid =
    itemType !== "" && (!needsSize || trimmedSize !== "") && quantity >= 1 && box !== "" && section !== "";

  // Auto-suggestion
  useEffect(() => {
    const readyToSuggest = itemType !== "" && (!needsSize || trimmedSize !== "");
    if (!readyToSuggest || userOverrode) return;

    const effectiveSize = needsSize ? trimmedSize : "N/A";

    // Priority 1: exact match (same type + size)
    const exact = stock.find((i) => i.itemType === itemType && i.size === effectiveSize);
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
        if (count > bestCount) {
          bestCount = count;
          bestKey = key;
        }
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
  }, [itemType, trimmedSize, stock, needsSize, userOverrode]);

  // Reset section if it no longer exists in the selected box
  useEffect(() => {
    const sections = shelfStructure.boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];
    if (section !== "" && !sections.includes(section)) {
      setSection("");
    }
  }, [box, shelfStructure]);

  function handleItemTypeChange(val: string) {
    setUserOverrode(false);
    setItemType(val);
    setSize("");
    setBox("");
    setSection("");
    setSuggestionSource(null);
  }

  function handleSizeChange(val: string) {
    setUserOverrode(false);
    setSize(val);
    setBox("");
    setSection("");
    setSuggestionSource(null);
  }

  function handleBoxChange(val: string) {
    setUserOverrode(true);
    setBox(val);
    setSection("");
  }

  function handleSectionChange(val: string) {
    setUserOverrode(true);
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
    setUserOverrode(false);
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
          size: needsSize ? trimmedSize : "N/A",
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

  const showHint = suggestionSource !== null && !userOverrode;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="addstock-type">Item Type</Label>
            <Select value={itemType} onValueChange={handleItemTypeChange}>
              <SelectTrigger id="addstock-type" className="w-full">
                <SelectValue placeholder="Select item type…" />
              </SelectTrigger>
              <SelectContent>
                {itemTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsSize && (
            <div className="space-y-1.5">
              <Label htmlFor="addstock-size">Size</Label>
              {/* Free text, not a catalogue-only list: a stock count has to be able
                  to record whatever is physically in the box, including sizes the
                  catalogue doesn't list yet. Orders are the ones restricted. */}
              <SizeCombobox
                id="addstock-size"
                itemType={itemType}
                value={size}
                onChange={handleSizeChange}
                placeholder="e.g. 95/36 or 74"
              />
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
              <Label htmlFor="addstock-box">Box</Label>
              <Select value={box} onValueChange={handleBoxChange}>
                <SelectTrigger id="addstock-box" className="w-full">
                  <SelectValue placeholder="Box…" />
                </SelectTrigger>
                <SelectContent>
                  {boxOptions.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addstock-section">Section</Label>
              <Select
                value={section}
                onValueChange={handleSectionChange}
                disabled={!box || sectionOptions.length === 0}
              >
                <SelectTrigger id="addstock-section" className="w-full">
                  <SelectValue placeholder="Section…" />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showHint && (
            <p className="text-muted-foreground text-xs">
              {suggestionSource === "exact"
                ? "Suggested: existing stock for this item and size — quantities will be merged."
                : "Suggested: co-located with other items of this type."}
            </p>
          )}

          {submitError && <p className="text-destructive text-sm">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? "Adding…" : "Add Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
