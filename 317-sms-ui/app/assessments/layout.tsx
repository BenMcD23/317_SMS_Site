"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Leadership", href: "/assessments/leadership" },
  { label: "First Aid", href: "/assessments/first-aid" },
  { label: "Radio", href: "/assessments/radio" },
];

export default function AssessmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assessment Sheets</h1>
        <p className="text-muted-foreground">View and manage cadet assessments</p>
      </div>

      {/* Sub-nav tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b min-w-max">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                pathname === tab.href
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}