"use client";

import { useEffect } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";

import {
  type Dataset,
  type Panel,
  GRAIN_OPTIONS,
  SORT_OPTIONS,
  VIZ_OPTIONS,
  defaultSize,
  emptyQuery,
  fieldOf,
  filterOps,
  keyLabel,
  newPanelId,
  opTakesValue,
} from "@/lib/custom-dashboard";
import { type PanelForm, formToQuery, panelFormSchema, panelToForm } from "@/lib/custom-dashboard-form";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PanelView, usePanelQuery } from "@/components/oc/custom-dashboard/panel-view";

// Radix Select can't hold "" as a value, so "none" stands in for no grouping.
const NONE = "__none";

/**
 * Builds or edits one panel: what to count, how to group it, what to filter
 * out, and how to show it, with a live preview of the answer underneath.
 * No `<form>` element: Radix Select inside one echoes programmatic values
 * back through onValueChange (see StockItemFields), so Save runs
 * handleSubmit directly.
 */
export function PanelEditor({
  open,
  panel,
  datasets,
  rangeDays,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  /** The panel to edit, or null to add a new one. */
  panel: Panel | null;
  datasets: Dataset[];
  rangeDays: number | null;
  onOpenChange: (open: boolean) => void;
  onSave: (panel: Omit<Panel, "x" | "y" | "w" | "h"> & Partial<Pick<Panel, "x" | "y" | "w" | "h">>) => void;
}) {
  const form = useForm<PanelForm>({
    resolver: zodResolver(panelFormSchema),
    defaultValues: panelToForm(panel, datasets[0]?.key ?? ""),
    mode: "onTouched",
  });
  const { control, register, handleSubmit, reset, setValue, formState } = form;
  const filters = useFieldArray({ control, name: "filters" });

  // A fresh form each time the dialog opens, for whichever panel it opened on.
  useEffect(() => {
    if (open) reset(panelToForm(panel, datasets[0]?.key ?? ""));
  }, [open, panel, datasets, reset]);

  const values = useWatch({ control }) as PanelForm;
  const dataset = datasets.find((d) => d.key === values.dataset);
  const group1Field = fieldOf(dataset, values.group1);
  const group2Field = fieldOf(dataset, values.group2);

  // Switching dataset clears what belonged to the old one, rather than
  // leaving a grouping or filter on a field the new dataset doesn't have.
  const changeDataset = (key: string) => {
    const next = datasets.find((d) => d.key === key);
    setValue("dataset", key);
    setValue("measure", next?.measures[0]?.key ?? "count");
    setValue("group1", "");
    setValue("group2", "");
    filters.replace([]);
  };

  const save = handleSubmit((v) => {
    onSave({
      id: panel?.id ?? newPanelId(),
      title: v.title.trim(),
      viz: v.viz,
      query: formToQuery(v, dataset),
      ...(panel ? {} : defaultSize(v.viz)),
    });
  });

  const fieldError = (name: keyof PanelForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;
  const preview = dataset ? formToQuery(values, dataset, true) : emptyQuery(values.dataset);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{panel ? "Edit panel" : "Add panel"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Pick what to count and how to break it down. The preview uses the dashboard&apos;s time range.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-1 sm:pr-1">
          <Field data-invalid={!!fieldError("title") || undefined}>
            <FieldLabel htmlFor="panel-title">Title</FieldLabel>
            <Input
              id="panel-title"
              aria-invalid={!!fieldError("title") || undefined}
              {...register("title")}
            />
            <FieldError>{fieldError("title")}</FieldError>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="panel-dataset">Dataset</FieldLabel>
              <Select value={values.dataset} onValueChange={changeDataset}>
                <SelectTrigger id="panel-dataset" className="w-full">
                  <SelectValue placeholder="Pick a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((d) => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dataset && <p className="text-muted-foreground text-xs">{dataset.description}</p>}
            </Field>

            <Field>
              <FieldLabel htmlFor="panel-measure">Show</FieldLabel>
              <Controller
                control={control}
                name="measure"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="panel-measure" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dataset?.measures.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <GroupPicker
              control={control}
              id="panel-group1"
              label="Group by"
              name="group1"
              grainName="grain1"
              dataset={dataset}
              isDate={group1Field?.kind === "date"}
              onClear={() => setValue("group2", "")}
            />
            {values.group1 && (
              <GroupPicker
                control={control}
                id="panel-group2"
                label="Then split by"
                name="group2"
                grainName="grain2"
                dataset={dataset}
                exclude={values.group1}
                isDate={group2Field?.kind === "date"}
                error={fieldError("group2")}
              />
            )}
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Only include</legend>
            {filters.fields.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Everything in the dataset. Add a filter to narrow it.
              </p>
            )}
            {filters.fields.map((row, i) => (
              <FilterRow
                key={row.id}
                index={i}
                control={control}
                setValue={setValue}
                dataset={dataset}
                error={formState.errors.filters?.[i]?.value?.message}
                onRemove={() => filters.remove(i)}
              />
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dataset || filters.fields.length >= 10}
                onClick={() => filters.append({ field: dataset?.fields[0]?.key ?? "", op: "eq", value: "" })}
              >
                <Plus />
                Add filter
              </Button>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="panel-viz">Show as</FieldLabel>
              <Controller
                control={control}
                name="viz"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="panel-viz" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIZ_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {values.group1 && (
              <Field>
                <FieldLabel htmlFor="panel-sort">Order</FieldLabel>
                <Controller
                  control={control}
                  name="sort"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="panel-sort" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}
          </div>

          <section aria-label="Preview" className="flex h-64 flex-col gap-2 rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-medium">Preview</p>
            <div className="flex min-h-0 flex-1 flex-col">
              <PanelView query={preview} viz={values.viz} dataset={dataset} rangeDays={rangeDays} />
            </div>
          </section>
        </div>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            {panel ? "Save panel" : "Add panel"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function GroupPicker({
  control,
  id,
  label,
  name,
  grainName,
  dataset,
  exclude,
  isDate,
  error,
  onClear,
}: {
  control: Control<PanelForm>;
  id: string;
  label: string;
  name: "group1" | "group2";
  grainName: "grain1" | "grain2";
  dataset: Dataset | undefined;
  exclude?: string;
  isDate: boolean;
  error?: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select
              value={field.value || NONE}
              onValueChange={(v) => {
                field.onChange(v === NONE ? "" : v);
                if (v === NONE) onClear?.();
              }}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nothing (one total)</SelectItem>
                {dataset?.fields
                  .filter((f) => f.key !== exclude)
                  .map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError>{error}</FieldError>
      </Field>
      {isDate && (
        <Field>
          <FieldLabel htmlFor={`${id}-grain`}>Each</FieldLabel>
          <Controller
            control={control}
            name={grainName}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={`${id}-grain`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRAIN_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      )}
    </div>
  );
}

function FilterRow({
  index,
  control,
  setValue,
  dataset,
  error,
  onRemove,
}: {
  index: number;
  control: Control<PanelForm>;
  setValue: UseFormSetValue<PanelForm>;
  dataset: Dataset | undefined;
  error?: string;
  onRemove: () => void;
}) {
  const row = useWatch({ control, name: `filters.${index}` });
  const field = fieldOf(dataset, row?.field);
  const ops = filterOps(field?.kind ?? "text");
  const id = `panel-filter-${index}`;

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border p-2">
      <div className="min-w-36 flex-1">
        <label htmlFor={`${id}-field`} className="sr-only">
          Filter {index + 1} field
        </label>
        <Controller
          control={control}
          name={`filters.${index}.field`}
          render={({ field: f }) => (
            <Select
              value={f.value}
              onValueChange={(v) => {
                f.onChange(v);
                // A comparison or value for the old field rarely fits the new one.
                setValue(`filters.${index}.op`, "eq");
                setValue(`filters.${index}.value`, "");
              }}
            >
              <SelectTrigger id={`${id}-field`} className="w-full">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {dataset?.fields.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="min-w-32">
        <label htmlFor={`${id}-op`} className="sr-only">
          Filter {index + 1} comparison
        </label>
        <Controller
          control={control}
          name={`filters.${index}.op`}
          render={({ field: f }) => (
            <Select value={f.value} onValueChange={f.onChange}>
              <SelectTrigger id={`${id}-op`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {row && opTakesValue(row.op) && (
        <div className="min-w-36 flex-1">
          <label htmlFor={`${id}-value`} className="sr-only">
            Filter {index + 1} value
          </label>
          <Controller
            control={control}
            name={`filters.${index}.value`}
            render={({ field: f }) =>
              field?.kind === "text" ? (
                <TextValuePicker
                  id={`${id}-value`}
                  dataset={dataset}
                  fieldKey={field.key}
                  value={f.value}
                  onChange={f.onChange}
                />
              ) : (
                <Input
                  id={`${id}-value`}
                  type={field?.kind === "date" ? "date" : "number"}
                  value={f.value}
                  onChange={f.onChange}
                  onBlur={f.onBlur}
                  aria-invalid={!!error || undefined}
                />
              )
            }
          />
          {error && <p className="text-destructive mt-1 text-sm">{error}</p>}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label={`Remove filter ${index + 1}`}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

/**
 * The values a text field actually holds, from the same query endpoint, so
 * the OC picks "Parade Night" rather than typing it and getting the spelling
 * wrong. Not narrowed by the range: a value from last year is still a value.
 */
function TextValuePicker({
  id,
  dataset,
  fieldKey,
  value,
  onChange,
}: {
  id: string;
  dataset: Dataset | undefined;
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data, isLoading } = usePanelQuery(
    { ...emptyQuery(dataset?.key ?? ""), group_by: [{ field: fieldKey }], limit: 200 },
    null,
    !!dataset
  );
  const field = fieldOf(dataset, fieldKey);
  const options = (data?.rows ?? [])
    .map((r) => r.keys[0])
    .filter((k): k is string => typeof k === "string" && k !== "");
  if (value && !options.includes(value)) options.unshift(value);

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={isLoading ? "Loading…" : "Pick a value"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {keyLabel(o, field)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
