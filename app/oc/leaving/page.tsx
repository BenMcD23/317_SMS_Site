"use client";

import { PageHeader } from "@/components/page-header";
import { LeavingProcessCard } from "@/components/oc/leaving-process-card";
import { OcOnly } from "@/components/oc/oc-access-required";
import { ParentEmailsCard } from "@/components/oc/parent-emails-card";
import { usePersonalDataHidden } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export default function OcLeavingPage() {
  const [personalHidden] = usePersonalDataHidden();
  // Parent emails sit beside the leavers because that's where the leaving
  // card copies each cadet's parents' addresses from.
  return (
    <OcOnly>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
        <PageHeader
          title="Leaving process"
          description={
            personalHidden
              ? "Cadets who haven't paraded for eight weeks."
              : "Cadets who haven't paraded for eight weeks, and parent emails to BCC from your own account."
          }
        />
        <div className={cn("grid items-start gap-4", !personalHidden && "lg:grid-cols-2")}>
          <LeavingProcessCard />
          {!personalHidden && <ParentEmailsCard />}
        </div>
      </div>
    </OcOnly>
  );
}
