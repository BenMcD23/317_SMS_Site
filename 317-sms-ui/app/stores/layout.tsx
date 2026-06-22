"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { HubTabs } from "@/components/hub-tabs";

const CATEGORIES = [
  { label: "Uniform", slug: "uniform", icon: Package },
  { label: "Badges", slug: "badges", icon: Award },
];
const VIEWS = [
  { label: "Stock", slug: "stock" },
  { label: "Orders", slug: "orders" },
];

export default function StoresLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [, , category = "uniform", view = "stock"] = pathname.split("/"); // /stores/<category>/<view>

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Primary: uniform vs badges — keeps the current stock/orders view when switching */}
      <HubTabs
        tabs={CATEGORIES.map((c) => ({
          label: c.label,
          href: `/stores/${c.slug}/${view}`,
          icon: c.icon,
          activePrefix: `/stores/${c.slug}`,
        }))}
      />

      {/* Secondary: stock vs orders within the selected category */}
      <div className="inline-flex w-fit rounded-lg bg-muted p-0.5 text-sm">
        {VIEWS.map((v) => {
          const active = view === v.slug;
          return (
            <Link
              key={v.slug}
              href={`/stores/${category}/${v.slug}`}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
