"use client";

import { CatchUps } from "@/components/training/catch-ups";

/** Lessons the programme has run, and who still needs them. */
export default function TrainingCatchUpsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <CatchUps />
    </div>
  );
}
