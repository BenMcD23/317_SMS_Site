"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, ScanLine } from "lucide-react";

import { DividedGrid } from "@/components/divided-grid";
import { SectionHeading } from "@317/ui-common/components/section-heading";
import type { DoorList } from "@/lib/check-ins";
import { todayLocal } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

type PlanSummary = { id: number; session_name: string; session_ic: string; session_date: string | null };

// The same queries the Check-in and Session Plans pages read, so opening
// either from here shows at once.
const DOOR_KEY = ["check-ins", "tonight"] as const;
const PLANS_KEY = ["session-plans"] as const;

/**
 * "Tonight" on the dashboard: how many cadets are in at the door, and
 * tonight's session plans, each a tap away. The dashboard is otherwise
 * figures for the week; on a parade night the NCO or staff member opening
 * it on their phone wants the door and the plan.
 *
 * Shown only when something is on tonight (someone has checked in, or a
 * plan is dated today), so the rest of the week the dashboard is unchanged.
 * A failed lookup just hides it: it's a shortcut, not the only way there.
 */
export function Tonight() {
  const door = useApiQuery<DoorList>(DOOR_KEY, "/check-ins").data;
  const plansData = useApiQuery<{ plans: PlanSummary[] }>(PLANS_KEY, "/session-plans").data;

  const today = todayLocal();
  // An error body ({detail}) in place of the list is treated as no plans.
  const plans = (Array.isArray(plansData?.plans) ? plansData.plans : [])
    .filter((p) => p.session_date?.slice(0, 10) === today)
    .sort((a, b) => a.session_name.localeCompare(b.session_name));
  const checkedIn = typeof door?.checked_in === "number" ? door.checked_in : 0;
  const roster = Array.isArray(door?.cadets) ? door.cadets.length : 0;

  if (checkedIn === 0 && plans.length === 0) return null;

  return (
    <section aria-labelledby="tonight-heading" className="flex flex-col gap-3">
      <SectionHeading title={<span id="tonight-heading">Tonight</span>} />
      <DividedGrid as="ul" className="grid-cols-1 sm:grid-cols-2">
        <li>
          <TonightLink
            href="/check-in"
            icon={<ScanLine />}
            title="Check-in"
            detail={checkedIn === 0 ? "Nobody in yet" : `${checkedIn} of ${roster} cadets in`}
          />
        </li>
        {plans.map((p) => (
          <li key={p.id}>
            <TonightLink
              href={`/session-plans/${p.id}`}
              icon={<ClipboardList />}
              title={p.session_name}
              detail={p.session_ic ? `Session plan · ${p.session_ic}` : "Session plan"}
            />
          </li>
        ))}
      </DividedGrid>
    </section>
  );
}

/** A whole-row link, tall enough to hit with a thumb, with the chevron always shown. */
function TonightLink({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-3 transition-colors [&>svg:first-child]:size-5 [&>svg:first-child]:shrink-0"
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{title}</span>
        <span className="text-muted-foreground text-sm">{detail}</span>
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </Link>
  );
}
