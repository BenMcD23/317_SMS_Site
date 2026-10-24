"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Private } from "@/components/private";
import { initialsOf } from "@/lib/format";

function initials(name: string | null | undefined): string {
  return initialsOf(name) || "?";
}

const ROLE_LABELS: Record<string, string> = { staff: "Staff", snco: "SNCO", nco: "NCO" };

/** Sidebar footer: who is signed in, with Settings and Sign out. */
export function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={user?.name ?? "Account"}>
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground rounded-md text-xs">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user?.name ?? "Signed out"}</span>
                <span className="text-sidebar-foreground/60 truncate text-xs">
                  {session?.role ? (ROLE_LABELS[session.role] ?? session.role) : ""}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.name}</p>
              <Private>
                <p className="text-muted-foreground text-xs">{user?.email}</p>
              </Private>
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
