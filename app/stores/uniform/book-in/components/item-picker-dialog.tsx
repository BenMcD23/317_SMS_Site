"use client";

import { useState } from "react";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Button } from "@317/ui-common/components/ui/button";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { SearchableSelect } from "@/components/searchable-select";
import { useReference } from "@/lib/reference";
import { formatNsn } from "@/lib/stores-scan";

/** What the dialog is asked: what an unknown stock number is (nsn set), or
 *  which item to book in by hand when a label won't scan (nsn null). */
export type PickerRequest = { nsn: string | null; readSize: string | null };

/** The catalogue size a label's printed size starts with ("110/40(16)" is
 *  110/40), so a photo's reading can pre-fill the size. */
export function sizeFromLabel(read: string | null, sizes: string[]): string {
  if (!read) return "";
  const printed = read.replace(/\s+/g, "").toLowerCase();
  const matches = sizes.filter((s) => printed.startsWith(s.replace(/\s+/g, "").toLowerCase()));
  // The longest match wins, so "110/40" isn't taken for "110/4".
  return matches.sort((a, b) => b.length - a.length)[0] ?? "";
}

/**
 * Item and size for one booking. The page gives each opening a new `key`, so
 * it starts empty without resetting itself. For an unknown number the answer is saved,
 * so the same label books in straight away from then on. Kept outside a
 * `<form>`: inside one, Radix Select echoes values back (see StockItemFields).
 */
export function ItemPickerDialog({
  request,
  onCancel,
  onPicked,
}: {
  request: PickerRequest | null;
  onCancel: () => void;
  onPicked: (itemType: string, size: string) => Promise<void>;
}) {
  const { stockItemTypes, noSizeItems, sizes } = useReference();
  const [itemType, setItemType] = useState("");
  const [size, setSize] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSize = itemType !== "" && !noSizeItems.has(itemType);
  const sizeOptions = sizes[itemType] ?? [];
  const ready = itemType !== "" && (!needsSize || size !== "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onPicked(itemType, needsSize ? size : "N/A");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book that in.");
    } finally {
      setSaving(false);
    }
  }

  const nsn = request?.nsn ?? null;
  return (
    <ResponsiveDialog open={request !== null} onOpenChange={(open) => !open && onCancel()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {nsn ? `What is ${formatNsn(nsn)}?` : "Choose the item"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {nsn
              ? "This stock number isn't on the logs form. Say what it is once and it books in straight away next time."
              : "For a label that won't scan or read."}
            {request?.readSize ? ` The label says size ${request.readSize}.` : ""}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="picker-item">Item</FieldLabel>
            <SearchableSelect
              id="picker-item"
              value={itemType}
              onValueChange={(v) => {
                setItemType(v);
                setSize(sizeFromLabel(request?.readSize ?? null, sizes[v] ?? []));
              }}
              placeholder="Choose an item…"
              className="w-full"
              options={stockItemTypes.map((t) => ({ value: t, label: t }))}
            />
          </Field>
          {needsSize && (
            <Field>
              <FieldLabel htmlFor="picker-size">Size</FieldLabel>
              <SearchableSelect
                id="picker-size"
                value={size}
                onValueChange={setSize}
                placeholder="Choose a size…"
                className="w-full"
                options={sizeOptions.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          )}
          <ErrorAlert message={error} />
        </div>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="h-10" disabled={!ready || saving} onClick={save}>
            {nsn ? "Save and book in" : "Book in"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
