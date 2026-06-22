"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { visibleSections, isLinkActive, currentPageTitle } from "@/lib/nav";
import { CommandPalette } from "@/components/command-palette";
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
  Settings,
  Sun,
  Moon,
  WifiOff,
  AlertTriangle,
  ChevronsUpDown,
  Search,
} from "lucide-react";

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

// ─── Command palette trigger (header) ───────────────────────────────────────────

function CommandPaletteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="hidden h-8 gap-2 px-2.5 text-muted-foreground sm:flex"
      aria-label="Open command palette"
    >
      <Search className="size-3.5" />
      <span className="text-xs">Search…</span>
      <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
        ⌘K
      </kbd>
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
                      isActive={isLinkActive(pathname, link)}
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
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global ⌘K / Ctrl+K to open the command palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          {title && <span className="text-sm font-medium text-muted-foreground">{title}</span>}
          <div className="ml-auto flex items-center gap-2">
            <ApiStatusBadge status={apiStatus} />
            <CommandPaletteButton onClick={() => setPaletteOpen(true)} />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}
