"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { OWNER_EMAIL } from "@/lib/config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  FileText,
  Calendar,
  Settings,
  Users,
  LayoutDashboard,
  Radio,
  Star,
  Sun,
  Moon,
  ClipboardCheck,
  WifiOff,
  AlertTriangle,
  MessageSquareText,
  Contact,
  Package,
  ShoppingCart,
  Award,
  Newspaper,
  BookOpen,
  UserCog,
  GraduationCap,
  ChevronsUpDown,
  DatabaseZap,
  DatabaseBackup,
  ReceiptText,
  ShieldCheck,
  ScrollText,
} from "lucide-react";

// ─── Navigation ───────────────────────────────────────────────────────────────

type NavLink = {
  label: string;
  href: string;
  icon: React.ElementType;
  staffOnly?: boolean;
  ownerOnly?: boolean;
};

type NavSection = {
  label?: string;
  staffOnly?: boolean;
  ownerOnly?: boolean;
  links: NavLink[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    links: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Cadets",
    links: [
      { label: "Overview", href: "/cadets/overview", icon: Users, staffOnly: true },
      { label: "Assessments", href: "/cadets/assessments", icon: ClipboardCheck },
      { label: "Theory Progress", href: "/cadets/theory", icon: GraduationCap, staffOnly: true },
      { label: "Events", href: "/cadets/events", icon: Calendar, staffOnly: true },
      { label: "Audit", href: "/cadets/audit", icon: ShieldCheck, staffOnly: true },
    ],
  },
  {
    label: "Assessment Sheets",
    links: [
      { label: "Leadership", href: "/assessments/leadership", icon: Star },
      { label: "Radio", href: "/assessments/radio", icon: Radio },
      { label: "MOI", href: "/assessments/moi", icon: BookOpen },
    ],
  },
  {
    label: "Stores",
    staffOnly: true,
    links: [
      { label: "Uniform Stock", href: "/stores/uniform/stock", icon: Package },
      { label: "Uniform Orders", href: "/stores/uniform/orders", icon: ShoppingCart },
      { label: "Badge Stock", href: "/stores/badges/stock", icon: Award },
      { label: "Badge Orders", href: "/stores/badges/orders", icon: ShoppingCart },
    ],
  },
  {
    label: "Texts",
    staffOnly: true,
    links: [
      { label: "Messages", href: "/texts/messages", icon: MessageSquareText },
      { label: "Recipients", href: "/texts/recipients", icon: Contact },
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
      { label: "HTD Claim", href: "/form-generators/htd", icon: ReceiptText },
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
    links: [
      { label: "API Logs", href: "/api-logs", icon: ScrollText, ownerOnly: true },
      { label: "Backups", href: "/backups", icon: DatabaseBackup, ownerOnly: true },
    ],
  },
];

function visibleSections(role: string | undefined, email: string | undefined): NavSection[] {
  const isOwner = (email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();
  const canSee = (item: { staffOnly?: boolean; ownerOnly?: boolean }) =>
    (!item.ownerOnly || isOwner) && (!item.staffOnly || role === "staff");
  return NAV_SECTIONS.filter(canSee)
    .map((s) => ({ ...s, links: s.links.filter(canSee) }))
    .filter((s) => s.links.length > 0);
}

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Page title for the header, from the deepest matching nav link. */
function currentPageTitle(pathname: string): string | null {
  let best: { label: string; len: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const link of section.links) {
      if (isLinkActive(pathname, link.href) && link.href.length > (best?.len ?? -1)) {
        best = {
          label: section.label ? `${section.label} · ${link.label}` : link.label,
          len: link.href.length,
        };
      }
    }
  }
  return best?.label ?? null;
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-8" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
    >
      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

// ─── User menu (sidebar footer) ───────────────────────────────────────────────

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user?.name ?? "Signed out"}</span>
                <span className="truncate text-xs text-sidebar-foreground/60 capitalize">
                  {session?.role ?? ""}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
        status === "api-down" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning"
      )}
    >
      {status === "api-down" ? (
        <>
          <WifiOff className="size-3.5" />
          API offline
        </>
      ) : (
        <>
          <AlertTriangle className="size-3.5" />
          Session expired —&nbsp;
          <button
            onClick={() => signIn("google", { callbackUrl: window.location.pathname })}
            className="underline underline-offset-2"
          >
            sign in again
          </button>
        </>
      )}
    </div>
  );
}

// ─── App sidebar ──────────────────────────────────────────────────────────────

function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const sections = visibleSections(session?.role, session?.user?.email ?? undefined);

  // On mobile the sidebar is an overlay sheet — collapse it after navigating
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={closeOnMobile}>
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-md">
                  <Image src="/icon.jpg" alt="" width={32} height={32} className="size-8 object-cover" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">317 Squadron</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">Management System</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section, i) => (
          <SidebarGroup key={section.label ?? i}>
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.links.map((link) => (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={link.label}
                      isActive={isLinkActive(pathname, link.href)}
                    >
                      <Link href={link.href} onClick={closeOnMobile}>
                        <link.icon />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

const NO_SHELL_ROUTES = ["/login", "/unauthorized"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const token = session?.id_token as string | undefined;
    if (!token) return;

    const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
    fetch(`${API}/health`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.ok) setApiStatus("ok");
        else if (res.status === 401 || res.status === 403) signIn("google", { callbackUrl: "/" });
        else setApiStatus("api-down");
      })
      .catch(() => setApiStatus("api-down"));
  }, [session]);

  // Auth routes render without the shell
  if (NO_SHELL_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  const title = currentPageTitle(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          {title && <span className="text-sm font-medium text-muted-foreground">{title}</span>}
          <div className="ml-auto flex items-center gap-2">
            <ApiStatusBadge status={apiStatus} />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
