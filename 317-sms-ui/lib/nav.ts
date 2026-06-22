import {
  FileText,
  Calendar,
  Settings,
  Users,
  LayoutDashboard,
  Newspaper,
  UserCog,
  DatabaseZap,
  ReceiptText,
  ScrollText,
  ClipboardCheck,
  MessageSquareText,
  Package,
} from "lucide-react";
import { OWNER_EMAIL } from "@/lib/config";

export type NavLink = {
  label: string;
  href: string;
  icon: React.ElementType;
  staffOnly?: boolean;
  ownerOnly?: boolean;
  /** Highlight this link as active for any route under this prefix. */
  activePrefix?: string;
  /** Keywords to help the command palette match this destination. */
  keywords?: string[];
};

export type NavSection = {
  label?: string;
  staffOnly?: boolean;
  ownerOnly?: boolean;
  links: NavLink[];
};

// Consolidated navigation — the Cadets, Assessment Sheets, Stores and Texts
// groups each collapse to a single entry that opens a tabbed hub page.
export const NAV_SECTIONS: NavSection[] = [
  {
    links: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      {
        label: "Cadets",
        href: "/cadets/assessments",
        icon: Users,
        activePrefix: "/cadets",
        keywords: ["overview", "assessments", "events", "audit", "medical"],
      },
      {
        label: "Assessment Sheets",
        href: "/assessments/leadership",
        icon: ClipboardCheck,
        activePrefix: "/assessments",
        keywords: ["leadership", "first aid", "radio", "moi"],
      },
      {
        label: "Stores",
        href: "/stores/uniform/stock",
        icon: Package,
        activePrefix: "/stores",
        staffOnly: true,
        keywords: ["uniform", "badges", "stock", "orders", "inventory"],
      },
      {
        label: "Texts",
        href: "/texts/messages",
        icon: MessageSquareText,
        activePrefix: "/texts",
        staffOnly: true,
        keywords: ["messages", "recipients", "sms"],
      },
    ],
  },
  {
    label: "Tools",
    staffOnly: true,
    links: [
      { label: "JI/AO Generator", href: "/tools/ji-ao-generator", icon: FileText },
      { label: "Bader Scrapers", href: "/tools/scraper", icon: DatabaseZap },
      { label: "Programme", href: "/tools/programme-updater", icon: Calendar },
      { label: "Newsletter", href: "/tools/newsletter-updater", icon: Newspaper },
      { label: "F1771e Claim", href: "/form-generators/f1771e", icon: ReceiptText },
    ],
  },
  {
    label: "Squadron",
    links: [
      { label: "Staff", href: "/staff/overview", icon: UserCog, staffOnly: true },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
  {
    label: "Developer",
    ownerOnly: true,
    links: [{ label: "API Logs", href: "/api-logs", icon: ScrollText, ownerOnly: true }],
  },
];

export function canSee(
  item: { staffOnly?: boolean; ownerOnly?: boolean },
  role: string | undefined,
  email: string | undefined
): boolean {
  const isOwner = (email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();
  return (!item.ownerOnly || isOwner) && (!item.staffOnly || role === "staff");
}

export function visibleSections(role: string | undefined, email: string | undefined): NavSection[] {
  return NAV_SECTIONS.filter((s) => canSee(s, role, email))
    .map((s) => ({ ...s, links: s.links.filter((l) => canSee(l, role, email)) }))
    .filter((s) => s.links.length > 0);
}

export function isLinkActive(pathname: string, link: Pick<NavLink, "href" | "activePrefix">): boolean {
  const target = link.activePrefix ?? link.href;
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(target + "/");
}

/** Page title for the header, from the deepest matching nav link. */
export function currentPageTitle(pathname: string): string | null {
  let best: { label: string; len: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const link of section.links) {
      const target = link.activePrefix ?? link.href;
      if (isLinkActive(pathname, link) && target.length > (best?.len ?? -1)) {
        best = {
          label: section.label ? `${section.label} · ${link.label}` : link.label,
          len: target.length,
        };
      }
    }
  }
  return best?.label ?? null;
}
