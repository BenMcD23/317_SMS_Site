"use client";

import { useParams } from "next/navigation";

import { ProgrammeBuilder } from "@/components/programme-builder/builder";

/** One month's programme: built by staff, read and commented on by NCOs. */
export default function ProgrammeMonthPage() {
  const { month } = useParams<{ month: string }>();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <ProgrammeBuilder month={month ?? ""} />
    </div>
  );
}
