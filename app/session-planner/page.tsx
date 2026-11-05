"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SessionPlanner } from "@/components/session-planner/planner";
import { Button } from "@/components/ui/button";

export default function SessionPlannerPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Session planner"
        description="Split the cadets into groups and rotate them through tasks. For leadership, everyone leads a task they haven't led before."
        actions={
          <Button asChild variant="outline">
            <Link href="/session-planner/bank">
              <ListChecks />
              Task bank and kit
            </Link>
          </Button>
        }
      />
      <SessionPlanner />
    </div>
  );
}
