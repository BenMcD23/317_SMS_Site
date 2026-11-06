"use client";

import { SessionPlanner } from "@/components/session-planner/planner";

/** Practical sessions: groups rotating through tasks, and who leads which. */
export default function SessionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <SessionPlanner />
    </div>
  );
}
