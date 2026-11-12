"use client";

import { NightPlanner } from "@/components/training/night-planner";

/**
 * Tonight: the night's sessions and who's in each group, worked out from the
 * door and the QR scans. Where a night is run from, so it's the area's index;
 * the classification and practical-session planners open from here.
 */
export default function TrainingTonightPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <NightPlanner />
    </div>
  );
}
