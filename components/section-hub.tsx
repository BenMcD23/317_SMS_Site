"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { NavLink, NavSection } from "@/lib/navigation";

/** One page as a row: a thumb-sized link with the chevron always showing. */
function HubRow({ href, label, icon: Icon }: { href: string; label: string; icon: NavLink["icon"] }) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">{label}</span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * The pages of one or more sections as a phone-sized list: the hub a bottom
 * bar tab opens. A page on its own is a row; a group (Uniform, Training) is its
 * name as a small heading over a row per page, so a section with areas still
 * reads top to bottom with one tap to anything in it.
 */
export function SectionHub({
  sections,
  showSectionNames,
}: {
  sections: NavSection[];
  showSectionNames: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section, i) => (
        <section
          key={section.label ?? i}
          aria-label={section.label || "General"}
          className="flex flex-col gap-3"
        >
          {showSectionNames && section.label && <h2 className="text-lg font-semibold">{section.label}</h2>}
          {/* Loose pages first in one frame, then each area in its own. */}
          {section.items.some((it) => !it.tabs) && (
            <ul className="bg-card divide-y overflow-hidden rounded-lg border">
              {section.items
                .filter((it) => !it.tabs)
                .map((it) => (
                  <HubRow key={it.href} href={it.href} label={it.label} icon={it.icon} />
                ))}
            </ul>
          )}
          {section.items
            .filter((it) => it.tabs)
            .map((it) => (
              <div key={it.label} className="flex flex-col gap-1.5">
                <h3 className="text-muted-foreground px-1 text-sm font-medium">{it.label}</h3>
                <ul aria-label={it.label} className="bg-card divide-y overflow-hidden rounded-lg border">
                  {it.tabs!.map((t) => (
                    <HubRow key={t.href} href={t.href} label={t.label} icon={t.icon ?? it.icon} />
                  ))}
                </ul>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
