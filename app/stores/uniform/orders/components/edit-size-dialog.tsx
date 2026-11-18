"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { SizeCombobox } from "@/components/size-combobox";
import type { OrderItem } from "@/lib/stores-types";

export type SizeEdit = Pick<OrderItem, "size" | "needSizing" | "sizingDetails">;

/**
 * Set an order item's size, or mark it as needing sizing with the
 * measurements so far. The two are exclusive: an item that needs sizing has
 * no size, and one with a size has no sizing details.
 *
 * `onSave` returns false when the save failed (the page shows why); the
 * dialog then stays open so the edit isn't lost.
 *
 * Its fields start from `item` each time it opens. The page renders it with
 * `key={item.id}`, so a second item never inherits the first one's edits.
 */
export function EditSizeDialog({
  item,
  onClose,
  onSave,
}: {
  item: OrderItem | null;
  onClose: () => void;
  onSave: (edit: SizeEdit) => boolean | Promise<boolean>;
}) {
  const [size, setSize] = useState(item?.size ?? "");
  const [needSizing, setNeedSizing] = useState(item?.needSizing ?? false);
  const [details, setDetails] = useState(item?.sizingDetails ?? "");
  const canSave = needSizing || !!size.trim();

  async function save() {
    if (!canSave) return;
    const saved = await onSave({ size: needSizing ? "" : size, needSizing, sizingDetails: details });
    if (saved) onClose();
  }

  return (
    <ResponsiveDialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Size & Sizing Details</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-needs-sizing"
              checked={needSizing}
              onCheckedChange={(c) => {
                setNeedSizing(!!c);
                if (!c) setDetails("");
              }}
            />
            <Label htmlFor="edit-needs-sizing" className="cursor-pointer">
              Needs Sizing
            </Label>
          </div>

          {needSizing ? (
            <div className="space-y-1.5">
              <Label htmlFor="editSizingDetails">Sizing Details</Label>
              <textarea
                id="editSizingDetails"
                className="bg-background focus:ring-ring w-full resize-none rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                rows={3}
                placeholder="e.g. chest 96cm, height 175cm"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="editSize">Size</Label>
              <SizeCombobox
                strict
                id="editSize"
                itemType={item?.itemType ?? ""}
                value={size}
                onChange={setSize}
                placeholder="e.g. 95/36"
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>
          )}
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave}>
            Save
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
