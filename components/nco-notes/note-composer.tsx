"use client";

import { useState, useSyncExternalStore } from "react";
import { Loader2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { canRecord, VoiceButton } from "@/components/nco-notes/voice-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayLocal } from "@/lib/format";
import { createNote, createNotes, splitDebrief, type NcoNoteRow } from "@/lib/nco-notes";
import { cn } from "@/lib/utils";

type Mode = "one" | "several";

interface ReviewRow {
  key: number;
  cin: number | null;
  body: string;
}

const noop = () => () => {};

/** Appends a transcript to what's already typed, so talking adds to a note
 *  rather than replacing it. */
function append(existing: string, text: string): string {
  const trimmed = existing.trimEnd();
  return trimmed ? `${trimmed} ${text}` : text;
}

/**
 * Where staff write a note on parade night: tap the NCO, say or type it, save.
 * "Several NCOs" takes one debrief about the whole team and has the AI split it
 * into a note each, which staff check (and fix a misheard name in) before any
 * are saved. With `fixedCin` (an NCO's own profile) it's the one-NCO form only.
 *
 * Shared by the overview and the profile page so both save the same way.
 */
export function NoteComposer({
  ncos,
  token,
  voiceAvailable,
  fixedCin,
  onSaved,
}: {
  ncos: Pick<NcoNoteRow, "cin" | "name">[];
  token: string | undefined;
  voiceAvailable: boolean;
  fixedCin?: number;
  onSaved: () => void;
}) {
  // Read on the client only: the server render has no MediaRecorder, and
  // guessing there would flash the mic in and out on hydration.
  const recordable = useSyncExternalStore(noop, canRecord, () => false);
  const voice = voiceAvailable && recordable;

  const [mode, setMode] = useState<Mode>("one");
  const [date, setDate] = useState(todayLocal);
  const [saving, setSaving] = useState(false);

  // One NCO
  const [cin, setCin] = useState<number | null>(fixedCin ?? null);
  const [text, setText] = useState("");
  const [spoken, setSpoken] = useState(false);

  // Several NCOs
  const [debrief, setDebrief] = useState("");
  const [debriefSpoken, setDebriefSpoken] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [nextKey, setNextKey] = useState(0);

  const several = mode === "several" && fixedCin === undefined;
  const nameOf = (c: number | null) => ncos.find((n) => n.cin === c)?.name ?? "";

  async function saveOne() {
    if (!token || cin === null || !text.trim()) return;
    setSaving(true);
    try {
      await createNote(token, {
        cadet_cin: cin,
        body: text,
        note_date: date,
        source: spoken ? "voice" : "typed",
      });
      toast.success(`Saved for ${nameOf(cin)}`);
      setText("");
      setSpoken(false);
      // The next note is usually about someone else.
      if (fixedCin === undefined) setCin(null);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function sort() {
    if (!token || !debrief.trim()) return;
    setSplitting(true);
    try {
      const result = await splitDebrief(token, debrief);
      if (!result.notes.length && !result.unassigned.length) {
        toast.error("Couldn't find anything about an NCO in that. Try naming them.");
        return;
      }
      setReview(result.notes.map((n, i) => ({ key: i, cin: n.cin, body: n.body })));
      setNextKey(result.notes.length);
      setUnassigned(result.unassigned);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sort those notes.");
    } finally {
      setSplitting(false);
    }
  }

  function updateRow(key: number, change: Partial<ReviewRow>) {
    setReview((rows) => rows?.map((r) => (r.key === key ? { ...r, ...change } : r)) ?? null);
  }

  function place(index: number) {
    setReview((rows) => [...(rows ?? []), { key: nextKey, cin: null, body: unassigned[index] }]);
    setNextKey((k) => k + 1);
    setUnassigned((parts) => parts.filter((_, i) => i !== index));
  }

  function startAgain() {
    setReview(null);
    setUnassigned([]);
  }

  const rows = review ?? [];
  const reviewReady = rows.length > 0 && rows.every((r) => r.cin !== null && r.body.trim());

  async function saveAll() {
    if (!token || !reviewReady) return;
    setSaving(true);
    try {
      await createNotes(
        token,
        rows.map((r) => ({ cadet_cin: r.cin as number, body: r.body })),
        debriefSpoken ? "voice" : "typed",
        date
      );
      toast.success(rows.length === 1 ? "Saved 1 note" : `Saved ${rows.length} notes`);
      setDebrief("");
      setDebriefSpoken(false);
      startAgain();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the notes.");
    } finally {
      setSaving(false);
    }
  }

  const onVoiceError = (message: string) => toast.error(message);

  return (
    <section aria-label="Add a note" className="bg-card flex flex-col gap-4 rounded-lg border p-4">
      {fixedCin === undefined && (
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          aria-label="Who the note is about"
          className="w-full sm:w-auto"
        >
          <ToggleGroupItem value="one" className="h-9 flex-1 px-4">
            One NCO
          </ToggleGroupItem>
          <ToggleGroupItem value="several" className="h-9 flex-1 px-4">
            <Users /> Several NCOs
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {!several ? (
        <>
          {fixedCin === undefined && (
            <div className="flex flex-col gap-2">
              <p id="note-nco-label" className="text-sm font-medium">
                NCO
              </p>
              <div role="group" aria-labelledby="note-nco-label" className="flex flex-wrap gap-2">
                {ncos.map((n) => (
                  <Button
                    key={n.cin}
                    type="button"
                    variant={cin === n.cin ? "default" : "outline"}
                    aria-pressed={cin === n.cin}
                    className="h-9"
                    onClick={() => setCin(cin === n.cin ? null : n.cin)}
                  >
                    {n.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="note-body">What did you see?</Label>
            <Textarea
              id="note-body"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Took the junior flight for drill without being asked; kept them sharp."
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {voice && (
              <VoiceButton
                token={token}
                onError={onVoiceError}
                onText={(t) => {
                  setText((existing) => append(existing, t));
                  setSpoken(true);
                }}
              />
            )}
            <DateField id="note-date" value={date} onChange={setDate} />
            <Button
              type="button"
              className="h-9 sm:ml-auto"
              disabled={saving || cin === null || !text.trim()}
              onClick={() => void saveOne()}
            >
              {saving && <Loader2 className="animate-spin" />}
              Save note
            </Button>
          </div>
          {fixedCin === undefined && cin === null && text.trim() && (
            <p className="text-muted-foreground text-sm">Tap the NCO it&apos;s about to save it.</p>
          )}
        </>
      ) : review === null ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="debrief-body">Tonight&apos;s notes, about anyone</Label>
            <Textarea
              id="debrief-body"
              rows={5}
              value={debrief}
              onChange={(e) => setDebrief(e.target.value)}
              placeholder="e.g. Amy was great on drill. Ben was late again and quiet with his section."
            />
            <p className="text-muted-foreground text-sm">
              Name each NCO as you go. You&apos;ll check who each note went to before anything saves.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {voice && (
              <VoiceButton
                token={token}
                onError={onVoiceError}
                onText={(t) => {
                  setDebrief((existing) => append(existing, t));
                  setDebriefSpoken(true);
                }}
              />
            )}
            <DateField id="debrief-date" value={date} onChange={setDate} />
            <Button
              type="button"
              className="h-9 sm:ml-auto"
              disabled={splitting || !debrief.trim()}
              onClick={() => void sort()}
            >
              {splitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {splitting ? "Sorting…" : "Sort into notes"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Check who each note is about</h3>
            <p className="text-muted-foreground text-sm">Fix anything misheard, then save them all.</p>
          </div>
          <ul className="flex flex-col divide-y rounded-lg border">
            {rows.map((row, i) => (
              <li key={row.key} className="flex flex-col gap-2 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`review-nco-${row.key}`}>NCO</Label>
                  <Select
                    value={row.cin === null ? "" : String(row.cin)}
                    onValueChange={(v) => updateRow(row.key, { cin: Number(v) })}
                  >
                    <SelectTrigger
                      id={`review-nco-${row.key}`}
                      className={cn("w-full sm:w-72", row.cin === null && "border-warning")}
                    >
                      <SelectValue placeholder="Choose the NCO…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ncos.map((n) => (
                        <SelectItem key={n.cin} value={String(n.cin)}>
                          {n.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`review-body-${row.key}`}>Note {i + 1}</Label>
                  <Textarea
                    id={`review-body-${row.key}`}
                    rows={2}
                    value={row.body}
                    onChange={(e) => updateRow(row.key, { body: e.target.value })}
                  />
                </div>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => setReview(rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 /> Remove
                  </Button>
                </div>
              </li>
            ))}
            {!rows.length && (
              <li className="text-muted-foreground p-3 text-sm">No notes yet — add one from below.</li>
            )}
          </ul>

          {unassigned.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Not about one NCO</h3>
              <ul className="flex flex-col gap-2">
                {unassigned.map((part, i) => (
                  <li key={`${i}-${part}`} className="flex flex-col gap-1 rounded-lg border p-3">
                    <p className="text-sm">{part}</p>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => place(i)}
                      >
                        <Plus /> Add as a note
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="h-9" onClick={startAgain}>
              Start again
            </Button>
            <Button
              type="button"
              className="h-9 sm:ml-auto"
              disabled={saving || !reviewReady}
              onClick={() => void saveAll()}
            >
              {saving && <Loader2 className="animate-spin" />}
              {rows.length === 1 ? "Save 1 note" : `Save ${rows.length} notes`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** The parade night a note is filed against — today unless staff are
 *  catching up on a night they missed writing up. */
function DateField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Night</Label>
      <Input
        id={id}
        type="date"
        className="h-9 w-40"
        value={value}
        max={todayLocal()}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
