"use client";

import { useState } from "react";

import { CountTabs } from "@/components/count-tabs";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { KitList } from "@/components/session-planner/kit-list";
import { TaskBank } from "@/components/session-planner/task-bank";
import { UnlinkedSheets } from "@/components/session-planner/unlinked-sheets";
import type { BankTask, KitItem, UnlinkedSheet } from "@/lib/session-planner";
import { useApiQuery } from "@/lib/use-api-query";

type Tab = "tasks" | "kit" | "unlinked";

export default function SessionPlannerPage() {
  const [tab, setTab] = useState<Tab>("tasks");
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
  const taskList = tasks.data ?? [];
  const kitList = kit.data ?? [];
  const sheets = unlinked.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Session planner"
        description="The bank of tasks your sessions run and the kit you have to run them with."
      />

      <CountTabs
        value={tab}
        onValueChange={setTab}
        loading={loading}
        tabs={[
          { value: "tasks", label: "Tasks", count: taskList.filter((t) => t.active).length },
          { value: "kit", label: "Kit", count: kitList.length },
          { value: "unlinked", label: "Unlinked sheets", count: sheets.length },
        ]}
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load the session planner" />

      {loading && <ListSkeleton rows={6} />}

      {!loading && !error && tab === "tasks" && (
        <TaskBank tasks={taskList} kit={kitList} onChanged={refresh} />
      )}
      {!loading && !error && tab === "kit" && <KitList kit={kitList} onChanged={refresh} />}
      {!loading && !error && tab === "unlinked" && (
        <UnlinkedSheets sheets={sheets} tasks={taskList} onLinked={refresh} />
      )}
    </div>
  );
}
