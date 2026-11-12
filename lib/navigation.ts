import type { LucideIcon } from "lucide-react";
import {
  Award,
  Bot,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ChartLine,
  ChartNoAxesColumn,
  ClipboardCheck,
  ClipboardList,
  DatabaseBackup,
  DatabaseZap,
  FileCheck,
  Globe,
  GraduationCap,
  House,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  NotebookPen,
  Package,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShieldUser,
  Shirt,
  ShoppingCart,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { canAccess } from "@/lib/access";
import { OWNER_EMAIL } from "@/lib/config";

/**
 * The site map: what the sidebar shows, what the header breadcrumbs say, what
 * the tab row at the top of a page offers, and what the ⌘K palette searches.
 * One definition so those never disagree.
 *
 * The sidebar lists areas, one row per job ("Orders", "Texts"). An area whose
 * job spans several pages lists them as `tabs`: the sidebar row opens the first
 * one the user can reach, and `PageHeader` puts the tab row under the title of
 * every page in it. That keeps the menu short without losing a page.
 *
 * Role gating is not repeated here. A link or tab is shown when `canAccess`
 * (the same rule the middleware enforces) says the role can reach it, so
 * nothing is ever listed that would bounce to /unauthorized. `ownerOnly` /
 * `ocOnly` are the two cosmetic gates for pages whose real enforcement is on
 * the API.
 */

type Gates = {
  ownerOnly?: boolean;
  ocOnly?: boolean;
};

export type NavTab = Gates & {
  label: string;
  href: string;
  /** Light up only on this exact path: for an area's index page, whose siblings live under it. */
  exact?: boolean;
  /** Extra words the palette should match, e.g. old names people still use. */
  keywords?: string[];
};

export type NavLink = Gates & {
  label: string;
  /** Where the sidebar row goes. For an area with tabs, the first tab the user can reach. */
  href: string;
  icon: LucideIcon;
  keywords?: string[];
  exact?: boolean;
  /** The pages of an area, shown as a tab row at the top of each of them. */
  tabs?: NavTab[];
};

export type NavSection = Gates & {
  label?: string;
  items: NavLink[];
};

/** An area: its first tab is where its sidebar row goes. */
function area(link: Omit<NavLink, "href"> & { tabs: NavTab[] }): NavLink {
  return { ...link, href: link.tabs[0].href };
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Home", href: "/", icon: House, keywords: ["dashboard", "today"] },
      {
        label: "Stats",
        href: "/stats",
        icon: ChartLine,
        keywords: ["squadron stats", "badge progression", "trends", "strength", "expiring"],
      },
      // Staff-only: lib/access.ts doesn't list either for NCOs, and the API requires staff.
      area({
        label: "Assistant",
        icon: Bot,
        tabs: [
          { label: "Ask", href: "/assistant", keywords: ["ai", "ask", "chat", "question", "who", "find"] },
          {
            label: "Documents",
            href: "/tools/docs-assistant",
            keywords: ["docs assistant", "rafac documents", "policy", "acp", "jsp", "sharepoint"],
          },
        ],
      }),
    ],
  },
  {
    label: "Cadets",
    items: [
      {
        label: "Cadets",
        href: "/cadets/overview",
        icon: Users,
        keywords: ["overview", "cadet list", "roll"],
      },
      // Staff-only (see lib/access.ts): parents' and medical details.
      {
        label: "Recruits",
        href: "/recruits",
        icon: UserPlus,
        keywords: ["joining form", "new cadets", "3822a", "3822h", "consent", "health declaration", "enrol"],
      },
      area({
        label: "Events",
        icon: Calendar,
        tabs: [
          { label: "Events", href: "/cadets/events", keywords: ["bader events", "banned"] },
          {
            label: "Flying paperwork",
            href: "/cadets/flying",
            keywords: ["aef", "gliding", "tg21", "tg23", "av med"],
          },
          {
            label: "JI / AO",
            href: "/tools/ji-ao-generator",
            keywords: ["joining instructions", "admin order", "generator"],
          },
        ],
      }),
      {
        label: "DofE Activity Logs",
        href: "/cadets/activity-logs",
        icon: NotebookPen,
        keywords: ["dofe", "duke of edinburgh", "volunteering", "skills", "physical", "weekly log"],
      },
      {
        label: "Audit",
        href: "/cadets/audit",
        icon: ShieldCheck,
        keywords: [
          "cadet check",
          "event audit",
          "qualifications",
          "medical",
          "dietary",
          "wht",
          "weapon handling",
          "l98a2",
          "scorpion",
        ],
      },
    ],
  },
  {
    // What happens on the night, in the order it happens.
    label: "Parade Night",
    items: [
      {
        label: "Check-in",
        href: "/check-in",
        icon: ScanLine,
        keywords: ["door", "tonight", "who's in", "qr code", "nfc", "register", "head count"],
      },
      // Staff-only (see lib/access.ts).
      area({
        label: "Training",
        icon: GraduationCap,
        tabs: [
          {
            // Not exact: the classification and practical-session planners
            // (/training/classifications, /training/sessions) are part of
            // running tonight, so they light this tab. The other tabs are
            // deeper matches and win on their own pages.
            label: "Tonight",
            href: "/training",
            keywords: [
              "nights",
              "training night",
              "groups",
              "sessions",
              "classifications",
              "classification day",
              "exams",
              "lessons",
              "lesson plan",
              "session planner",
              "leadership tasks",
              "command tasks",
              "rotation",
              "stands",
            ],
          },
          {
            label: "Progress",
            href: "/training/progress",
            keywords: ["theory progress", "catch-ups", "missed lessons", "record a lesson"],
          },
          { label: "Tasks & kit", href: "/training/tasks", keywords: ["task bank", "kit list"] },
          { label: "Setup", href: "/training/setup", keywords: ["qr codes", "lesson qr", "programme links"] },
        ],
      }),
      area({
        label: "Assessments",
        icon: ClipboardCheck,
        tabs: [
          { label: "Leadership", href: "/assessments/leadership", keywords: ["marking sheet"] },
          { label: "Radio", href: "/assessments/radio", keywords: ["marking sheet"] },
          {
            label: "Space",
            href: "/assessments/space",
            keywords: ["blue space", "workbook", "marking sheet"],
          },
          { label: "MOI", href: "/assessments/moi", keywords: ["method of instruction", "marking sheet"] },
          {
            label: "Results",
            href: "/cadets/assessments",
            keywords: ["cadet assessments", "upload to sms", "pdf"],
          },
        ],
      }),
      area({
        label: "Inspections",
        icon: Shirt,
        tabs: [
          { label: "Mark", href: "/assessments/inspection", keywords: ["inspection marking sheet"] },
          {
            label: "History",
            href: "/cadets/inspections",
            keywords: ["inspection history", "leaderboard", "analysis"],
          },
        ],
      }),
      area({
        label: "Attendance",
        icon: CalendarCheck,
        tabs: [
          { label: "Squadron", href: "/attendance", exact: true, keywords: ["parade nights", "turnout"] },
          { label: "NCOs", href: "/attendance/ncos", keywords: ["per nco", "nco attendance"] },
        ],
      }),
    ],
  },
  {
    label: "NCO Team",
    items: [
      { label: "Session Plans", href: "/session-plans", icon: ClipboardList },
      { label: "Holidays", href: "/nco-holidays", icon: CalendarOff, keywords: ["nco holidays", "leave"] },
      // Staff-only (see lib/access.ts): the NCO gets their appraisal by email,
      // and the notes are staff's own, which the appraisals draw on.
      area({
        label: "Appraisals",
        icon: UserCheck,
        tabs: [
          { label: "Appraisals", href: "/nco-appraisals", keywords: ["nco appraisals"] },
          {
            label: "Staff notes",
            href: "/nco-notes",
            keywords: ["nco notes", "observations", "voice note", "appraisal notes"],
          },
        ],
      }),
      {
        label: "Cadet Comments",
        href: "/nco-comments",
        icon: MessageSquare,
        keywords: ["nco comments", "notes about cadets", "general"],
      },
    ],
  },
  {
    label: "Stores",
    items: [
      area({
        label: "Orders",
        icon: ShoppingCart,
        tabs: [
          {
            label: "Uniform",
            href: "/stores/uniform/orders",
            keywords: ["uniform orders", "kitting", "logs form"],
          },
          { label: "Badges", href: "/stores/badges/orders", keywords: ["badge orders", "order list"] },
        ],
      }),
      area({
        label: "Stock",
        icon: Package,
        tabs: [
          {
            label: "Uniform",
            href: "/stores/uniform/stock",
            keywords: ["uniform stock", "shelves", "boxes"],
          },
          { label: "Badges", href: "/stores/badges/stock", keywords: ["badge stock", "badge grid"] },
          {
            label: "Insights",
            href: "/stores/uniform/insights",
            keywords: ["popular sizes", "what to order", "low stock", "unused stock", "reorder"],
          },
        ],
      }),
      {
        label: "Catalogue",
        href: "/stores/catalogue",
        icon: ListChecks,
        keywords: [
          "sizes",
          "item types",
          "add item",
          "new badge",
          "badge categories",
          "low stock level",
          "retire",
        ],
      },
    ],
  },
  {
    label: "Comms",
    items: [
      area({
        label: "Texts",
        icon: MessageSquareText,
        tabs: [
          { label: "Messages", href: "/texts/messages", keywords: ["parade night texts", "sms"] },
          { label: "Recipients", href: "/texts/recipients", keywords: ["text recipients", "phone numbers"] },
        ],
      }),
      area({
        label: "Website",
        icon: Globe,
        tabs: [
          {
            label: "Programme",
            href: "/tools/programme-updater",
            keywords: ["publish", "monthly programme"],
          },
          { label: "Newsletters", href: "/tools/newsletter-updater", keywords: ["newsletter"] },
          { label: "Gallery", href: "/tools/gallery-updater", keywords: ["photos"] },
          {
            label: "Staff & NCO Photos",
            href: "/tools/website-people",
            keywords: ["photos", "our staff", "our ncos", "promotion"],
          },
        ],
      }),
    ],
  },
  {
    label: "Admin",
    items: [
      // Staff-only (see lib/access.ts), as the API requires.
      area({
        label: "Applications",
        icon: FileCheck,
        tabs: [
          {
            label: "Staff cadets",
            href: "/applications/staff-cadets",
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
            label: "Adult staff",
            href: "/applications/adult-staff",
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
      }),
      {
        label: "Committee Requests",
        href: "/committee/requests",
        icon: ReceiptText,
        keywords: ["purchase", "civcom", "committee"],
      },
      area({
        label: "Travel Claims",
        icon: ReceiptText,
        tabs: [
          { label: "F1771e", href: "/form-generators/f1771e", keywords: ["travel claim", "expenses"] },
          { label: "HTD", href: "/form-generators/htd", keywords: ["home to duty", "7101"] },
        ],
      }),
      area({
        label: "OC",
        icon: ShieldUser,
        ocOnly: true,
        tabs: [
          { label: "Dashboard", href: "/oc", exact: true, ocOnly: true, keywords: ["oc dashboard"] },
          {
            label: "Custom",
            href: "/oc/custom",
            ocOnly: true,
            keywords: ["custom dashboard", "grafana", "panels", "query", "charts", "build your own"],
          },
          {
            label: "Leaving",
            href: "/oc/leaving",
            ocOnly: true,
            keywords: ["leaving process", "leavers", "lapsed cadets", "parent emails"],
          },
          { label: "Staff", href: "/staff/overview", ocOnly: true, keywords: ["cfav", "adults"] },
        ],
      }),
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
 * The bottom tab bar on a phone: four places, one tap each, and "More" for the
 * full menu. Four fit a 390px phone at a thumb-sized width without scrolling;
 * the old strip of ten to twelve scrolled sideways, so most of it was hidden
 * and its labels were cut off.
 *
 * Staff's picks are their most used pages in prod's Usage_Daily (Oct-Nov
 * 2026): cadets, then stores, with Check-in up front because it's the door on
 * parade night. NCOs' are the parade-night jobs: the door, marking, plans.
 * `match` widens what lights a tab (a cadet's record lights "Cadets"); the
 * longest match wins.
 */
export type MobileTab = { label: string; href: string; icon: LucideIcon; match: string[] };

const HOME: MobileTab = { label: "Home", href: "/", icon: House, match: [] };
const CHECK_IN: MobileTab = { label: "Check-in", href: "/check-in", icon: ScanLine, match: [] };

// Shared by SNCOs and NCOs.
const NCO_TEAM: MobileTab[] = [
  HOME,
  CHECK_IN,
  {
    label: "Mark",
    href: "/assessments/leadership",
    icon: ClipboardCheck,
    match: ["/assessments", "/cadets/assessments"],
  },
  { label: "Plans", href: "/session-plans", icon: ClipboardList, match: [] },
];

const MOBILE_TABS: Record<"staff" | "snco" | "nco", MobileTab[]> = {
  staff: [
    HOME,
    { label: "Cadets", href: "/cadets/overview", icon: Users, match: ["/cadets", "/recruits"] },
    CHECK_IN,
    { label: "Stores", href: "/stores/uniform/orders", icon: Award, match: ["/stores"] },
  ],
  snco: NCO_TEAM,
  nco: NCO_TEAM,
};

/** The tabs for a role, minus any it can't reach (the same rule as the sidebar). */
export function mobileTabsFor(role: string | undefined): MobileTab[] {
  const tabs = MOBILE_TABS[role as keyof typeof MOBILE_TABS] ?? [HOME];
  return tabs.filter((t) => canAccess(role, t.href));
}

/** Which tab the current page belongs to, or null (it's only in the sidebar). */
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

export function isLinkActive(pathname: string, href: string, exact = false): boolean {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The tab of an area the path is on, if any. The deepest match wins, so
 * /attendance/ncos is "NCOs", not "Squadron".
 */
export function activeTab(pathname: string, tabs: NavTab[]): NavTab | null {
  let best: NavTab | null = null;
  for (const tab of tabs) {
    if (isLinkActive(pathname, tab.href, tab.exact) && (!best || tab.href.length > best.href.length))
      best = tab;
  }
  return best;
}

/** A sidebar row is current when the page is it, or any page of its area. */
export function isNavLinkActive(pathname: string, link: NavLink): boolean {
  return link.tabs ? activeTab(pathname, link.tabs) !== null : isLinkActive(pathname, link.href, link.exact);
}

/** The sections a signed-in user should see, with every link and tab they can't reach removed. */
export function visibleSections(
  role: string | undefined,
  email: string | undefined,
  oc = false
): NavSection[] {
  const isOwner = (email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();
  const canSee = (item: Gates) => (!item.ownerOnly || isOwner) && (!item.ocOnly || oc);
  const keepTab = (t: NavTab) => canSee(t) && canAccess(role, t.href);

  return NAV_SECTIONS.filter(canSee)
    .map((section) => ({
      ...section,
      items: section.items.flatMap<NavLink>((item) => {
        if (!canSee(item)) return [];
        if (!item.tabs) return canAccess(role, item.href) ? [item] : [];
        const tabs = item.tabs.filter(keepTab);
        // An area opens on the first of its pages the user can reach.
        return tabs.length ? [{ ...item, href: tabs[0].href, tabs }] : [];
      }),
    }))
    .filter((s) => s.items.length > 0);
}

export type FlatLink = NavTab & { icon: LucideIcon; path: string[] };

/**
 * Every reachable page flattened, with the section/area path it lives under:
 * for the palette and the breadcrumbs. An area contributes its tabs, not
 * itself, so each page appears once.
 */
export function flattenLinks(sections: NavSection[]): FlatLink[] {
  return sections.flatMap((section) =>
    section.items.flatMap((item): FlatLink[] => {
      const base = section.label ? [section.label] : [];
      if (!item.tabs) return [{ ...item, path: base }];
      return item.tabs.map((t) => ({
        ...t,
        icon: item.icon,
        path: [...base, item.label],
        keywords: [...(t.keywords ?? []), ...(item.keywords ?? [])],
      }));
    })
  );
}

/** The area a path belongs to, with only the tabs in `sections` (so the ones this user can reach). */
export function areaFor(pathname: string, sections: NavSection[]): NavLink | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.tabs && activeTab(pathname, item.tabs)) return item;
    }
  }
  return null;
}

/**
 * Things people come to the palette to *do*, not just places to go: each is a
 * page that starts the job. Gated by `canAccess` like everything else.
 */
export type QuickAction = { label: string; href: string; keywords: string[] };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New session plan", href: "/session-plans/new", keywords: ["write", "plan a lesson"] },
  {
    label: "New committee request",
    href: "/committee/requests/new",
    keywords: ["purchase", "buy", "civcom"],
  },
  { label: "New NCO appraisal", href: "/nco-appraisals/new", keywords: ["appraise"] },
  { label: "Book a holiday", href: "/nco-holidays", keywords: ["leave", "away"] },
  { label: "Record a lesson", href: "/training/progress", keywords: ["theory", "lesson had"] },
];

export function quickActionsFor(role: string | undefined): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => canAccess(role, a.href));
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
 * nearest ancestor, linked, as the way back.
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
