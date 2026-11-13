"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { CadetMultiPicker, type PickableCadet } from "@/components/cadet-multi-picker";
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
import { markSquad, type DrillCadet, type DrillStage } from "@/lib/drill";

/** "Tom Able" → first and last name, for the shared picker. */
function pickable(c: DrillCadet): PickableCadet {
  const [first, ...rest] = c.name.split(" ");
  return { cin: c.cin, first_name: first ?? "", last_name: rest.join(" "), flight: c.flight };
}

/**
 * Ticks one lesson for a whole squad, the usual case on a parade night: "I
 * took B Flight through wheeling". Only adds, so a cadet who had already
 * passed keeps their pass (the API's rule too).
 */
export function SquadDialog({
  open,
  onOpenChange,
  stages,
  cadets,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: DrillStage[];
  cadets: DrillCadet[];
  onSaved: () => Promise<unknown>;
}) {
  const { data: session } = useSession();
  const [lesson, setLesson] = useState("");
  const [passed, setPassed] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    setLesson("");
    setPassed(false);
    setSelected(new Set());
    setError(null);
    onOpenChange(false);
  }

  async function save() {
    if (!lesson) return setError("Pick the lesson you taught.");
    if (!selected.size) return setError("Tick at least one cadet.");
    setSaving(true);
    setError(null);
    try {
      const { changed } = await markSquad(session?.id_token ?? "", Number(lesson), [...selected], passed);
      await onSaved();
      toast.success(`${changed} cadet${changed === 1 ? "" : "s"} updated`);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the lesson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Mark a squad</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Tick a lesson for everyone you took through it. Cadets who already passed it keep their pass.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4 px-4 sm:px-0">
          <div className="flex flex-col gap-2">
            <Label htmlFor="squad-lesson">Lesson</Label>
            <Select value={lesson} onValueChange={setLesson}>
              <SelectTrigger id="squad-lesson" className="h-9 w-full">
                <SelectValue placeholder="Pick a lesson" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectGroup key={s.id}>
                    <SelectLabel>{s.name}</SelectLabel>
                    {s.lessons.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label id="squad-mark">Mark them as</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="squad-mark"
              value={passed ? "passed" : "taught"}
              onValueChange={(v) => v && setPassed(v === "passed")}
              className="w-fit"
            >
              <ToggleGroupItem value="taught" className="h-9 px-4">
                Taught
              </ToggleGroupItem>
              <ToggleGroupItem value="passed" className="h-9 px-4">
                Passed
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <CadetMultiPicker
            cadets={cadets.map(pickable)}
            loading={false}
            selected={selected}
            onChange={setSelected}
          />
          <ErrorAlert message={error} title="Nothing saved" />
        </div>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : `Save for ${selected.size} cadet${selected.size === 1 ? "" : "s"}`}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
