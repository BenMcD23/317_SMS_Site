import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";

/**
 * The top of a planner opened from Tonight (classifications, a practical
 * session): the way back, then what this planner is for. Shared so both read
 * as part of running the night, not as separate tools.
 */
export function TonightSubpage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/training"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to tonight
        </Link>
        <SectionHeading title={title} description={description} />
      </div>
      {children}
    </div>
  );
}
