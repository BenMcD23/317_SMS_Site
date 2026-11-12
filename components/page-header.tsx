"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft } from "lucide-react";

import { mobileHubFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Standard page header — title on the left, optional actions on the right.
 * Every page opens with one so the sidebar's link, the breadcrumb and the
 * heading agree on what the page is called.
 *
 * On a phone it also carries the way back to the page's section hub
 * ("‹ Stores"), which the bottom bar opened: pages have no tab rows, so the
 * hub is how you move between the pages of a section. On a laptop the sidebar
 * does that job, so the link is hidden.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  // Null outside the app router (a component rendered on its own in a test).
  const pathname = usePathname() ?? "";
  const { data: session } = useSession() ?? {};
  const hub = mobileHubFor(pathname, session?.role);

  return (
    <div className="flex flex-col gap-2">
      {hub && (
        <Link
          href={hub.href}
          className="text-muted-foreground hover:text-foreground -ml-1 inline-flex min-h-9 w-fit items-center gap-1 text-sm md:hidden"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {hub.label}
        </Link>
      )}
      <div
        className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-5", className)}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
