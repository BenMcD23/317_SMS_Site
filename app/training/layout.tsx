"use client";

import { PageHeader } from "@/components/page-header";
import { RouteTabs, type RouteTab } from "@/components/route-tabs";

/**
 * Planning what cadets do on a night, and keeping track of what they've done:
 * classification lessons and exams, practical sessions (leadership tasks,
 * radio, first aid), theory progress, the task bank and kit, and the lesson
 * QR codes. One area because it's the same job, getting the right cadets onto
 * the right thing, and each part is its own page so it can be bookmarked.
 */
const TABS: RouteTab[] = [
  { label: "Classifications", href: "/training", exact: true },
  { label: "Sessions", href: "/training/sessions" },
  { label: "Theory progress", href: "/training/progress" },
  { label: "Tasks & kit", href: "/training/tasks" },
  { label: "QR codes", href: "/training/qr-codes" },
];

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Training"
        description="Plan classification lessons and practical sessions, and keep track of who's done what."
        className="border-b-0 pb-0"
      />
      <RouteTabs tabs={TABS} label="Training" />
      {children}
    </div>
  );
}
