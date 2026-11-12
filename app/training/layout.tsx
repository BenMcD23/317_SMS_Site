"use client";

import { PageHeader } from "@/components/page-header";

/**
 * Getting the right cadets onto the right thing on a parade night, and keeping
 * track of what they've had. Tonight is where a night is run from; Progress is
 * who's had which lesson (and who's missed one); Tasks & kit and Setup are the
 * rarely-changed things behind them. The tabs come from the Training area in
 * lib/navigation.ts, each its own page so it can be bookmarked.
 */
export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Training"
        description="Run tonight's sessions and keep track of who's had which lesson."
      />
      {children}
    </div>
  );
}
