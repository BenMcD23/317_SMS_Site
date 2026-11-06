"use client";

import { AlertTriangle } from "lucide-react";

import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { KitList } from "@/components/session-planner/kit-list";
import { TaskBank } from "@/components/session-planner/task-bank";
import { UnlinkedSheets } from "@/components/session-planner/unlinked-sheets";
import type { BankTask, KitItem, UnlinkedSheet } from "@/lib/session-planner";
import { useApiQuery } from "@/lib/use-api-query";

/**
 * The tasks sessions run and the kit to run them with, on one page: each is a
 * short list and a task's kit only makes sense next to the kit list. Old
 * leadership sheets the bank can't place show at the bottom, flagged at the
 * top, only while there are any.
 */
export default function TasksAndKitPage() {
  const tasks = useApiQuery<BankTask[]>(
    ["session-planner", "tasks"],
    "/session-planner/tasks?include_retired=true"
  );
  const kit = useApiQuery<KitItem[]>(["session-planner", "kit"], "/session-planner/kit");
  const unlinked = useApiQuery<UnlinkedSheet[]>(
    ["session-planner", "unlinked"],
    "/session-planner/unlinked-assessments"
  );

  // Kit and tasks show each other (what needs this kit, what kit a task has
  // and whether it's short), and linking a sheet changes a task's lead count,
  // so any change refreshes all three.
  const refresh = () => {
    void tasks.refetch();
    void kit.refetch();
    void unlinked.refetch();
  };

  const loading = tasks.isLoading || kit.isLoading || unlinked.isLoading;
  const error = tasks.error ?? kit.error ?? unlinked.error;
  const taskList = Array.isArray(tasks.data) ? tasks.data : [];
  const kitList = Array.isArray(kit.data) ? kit.data : [];
  const sheets = Array.isArray(unlinked.data) ? unlinked.data : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <ErrorAlert message={error?.message ?? null} title="Could not load the task bank" />
      {loading && <ListSkeleton rows={6} />}
      {!loading && !error && (
        <>
          {sheets.length > 0 && (
            <p className="text-warning flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {sheets.length} old leadership sheet{sheets.length === 1 ? " isn't" : "s aren't"} on a task,
                so the planner can&apos;t tell who led what.{" "}
                <a href="#unlinked" className="font-medium underline">
                  Link {sheets.length === 1 ? "it" : "them"}
                </a>
              </span>
            </p>
          )}
          <TaskBank tasks={taskList} kit={kitList} onChanged={refresh} />
          <KitList kit={kitList} onChanged={refresh} />
          <UnlinkedSheets sheets={sheets} tasks={taskList} onLinked={refresh} />
        </>
      )}
    </div>
  );
}
