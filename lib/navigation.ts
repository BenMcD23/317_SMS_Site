import type { LucideIcon } from "lucide-react";
import {
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DatabaseBackup,
  DatabaseZap,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  MessageSquareText,
  Newspaper,
  Package,
  Radio,
  ReceiptText,
  ScrollText,
  Shirt,
  ShieldCheck,
  ShieldUser,
  ShoppingCart,
  Star,
  UserCheck,
  UserCog,
  UserMinus,
  Users,
} from "lucide-react";

import { canAccess } from "@/lib/access";
import { OWNER_EMAIL, isOc } from "@/lib/config";

/**
 * The site map: what the sidebar shows, what the header breadcrumbs say, and
 * what the ⌘K palette searches. One definition so those three never disagree.
 *
 * Role gating is not repeated here. A link is shown when `canAccess` (the same
 * rule the middleware enforces) says the role can reach it, so nothing is ever
 * listed that would bounce to /unauthorized. `ownerOnly` / `ocOnly` are the two
 * cosmetic gates for pages whose real enforcement is on the API.
 */

export type NavLink = {
  kind?: "link";
  label: string;
  href: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  ocOnly?: boolean;
  /** Extra words the palette should match, e.g. old names people still use. */
  keywords?: string[];
};

/** A collapsible parent with its own children (Stores › Uniform › Stock). */
export type NavGroup = {
  kind: "group";
  label: string;
  icon: LucideIcon;
  links: NavLink[];
};

export type NavItem = NavLink | NavGroup;

export type NavSection = {
  label?: string;
  ownerOnly?: boolean;
  ocOnly?: boolean;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "OC Dashboard", href: "/oc", icon: ShieldUser, ocOnly: true },
    ],
  },
  {
    label: "Cadets",
    items: [
      { label: "Overview", href: "/cadets/overview", icon: Users, keywords: ["cadet list", "roll"] },
      { label: "Assessments", href: "/cadets/assessments", icon: ClipboardCheck, keywords: ["results"] },
      { label: "Inspections", href: "/cadets/inspections", icon: Shirt, keywords: ["inspection history"] },
      { label: "Theory Progress", href: "/cadets/theory", icon: GraduationCap },
      { label: "Events", href: "/cadets/events", icon: Calendar },
      {
        label: "Audit",
        href: "/cadets/audit",
        icon: ShieldCheck,
        keywords: ["qualifications", "medical", "dietary"],
      },
      { label: "Leaving Process", href: "/cadets/leaving", icon: UserMinus },
    ],
  },
  {
    label: "Marking Sheets",
    items: [
      { label: "Inspection", href: "/assessments/inspection", icon: Shirt },
      { label: "Leadership", href: "/assessments/leadership", icon: Star },
      { label: "Radio", href: "/assessments/radio", icon: Radio },
      { label: "MOI", href: "/assessments/moi", icon: BookOpen, keywords: ["method of instruction"] },
    ],
  },
  {
    label: "NCO Team",
    items: [
      { label: "Session Plans", href: "/session-plans", icon: ClipboardList },
      { label: "Holidays", href: "/nco-holidays", icon: CalendarOff, keywords: ["nco holidays", "leave"] },
      // Staff-only (see lib/access.ts); the NCO gets their copy by email.
      { label: "Appraisals", href: "/nco-appraisals", icon: UserCheck, keywords: ["nco appraisals"] },
      { label: "Comments", href: "/nco-comments", icon: MessageSquare, keywords: ["nco comments", "notes"] },
      { label: "Attendance", href: "/attendance/ncos", icon: CalendarCheck, keywords: ["nco attendance"] },
    ],
  },
  {
    label: "Stores",
    items: [
      {
        kind: "group",
        label: "Uniform",
        icon: Package,
        links: [
          {
            label: "Stock",
            href: "/stores/uniform/stock",
            icon: Package,
            keywords: ["uniform stock", "shelves", "boxes"],
          },
          {
            label: "Orders",
            href: "/stores/uniform/orders",
            icon: ShoppingCart,
            keywords: ["uniform orders", "kitting"],
          },
        ],
      },
      {
        kind: "group",
        label: "Badges",
        icon: Award,
        links: [
          {
            label: "Stock",
            href: "/stores/badges/stock",
            icon: Award,
            keywords: ["badge stock", "badge grid"],
          },
          { label: "Orders", href: "/stores/badges/orders", icon: ShoppingCart, keywords: ["badge orders"] },
        ],
      },
    ],
  },
  {
    label: "Comms",
    items: [
      {
        label: "Parade Night Texts",
        href: "/texts/messages",
        icon: MessageSquareText,
        keywords: ["sms", "messages"],
      },
      { label: "Text Recipients", href: "/texts/recipients", icon: Contact, keywords: ["phone numbers"] },
      {
        label: "Programme",
        href: "/tools/programme-updater",
        icon: Calendar,
        keywords: ["website", "publish"],
      },
      { label: "Newsletter", href: "/tools/newsletter-updater", icon: Newspaper, keywords: ["website"] },
    ],
  },
  {
    label: "Squadron",
    items: [
      { label: "Staff", href: "/staff/overview", icon: UserCog },
      {
        label: "Attendance",
        href: "/attendance",
        icon: CalendarCheck,
        keywords: ["parade nights", "turnout"],
      },
      {
        label: "Committee Requests",
        href: "/committee/requests",
        icon: ReceiptText,
        keywords: ["purchase", "civcom"],
      },
      {
        label: "JI / AO Generator",
        href: "/tools/ji-ao-generator",
        icon: FileText,
        keywords: ["joining instructions", "admin order"],
      },
      {
        kind: "group",
        label: "Travel Claims",
        icon: ReceiptText,
        links: [
          {
            label: "F1771e",
            href: "/form-generators/f1771e",
            icon: ReceiptText,
            keywords: ["travel claim", "expenses"],
          },
          {
            label: "HTD",
            href: "/form-generators/htd",
            icon: ReceiptText,
            keywords: ["home to duty", "7101"],
          },
        ],
      },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Bader Scrapers", href: "/tools/scraper", icon: DatabaseZap, keywords: ["sync", "import"] },
      { label: "Backups", href: "/backups", icon: DatabaseBackup, ownerOnly: true },
      { label: "API Logs", href: "/api-logs", icon: ScrollText, ownerOnly: true },
    ],
  },
];

export function isGroup(item: NavItem): item is NavGroup {
  return item.kind === "group";
}

export function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.links.some((l) => isLinkActive(pathname, l.href));
}

/** The sections a signed-in user should see, with every link they can't reach removed. */
export function visibleSections(role: string | undefined, email: string | undefined): NavSection[] {
  const isOwner = (email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();
  const oc = isOc(email);
  const canSee = (item: { ownerOnly?: boolean; ocOnly?: boolean }) =>
    (!item.ownerOnly || isOwner) && (!item.ocOnly || oc);
  const keepLink = (l: NavLink) => canSee(l) && canAccess(role, l.href);

  return NAV_SECTIONS.filter(canSee)
    .map((section) => ({
      ...section,
      items: section.items.flatMap<NavItem>((item) => {
        if (isGroup(item)) {
          const links = item.links.filter(keepLink);
          return links.length ? [{ ...item, links }] : [];
        }
        return keepLink(item) ? [item] : [];
      }),
    }))
    .filter((s) => s.items.length > 0);
}

/** Every reachable link flattened, with the section/group path it lives under — for the palette. */
export function flattenLinks(sections: NavSection[]): Array<NavLink & { path: string[] }> {
  return sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const base = section.label ? [section.label] : [];
      if (isGroup(item)) return item.links.map((l) => ({ ...l, path: [...base, item.label] }));
      return [{ ...item, path: base }];
    })
  );
}

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail for the header, from the deepest nav link that matches the
 * current path. Pages deeper than any nav link (e.g. /cadets/1234) get the
 * nearest ancestor and a trailing "…" the page itself replaces with a title.
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  let best: { crumbs: Crumb[]; len: number } | null = null;
  for (const link of flattenLinks(NAV_SECTIONS)) {
    if (!isLinkActive(pathname, link.href) || link.href.length <= (best?.len ?? -1)) continue;
    const crumbs: Crumb[] = [
      ...link.path.map((label) => ({ label })),
      { label: link.label, href: link.href },
    ];
    best = { crumbs, len: link.href.length };
  }
  if (!best) return [];
  const exact = best.crumbs[best.crumbs.length - 1].href === pathname;
  return exact ? best.crumbs.map((c, i, a) => (i === a.length - 1 ? { label: c.label } : c)) : best.crumbs;
}
