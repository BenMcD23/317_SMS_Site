"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Users, ClipboardCheck, Calendar, ShieldCheck } from "lucide-react";
import { HubTabs, type HubTab } from "@/components/hub-tabs";

type CadetTab = HubTab & { staffOnly?: boolean };

const CADET_TABS: CadetTab[] = [
  { label: "Overview", href: "/cadets/overview", icon: Users, staffOnly: true },
  { label: "Assessments", href: "/cadets/assessments", icon: ClipboardCheck },
  { label: "Events", href: "/cadets/events", icon: Calendar, staffOnly: true },
  { label: "Audit", href: "/cadets/audit", icon: ShieldCheck, staffOnly: true },
];

/** Matches the individual-cadet detail route, e.g. /cadets/1234567. */
function isDetailRoute(pathname: string): boolean {
  return /^\/cadets\/[^/]+$/.test(pathname) && !CADET_TABS.some((t) => t.href === pathname);
}

export default function CadetsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // The per-cadet detail page is not a hub tab — render it without the strip.
  if (isDetailRoute(pathname)) return <>{children}</>;

  const isStaff = session?.role === "staff";
  const tabs = CADET_TABS.filter((t) => !t.staffOnly || isStaff);

  return (
    <div className="flex w-full flex-col gap-6">
      <HubTabs tabs={tabs} />
      {children}
    </div>
  );
}
