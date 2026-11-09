"use client";

import { ProgrammeLinks } from "@/components/training/programme-links";

/** Which lesson each programme activity is. */
export default function TrainingProgrammeLinksPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ProgrammeLinks />
    </div>
  );
}
