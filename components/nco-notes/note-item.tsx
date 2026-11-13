"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mic, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { SearchableSelect } from "@/components/searchable-select";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { deleteWithUndo } from "@/lib/undo-delete";
import { deleteNote, editNote, type NcoNote, type NcoNoteRow } from "@/lib/nco-notes";

/**
 * One staff note, as the overview's "latest" list and an NCO's profile both
 * show it: the night, what was noted, who by and whether it was spoken. Edit
 * and Delete sit under the text (not in a side column) so they wrap on a phone,
 * and only show when the API says this viewer may use them.
 */
export function NoteItem({
  note,
  ncos,
  token,
  showNco,
  onChanged,
}: {
  note: NcoNote;
  ncos: Pick<NcoNoteRow, "cin" | "name">[];
  token: string | undefined;
  /** Name the NCO, linking to their profile — on the overview, not a profile. */
  showNco?: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  // A note is small and the author's own: Undo beats an "Are you sure?".
  const [gone, setGone] = useState(false);
  const onDelete = () => {
    if (!token) return;
    deleteWithUndo({
      message: "Note deleted",
      hide: () => setGone(true),
      restore: () => setGone(false),
      commit: async () => {
        await deleteNote(token, note.id);
        onChanged();
      },
      failMessage: "Couldn't delete that note.",
    });
  };

  if (gone) return null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {showNco &&
          (note.cadet_cin !== null ? (
            <Link
              href={`/nco-notes/${note.cadet_cin}`}
              className="text-foreground font-medium hover:underline"
            >
              {note.cadet_name}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{note.cadet_name} (left)</span>
          ))}
        <span>{formatDate(note.note_date)}</span>
        <span aria-hidden>·</span>
        <span>{note.author_name}</span>
        {note.source === "voice" && (
          <span className="inline-flex items-center gap-1">
            <Mic className="size-3.5" aria-hidden />
            Spoken
          </span>
        )}
        {note.updated_at && <span>(edited)</span>}
      </div>
      <p className="text-sm whitespace-pre-wrap">{note.body}</p>
      {(note.can_edit || note.can_delete) && (
        <div className="flex flex-wrap gap-2">
          {note.can_edit && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
          {note.can_delete && (
            <Button variant="ghost" size="sm" className="h-8" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      )}
      {note.can_edit && (
        <EditNoteDialog
          note={note}
          ncos={ncos}
          token={token}
          open={editing}
          onOpenChange={setEditing}
          onSaved={onChanged}
        />
      )}
    </li>
  );
}

const editSchema = z.object({
  body: z.string().trim().min(1, "Write something, or delete the note"),
  cadetCin: z.number(),
});
type EditForm = z.infer<typeof editSchema>;

/** Fix a note's wording, or move it to the right NCO when a name was misheard. */
function EditNoteDialog({
  note,
  ncos,
  token,
  open,
  onOpenChange,
  onSaved,
}: {
  note: NcoNote;
  ncos: Pick<NcoNoteRow, "cin" | "name">[];
  token: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { body: note.body, cadetCin: note.cadet_cin ?? 0 },
    mode: "onTouched",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const { reset } = form;

  // A fresh copy each time it opens, so a cancelled edit is gone.
  useEffect(() => {
    if (open) reset({ body: note.body, cadetCin: note.cadet_cin ?? 0 });
  }, [open, note, reset]);

  const save = form.handleSubmit(async (values) => {
    if (!token) return;
    setSaveError(null);
    try {
      await editNote(token, note.id, {
        body: values.body,
        ...(values.cadetCin && values.cadetCin !== note.cadet_cin ? { cadet_cin: values.cadetCin } : {}),
      });
      toast.success("Note saved");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the note.");
    }
  });

  const cadetCin = useWatch({ control: form.control, name: "cadetCin" });
  const bodyError = form.formState.errors.body?.message;
  const formId = `edit-note-${note.id}`;
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Edit note</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>From {formatDate(note.note_date)}.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Outside the <form>: inside one, Radix Select's hidden native select
            echoes values back through onValueChange. */}
        {note.cadet_cin !== null && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-nco`}>About</Label>
            <SearchableSelect
              id={`${formId}-nco`}
              value={String(cadetCin)}
              onValueChange={(v) => form.setValue("cadetCin", Number(v), { shouldDirty: true })}
              searchPlaceholder="Find an NCO…"
              options={ncos.map((n) => ({ value: String(n.cin), label: n.name }))}
            />
          </div>
        )}

        <form id={formId} onSubmit={save} noValidate className="flex flex-col gap-4">
          <Field data-invalid={!!bodyError}>
            <FieldLabel htmlFor={`${formId}-body`}>Note</FieldLabel>
            <Textarea id={`${formId}-body`} rows={5} aria-invalid={!!bodyError} {...form.register("body")} />
            <FieldError>{bodyError}</FieldError>
          </Field>
          <ErrorAlert message={saveError} title="Not saved" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Save note
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
