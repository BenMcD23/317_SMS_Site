"use client";

import { NightPlanner } from "@/components/training/night-planner";

/** A training night: what's running, who's in each session and how they're grouped. */
export default function TrainingNightPlannerPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <NightPlanner />
    </div>
  );
}
