"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Eraser } from "lucide-react";
import { toast } from "sonner";

import { CadetMultiPicker, type PickableCadet } from "@/components/cadet-multi-picker";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  categoriesOf,
  lessonLabel,
  markLessons,
  THEORY_KEYS,
  type LessonRef,
  type TheorySubject,
} from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";

/** Lessons picked, as subject → lesson numbers. */
type Picked = Record<string, number[]>;

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Each subject with a toggle per lesson, so "Airmanship lesson 2" is one tap. */
function LessonPicker({
  subjects,
  picked,
  onChange,
}: {
  subjects: TheorySubject[];
  picked: Picked;
  onChange: (next: Picked) => void;
}) {
  if (!subjects.length) return <ListSkeleton rows={4} className="h-8" />;
  return (
    <div className="flex flex-col gap-5">
      {categoriesOf(subjects).map((category) => (
        <fieldset key={category} className="flex flex-col gap-1">
          <legend className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            {category}
          </legend>
          {subjects
            .filter((s) => s.category === category)
            .map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 py-0.5">
                <span className="min-w-0 text-sm">{s.name}</span>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  aria-label={`${s.name} lessons`}
                  value={(picked[s.key] ?? []).map(String)}
                  onValueChange={(v) => onChange({ ...picked, [s.key]: v.map(Number).sort() })}
                  className="shrink-0"
                >
                  {Array.from({ length: s.parts }, (_, i) => i + 1).map((part) => (
                    <ToggleGroupItem
                      key={part}
                      value={String(part)}
                      aria-label={`${s.name} ${lessonLabel(s, part)}`}
                      className="min-w-9 px-2 text-xs"
                    >
                      {s.parts === 1 ? "Done" : part}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ))}
        </fieldset>
      ))}
    </div>
  );
}

/**
 * Record lessons for a group of cadets in one go — after a lesson nobody
 * scanned in, or to catch up on paper registers.
 */
export function RecordLessons({ subjects }: { subjects: TheorySubject[] }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: cadets, isLoading } = useApiQuery<PickableCadet[]>(["cadets"], "/cadets");
  const [cins, setCins] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<Picked>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lessons: LessonRef[] = Object.entries(picked).flatMap(([key, parts]) =>
    parts.map((part) => ({ key, part }))
  );
  const canSubmit = cins.size > 0 && lessons.length > 0 && !saving;

  async function submit(completed: boolean) {
    if (!session?.id_token || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { changed } = await markLessons(session.id_token, [...cins], lessons, completed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: THEORY_KEYS.progress }),
        queryClient.invalidateQueries({ queryKey: THEORY_KEYS.plan }),
      ]);
      const what = `${plural(cins.size, "cadet")} × ${plural(lessons.length, "lesson")}`;
      toast.success(completed ? `Recorded ${what}.` : `Cleared ${what}.`, {
        description: changed ? `${plural(changed, "lesson")} changed.` : "They were already up to date.",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save the lessons.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CadetMultiPicker
          cadets={Array.isArray(cadets) ? cadets : []}
          loading={isLoading}
          selected={cins}
          onChange={setCins}
        />
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center justify-between text-sm">
              Lessons
              <span className="text-muted-foreground text-xs font-normal">{lessons.length} selected</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="border-t px-4 py-3">
            <LessonPicker subjects={subjects} picked={picked} onChange={setPicked} />
          </CardContent>
        </Card>
      </div>

      <ErrorAlert message={error} title="Couldn't save" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={() => submit(true)} disabled={!canSubmit}>
          <Check className="size-4" />
          {saving ? "Saving…" : "Record lessons"}
        </Button>
        <Button variant="outline" onClick={() => submit(false)} disabled={!canSubmit}>
          <Eraser className="size-4" />
          Clear them
        </Button>
        <p className="text-muted-foreground text-xs sm:ml-2">
          A subject is taught once all its lessons are in, and the cadet goes on its exam on the Tonight tab.
        </p>
      </div>
    </div>
  );
}
