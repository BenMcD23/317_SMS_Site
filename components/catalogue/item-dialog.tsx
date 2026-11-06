"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSession } from "next-auth/react";

import { ErrorAlert } from "@/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type CatalogueItem,
  EMPTY_ITEM,
  GENDER_LABELS,
  type Gender,
  itemPayload,
  itemResolver,
  itemToForm,
  type ItemForm,
  OWN_LINE,
  parseList,
  saveItem,
  SIZING_FIELD_OPTIONS,
} from "@/lib/catalogue";

/**
 * Add a uniform item, or edit one. The name is fixed once an item exists
 * because stock and orders record it as text, so editing shows it but doesn't
 * offer to change it. Rendered outside a `<form>` for the same reason as the
 * stock dialogs: Radix Select inside one echoes programmatic values back.
 */
function ItemDialogBody({
  item,
  onOpenChange,
  lines,
  onSaved,
  onSetActive,
  onDelete,
}: {
  /** null = adding a new item */
  item: CatalogueItem | null;
  onOpenChange: (open: boolean) => void;
  /** The record lines already in use, for "shares a line with". */
  lines: string[];
  onSaved: () => void;
  /** Retire or restore the item being edited (the page does it and closes this). */
  onSetActive: (item: CatalogueItem, active: boolean) => void;
  onDelete: (item: CatalogueItem) => void;
}) {
  const { data: session } = useSession();
  const creating = item === null;
  const form = useForm<ItemForm>({
    resolver: itemResolver,
    defaultValues: item ? itemToForm(item) : EMPTY_ITEM,
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;
  const [noSize, stockOnly, sizesText] = useWatch({ control, name: ["noSize", "stockOnly", "sizes"] });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const touched = (name: keyof ItemForm) =>
    formState.touchedFields[name] ? formState.errors[name]?.message : undefined;
  const id = (name: string) => `item-${name}`;

  const submit = handleSubmit(async (v) => {
    setSubmitError(null);
    try {
      await saveItem(session?.id_token ?? "", item?.id ?? null, itemPayload(v, creating));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save the item.");
    }
  });

  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{creating ? "Add an item" : item.name}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {creating
            ? "It will be offered on the stock and order forms straight away."
            : "The name can't change, because stock and orders already use it."}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-0.5">
        {creating && (
          <Field data-invalid={!!touched("name") || undefined}>
            <FieldLabel htmlFor={id("name")}>Name</FieldLabel>
            <Input id={id("name")} aria-invalid={!!touched("name") || undefined} {...register("name")} />
            <FieldError>{touched("name")}</FieldError>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor={id("gender")}>Worn by</FieldLabel>
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <Select value={field.value} onValueChange={(v) => field.onChange(v as Gender)}>
                <SelectTrigger id={id("gender")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                    <SelectItem key={g} value={g}>
                      {GENDER_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <ToggleRow
          id={id("nosize")}
          control={control}
          name="noSize"
          label="Has no size"
          hint="Ties, belts and brassards are one line however many are on the shelf."
        />

        {!noSize && (
          <>
            <Field data-invalid={!!touched("sizes") || undefined}>
              <FieldLabel htmlFor={id("sizes")}>Sizes</FieldLabel>
              <Textarea
                id={id("sizes")}
                rows={6}
                aria-invalid={!!touched("sizes") || undefined}
                {...register("sizes")}
              />
              <FieldDescription>
                One per line, in the order they should be listed. {parseList(sizesText).length} so far.
              </FieldDescription>
              <FieldError>{touched("sizes")}</FieldError>
            </Field>

            <Field>
              <FieldLabel>Measurements to ask for</FieldLabel>
              <Controller
                control={control}
                name="sizingFields"
                render={({ field }) => (
                  <div
                    className="flex flex-wrap gap-x-4 gap-y-2"
                    role="group"
                    aria-label="Measurements to ask for"
                  >
                    {SIZING_FIELD_OPTIONS.map((m) => (
                      <label key={m} className="flex min-h-8 items-center gap-2 text-sm capitalize">
                        <Checkbox
                          checked={field.value.includes(m)}
                          onCheckedChange={(on) =>
                            field.onChange(on ? [...field.value, m] : field.value.filter((x) => x !== m))
                          }
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                )}
              />
              <FieldDescription>What a cadet fills in when they say they need sizing.</FieldDescription>
            </Field>
          </>
        )}

        <Field>
          <FieldLabel htmlFor={id("line")}>Cadet record line</FieldLabel>
          <Controller
            control={control}
            name="issuanceCategory"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id("line")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OWN_LINE}>Its own line</SelectItem>
                  {lines.map((l) => (
                    <SelectItem key={l} value={l}>
                      Shares “{l}”
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>
            Giving this item updates this line of the cadet’s last-issued sizes.
          </FieldDescription>
        </Field>

        <Field data-invalid={!!touched("lowStockLevel") || undefined}>
          <FieldLabel htmlFor={id("level")}>Order more below</FieldLabel>
          <Input
            id={id("level")}
            type="number"
            inputMode="numeric"
            min={0}
            className="w-28"
            placeholder="Automatic"
            aria-invalid={!!touched("lowStockLevel") || undefined}
            {...register("lowStockLevel")}
          />
          <FieldDescription>
            The least to keep on the shelf of each size. Leave empty to work it out from what cadets ask for.
          </FieldDescription>
          <FieldError>{touched("lowStockLevel")}</FieldError>
        </Field>

        <ToggleRow
          id={id("orderlist")}
          control={control}
          name="onOrderList"
          label="Show on the order list"
          hint="Off for things the QM tops up by eye, like berets."
        />
        <ToggleRow
          id={id("stockonly")}
          control={control}
          name="stockOnly"
          label="Held in stock only"
          hint="Kept on the stock pages but never offered on orders or the cadet portal, like polos."
        />
        {!stockOnly && (
          <ToggleRow
            id={id("kit")}
            control={control}
            name="kitFlight"
            label="Part of a new cadet’s kit"
            hint="Added to the kitting order for each new C Flight cadet."
          />
        )}

        <ErrorAlert message={submitError} title="Not saved" />

        {item && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onSetActive(item, !item.active)}>
                {item.active ? "Retire item" : "Restore item"}
              </Button>
              {item.stockRows + item.orderItems === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onDelete(item)}
                >
                  Delete item
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-sm text-pretty">
              {item.stockRows + item.orderItems > 0
                ? `In ${item.stockRows} stock ${item.stockRows === 1 ? "line" : "lines"} and ${item.orderItems} order ${item.orderItems === 1 ? "item" : "items"}, so it can be retired but not deleted. A retired item leaves the pickers; nothing recorded against it changes.`
                : "Not used anywhere yet, so it can be deleted."}
            </p>
          </div>
        )}
      </div>

      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={!formState.isValid || formState.isSubmitting}>
          {creating ? "Add item" : "Save changes"}
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}

function ToggleRow({
  id,
  control,
  name,
  label,
  hint,
}: {
  id: string;
  control: ReturnType<typeof useForm<ItemForm>>["control"];
  name: "noSize" | "stockOnly" | "onOrderList" | "kitFlight";
  label: string;
  hint: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label htmlFor={id} className="text-sm leading-snug font-medium">
              {label}
            </label>
            <p className="text-muted-foreground text-sm text-pretty">{hint}</p>
          </div>
          <Switch id={id} checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
        </div>
      )}
    />
  );
}

/**
 * The dialog around the form. The form lives one level down, inside the
 * content, so each time the dialog opens it mounts fresh from the entry being
 * edited: a cancelled edit or an old error never leaks into the next one.
 */
export function ItemDialog({
  open,
  ...props
}: Omit<Parameters<typeof ItemDialogBody>[0], never> & { open: boolean }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={props.onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ItemDialogBody {...props} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
