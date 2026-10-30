import type { LucideIcon } from "lucide-react";
import {
  Award,
  BadgeCheck,
  Bot,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ChartColumn,
  ChartLine,
  ChartNoAxesColumn,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DatabaseBackup,
  DatabaseZap,
  FileCheck,
  FileSearch,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  MessageSquareText,
  NotebookPen,
  Images,
  Newspaper,
  Orbit,
  Package,
  Plane,
  Radio,
  ReceiptText,
  Shirt,
  ShieldCheck,
  ShieldUser,
  ShoppingCart,
  Star,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserRoundPlus,
  Users,
} from "lucide-react";

import { canAccess } from "@/lib/access";
import { OWNER_EMAIL } from "@/lib/config";

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
  /** Highlight only on this exact path — for a group's landing page (/oc)
   *  whose siblings (/oc/leaving) live underneath it. */
  exact?: boolean;
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
      {
        label: "Squadron Stats",
        href: "/stats",
        icon: ChartLine,
        keywords: ["badge progression", "trends", "strength", "expiring"],
      },
      // Staff-only: lib/access.ts doesn't list it for NCOs, and the API requires staff.
      {
        label: "Assistant",
        href: "/assistant",
        icon: Bot,
        keywords: ["ai", "ask", "chat", "question", "who", "find"],
      },
      {
        kind: "group",
        label: "OC",
        icon: ShieldUser,
        links: [
          {
            label: "Dashboard",
            href: "/oc",
            icon: ShieldUser,
            ocOnly: true,
            exact: true,
            keywords: ["oc dashboard"],
          },
          {
            label: "Custom Dashboard",
            href: "/oc/custom",
            icon: LayoutGrid,
            ocOnly: true,
            keywords: ["grafana", "panels", "query", "charts", "build your own"],
          },
          {
            label: "Leaving Process",
            href: "/oc/leaving",
            icon: UserMinus,
            ocOnly: true,
            keywords: ["leavers", "lapsed cadets", "parent emails"],
          },
          {
            label: "Staff",
            href: "/staff/overview",
            icon: UserCog,
            ocOnly: true,
            keywords: ["cfav", "adults"],
          },
        ],
      },
    ],
  },
  {
    label: "Cadets",
    items: [
      { label: "Overview", href: "/cadets/overview", icon: Users, keywords: ["cadet list", "roll"] },
      // Staff-only (see lib/access.ts): parents' and medical details.
      {
        label: "Recruits",
        href: "/recruits",
        icon: UserPlus,
        keywords: ["joining form", "new cadets", "3822a", "3822h", "consent", "health declaration", "enrol"],
      },
      { label: "Assessments", href: "/cadets/assessments", icon: ClipboardCheck, keywords: ["results"] },
      { label: "Inspections", href: "/cadets/inspections", icon: Shirt, keywords: ["inspection history"] },
      {
        label: "Classifications",
        href: "/cadets/classifications",
        icon: GraduationCap,
        keywords: ["exams", "lesson plan", "theory", "classification day", "qr code", "lessons"],
      },
      { label: "Events", href: "/cadets/events", icon: Calendar },
      // Staff-only (see lib/access.ts).
      {
        label: "DofE Activity Logs",
        href: "/cadets/activity-logs",
        icon: NotebookPen,
        keywords: ["dofe", "duke of edinburgh", "volunteering", "skills", "physical", "weekly log"],
      },
      {
        label: "Flying Paperwork",
        href: "/cadets/flying",
        icon: Plane,
        keywords: ["aef", "gliding", "tg21", "tg23", "av med"],
      },
      {
        label: "Audit",
        href: "/cadets/audit",
        icon: ShieldCheck,
        keywords: ["qualifications", "medical", "dietary", "wht", "weapon handling", "l98a2", "scorpion"],
      },
    ],
  },
  {
    label: "Marking Sheets",
    items: [
      { label: "Inspection", href: "/assessments/inspection", icon: Shirt },
      { label: "Leadership", href: "/assessments/leadership", icon: Star },
      { label: "Radio", href: "/assessments/radio", icon: Radio },
      { label: "Space", href: "/assessments/space", icon: Orbit, keywords: ["blue space", "workbook"] },
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
      // Per-NCO attendance isn't listed here; it's reached from the Squadron
      // attendance page's "Per NCO" button.
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
          {
            label: "Insights",
            href: "/stores/uniform/insights",
            icon: ChartColumn,
            keywords: ["popular sizes", "what to order", "low stock", "unused stock", "reorder"],
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
      { label: "Gallery", href: "/tools/gallery-updater", icon: Images, keywords: ["website", "photos"] },
    ],
  },
  {
    label: "Squadron",
    items: [
      // Staff-only (see lib/access.ts), as the API requires.
      {
        kind: "group",
        label: "Applications",
        icon: FileCheck,
        links: [
          {
            label: "Staff Cadets",
            href: "/applications/staff-cadets",
            icon: BadgeCheck,
            keywords: [
              "staff cadet application",
              "pi501",
              "18th birthday",
              "bpss",
              "dbs",
              "5-01",
              "turning 18",
            ],
          },
          {
            label: "Adult Staff",
            href: "/applications/adult-staff",
            icon: UserRoundPlus,
            keywords: [
              "uniformed staff",
              "cfav application",
              "snco",
              "cfc",
              "officer",
              "wing board",
              "1-10",
              "cic",
            ],
          },
        ],
      },
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
      // Staff-only: lib/access.ts doesn't list it for NCOs, and the API requires staff.
      {
        label: "Docs Assistant",
        href: "/tools/docs-assistant",
        icon: FileSearch,
        keywords: ["ai", "chatbot", "rafac documents", "policy", "acp", "jsp", "sharepoint"],
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
      {
        label: "Usage",
        href: "/usage",
        icon: ChartNoAxesColumn,
        ownerOnly: true,
        keywords: ["analytics", "stats"],
      },
    ],
  },
];

/**
 * The bottom tab bar on a phone: the few places each role goes on parade
 * night, one thumb-tap away. Everything else stays in the sidebar, which the
 * bar's "More" tab opens. `match` widens what lights the tab up (any page under
 * /stores lights "Orders"); the longest match wins, so an NCO on
 * /cadets/assessments sees "Results", not nothing.
 */
export type MobileTab = { label: string; href: string; icon: LucideIcon; match: string[] };

const HOME: MobileTab = { label: "Home", href: "/", icon: LayoutDashboard, match: [] };

const MOBILE_TABS: Record<"staff" | "snco" | "nco", MobileTab[]> = {
  staff: [
    HOME,
    { label: "Cadets", href: "/cadets/overview", icon: Users, match: ["/cadets", "/recruits"] },
    { label: "Marking", href: "/assessments/inspection", icon: ClipboardCheck, match: ["/assessments"] },
    { label: "Orders", href: "/stores/uniform/orders", icon: ShoppingCart, match: ["/stores"] },
  ],
  // SNCOs run inspections, so the marking tab opens on that sheet.
  snco: [
    HOME,
    { label: "Marking", href: "/assessments/inspection", icon: ClipboardCheck, match: ["/assessments"] },
    { label: "Plans", href: "/session-plans", icon: ClipboardList, match: ["/session-plans"] },
    { label: "Results", href: "/cadets/assessments", icon: Award, match: ["/cadets/assessments"] },
  ],
  nco: [
    HOME,
    { label: "Marking", href: "/assessments/leadership", icon: ClipboardCheck, match: ["/assessments"] },
    { label: "Plans", href: "/session-plans", icon: ClipboardList, match: ["/session-plans"] },
    { label: "Results", href: "/cadets/assessments", icon: Award, match: ["/cadets/assessments"] },
  ],
};

/** The tabs for a role, minus any it can't reach (the same rule as the sidebar). */
export function mobileTabsFor(role: string | undefined): MobileTab[] {
  const tabs = MOBILE_TABS[role as keyof typeof MOBILE_TABS] ?? [HOME];
  return tabs.filter((t) => canAccess(role, t.href));
}

/** Which tab the current page belongs to, or null (the page lives under "More"). */
export function activeMobileTab(pathname: string, tabs: MobileTab[]): MobileTab | null {
  let best: { tab: MobileTab; len: number } | null = null;
  for (const tab of tabs) {
    for (const prefix of [tab.href, ...tab.match]) {
      if (!isLinkActive(pathname, prefix)) continue;
      if (!best || prefix.length > best.len) best = { tab, len: prefix.length };
    }
  }
  return best?.tab ?? null;
}

export function isGroup(item: NavItem): item is NavGroup {
  return item.kind === "group";
}

export function isLinkActive(pathname: string, href: string, exact = false): boolean {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.links.some((l) => isLinkActive(pathname, l.href));
}

/** The sections a signed-in user should see, with every link they can't reach removed. */
export function visibleSections(
  role: string | undefined,
  email: string | undefined,
  oc = false
): NavSection[] {
  const isOwner = (email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();
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

/** Pages reachable only from menus (not the sidebar), so the trail still names them. */
const UNLISTED_PAGES: Record<string, string> = {
  "/settings": "Settings",
};

/**
 * Record pages that live beside their list rather than under it (/cadets/1234
 * next to /cadets/overview), so prefix matching alone finds no trail for them.
 */
const DETAIL_PARENTS: Array<[prefix: string, listHref: string]> = [
  ["/cadets/", "/cadets/overview"],
  ["/staff/", "/staff/overview"],
];

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
  if (!best) {
    const label = UNLISTED_PAGES[pathname];
    if (label) return [{ label }];
    const parent = DETAIL_PARENTS.find(([prefix]) => pathname.startsWith(prefix));
    // Recurse on the list page; with a trailing segment it comes back linked.
    return parent ? breadcrumbsFor(`${parent[1]}/_`) : [];
  }
  const exact = best.crumbs[best.crumbs.length - 1].href === pathname;
  return exact ? best.crumbs.map((c, i, a) => (i === a.length - 1 ? { label: c.label } : c)) : best.crumbs;
}
