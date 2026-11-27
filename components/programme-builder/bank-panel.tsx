"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { History, Library, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@317/ui-common/components/responsive-dialog";
import { Button } from "@317/ui-common/components/ui/button";
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import { Input } from "@317/ui-common/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@317/ui-common/components/ui/select";
import { Textarea } from "@317/ui-common/components/ui/textarea";
import { cn } from "@317/ui-common/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { ListSkeleton } from "@/components/list-skeleton";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";
import { lessonName, type CatalogueSubject } from "@/lib/training";
import { useApiQuery } from "@/lib/use-api-query";
import {
  bankFormFrom,
  bankSchema,
  categoryColour,
  categoryLabel,
  pickableKinds,
  PROGRAMME_KEYS,
  programmeApi,
  type BankForm,
  type BankItem,
  type HistoryActivity,
  type Room,
} from "@/lib/programme-builder";
import type { DragData } from "@/components/programme-builder/night-grid";
import { useKinds } from "@/components/programme-builder/use-programme";

const ALL = "all";
const NONE = "none";

/**
 * The bank of sessions down the side of the builder. Staff drag one onto a
 * night, or tap it to place it with a form (the way on a phone); NCOs can
 * browse it. Search and a kind filter narrow it; "From past programmes"
 * fills it from what the squadron has actually run.
 */
export function BankPanel({
  items,
  loading,
  error,
  canEdit,
  rooms,
  subjects,
  onPlace,
}: {
  items: BankItem[] | undefined;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  rooms: Room[];
  subjects: CatalogueSubject[];
  /** Open the add-session form with this bank session in it. */
  onPlace: (item: BankItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState(ALL);
  const [editing, setEditing] = useState<{ item: BankItem | null; key: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const kinds = useKinds();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? [])
      .filter((i) => i.active || canEdit)
      .filter((i) => kind === ALL || i.category === kind)
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          categoryLabel(i.category, kinds).toLowerCase().includes(q)
      );
  }, [items, search, kind, canEdit, kinds]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Session bank</h2>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ item: null, key: Date.now() })}>
            <Plus /> New
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          aria-label="Search the bank"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>
      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger aria-label="Kind of session" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Every kind</SelectItem>
          {kinds.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ErrorAlert message={error} title="Couldn't load the bank" />
      {loading ? (
        <ListSkeleton rows={6} className="h-10" />
      ) : !error && shown.length === 0 ? (
        <EmptyState
          icon={Library}
          title={items?.length ? "Nothing matches" : "The bank is empty"}
          description={
            items?.length
              ? "Try another search or kind."
              : canEdit
                ? "Add the sessions the squadron runs, or bring them in from past programmes."
                : "Staff haven't added any sessions yet."
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Sessions in the bank">
          {shown.map((item) => (
            <BankRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onPlace={() => onPlace(item)}
              onEdit={() => setEditing({ item, key: Date.now() })}
            />
          ))}
        </ul>
      )}
      {canEdit && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setImporting(true)}>
          <History /> From past programmes
        </Button>
      )}
      {canEdit && (
        <p className="text-muted-foreground text-xs">Drag a session onto a night, or tap it to place it.</p>
      )}

      {editing && (
        <BankItemDialog
          key={editing.key}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          item={editing.item}
          rooms={rooms}
          subjects={subjects}
          onDone={() => setEditing(null)}
        />
      )}
      {importing && <BankImportDialog open onOpenChange={setImporting} />}
    </div>
  );
}

function BankRow({
  item,
  canEdit,
  onPlace,
  onEdit,
}: {
  item: BankItem;
  canEdit: boolean;
  onPlace: () => void;
  onEdit: () => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `bank:${item.id}`,
    data: {
      kind: "bank",
      id: item.id,
      title: item.title,
      category: item.category,
      wholeNight: item.whole_night,
    } satisfies DragData,
    disabled: !canEdit || !item.active,
  });
  const kinds = useKinds();
  const meta = [
    categoryLabel(item.category, kinds),
    item.whole_night && "all night",
    item.times_run ? `run ${item.times_run}×` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      ref={setNodeRef}
      {...(canEdit && item.active ? listeners : {})}
      style={{ borderLeftColor: categoryColour(item.category, kinds) }}
      className={cn(
        "bg-card flex items-center gap-1 rounded-md border border-l-4 pl-2",
        canEdit && item.active && "cursor-grab select-none [-webkit-touch-callout:none]",
        isDragging && "opacity-40",
        !item.active && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={canEdit && item.active ? onPlace : undefined}
        disabled={!canEdit || !item.active}
        className="min-w-0 flex-1 py-1.5 text-left disabled:cursor-default"
        aria-label={canEdit && item.active ? `Place ${item.title}` : item.title}
      >
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {item.active ? meta : "Retired"}
          {item.last_run && item.active && ` · last ${formatDate(item.last_run)}`}
        </span>
      </button>
      {canEdit && (
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${item.title}`}>
          <Pencil />
        </Button>
      )}
    </li>
  );
}

/** Add a session to the bank or change one. Placed sessions keep what they copied. */
function BankItemDialog({
  open,
  onOpenChange,
  item,
  rooms,
  subjects,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: BankItem | null;
  rooms: Room[];
  subjects: CatalogueSubject[];
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const form = useForm<BankForm>({
    resolver: zodResolver(bankSchema),
    defaultValues: bankFormFrom(item),
    mode: "onTouched",
  });
  const { control, register, handleSubmit, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const kinds = useKinds();
  const errorFor = (name: keyof BankForm) =>
    formState.touchedFields[name] || formState.isSubmitted ? formState.errors[name]?.message : undefined;

  const refresh = () => queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.bank });
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await programmeApi.saveBankItem(session!.id_token!, values, item?.id);
      await refresh();
      toast.success(item ? "Saved." : "Added to the bank.");
      onDone();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{item ? `Edit ${item.title}` : "New bank session"}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            What a session brings with it when it&apos;s dropped on a night. Changing it here never changes a
            programme it&apos;s already on.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4">
          <Field data-invalid={!!errorFor("title") || undefined}>
            <FieldLabel htmlFor="bank-title">Name</FieldLabel>
            <Input
              id="bank-title"
              autoComplete="off"
              aria-invalid={!!errorFor("title") || undefined}
              {...register("title")}
            />
            <FieldError>{errorFor("title")}</FieldError>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="bank-category">Kind</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bank-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pickableKinds(kinds, field.value).map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="roomId"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="bank-room">Usual room</FieldLabel>
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger id="bank-room" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {rooms.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="bank-instructor">Usually run by</FieldLabel>
            <Input
              id="bank-instructor"
              autoComplete="off"
              placeholder="e.g. Sgt Hughes"
              {...register("instructor")}
            />
            <FieldError>{errorFor("instructor")}</FieldError>
          </Field>
          <Controller
            control={control}
            name="lesson"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="bank-lesson">Lesson</FieldLabel>
                <Select
                  value={field.value || NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                >
                  <SelectTrigger id="bank-lesson" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not a lesson</SelectItem>
                    {subjects.flatMap((s) =>
                      Array.from({ length: s.parts }, (_, i) => (
                        <SelectItem key={`${s.key}:${i + 1}`} value={`${s.key}:${i + 1}`}>
                          {lessonName(s.name, i + 1, s.parts)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FieldDescription>Suggestions then offer lesson 2 only after lesson 1.</FieldDescription>
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="bank-notes">Notes</FieldLabel>
            <Textarea id="bank-notes" rows={2} {...register("notes")} />
            <FieldError>{errorFor("notes")}</FieldError>
          </Field>
          <Controller
            control={control}
            name="wholeNight"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Switch id="bank-whole" checked={field.value} onCheckedChange={field.onChange} />
                <FieldLabel htmlFor="bank-whole">Runs all night</FieldLabel>
              </Field>
            )}
          />
          {item && (
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch id="bank-active" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="bank-active">In use (off retires it from the bank)</FieldLabel>
                </Field>
              )}
            />
          )}
          <ErrorAlert message={submitError} title="Not saved" />
        </div>
        <ResponsiveDialogFooter>
          {item && (
            <Button
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={() =>
                confirm(
                  `Delete ${item.title} from the bank? Programmes it's on keep their copy.`,
                  async () => {
                    try {
                      await programmeApi.deleteBankItem(session!.id_token!, item.id);
                      await refresh();
                      toast.success("Deleted from the bank.");
                      onDone();
                    } catch (e) {
                      setSubmitError(e instanceof Error ? e.message : "Couldn't delete it.");
                    }
                  }
                )
              }
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : item ? "Save changes" : "Add to bank"}
          </Button>
        </ResponsiveDialogFooter>
        {confirmDialog}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** Tick what the squadron has run before to add it to the bank in one go. */
function BankImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const history = useApiQuery<HistoryActivity[]>(
    PROGRAMME_KEYS.bankHistory,
    "/programme-builder/bank/history"
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const kinds = useKinds();

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add from past programmes</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            What the squadron has run that isn&apos;t in the bank yet, most often first.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ErrorAlert message={history.error?.message} title="Couldn't load past programmes" />
        {history.isLoading ? (
          <ListSkeleton rows={5} className="h-9" />
        ) : history.data && history.data.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing new"
            description="Everything the record has is already in the bank."
          />
        ) : (
          <ul className="flex max-h-[50vh] flex-col overflow-y-auto" aria-label="Past sessions">
            {(history.data ?? []).map((h) => {
              const id = `import-${h.title}`;
              return (
                <li key={h.title} className="flex min-h-10 items-center gap-2 border-b py-1 last:border-0">
                  <Checkbox
                    id={id}
                    checked={chosen.includes(h.title)}
                    onCheckedChange={(v) =>
                      setChosen((c) => (v === true ? [...c, h.title] : c.filter((t) => t !== h.title)))
                    }
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{h.title}</span>
                    <span className="text-muted-foreground block text-xs">
                      {categoryLabel(h.category, kinds)} · {h.times} night{h.times === 1 ? "" : "s"}
                      {h.last_run && `, last ${formatDate(h.last_run)}`}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!chosen.length || saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await programmeApi.importBank(session!.id_token!, chosen);
                await queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.bank });
                await queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.bankHistory });
                toast.success(`${res.added} added to the bank.`);
                onOpenChange(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't add them.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Adding…" : chosen.length ? `Add ${chosen.length}` : "Add"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
