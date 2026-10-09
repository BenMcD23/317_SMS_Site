"use client";

import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import {
  isGroup,
  isGroupActive,
  isLinkActive,
  visibleSections,
  type NavGroup,
  type NavLink,
  type NavSection,
} from "@/lib/navigation";
import { useOpenSections } from "@/lib/sidebar-sections";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
      <SidebarMenuButton asChild tooltip={link.label} isActive={isLinkActive(pathname, link.href)}>
        <Link href={link.href} onClick={onNavigate}>
          <NavIcon icon={link.icon} />
          <span>{link.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * A parent with children. Expanded sidebar: a collapsible, open whenever one
 * of its children is the current page. Icon-only sidebar: the children would
 * be hidden, so the icon opens them as a flyout menu instead.
 */
function NavGroupItem({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const active = isGroupActive(pathname, group);

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={group.label} isActive={active}>
              <group.icon />
              <span>{group.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-40">
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.links.map((link) => (
              <DropdownMenuItem key={link.href} asChild>
                <Link href={link.href} onClick={onNavigate}>
                  <link.icon />
                  {link.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild defaultOpen={active} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={group.label} isActive={active}>
            <group.icon />
            <span>{group.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.links.map((link) => (
              <SidebarMenuSubItem key={link.href}>
                <SidebarMenuSubButton asChild isActive={isLinkActive(pathname, link.href)}>
                  <Link href={link.href} onClick={onNavigate}>
                    <NavIcon icon={link.icon} />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SectionItems({ section, onNavigate }: { section: NavSection; onNavigate: () => void }) {
  return (
    <SidebarGroupContent>
      <SidebarMenu>
        {section.items.map((item) =>
          isGroup(item) ? (
            <NavGroupItem key={item.label} group={item} onNavigate={onNavigate} />
          ) : (
            <NavLinkItem key={item.href} link={item} onNavigate={onNavigate} />
          )
        )}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}

export function AppSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const sections = visibleSections(session?.role, session?.user?.email ?? undefined);
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
            <SidebarMenuButton size="lg" asChild tooltip="Dashboard">
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
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
