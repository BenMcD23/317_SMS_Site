"use client";

import { useSession } from "next-auth/react";

import { DoorCode } from "@/components/check-in/door-code";
import { DoorList } from "@/components/check-in/door-list";
import { PageHeader } from "@/components/page-header";

export default function CheckInPage() {
  const { data: session } = useSession();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Check-in"
        description="Who's in tonight, for the session planner. Cadets scan the QR code or tap the NFC tag; check in anyone without their phone. The Bader register is still the record."
        actions={session?.role === "staff" && <DoorCode />}
      />
      <DoorList />
    </div>
  );
}
