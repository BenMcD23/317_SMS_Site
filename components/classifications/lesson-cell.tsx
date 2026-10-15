"use client";

import { useState } from "react";
import { Check, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { lessonLabel, progressLabel, type SubjectProgress, type TheorySubject } from "@/lib/theory";
import { cn } from "@/lib/utils";

/**
 * A subject's lessons as a row of pips: filled for each lesson had. Taught
 * (every lesson in, exam to sit) turns them amber; passed is a green tick.
 */
export function LessonPips({ progress, parts }: { progress: SubjectProgress; parts: number }) {
  if (progress.passed) {
    return (
      <span className="text-success inline-flex items-center gap-1 text-xs font-medium">
        <GraduationCap className="size-3.5" />
        Passed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: parts }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-4 rounded-full transition-colors",
            progress.lessons.includes(i + 1)
              ? progress.taught
                ? "bg-warning"
                : "bg-primary"
              : "bg-muted-foreground/20"
          )}
        />
      ))}
    </span>
  );
}

/**
 * One cadet × subject cell on the Progress tab. Opens a small menu to tick the
 * lessons they've had, so fixing one missed scan doesn't mean going to the
 * Record tab and re-picking the cadet.
 */
export function LessonCell({
  cadetName,
  subject,
  progress,
  onChange,
}: {
  cadetName: string;
  subject: TheorySubject;
  progress: SubjectProgress;
  onChange: (part: number | undefined, completed: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const label = `${cadetName}, ${subject.name}: ${progressLabel(progress, subject.parts)}`;

  // Already passed: nothing to record, so no menu to open.
  if (progress.passed) {
    return (
      <span title={label} aria-label={label} role="img" className="inline-flex">
        <LessonPips progress={progress} parts={subject.parts} />
      </span>
    );
  }

  async function run(part: number | undefined, completed: boolean) {
    setBusy(true);
    try {
      await onChange(part, completed);
    } finally {
      setBusy(false);
    }
  }

  const all = progress.lessons.length >= subject.parts;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={progressLabel(progress, subject.parts)}
          className="hover:bg-muted focus-visible:ring-ring/50 inline-flex h-8 items-center rounded-md px-2 outline-none focus-visible:ring-[3px]"
        >
          <LessonPips progress={progress} parts={subject.parts} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="flex w-60 flex-col gap-3">
        <div>
          <p className="text-sm font-semibold">{subject.name}</p>
          <p className="text-muted-foreground text-xs">{cadetName}</p>
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: subject.parts }, (_, i) => i + 1).map((part) => {
            const had = progress.lessons.includes(part);
            return (
              <Label key={part} className="flex items-center gap-2 text-sm font-normal">
                <Checkbox checked={had} disabled={busy} onCheckedChange={() => run(part, !had)} />
                {lessonLabel(subject, part)}
              </Label>
            );
          })}
        </div>
        {subject.parts > 1 && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(undefined, !all)}>
            {all ? (
              "Clear all lessons"
            ) : (
              <>
                <Check className="size-4" />
                All {subject.parts} lessons
              </>
            )}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
