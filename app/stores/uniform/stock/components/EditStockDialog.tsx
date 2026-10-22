"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/error-alert";
import { StockItemFields } from "@/app/stores/uniform/stock/components/StockItemFields";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { stockPayload, stockResolver, type StockForm, type StockFormContext } from "@/lib/stock-form";
import { ShelfStructure, StockItem } from "@/lib/stores-types";
import { useReference } from "@/lib/reference";

interface EditStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItem | null;
  shelfStructure: ShelfStructure;
  onSuccess: (updated: StockItem) => void;
}

const fromItem = (item: StockItem | null): StockForm => ({
  itemType: item?.itemType ?? "",
  size: item?.size ?? "",
  quantity: item?.quantity ?? 0,
  box: item?.box ?? "",
  section: item?.section ?? "",
});

// Shared by the box detail view and the search results view so the
// item-edit form and PATCH logic live in one place.
export function EditStockDialog({
  open,
  onOpenChange,
  item,
  shelfStructure,
  onSuccess,
}: EditStockDialogProps) {
  const { noSizeItems } = useReference();
  // An edit can count a line down to zero; adding can't.
  const form = useForm<StockForm, StockFormContext>({
    resolver: stockResolver(0),
    context: { noSizeItems },
    defaultValues: fromItem(item),
    mode: "onChange",
  });
  const { getValues, setValue, handleSubmit, reset, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      reset(fromItem(item));
      setSubmitError(null);
    }
  }, [item, reset]);

  function close() {
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (v) => {
    if (!item) return;
    setSubmitError(null);
    try {
      const res = await apiFetch(`/api/stores/stock/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockPayload(v, noSizeItems)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorDetail(data) ?? "Couldn't save the changes. Try again.");
      onSuccess(data as StockItem);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save the changes. Try again.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Edit stock item</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-4">
          <StockItemFields
            form={form}
            idPrefix="editstock"
            shelfStructure={shelfStructure}
            // Switching between two sized items keeps the size (often the same
            // garment, re-labelled); coming off an unsized one clears its "N/A".
            onItemTypeChange={() => {
              if (getValues("size") === "N/A") setValue("size", "", { shouldValidate: true });
            }}
          />
          <ErrorAlert message={submitError} title="Changes not saved" />
        </div>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!formState.isValid || formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : "Save Changes"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
