"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ClassificationPlanner } from "@/components/classifications/planner";
import { TheoryProgress } from "@/components/classifications/progress";
import { LessonQrCodes } from "@/components/classifications/qr-codes";
import { RecordLessons } from "@/components/classifications/record";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { THEORY_KEYS, type TheorySubject } from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";

const TABS = [
  { value: "tonight", label: "Tonight" },
  { value: "progress", label: "Progress" },
  { value: "record", label: "Record" },
  { value: "qr", label: "QR codes" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** useSearchParams needs a Suspense boundary or the page fails to prerender. */
export default function ClassificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-16 w-full max-w-5xl" />}>
      <Classifications />
    </Suspense>
  );
}

function Classifications() {
  const params = useSearchParams();
  const pathname = usePathname();
  // ?tab= so the old Theory Progress link, and a bookmark of the QR codes, open the right tab.
  const asked = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === asked) ? (asked as Tab) : "tonight";

  const { data } = useApiQuery<TheorySubject[]>(THEORY_KEYS.subjects, "/cadets/theory/lessons", {
    staleTime: Infinity,
  });
  const subjects = Array.isArray(data) ? data : [];

  function open(next: string) {
    const qs = new URLSearchParams(window.location.search);
    if (next === "tonight") qs.delete("tab");
    else qs.set("tab", next);
    const query = qs.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Classifications"
        description="Plan classification nights, track each cadet's lessons, and the QR codes cadets scan to check in to a lesson"
      />
      <Tabs value={tab} onValueChange={open}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tonight" className="mt-4">
          <ClassificationPlanner />
        </TabsContent>
        <TabsContent value="progress" className="mt-4">
          <TheoryProgress subjects={subjects} />
        </TabsContent>
        <TabsContent value="record" className="mt-4">
          <RecordLessons subjects={subjects} />
        </TabsContent>
        <TabsContent value="qr" className="mt-4">
          <LessonQrCodes />
        </TabsContent>
      </Tabs>
    </div>
  );
}
