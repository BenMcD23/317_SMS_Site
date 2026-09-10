"use client";

import { usePathname } from "next/navigation";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { HeaderBreadcrumbs } from "@/components/layout/breadcrumbs";
import { CommandPaletteTrigger } from "@/components/layout/command-palette";
import { ApiStatusBadge, useApiStatus } from "@/components/layout/api-status";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Auth pages render bare — no sidebar or header. */
const NO_SHELL_ROUTES = ["/login", "/unauthorized"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const apiStatus = useApiStatus();

  if (NO_SHELL_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="no-print bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <HeaderBreadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <ApiStatusBadge status={apiStatus} />
            <CommandPaletteTrigger />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
