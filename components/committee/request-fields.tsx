"use client";

import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatGBP } from "@/lib/committee";
import { type CommitteeRequestForm, emptyItem, lineTotal, requestTotal } from "@/lib/committee-form";

/**
 * Title, justification and items of a committee request. Shared by the
 * new-request page and the OC's edit dialog so the two can't drift.
 *
 * Changing an item's quantity or unit cost refills its total; typing in the
 * total overrides it until quantity or unit cost changes again.
 */
export function CommitteeRequestFields({
  form,
  idPrefix,
}: {
  form: UseFormReturn<CommitteeRequestForm>;
  idPrefix: string;
}) {
  const { control, register, getValues, setValue, formState } = form;
  const items = useFieldArray({ control, name: "items" });
  const watched = useWatch({ control, name: "items" }) ?? [];

  const refill = (index: number) => {
    const { quantity, unitCost } = getValues(`items.${index}`);
    const total = lineTotal(quantity, unitCost);
    if (Number.isFinite(total))
      setValue(`items.${index}.total`, total, {
        shouldDirty: true,
        shouldValidate: formState.isSubmitted,
      });
  };

  const titleError = formState.errors.title?.message;
  const itemsError = formState.errors.items?.root?.message ?? formState.errors.items?.message;
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="flex flex-col gap-5">
      <Field data-invalid={!!titleError || undefined}>
        <FieldLabel htmlFor={id("title")}>Title</FieldLabel>
        <Input
          id={id("title")}
          placeholder="e.g. New handheld radios for radio badge"
          aria-invalid={!!titleError || undefined}
          {...register("title")}
        />
        <FieldError>{titleError}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor={id("justification")}>Justification</FieldLabel>
        <Textarea
          id={id("justification")}
          placeholder="Why is this needed?"
          rows={3}
          {...register("justification")}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Items</legend>
        <ol className="divide-y rounded-md border">
          {items.fields.map((field, index) => {
            const errors = formState.errors.items?.[index];
            const n = index + 1;
            return (
              <li key={field.id} className="flex flex-col gap-3 p-3">
                <Field data-invalid={!!errors?.description || undefined}>
                  <FieldLabel htmlFor={id(`item-${index}-description`)}>Item {n}</FieldLabel>
                  <div className="flex items-start gap-2">
                    <Input
                      id={id(`item-${index}-description`)}
                      placeholder="Item name"
                      aria-invalid={!!errors?.description || undefined}
                      {...register(`items.${index}.description`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      onClick={() => items.remove(index)}
                      disabled={items.fields.length === 1}
                      aria-label={`Remove item ${n}`}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                  <FieldError>{errors?.description?.message}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor={id(`item-${index}-details`)}>Description</FieldLabel>
                  <Textarea
                    id={id(`item-${index}-details`)}
                    rows={2}
                    placeholder="Model, size, supplier or link"
                    {...register(`items.${index}.details`)}
                  />
                </Field>
                <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-2">
                  <Field data-invalid={!!errors?.quantity || undefined}>
                    <FieldLabel htmlFor={id(`item-${index}-quantity`)}>Qty</FieldLabel>
                    <Input
                      id={id(`item-${index}-quantity`)}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      aria-invalid={!!errors?.quantity || undefined}
                      {...register(`items.${index}.quantity`, {
                        valueAsNumber: true,
                        onChange: () => refill(index),
                      })}
                    />
                    <FieldError>{errors?.quantity?.message}</FieldError>
                  </Field>
                  <MoneyField
                    id={id(`item-${index}-unit`)}
                    label="Unit cost"
                    error={errors?.unitCost?.message}
                    {...register(`items.${index}.unitCost`, {
                      valueAsNumber: true,
                      onChange: () => refill(index),
                    })}
                  />
                  <MoneyField
                    id={id(`item-${index}-total`)}
                    label="Total"
                    error={errors?.total?.message}
                    {...register(`items.${index}.total`, { valueAsNumber: true })}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <FieldError>{itemsError}</FieldError>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button type="button" variant="outline" className="h-9" onClick={() => items.append(emptyItem())}>
            <Plus /> Add item
          </Button>
          <p className="text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="font-semibold tabular-nums">{formatGBP(requestTotal(watched))}</span>
          </p>
        </div>
      </fieldset>
    </div>
  );
}

function MoneyField({
  id,
  label,
  error,
  ...input
}: { id: string; label: string; error?: string } & React.ComponentProps<"input">) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
          £
        </span>
        <Input
          id={id}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          className="pl-6 text-right"
          aria-invalid={!!error || undefined}
          {...input}
        />
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
