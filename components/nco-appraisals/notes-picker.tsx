"use client";

import { useState } from "react";
import Link from "next/link";
import { Mic, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { notesAsPoints, openNotes, type NcoProfile } from "@/lib/nco-notes";
import { useApiQuery } from "@/lib/use-api-query";

/**
 * The staff notes made about this NCO since their last appraisal, offered as
 * the AI writer's starting points. All are ticked; staff untick anything that
 * no longer applies. The ones used are sent with the save, which marks them so
 * the next appraisal starts from what's noted after this one.
 */
export function NotesPicker({
  cin,
  usedIds,
  onUse,
}: {
  cin: number;
  usedIds: number[];
  onUse: (points: string, ids: number[]) => void;
}) {
  // Same key as the NCO's profile page, so the two share one cached copy.
  const { data, isLoading, error } = useApiQuery<NcoProfile>(
    ["nco-notes", String(cin)],
    `/nco-notes/ncos/${cin}`
  );
  const [unticked, setUnticked] = useState<Set<number>>(new Set());

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  // The appraisal can still be written by hand; the notes are a help, not a gate.
  if (error)
    return <p className="text-muted-foreground text-sm">Couldn&apos;t load the staff notes for this NCO.</p>;

  const notes = openNotes(data?.notes ?? []);
  if (!notes.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No staff notes since the last appraisal.{" "}
        <Link href={`/nco-notes/${cin}`} className="underline">
          Add some
        </Link>{" "}
        and they&apos;ll show up here.
      </p>
    );
  }

  const ticked = notes.filter((n) => !unticked.has(n.id));
  const toggle = (id: number, on: boolean) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <NotebookPen className="size-4" aria-hidden />
        Staff notes since the last appraisal
      </div>
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {notes.map((note) => (
          <li key={note.id} className="flex items-start gap-2">
            <Checkbox
              id={`appraisal-note-${note.id}`}
              checked={!unticked.has(note.id)}
              onCheckedChange={(on) => toggle(note.id, on === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor={`appraisal-note-${note.id}`}
              className="flex flex-col items-start gap-0.5 font-normal"
            >
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                {formatDate(note.note_date)} · {note.author_name}
                {note.source === "voice" && <Mic className="size-3" aria-label="Spoken" />}
              </span>
              <span className="text-sm">{note.body}</span>
            </Label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9"
          disabled={!ticked.length}
          onClick={() =>
            onUse(
              notesAsPoints(ticked),
              ticked.map((n) => n.id)
            )
          }
        >
          Add {ticked.length} {ticked.length === 1 ? "note" : "notes"} to the points
        </Button>
        {usedIds.length > 0 && (
          <span className="text-muted-foreground text-xs">
            {usedIds.length} added. They&apos;re marked as used when you save.
          </span>
        )}
      </div>
    </div>
  );
}
