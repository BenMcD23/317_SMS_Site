"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { ErrorAlert } from "@/components/error-alert";
import { StockItemFields } from "@/app/stores/uniform/stock/components/StockItemFields";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import {
  stockPayload,
  stockResolver,
  suggestLocation,
  type StockForm,
  type StockFormContext,
} from "@/lib/stock-form";
import { ShelfStructure, StockItem } from "@/lib/stores-types";
import { useReference } from "@/lib/reference";

interface AddStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock: StockItem[];
  shelfStructure: ShelfStructure;
  onSuccess: () => void;
}

const EMPTY: StockForm = { itemType: "", size: "", quantity: 1, box: "", section: "" };

export function AddStockDialog({
  open,
  onOpenChange,
  stock,
  shelfStructure,
  onSuccess,
}: AddStockDialogProps) {
  const { noSizeItems } = useReference();
  const form = useForm<StockForm, StockFormContext>({
    resolver: stockResolver(1),
    context: { noSizeItems },
    defaultValues: EMPTY,
    mode: "onChange",
  });
  const { control, setValue, handleSubmit, reset, formState } = form;
  const [itemType, size] = useWatch({ control, name: ["itemType", "size"] });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [suggestionSource, setSuggestionSource] = useState<"exact" | "co-location" | null>(null);
  // True once the user has picked a box/section by hand, so auto-suggestion
  // stops overriding them until the item or size changes again.
  const [userOverrode, setUserOverrode] = useState(false);

  const needsSize = itemType !== "" && !noSizeItems.has(itemType);
  const trimmedSize = size.trim();

  useEffect(() => {
    const readyToSuggest = itemType !== "" && (!needsSize || trimmedSize !== "");
    if (!readyToSuggest || userOverrode) return;
    const found = suggestLocation(stock, itemType, needsSize ? trimmedSize : "N/A");
    setValue("box", found?.box ?? "", { shouldValidate: true });
    setValue("section", found?.section ?? "", { shouldValidate: true });
    setSuggestionSource(found?.source ?? null);
  }, [itemType, trimmedSize, stock, needsSize, userOverrode, setValue]);

  function clearLocation() {
    setUserOverrode(false);
    setValue("box", "");
    setValue("section", "");
    setSuggestionSource(null);
  }

  function close() {
    reset(EMPTY);
    setSubmitError(null);
    setSuggestionSource(null);
    setUserOverrode(false);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (v) => {
    setSubmitError(null);
    try {
      const res = await apiFetch("/api/stores/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockPayload(v, noSizeItems)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(errorDetail(data) ?? "Couldn't add the stock. Try again.");
      }
      onSuccess();
      close();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't add the stock. Try again.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add stock</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <StockItemFields
            form={form}
            idPrefix="addstock"
            shelfStructure={shelfStructure}
            onItemTypeChange={() => {
              setValue("size", "", { shouldValidate: true });
              clearLocation();
            }}
            onSizeChange={clearLocation}
            onLocationPicked={() => setUserOverrode(true)}
          />
          {suggestionSource !== null && !userOverrode && (
            <FieldDescription>
              {suggestionSource === "exact"
                ? "Suggested: existing stock for this item and size — quantities will be merged."
                : "Suggested: co-located with other items of this type."}
            </FieldDescription>
          )}
          <ErrorAlert message={submitError} title="Stock not added" />
        </div>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!formState.isValid || formState.isSubmitting}>
            {formState.isSubmitting ? "Adding…" : "Add Stock"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
