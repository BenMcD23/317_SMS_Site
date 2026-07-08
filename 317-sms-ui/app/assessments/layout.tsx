"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const TABS = [
  { label: "Leadership", href: "/assessments/leadership" },
  { label: "Radio", href: "/assessments/radio" },
  { label: "MOI", href: "/assessments/moi" },
];

export default function AssessmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Assessment Sheets"
        description="Record assessments and generate the paperwork"
        className="border-b-0 pb-0"
      />

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 border-b">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                pathname === tab.href
                  ? "border-primary text-foreground"
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
