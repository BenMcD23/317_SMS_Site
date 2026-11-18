"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@317/ui-common/components/ui/button";
import { Input } from "@317/ui-common/components/ui/input";
import { Label } from "@317/ui-common/components/ui/label";
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Order } from "@/lib/stores-types";
import { useReference } from "@/lib/reference";
import { SizeCombobox } from "@/components/size-combobox";
import { CadetSearchInput } from "@/components/cadet-search";
import { type DraftItem, emptyDraftItem } from "./draft-item";

/**
 * "New Order": pick a cadet and the items they need (a size, or "Need Sizing").
 * Holds its own form state, cleared each time it opens. Split out of the
 * uniform orders page, which had grown to 1,500 lines.
 */
export function NewUniformOrderDialog({
  open,
  onOpenChange,
  token,
  onCreated,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  onCreated: (order: Order) => void;
  onError: (message: string) => void;
}) {
  const { itemTypes, noSizeItems } = useReference();
  const [newCadetCin, setNewCadetCin] = useState<number | null>(null);
  const [newCadetName, setNewCadetName] = useState("");
  const [newItems, setNewItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [submitting, setSubmitting] = useState(false);

  // A fresh form every time it opens: reset while rendering the open, React's
  // pattern for state that follows a prop, so the last cadet doesn't flash up.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNewCadetCin(null);
      setNewCadetName("");
      setNewItems([emptyDraftItem()]);
    }
  }

  async function handleCreateOrder() {
    const validItems = newItems.filter((i) => i.itemType);
    if (!newCadetCin || validItems.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadetCin: newCadetCin, items: validItems }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      const created = await res.json();
      onCreated(created);
      onOpenChange(false);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New Order</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cadet</Label>
            <CadetSearchInput
              token={token}
              selectedCin={newCadetCin}
              selectedName={newCadetName}
              onSelect={(cin, name) => {
                setNewCadetCin(cin || null);
                setNewCadetName(name);
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setNewItems((prev) => [...prev, emptyDraftItem()])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            {newItems.length === 0 && <p className="text-muted-foreground text-sm">No items added yet.</p>}

            {newItems.map((item, idx) => (
              <div key={idx} className="space-y-1.5 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      aria-label="Item type"
                      value={item.itemType}
                      onValueChange={(v) =>
                        setNewItems((prev) => prev.map((it, i) => (i === idx ? { ...it, itemType: v } : it)))
                      }
                      placeholder="Item type"
                      className="h-8 text-sm"
                      options={itemTypes.map((t) => ({ value: t, label: t }))}
                    />
                  </div>
                  {!noSizeItems.has(item.itemType) && (
                    <div className="w-24">
                      <SizeCombobox
                        strict
                        className="h-8 text-sm"
                        itemType={item.itemType}
                        value={item.size}
                        disabled={item.needSizing}
                        onChange={(v) =>
                          setNewItems((prev) => prev.map((it, i) => (i === idx ? { ...it, size: v } : it)))
                        }
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground h-8 w-8 shrink-0"
                    onClick={() => setNewItems((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove item"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {!noSizeItems.has(item.itemType) && (
                  <>
                    <div className="flex items-center gap-1.5 px-0.5">
                      <Checkbox
                        id={`ns-new-${idx}`}
                        checked={item.needSizing}
                        onCheckedChange={(c) =>
                          setNewItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, needSizing: !!c, size: !!c ? "" : it.size } : it
                            )
                          )
                        }
                      />
                      <Label htmlFor={`ns-new-${idx}`} className="cursor-pointer text-xs">
                        Need Sizing
                      </Label>
                    </div>
                    {item.needSizing && (
                      <Input
                        className="h-8 text-sm"
                        placeholder="Sizing details (optional)"
                        value={item.sizingDetails}
                        onChange={(e) =>
                          setNewItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, sizingDetails: e.target.value } : it))
                          )
                        }
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateOrder}
            disabled={submitting || !newCadetCin || newItems.filter((i) => i.itemType).length === 0}
          >
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
