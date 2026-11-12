"use client";

import { LessonQrCodes } from "@/components/classifications/qr-codes";
import { ProgrammeLinks } from "@/components/training/programme-links";

/**
 * The things set up once and then left alone: each lesson's QR code, and which
 * lesson each programme activity is. They were two tabs of their own, in the
 * way of the ones used every week.
 */
export default function TrainingSetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <section aria-labelledby="setup-qr" className="flex flex-col gap-4">
        <h2 id="setup-qr" className="text-lg font-semibold">
          Lesson QR codes
        </h2>
        <LessonQrCodes />
      </section>
      <section aria-labelledby="setup-links" className="flex flex-col gap-4 border-t pt-8">
        <h2 id="setup-links" className="text-lg font-semibold">
          Programme links
        </h2>
        <ProgrammeLinks />
      </section>
    </div>
  );
}
