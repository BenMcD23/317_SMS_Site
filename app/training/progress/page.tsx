"use client";

import { TheoryProgress } from "@/components/classifications/progress";
import { THEORY_KEYS, type TheorySubject } from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";

/** Who's had which theory lessons, and recording the ones taught. */
export default function TheoryProgressPage() {
  const { data } = useApiQuery<TheorySubject[]>(THEORY_KEYS.subjects, "/cadets/theory/lessons", {
    staleTime: Infinity,
  });
  const subjects = Array.isArray(data) ? data : [];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <TheoryProgress subjects={subjects} />
    </div>
  );
}
