"use client";

import { useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import type { QmNote } from "@/lib/stores-types";

/**
 * An order item's QM notes, with "Add QM Note" while the item can still be
 * changed. Shared by the uniform and badge order pages and the badge order
 * list, which each carried a copy. The draft lives here, so two items' editors
 * never share one box of text.
 */
export function QmNotes({
  notes,
  editable,
  itemLabel,
  onAdd,
  onDelete,
}: {
  notes: QmNote[] | undefined;
  /** False on a completed order: notes stay readable but can't change. */
  editable: boolean;
  /** What the notes are about ("Beret"), for the controls' accessible names. */
  itemLabel: string;
  /** Saves the note; the editor closes once it resolves. */
  onAdd: (content: string) => Promise<void>;
  onDelete: (noteId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const list = notes ?? [];

  if (!editable && list.length === 0) return null;

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onAdd(text.trim());
      setText("");
      setAdding(false);
    } catch {
      // The page reports why; keeping the draft open means nothing typed is lost.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5 border-t pt-2">
      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((note) => (
            <div key={note.id} className="bg-background space-y-0.5 rounded border px-2.5 py-1.5">
              <p className="text-xs whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-[10px]">
                  {note.addedBy} · {formatTimestamp(note.timestamp)}
                </p>
                {editable && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive size-8"
                    onClick={() => onDelete(note.id)}
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editable &&
        (adding ? (
          <div className="space-y-1.5">
            <textarea
              className="bg-background focus:ring-ring w-full resize-none rounded-md border px-3 py-1.5 text-xs focus:ring-1 focus:outline-none"
              rows={3}
              aria-label={`QM note on ${itemLabel}`}
              placeholder="Type your note..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-8 px-3 text-xs" disabled={!text.trim() || saving} onClick={save}>
                {saving ? "Saving..." : "Save Note"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => {
                  setAdding(false);
                  setText("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full px-2 text-xs"
            onClick={() => {
              setAdding(true);
              setText("");
            }}
          >
            <StickyNote className="mr-1.5 h-3 w-3" />
            Add QM Note
          </Button>
        ))}
    </div>
  );
}
