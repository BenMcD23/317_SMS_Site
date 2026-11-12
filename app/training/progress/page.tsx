"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TheoryProgress } from "@/components/classifications/progress";
import { CatchUps } from "@/components/training/catch-ups";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { THEORY_KEYS, type TheorySubject } from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";

/**
 * Who's had which theory lessons. Two views of the same question: by cadet
 * (the grid, where lessons are recorded) and by lesson ("Missed lessons", who
 * still needs one the programme has already run). They were separate tabs;
 * one page with a switch says they're the same thing. The view is in the URL
 * (`?view=missed`) so the old Catch-ups link lands on it.
 */
export default function TheoryProgressPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get("view") === "missed" ? "missed" : "cadets";
  const { data } = useApiQuery<TheorySubject[]>(THEORY_KEYS.subjects, "/cadets/theory/lessons", {
    staleTime: Infinity,
    enabled: view === "cadets",
  });
  const subjects = Array.isArray(data) ? data : [];

  function setView(next: string) {
    if (!next || next === view) return;
    router.replace(next === "missed" ? `${pathname}?view=missed` : pathname, { scroll: false });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ToggleGroup
        type="single"
        variant="outline"
        value={view}
        onValueChange={setView}
        aria-label="Show progress"
        className="w-fit"
      >
        <ToggleGroupItem value="cadets" className="px-3">
          By cadet
        </ToggleGroupItem>
        <ToggleGroupItem value="missed" className="px-3">
          Missed lessons
        </ToggleGroupItem>
      </ToggleGroup>
      {view === "missed" ? <CatchUps /> : <TheoryProgress subjects={subjects} />}
    </div>
  );
}
