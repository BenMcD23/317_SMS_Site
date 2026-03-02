"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  FileText,
  MessageSquare,
  Calendar,
  Settings,
  Users,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  ClipboardList,
  Shield,
  Radio,
  HeartPulse,
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type NavChild = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavItem =
  | { label: string; href: string; icon: React.ElementType; children?: never }
  | { label: string; href?: never; icon: React.ElementType; children: NavChild[] };

// ─── Nav structure ────────────────────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Tools",
    icon: FileText,
    children: [
      { label: "JI/AO Generator", href: "/ji-ao-generator", icon: FileText },
      { label: "SMS Scraper", href: "/scraper", icon: MessageSquare },
      { label: "Programme Updater", href: "/programme-updater", icon: Calendar },
    ],
  },
  {
    label: "Assessment Sheets",
    icon: ClipboardList,
    children: [
      { label: "Leadership", href: "/assessments/leadership", icon: Star },
      { label: "First Aid", href: "/assessments/first-aid", icon: HeartPulse },
      { label: "Radio", href: "/assessments/radio", icon: Radio },
    ],
  },
  {
    label: "Cadets",
    icon: Users,
    children: [
      { label: "Cadet Overview", href: "/cadets/overview", icon: Users },
      { label: "Event List", href: "/cadets/events", icon: Calendar },
    ],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

// ─── NavItem component ────────────────────────────────────────────────────────
function NavItemComponent({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hasChildren = !!item.children?.length;
  const Icon = item.icon;

  // Auto-open group if a child is active
  const isChildActive = item.children?.some((c) => pathname === c.href) ?? false;
  const isActive = !hasChildren && item.href ? pathname === item.href : false;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isChildActive
              ? "text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {open || isChildActive ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        {(open || isChildActive) && (
          <div className="ml-4 mt-1 space-y-1 border-l pl-3">
            {item.children!.map((child) => {
              const ChildIcon = child.icon;
              const childActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    childActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <ChildIcon className="h-4 w-4 shrink-0" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href!}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar() {
  const { data: session } = useSession();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-background">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <Shield className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold tracking-tight">317 SMS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavItemComponent key={item.href ?? item.label} item={item} />
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t px-4 py-3">
        {session?.user && (
          <p className="mb-2 truncate text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{session.user.name}</span>
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-muted/30 p-8">
        {children}
      </main>
    </div>
  );
}