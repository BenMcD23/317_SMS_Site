"use client";

import { ClassificationPlanner } from "@/components/classifications/planner";
import { TonightSubpage } from "@/components/training/tonight-subpage";

/** Tonight's classification lessons and exams: who's on which. Opened from Tonight. */
export default function ClassificationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <TonightSubpage
        title="Lessons and exams"
        description="Who's on which classification lesson or exam tonight. Change anyone's with their dropdown."
      >
        <ClassificationPlanner />
      </TonightSubpage>
    </div>
  );
}
