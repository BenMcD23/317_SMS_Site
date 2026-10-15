"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { ErrorAlert } from "@/components/error-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  categoriesOf,
  markLessons,
  progressOf,
  stillToDo,
  THEORY_KEYS,
  type CadetProgress,
  type TheorySubject,
} from "@/lib/theory";

/**
 * The one way to record a lesson by hand: pick the lesson, tick who was there,
 * save. The list starts with only the cadets who still need that lesson, so
 * it's usually a short one; anyone else is a tap away.
 */
export function RecordLessonDialog({
  subjects,
  roster,
}: {
  subjects: TheorySubject[];
  roster: CadetProgress[];
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [part, setPart] = useState(1);
  const [cins, setCins] = useState<Set<number>>(new Set());
  const [everyone, setEveryone] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = subjects.find((s) => s.key === key);
  const sameCategory = subjects.filter((s) => s.category === subject?.category);

  // Who still needs this lesson: on the subject's classification (or started
  // it), not passed it, and not had this lesson yet.
  const needing = subject
    ? roster.filter((c) => {
        const p = progressOf(c, subject.key);
        return !p.passed && !p.lessons.includes(part) && stillToDo(c, sameCategory);
      })
    : [];
  const needle = search.trim().toLowerCase();
  const listed = (everyone ? roster : needing).filter(
    (c) => !needle || `${c.first_name} ${c.last_name}`.toLowerCase().includes(needle)
  );

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setCins(new Set());
      setSearch("");
      setEveryone(false);
      setError(null);
    }
  }

  function pickLesson(nextKey: string, nextPart = 1) {
    setKey(nextKey);
    setPart(nextPart);
    setCins(new Set());
  }

  function toggle(cin: number) {
    const next = new Set(cins);
    if (next.has(cin)) next.delete(cin);
    else next.add(cin);
    setCins(next);
  }

  const allTicked = listed.length > 0 && listed.every((c) => cins.has(c.cin));
  function toggleAll() {
    const next = new Set(cins);
    for (const c of listed) {
      if (allTicked) next.delete(c.cin);
      else next.add(c.cin);
    }
    setCins(next);
  }

  async function save() {
    if (!session?.id_token || !subject || !cins.size) return;
    setSaving(true);
    setError(null);
    try {
      await markLessons(session.id_token, [...cins], [{ key: subject.key, part }]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: THEORY_KEYS.progress }),
        queryClient.invalidateQueries({ queryKey: THEORY_KEYS.plan }),
      ]);
      const what = subject.parts === 1 ? subject.name : `${subject.name} lesson ${part}`;
      toast.success(`${what} recorded for ${cins.size} cadet${cins.size === 1 ? "" : "s"}.`);
      reset(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save the lesson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Record a lesson
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a lesson</DialogTitle>
          <DialogDescription>For cadets who were there but didn&apos;t scan the QR code.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="record-subject">Subject</Label>
            <Select value={key} onValueChange={(v) => pickLesson(v)}>
              <SelectTrigger id="record-subject" className="w-full">
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                {categoriesOf(subjects).map((category) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{category}</SelectLabel>
                    {subjects
                      .filter((s) => s.category === category)
                      .map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          {subject && subject.parts > 1 && (
            <div className="grid gap-1.5">
              <Label>Lesson</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-label="Lesson"
                value={String(part)}
                onValueChange={(v) => v && pickLesson(subject.key, Number(v))}
                className="w-full"
              >
                {Array.from({ length: subject.parts }, (_, i) => i + 1).map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} className="flex-1">
                    Lesson {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
        </div>

        {subject && (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Who was there</Label>
              {listed.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={toggleAll}>
                  {allTicked ? "Untick all" : "Tick all"}
                </Button>
              )}
            </div>
            <InputGroup className="h-8">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search cadets"
                placeholder="Search cadets"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border" aria-label="Cadets">
              {listed.map((c) => (
                <li key={c.cin}>
                  <Label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal">
                    <Checkbox checked={cins.has(c.cin)} onCheckedChange={() => toggle(c.cin)} />
                    <span className="flex-1">
                      {c.last_name}, {c.first_name}
                    </span>
                    {c.flight && <span className="text-muted-foreground text-xs">{c.flight}</span>}
                  </Label>
                </li>
              ))}
              {listed.length === 0 && (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                  {everyone || needle ? "No cadets match." : "Everyone on this subject has had this lesson."}
                </li>
              )}
            </ul>
            {!everyone && (
              <Button
                variant="link"
                size="sm"
                className="h-auto self-start p-0"
                onClick={() => setEveryone(true)}
              >
                Someone missing? Show every cadet
              </Button>
            )}
          </div>
        )}

        <ErrorAlert message={error} title="Couldn't save" />

        <DialogFooter>
          <Button onClick={save} disabled={!subject || !cins.size || saving} className="w-full sm:w-auto">
            {saving ? "Saving…" : `Record for ${cins.size} cadet${cins.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
