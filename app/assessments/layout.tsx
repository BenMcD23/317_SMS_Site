"use client";

import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/page-header";
import { RouteTabs } from "@/components/route-tabs";

const TABS = [
  { label: "Inspection", href: "/assessments/inspection", sncoOnly: true },
  { label: "Leadership", href: "/assessments/leadership" },
  { label: "Radio", href: "/assessments/radio" },
  { label: "Space", href: "/assessments/space" },
  { label: "MOI", href: "/assessments/moi", staffOnly: true },
];

export default function AssessmentsLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const tabs = TABS.filter((tab) => {
    if (tab.staffOnly) return session?.role === "staff";
    return !tab.sncoOnly || session?.role === "staff" || session?.role === "snco";
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Assessment Sheets"
        description="Record assessments and generate the paperwork"
        className="border-b-0 pb-0"
      />

      <RouteTabs tabs={tabs} label="Assessment sheets" />

      {children}
    </div>
  );
}
