"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
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
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Sun,
  Moon,
  ClipboardCheck,
  WifiOff,
  AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type NavChild = {
  label: string;
  href: string;
  icon: React.ElementType;
  staffOnly?: boolean;
};

type NavItem =
  | { label: string; href: string; icon: React.ElementType; children?: never; staffOnly?: boolean }
  | { label: string; href?: never; icon: React.ElementType; children: NavChild[]; staffOnly?: boolean };

// ─── Nav structure ────────────────────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Tools",
    icon: FileText,
    staffOnly: true,
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
      { label: "Cadet Overview", href: "/cadets/overview", icon: Users, staffOnly: true },
      { label: "Cadet Assessment Sheets", href: "/cadets/assessments", icon: ClipboardCheck },
      { label: "Event List", href: "/cadets/events", icon: Calendar, staffOnly: true },
    ],
  },
  { label: "Settings", href: "/settings", icon: Settings },
];

function filterNavItems(items: NavItem[], role: string | undefined): NavItem[] {
  return items
    .filter((item) => role === "staff" || !item.staffOnly)
    .map((item) => {
      if (!item.children) return item;
      const children = item.children.filter((c) => role === "staff" || !c.staffOnly);
      return { ...item, children };
    })
    .filter((item) => !item.children || item.children.length > 0) as NavItem[];
}

// ─── Dark mode toggle button ──────────────────────────────────────────────────
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Toggle dark mode"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}

// ─── NavItem component ────────────────────────────────────────────────────────
function NavItemComponent({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hasChildren = !!item.children?.length;
  const Icon = item.icon;

  const isChildActive = item.children?.some((c) => pathname === c.href) ?? false;
  const isActive = !hasChildren && item.href ? pathname === item.href : false;

  const [open, setOpen] = useState(isChildActive);
  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  if (hasChildren) {
    if (collapsed) {
      return (
        <div className="group/tip relative">
          <button
            className={cn(
              "flex w-full items-center justify-center rounded-md p-2 transition-colors",
              isChildActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </button>
          <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden w-44 rounded-md border bg-popover p-1 shadow-md group-hover/tip:pointer-events-auto group-hover/tip:block">
            <p className="mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
            {item.children!.map((child) => {
              const ChildIcon = child.icon;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                    pathname === child.href
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  <ChildIcon className="h-3.5 w-3.5" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      );
    }

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
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {open && (
          <div className="ml-4 mt-1 space-y-1 border-l pl-3">
            {item.children!.map((child) => {
              const ChildIcon = child.icon;
              const childActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
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

  if (collapsed) {
    return (
      <div className="group/tip relative">
        <Link
          href={item.href!}
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center justify-center rounded-md p-2 transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </Link>
        <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md group-hover/tip:block">
          {item.label}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={item.href!}
      onClick={onNavigate}
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

// ─── Sidebar content ──────────────────────────────────────────────────────────
function SidebarContent({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}) {
  const { data: session } = useSession();
  const visibleNavItems = filterNavItems(NAV_ITEMS, session?.role);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center px-2 py-4" : "justify-between px-5 py-4"
        )}
      >
        {collapsed ? (
          <Shield className="h-6 w-6 text-primary" />
        ) : (
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">317 SMS</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={cn(
            "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "ml-0"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {visibleNavItems.map((item) => (
          <NavItemComponent
            key={item.href ?? item.label}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className={cn("border-t py-3", collapsed ? "px-2" : "px-4")}>
        {!collapsed && session?.user && (
          <p className="mb-2 truncate text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{session.user.name}</span>
          </p>
        )}
        {collapsed ? (
          <div className="group/tip relative">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center justify-center rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md group-hover/tip:block">
              Logout
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── API status indicator ─────────────────────────────────────────────────────
type ApiStatus = "checking" | "ok" | "api-down" | "auth-error";

function ApiStatusBadge({ status }: { status: ApiStatus }) {
  if (status === "ok" || status === "checking") return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        status === "api-down"
          ? "bg-destructive/10 text-destructive"
          : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
      )}
    >
      {status === "api-down" ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          API Offline
        </>
      ) : (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          Session expired — please&nbsp;
          <button
            onClick={() => signIn("google", { callbackUrl: window.location.pathname })}
            className="underline underline-offset-2"
          >
            re-authenticate
          </button>
        </>
      )}
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
const NO_SHELL_ROUTES = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const update = () => {
      setCollapsed(window.innerWidth < 768);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = (session as any)?.id_token as string | undefined;
    if (!token) return;

    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${API}/health`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.ok) setApiStatus("ok");
        else if (res.status === 401 || res.status === 403) signOut({ callbackUrl: "/login" });
        else setApiStatus("api-down");
      })
      .catch(() => setApiStatus("api-down"));
  }, [session]);

  // Render bare page with no sidebar/header for auth routes
  if (NO_SHELL_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r bg-background transition-all duration-200 ease-in-out",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent
          collapsed={false}
          onToggleCollapse={() => setMobileOpen(false)}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — visible on all screen sizes, contains dark mode toggle */}
        <header className="flex items-center justify-between border-b bg-background px-4 py-2">
          {/* Left: hamburger on mobile, empty spacer on desktop */}
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Centre: brand on mobile */}
          <div className="flex items-center gap-2 md:hidden">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">317 SMS</span>
          </div>

          {/* Invisible spacer so toggle stays right on desktop */}
          <div className="hidden md:block" />

          {/* Right: API status + dark mode toggle */}
          <div className="flex items-center gap-2">
            <ApiStatusBadge status={apiStatus} />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}