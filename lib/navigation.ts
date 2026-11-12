import type { LucideIcon } from "lucide-react";
import {
  Award,
  BadgeCheck,
  BookOpen,
  Bot,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Car,
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
  Globe,
  GraduationCap,
  History,
  House,
  Images,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  Newspaper,
  NotebookPen,
  Orbit,
  Package,
  Plane,
  QrCode,
  Radio,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShieldUser,
  Shirt,
  ShoppingCart,
  SquareUser,
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
  /** Its own icon in the sidebar and on a phone's hub; the area's when not set. */
  icon?: LucideIcon;
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
          {
            label: "Ask",
            href: "/assistant",
            icon: Bot,
            keywords: ["ai", "ask", "chat", "question", "who", "find"],
          },
          {
            label: "Documents",
            href: "/tools/docs-assistant",
            icon: FileSearch,
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
          { label: "Events", href: "/cadets/events", icon: Calendar, keywords: ["bader events", "banned"] },
          {
            label: "Flying paperwork",
            href: "/cadets/flying",
            icon: Plane,
            keywords: ["aef", "gliding", "tg21", "tg23", "av med"],
          },
          {
            label: "JI / AO",
            href: "/tools/ji-ao-generator",
            icon: FileText,
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
            icon: CalendarDays,
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
            icon: BookOpen,
            keywords: ["theory progress", "catch-ups", "missed lessons", "record a lesson"],
          },
          {
            label: "Tasks & kit",
            href: "/training/tasks",
            icon: ListChecks,
            keywords: ["task bank", "kit list"],
          },
          {
            label: "Setup",
            href: "/training/setup",
            icon: QrCode,
            keywords: ["qr codes", "lesson qr", "programme links"],
          },
        ],
      }),
      area({
        label: "Assessments",
        icon: ClipboardCheck,
        tabs: [
          { label: "Leadership", href: "/assessments/leadership", icon: Star, keywords: ["marking sheet"] },
          { label: "Radio", href: "/assessments/radio", icon: Radio, keywords: ["marking sheet"] },
          {
            label: "Space",
            href: "/assessments/space",
            icon: Orbit,
            keywords: ["blue space", "workbook", "marking sheet"],
          },
          {
            label: "MOI",
            href: "/assessments/moi",
            icon: BookOpen,
            keywords: ["method of instruction", "marking sheet"],
          },
          {
            label: "Results",
            href: "/cadets/assessments",
            icon: ClipboardCheck,
            keywords: ["cadet assessments", "upload to sms", "pdf"],
          },
        ],
      }),
      area({
        label: "Inspections",
        icon: Shirt,
        tabs: [
          {
            label: "Mark",
            href: "/assessments/inspection",
            icon: Shirt,
            keywords: ["inspection marking sheet"],
          },
          {
            label: "History",
            href: "/cadets/inspections",
            icon: History,
            keywords: ["inspection history", "leaderboard", "analysis"],
          },
        ],
      }),
      area({
        label: "Attendance",
        icon: CalendarCheck,
        tabs: [
          {
            label: "Squadron",
            href: "/attendance",
            icon: CalendarCheck,
            exact: true,
            keywords: ["parade nights", "turnout"],
          },
          {
            label: "NCOs",
            href: "/attendance/ncos",
            icon: UserCheck,
            keywords: ["per nco", "nco attendance"],
          },
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
          { label: "Appraisals", href: "/nco-appraisals", icon: UserCheck, keywords: ["nco appraisals"] },
          {
            label: "Staff notes",
            href: "/nco-notes",
            icon: MessageSquareText,
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
        label: "Uniform",
        icon: Package,
        tabs: [
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
            keywords: ["uniform orders", "kitting", "logs form"],
          },
          {
            label: "Insights",
            href: "/stores/uniform/insights",
            icon: ChartColumn,
            keywords: ["popular sizes", "what to order", "low stock", "unused stock", "reorder"],
          },
        ],
      }),
      area({
        label: "Badges",
        icon: Award,
        tabs: [
          {
            label: "Stock",
            href: "/stores/badges/stock",
            icon: Award,
            keywords: ["badge stock", "badge grid"],
          },
          {
            label: "Orders",
            href: "/stores/badges/orders",
            icon: ShoppingCart,
            keywords: ["badge orders", "order list"],
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
          {
            label: "Messages",
            href: "/texts/messages",
            icon: MessageSquareText,
            keywords: ["parade night texts", "sms"],
          },
          {
            label: "Recipients",
            href: "/texts/recipients",
            icon: Contact,
            keywords: ["text recipients", "phone numbers"],
          },
        ],
      }),
      area({
        label: "Website",
        icon: Globe,
        tabs: [
          {
            label: "Programme",
            href: "/tools/programme-updater",
            icon: Calendar,
            keywords: ["publish", "monthly programme"],
          },
          {
            label: "Newsletters",
            href: "/tools/newsletter-updater",
            icon: Newspaper,
            keywords: ["newsletter"],
          },
          { label: "Gallery", href: "/tools/gallery-updater", icon: Images, keywords: ["photos"] },
          {
            label: "Staff & NCO Photos",
            href: "/tools/website-people",
            icon: SquareUser,
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
            label: "Adult staff",
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
          {
            label: "F1771e",
            href: "/form-generators/f1771e",
            icon: ReceiptText,
            keywords: ["travel claim", "expenses"],
          },
          { label: "HTD", href: "/form-generators/htd", icon: Car, keywords: ["home to duty", "7101"] },
        ],
      }),
      area({
        label: "OC",
        icon: ShieldUser,
        ocOnly: true,
        tabs: [
          {
            label: "Dashboard",
            href: "/oc",
            icon: LayoutDashboard,
            exact: true,
            ocOnly: true,
            keywords: ["oc dashboard"],
          },
          {
            label: "Custom",
            href: "/oc/custom",
            icon: LayoutGrid,
            ocOnly: true,
            keywords: ["custom dashboard", "grafana", "panels", "query", "charts", "build your own"],
          },
          {
            label: "Leaving",
            href: "/oc/leaving",
            icon: UserMinus,
            ocOnly: true,
            keywords: ["leaving process", "leavers", "lapsed cadets", "parent emails"],
          },
          {
            label: "Staff",
            href: "/staff/overview",
            icon: UserCog,
            ocOnly: true,
            keywords: ["cfav", "adults"],
          },
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
 * The bottom bar on a phone holds sections, not pages. Tapping one opens its
 * hub (`/m/<section>`): a list of every page in it, big enough for a thumb.
 * A page inside has a back link to its hub, so moving around a section is
 * hub → page → back, with no tab rows on the pages themselves. "More" is the
 * hub for every section that isn't on the bar.
 *
 * Staff's sections are the ones they use most (prod's Usage_Daily, Oct-Nov
 * 2026: cadets, then stores) plus Parade Night for the door and the sheets.
 * NCOs and SNCOs only reach Parade Night and NCO Team, so those are theirs.
 */
export type MobileTab = { label: string; href: string; icon: LucideIcon; sections: string[] };

export const MORE_HREF = "/m/more";

/** A section's hub address part: "Parade Night" → "parade-night". */
export function sectionSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function hubHref(sectionLabel: string): string {
  return `/m/${sectionSlug(sectionLabel)}`;
}

function sectionTab(label: string, icon: LucideIcon): MobileTab {
  return { label, href: hubHref(label), icon, sections: [label] };
}

const HOME: MobileTab = { label: "Home", href: "/", icon: House, sections: [] };
const PARADE_NIGHT = sectionTab("Parade Night", ScanLine);

const MOBILE_TABS: Record<"staff" | "snco" | "nco", MobileTab[]> = {
  staff: [HOME, sectionTab("Cadets", Users), PARADE_NIGHT, sectionTab("Stores", Package)],
  snco: [HOME, PARADE_NIGHT, sectionTab("NCO Team", ClipboardList)],
  nco: [HOME, PARADE_NIGHT, sectionTab("NCO Team", ClipboardList)],
};

/** The tabs for a role, minus any it can't reach (the same rule as the sidebar). */
export function mobileTabsFor(role: string | undefined): MobileTab[] {
  return MOBILE_TABS[role as keyof typeof MOBILE_TABS] ?? [HOME];
}

/**
 * The label of the section a page lives in: "Stores" for /stores/badges/orders
 * or a box below it, "Cadets" for a cadet's record, "" for a top-level page
 * (Stats, Settings), and null for Home, a hub, or a page the map doesn't know.
 */
export function sectionFor(pathname: string): string | null {
  if (pathname === "/" || pathname.startsWith("/m/")) return null;
  const crumbs = breadcrumbsFor(pathname);
  if (!crumbs.length) return null;
  const labels = NAV_SECTIONS.flatMap((s) => (s.label ? [s.label] : []));
  return labels.includes(crumbs[0].label) ? crumbs[0].label : "";
}

/**
 * Which bar tab the current page belongs to: its hub, or a page in its
 * section. Null means More (a section that isn't on the bar) or nowhere.
 */
export function activeMobileTab(pathname: string, tabs: MobileTab[]): MobileTab | null {
  const exact = tabs.find((t) => t.href === pathname);
  if (exact) return exact;
  const section = sectionFor(pathname);
  if (section === null) return null;
  return tabs.find((t) => t.sections.includes(section)) ?? null;
}

/** Where a page's back link on a phone goes: its section's hub, or More. Null on Home and the hubs. */
export function mobileHubFor(
  pathname: string,
  role: string | undefined
): { label: string; href: string } | null {
  const section = sectionFor(pathname);
  if (section === null) return null;
  const tab = mobileTabsFor(role).find((t) => t.sections.includes(section));
  return tab ? { label: tab.label, href: tab.href } : { label: "More", href: MORE_HREF };
}

/** The sections a hub lists, already filtered to what the user can reach. */
export function hubSections(
  slug: string,
  role: string | undefined,
  visible: NavSection[]
): { label: string; sections: NavSection[] } | null {
  if (slug === "more") {
    const onBar = new Set(mobileTabsFor(role).flatMap((t) => t.sections));
    const sections = visible
      .filter((s) => !onBar.has(s.label ?? ""))
      // The top block's Home is on the bar already.
      .map((s) => (s.label ? s : { ...s, items: s.items.filter((i) => i.href !== "/") }))
      .filter((s) => s.items.length > 0);
    return { label: "More", sections };
  }
  const section = visible.find((s) => s.label && sectionSlug(s.label) === slug);
  return section ? { label: section.label!, sections: [section] } : null;
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
