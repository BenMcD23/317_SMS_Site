"use client";

import { PageHeader } from "@/components/page-header";
import { LeavingProcessCard } from "@/components/oc/leaving-process-card";
import { OcOnly } from "@/components/oc/oc-access-required";
import { ParentEmailsCard } from "@/components/oc/parent-emails-card";

export default function OcLeavingPage() {
  // Parent emails sit beside the leavers because that's where the leaving
  // card copies each cadet's parents' addresses from.
  return (
    <OcOnly>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
        <PageHeader
          title="Leaving process"
          description="Cadets who haven't paraded for eight weeks, and parent emails to BCC from your own account."
        />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <LeavingProcessCard />
          <ParentEmailsCard />
        </div>
      </div>
    </OcOnly>
  );
}
