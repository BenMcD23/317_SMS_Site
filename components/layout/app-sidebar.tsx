"use client";

import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Loader2 } from "lucide-react";

import { isNavLinkActive, visibleSections, type NavLink, type NavSection } from "@/lib/navigation";
import { useOpenSections } from "@/lib/sidebar-sections";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

// Swaps a nav item's icon for a spinner while its Link is pending — the
// tap-and-nothing-happens feeling on a slow mobile connection is really "no
// feedback", not "no navigation", so this alone fixes the perceived hang.
function NavIcon({ icon: Icon }: { icon: React.ElementType }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="animate-spin" /> : <Icon />;
}

function NavLinkItem({ link, onNavigate }: { link: NavLink; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={link.label} isActive={isNavLinkActive(pathname, link)}>
        <Link href={link.href} onClick={onNavigate}>
          <NavIcon icon={link.icon} />
          <span>{link.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SectionItems({ section, onNavigate }: { section: NavSection; onNavigate: () => void }) {
  return (
    <SidebarGroupContent>
      <SidebarMenu>
        {section.items.map((item) => (
          <NavLinkItem key={item.label} link={item} onNavigate={onNavigate} />
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}

export function AppSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const sections = visibleSections(session?.role, session?.user?.email ?? undefined, session?.is_oc);
  const { isOpen, setOpen } = useOpenSections(
    pathname,
    sections.flatMap((s) => (s.label ? [s.label] : []))
  );
  // Icon-only mode has no headings to click, so every icon stays reachable.
  const iconOnly = state === "collapsed" && !isMobile;

  // On mobile the sidebar is an overlay sheet — collapse it after navigating.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Home">
              <Link href="/" onClick={closeOnMobile}>
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-md">
                  <Image src="/icon.jpg" alt="" width={32} height={32} className="size-8 object-cover" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">317 Squadron</span>
                  <span className="text-sidebar-foreground/60 truncate text-xs">Management System</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section, i) =>
          !section.label || iconOnly ? (
            <SidebarGroup key={section.label ?? i}>
              {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
              <SectionItems section={section} onNavigate={closeOnMobile} />
            </SidebarGroup>
          ) : (
            // The menu is taller than a laptop screen, so each section folds
            // away; useOpenSections remembers which and keeps the current one open.
            <Collapsible
              key={section.label}
              open={isOpen(section.label)}
              onOpenChange={(open) => setOpen(section.label!, open)}
              className="group/section"
            >
              {/* Less padding than a plain group: folded, the headings stack
                  as a compact list instead of a column of gaps. */}
              <SidebarGroup className="py-0.5">
                <SidebarGroupLabel
                  asChild
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
                >
                  <CollapsibleTrigger>
                    {section.label}
                    <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=closed]/section:-rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SectionItems section={section} onNavigate={closeOnMobile} />
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        )}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu onNavigate={closeOnMobile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
