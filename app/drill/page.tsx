"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { DrillProgressView } from "@/components/drill/drill-progress";
import { SyllabusEditor } from "@/components/drill/syllabus-editor";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The progressive drill syllabus: who is where, who is ready for a stage test,
 * and the syllabus itself. Open to every NCO so they know who to teach next;
 * staff and SNCOs sign lessons and tests off, and staff edit the syllabus. The
 * API enforces each of those (routers/drill.py).
 */
export default function DrillPage() {
  const { data: session } = useSession();
  const role = session?.role;
  const [tab, setTab] = useState("progress");
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Drill"
        description="Each cadet's progress through the drill syllabus, from first turns to taking a squad."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="syllabus">Syllabus</TabsTrigger>
        </TabsList>
        <TabsContent value="progress" className="pt-4">
          <DrillProgressView canRecord={role === "staff" || role === "snco"} />
        </TabsContent>
        <TabsContent value="syllabus" className="pt-4">
          <SyllabusEditor canEdit={role === "staff"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
