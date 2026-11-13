"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Footprints, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { LessonDialog } from "@/components/drill/lesson-dialog";
import { StageDialog } from "@/components/drill/stage-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Button } from "@/components/ui/button";
import {
  deleteLesson,
  deleteStage,
  DRILL_KEYS,
  moved,
  orderLessons,
  orderStages,
  type DrillLesson,
  type DrillStage,
} from "@/lib/drill";
import { useApiQuery } from "@/lib/use-api-query";

/** "5x5 drill test · out of 25 · pass mark 15", or that it has no test. */
function testSummary(stage: DrillStage): string {
  if (!stage.test_name) return "No test";
  return [
    stage.test_name,
    stage.max_score !== null && `out of ${stage.max_score}`,
    stage.pass_mark !== null ? `pass mark ${stage.pass_mark}` : "tester decides",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The drill syllabus. Staff add, rename, reorder and remove stages and
 * lessons; everyone else sees the same list read-only. Something with records
 * against it can't be deleted (the API answers 409 and says to rename it), so
 * an edit never loses a cadet's history.
 */
export function SyllabusEditor({ canEdit }: { canEdit: boolean }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const { data, isLoading, error } = useApiQuery<DrillStage[]>(DRILL_KEYS.syllabus, "/drill/syllabus");
  const stages = Array.isArray(data) ? data : [];
  const [editing, setEditing] = useState<{ stage: DrillStage | null } | null>(null);
  const [lessonTarget, setLessonTarget] = useState<{ stage: DrillStage; lesson?: DrillLesson } | null>(null);
  const token = session?.id_token ?? "";

  // The progress view shows the same stages, so both refresh together.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: DRILL_KEYS.syllabus }),
      queryClient.invalidateQueries({ queryKey: DRILL_KEYS.progress }),
    ]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    try {
      await action();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fallback);
    }
  }

  if (isLoading) return <ListSkeleton rows={6} />;
  if (error) return <ErrorAlert message={error.message} title="Couldn't load the syllabus" />;

  const ids = stages.map((s) => s.id);
  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Renaming keeps every cadet&apos;s record. Lessons with records can&apos;t be deleted.
          </p>
          <Button className="h-9" onClick={() => setEditing({ stage: null })}>
            <Plus className="size-4" /> Add stage
          </Button>
        </div>
      )}

      {stages.length === 0 ? (
        <EmptyState
          icon={Footprints}
          title="No stages yet"
          description={canEdit ? "Add the first stage of the drill syllabus." : "Staff set the syllabus up."}
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {stages.map((stage, si) => {
            const lessonIds = stage.lessons.map((l) => l.id);
            return (
              <li key={stage.id} className="bg-card rounded-lg border">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{stage.name}</h2>
                    <p className="text-muted-foreground text-sm">{testSummary(stage)}</p>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Move ${stage.name} up`}
                        disabled={si === 0}
                        onClick={() => run(() => orderStages(token, moved(ids, si, -1)), "Couldn't move it.")}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Move ${stage.name} down`}
                        disabled={si === stages.length - 1}
                        onClick={() => run(() => orderStages(token, moved(ids, si, 1)), "Couldn't move it.")}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit ${stage.name}`}
                        onClick={() => setEditing({ stage })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Delete ${stage.name}`}
                        onClick={() =>
                          confirm(`Delete ${stage.name}?`, () =>
                            run(() => deleteStage(token, stage.id), "Couldn't delete the stage.")
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <ul className="divide-y">
                  {stage.lessons.map((lesson, li) => (
                    <li
                      key={lesson.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                    >
                      <span className="text-sm">{lesson.name}</span>
                      {canEdit && (
                        <span className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Move ${lesson.name} up`}
                            disabled={li === 0}
                            onClick={() =>
                              run(
                                () => orderLessons(token, stage.id, moved(lessonIds, li, -1)),
                                "Couldn't move it."
                              )
                            }
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Move ${lesson.name} down`}
                            disabled={li === stage.lessons.length - 1}
                            onClick={() =>
                              run(
                                () => orderLessons(token, stage.id, moved(lessonIds, li, 1)),
                                "Couldn't move it."
                              )
                            }
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Rename ${lesson.name}`}
                            onClick={() => setLessonTarget({ stage, lesson })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Delete ${lesson.name}`}
                            onClick={() =>
                              confirm(`Delete the lesson "${lesson.name}"?`, () =>
                                run(() => deleteLesson(token, lesson.id), "Couldn't delete the lesson.")
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                  {stage.lessons.length === 0 && (
                    <li className="text-muted-foreground px-4 py-2 text-sm">No lessons yet.</li>
                  )}
                </ul>
                {canEdit && (
                  <div className="border-t px-4 py-2">
                    <Button variant="ghost" className="h-9" onClick={() => setLessonTarget({ stage })}>
                      <Plus className="size-4" /> Add lesson
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {canEdit && (
        <>
          <StageDialog
            open={!!editing}
            stage={editing?.stage ?? null}
            onOpenChange={(o) => !o && setEditing(null)}
            onSaved={refresh}
          />
          <LessonDialog target={lessonTarget} onClose={() => setLessonTarget(null)} onSaved={refresh} />
        </>
      )}
      {confirmDialog}
    </div>
  );
}
