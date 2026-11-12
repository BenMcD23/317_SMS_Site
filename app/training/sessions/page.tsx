"use client";

import { SessionPlanner } from "@/components/session-planner/planner";
import { TonightSubpage } from "@/components/training/tonight-subpage";

/** Practical sessions: groups rotating through tasks, and who leads which. Opened from Tonight. */
export default function SessionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <TonightSubpage
        title="Practical session"
        description="Pick the tasks and who's taking part, and the planner rotates the groups and picks who leads."
      >
        <SessionPlanner />
      </TonightSubpage>
    </div>
  );
}
