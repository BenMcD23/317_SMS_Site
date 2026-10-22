"use client";

import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SizeCombobox } from "@/components/size-combobox";
import { useReference } from "@/lib/reference";
import type { StockForm, StockFormContext } from "@/lib/stock-form";
import type { ShelfStructure } from "@/lib/stores-types";

/**
 * The item / size / quantity / box / section fields of a stock line, shared
 * by the add and edit dialogs. Render it outside a `<form>`: inside one, Radix
 * Select adds a hidden native select that echoes every programmatic value back
 * through `onValueChange`, so a suggested location would read as hand-picked.
 *
 * The `on…` callbacks fire after the field has changed: what a new item type
 * does to the size, and the add dialog's location suggestion, differ by dialog.
 */
export function StockItemFields({
  form,
  idPrefix,
  shelfStructure,
  onItemTypeChange,
  onSizeChange,
  onLocationPicked,
}: {
  form: UseFormReturn<StockForm, StockFormContext>;
  idPrefix: string;
  shelfStructure: ShelfStructure;
  onItemTypeChange?: () => void;
  onSizeChange?: () => void;
  onLocationPicked?: () => void;
}) {
  const { control, register, setValue, formState } = form;
  const [itemType, box] = useWatch({ control, name: ["itemType", "box"] });
  const { itemTypes, noSizeItems } = useReference();
  const needsSize = itemType !== "" && !noSizeItems.has(itemType);
  const sections = shelfStructure.boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];

  // Errors show once a field has been left, not while it's first being filled.
  const errorFor = (name: keyof StockForm) =>
    formState.touchedFields[name] ? formState.errors[name]?.message : undefined;
  const qtyError = errorFor("quantity");
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={id("type")}>Item Type</FieldLabel>
        <Controller
          control={control}
          name="itemType"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                onItemTypeChange?.();
              }}
            >
              <SelectTrigger id={id("type")} className="w-full">
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
          )}
        />
      </Field>

      {needsSize && (
        <Field>
          <FieldLabel htmlFor={id("size")}>Size</FieldLabel>
          {/* Free text, not a catalogue-only list: a stock count has to be able
              to record whatever is physically in the box, including sizes the
              catalogue doesn't list yet. Orders are the ones restricted. */}
          <Controller
            control={control}
            name="size"
            render={({ field }) => (
              <SizeCombobox
                id={id("size")}
                itemType={itemType}
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  onSizeChange?.();
                }}
                placeholder="e.g. 95/36 or 74"
              />
            )}
          />
        </Field>
      )}

      <Field data-invalid={!!qtyError || undefined}>
        <FieldLabel htmlFor={id("qty")}>Quantity</FieldLabel>
        <Input
          id={id("qty")}
          type="number"
          inputMode="numeric"
          min={0}
          className="w-28"
          aria-invalid={!!qtyError || undefined}
          {...register("quantity", { valueAsNumber: true })}
        />
        <FieldError>{qtyError}</FieldError>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={id("box")}>Box</FieldLabel>
          <Controller
            control={control}
            name="box"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  setValue("section", "", { shouldValidate: true });
                  onLocationPicked?.();
                }}
              >
                <SelectTrigger id={id("box")} className="w-full">
                  <SelectValue placeholder="Box…" />
                </SelectTrigger>
                <SelectContent>
                  {shelfStructure.boxes.map((b) => (
                    <SelectItem key={b.label} value={b.label}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={id("section")}>Section</FieldLabel>
          <Controller
            control={control}
            name="section"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  onLocationPicked?.();
                }}
                disabled={!box || sections.length === 0}
              >
                <SelectTrigger id={id("section")} className="w-full">
                  <SelectValue placeholder={box && sections.length === 0 ? "No sections" : "Section…"} />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>
    </div>
  );
}
