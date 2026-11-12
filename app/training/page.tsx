"use client";

import { ClassificationPlanner } from "@/components/classifications/planner";

/** Tonight's classification lessons and exams: who's on which. */
export default function ClassificationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ClassificationPlanner />
    </div>
  );
}
