"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useApiQuery } from "@/lib/use-api-query";
import { visibleSections } from "@/lib/nav";
import { cadetInitials } from "@/lib/cadet-format";
import { Moon, Sun, UserRound } from "lucide-react";

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

/**
 * Global ⌘K / Ctrl+K palette. Navigation entries are sourced from the same
 * role-filtered nav config as the sidebar, and staff can jump straight to a
 * cadet by name, rank, flight or CIN.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();

  const role = session?.role;
  const email = session?.user?.email ?? undefined;
  const sections = visibleSections(role, email);
  const isStaff = role === "staff";

  // Only staff can read the cadet list; fetch lazily once the palette opens.
  const { data: cadets = [] } = useApiQuery<Cadet[]>(["cadets"], "/cadets", {
    enabled: open && isStaff,
  });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and cadets…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {sections.map((section) => (
          <CommandGroup key={section.label ?? "general"} heading={section.label ?? "Navigation"}>
            {section.links.map((link) => (
              <CommandItem
                key={link.href}
                value={`${link.label} ${(link.keywords ?? []).join(" ")}`}
                onSelect={() => go(link.href)}
              >
                <link.icon />
                {link.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {isStaff && cadets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cadets">
              {cadets.map((c) => (
                <CommandItem
                  key={c.cin}
                  value={`${c.first_name} ${c.last_name} ${c.cin} ${c.rank ?? ""} ${c.flight ?? ""}`}
                  onSelect={() => go(`/cadets/${c.cin}`)}
                >
                  <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                    {cadetInitials(c.first_name, c.last_name)}
                  </span>
                  <span>
                    {c.last_name}, {c.first_name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{c.cin}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem
            value="toggle theme dark light mode"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            Toggle {resolvedTheme === "dark" ? "light" : "dark"} mode
          </CommandItem>
          <CommandItem value="settings account profile" onSelect={() => go("/settings")}>
            <UserRound />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
