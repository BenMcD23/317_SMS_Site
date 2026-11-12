"use client";

import { useArea } from "@/components/area-tabs";
import { PageHeader } from "@/components/page-header";

const DESCRIPTIONS: Record<string, string> = {
  Assessments: "Mark an assessment, then find it under Results to download or upload it.",
  Inspections: "Mark a flight's inspection, then see the history and leaderboard.",
};

/**
 * The marking sheets. Most belong to the Assessments area and the inspection
 * sheet to Inspections (lib/navigation.ts), so the header takes its title and
 * tab row from whichever area the sheet is in.
 */
export default function AssessmentsLayout({ children }: { children: React.ReactNode }) {
  const area = useArea();
  const title = area?.label ?? "Assessments";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={title} description={DESCRIPTIONS[title]} />
      {children}
    </div>
  );
}
