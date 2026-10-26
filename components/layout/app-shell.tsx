"use client";

import { usePathname } from "next/navigation";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { HeaderBreadcrumbs } from "@/components/layout/breadcrumbs";
import { CommandPaletteTrigger } from "@/components/layout/command-palette";
import { ApiStatusBadge, useApiStatus } from "@/components/layout/api-status";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { OutboxIndicator, OutboxSync } from "@/components/outbox";

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
          {/* On a phone the tab bar's "More" opens the sidebar instead. */}
          <SidebarTrigger className="-ml-1 max-md:hidden" />
          <HeaderBreadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <OutboxIndicator />
            <ApiStatusBadge status={apiStatus} />
            <CommandPaletteTrigger />
            <ThemeToggle />
          </div>
        </header>
        {/* Bottom padding clears the phone tab bar and the home indicator under it. */}
        <main className="min-w-0 flex-1 overflow-x-clip px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-6">
          {children}
        </main>
      </SidebarInset>
      <MobileTabBar />
      <OutboxSync />
    </SidebarProvider>
  );
}
