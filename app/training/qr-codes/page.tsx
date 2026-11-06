"use client";

import { LessonQrCodes } from "@/components/classifications/qr-codes";

/** The QR code for each theory lesson, which cadets scan to record they've had it. */
export default function QrCodesPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <LessonQrCodes />
    </div>
  );
}
