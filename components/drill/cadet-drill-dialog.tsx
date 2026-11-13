"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { AttemptForm } from "@/components/drill/attempt-form";
import { StageStatusBadge } from "@/components/drill/status-badge";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  deleteAttempt,
  lessonState,
  markLesson,
  scoreLabel,
  stageCount,
  type DrillCadet,
  type DrillProgress,
  type LessonState,
} from "@/lib/drill";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<LessonState, string> = { none: "Not yet", taught: "Taught", passed: "Passed" };

/**
 * One cadet's drill record: every stage with its lessons and test attempts.
 * Staff and SNCOs tick lessons and record tests here; NCOs see the same sheet
 * read-only, so they know what to practise with the cadet next.
 */
export function CadetDrillDialog({
  cadet,
  progress,
  canRecord,
  onClose,
  onChanged,
}: {
  cadet: DrillCadet | null;
  progress: DrillProgress;
  canRecord: boolean;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const [testing, setTesting] = useState<number | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function setLesson(lessonId: number, state: LessonState) {
    if (!cadet) return;
    setSaving(`lesson-${lessonId}`);
    try {
      await markLesson(session?.id_token ?? "", cadet.cin, lessonId, state);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the lesson.");
    } finally {
      setSaving(null);
    }
  }

  function removeAttempt(id: number) {
    confirm("Delete this test result? Use this for a result entered by mistake.", async () => {
      try {
        await deleteAttempt(session?.id_token ?? "", id);
        await onChanged();
        toast.success("Test result deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the test.");
      }
    });
  }

  return (
    <ResponsiveDialog
      open={!!cadet}
      onOpenChange={(open) => {
        if (!open) {
          setTesting(null);
          onClose();
        }
      }}
    >
      <ResponsiveDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {cadet && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {[cadet.rank, cadet.name].filter(Boolean).join(" ")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {canRecord
                  ? "Tick each lesson as it's taught, then passed. Record the stage test once every lesson is passed."
                  : "Where this cadet is on the drill syllabus. Staff and SNCOs sign lessons off."}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="flex flex-col gap-6 px-4 pb-4 sm:px-0 sm:pb-0">
              {progress.stages.map((stage) => {
                const status = cadet.stages[String(stage.id)] ?? "not_started";
                const { passed, total } = stageCount(cadet, stage);
                const attempts = cadet.tests.filter((t) => t.stage_id === stage.id);
                return (
                  <section
                    key={stage.id}
                    aria-labelledby={`drill-stage-${stage.id}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id={`drill-stage-${stage.id}`} className="font-semibold">
                        {stage.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {passed} of {total} passed
                        </span>
                        <StageStatusBadge status={status} />
                      </div>
                    </div>

                    {stage.lessons.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No lessons in this stage yet.</p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {stage.lessons.map((lesson) => {
                          const state = lessonState(cadet, lesson.id);
                          const mark = cadet.lessons[String(lesson.id)];
                          return (
                            <li
                              key={lesson.id}
                              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm">{lesson.name}</p>
                                {mark?.passed_at && (
                                  <p className="text-muted-foreground text-xs">
                                    Passed {formatDate(mark.passed_at)}
                                  </p>
                                )}
                              </div>
                              {canRecord ? (
                                <ToggleGroup
                                  type="single"
                                  variant="outline"
                                  size="sm"
                                  aria-label={`${lesson.name} for ${cadet.name}`}
                                  value={state}
                                  disabled={saving === `lesson-${lesson.id}`}
                                  onValueChange={(v) =>
                                    v && v !== state && setLesson(lesson.id, v as LessonState)
                                  }
                                >
                                  {(["none", "taught", "passed"] as const).map((s) => (
                                    <ToggleGroupItem key={s} value={s} className="h-8 px-3">
                                      {STATE_LABEL[s]}
                                    </ToggleGroupItem>
                                  ))}
                                </ToggleGroup>
                              ) : (
                                <span
                                  className={cn(
                                    "text-sm",
                                    state === "passed" && "text-success",
                                    state === "none" && "text-muted-foreground"
                                  )}
                                >
                                  {STATE_LABEL[state]}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {stage.test_name && (
                      <div className="flex flex-col gap-2">
                        {attempts.length > 0 && (
                          <ul
                            aria-label={`${stage.test_name} results`}
                            className="flex flex-col gap-1 text-sm"
                          >
                            {attempts.map((a) => (
                              <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className={a.passed ? "text-success font-medium" : "font-medium"}>
                                  {a.passed ? "Passed" : "Not yet"}
                                </span>
                                <span className="text-muted-foreground">
                                  {stage.test_name} · {formatDate(a.tested_on)}
                                  {scoreLabel(a, stage) && ` · ${scoreLabel(a, stage)}`}
                                </span>
                                {a.notes && (
                                  <span className="text-muted-foreground w-full text-xs">{a.notes}</span>
                                )}
                                {canRecord && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-auto size-8"
                                    aria-label={`Delete ${stage.test_name} result from ${formatDate(a.tested_on)}`}
                                    onClick={() => removeAttempt(a.id)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {canRecord &&
                          (testing === stage.id ? (
                            <AttemptForm
                              cin={cadet.cin}
                              stage={stage}
                              onCancel={() => setTesting(null)}
                              onSaved={async (a) => {
                                setTesting(null);
                                await onChanged();
                                toast.success(
                                  a.passed ? `${stage.test_name} passed` : `${stage.test_name} saved`
                                );
                              }}
                            />
                          ) : (
                            <Button
                              variant="outline"
                              className="h-9 w-fit"
                              onClick={() => setTesting(stage.id)}
                            >
                              <Plus className="size-4" /> Record {stage.test_name}
                            </Button>
                          ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
        {confirmDialog}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
