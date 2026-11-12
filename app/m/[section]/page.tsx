"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Compass, Settings } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionHub } from "@/components/section-hub";
import { Button } from "@/components/ui/button";
import { hubSections, visibleSections, type NavSection } from "@/lib/navigation";

/** Settings lives in the account menu on a laptop; on a phone More is where people look for it. */
const ACCOUNT: NavSection = {
  label: "Account",
  items: [{ label: "Settings", href: "/settings", icon: Settings }],
};

/**
 * A section's hub on a phone (`/m/stores`, `/m/more`): every page in it that
 * this user can reach, as rows to tap. The bottom bar's tabs open these, and
 * each page inside links back to its hub.
 */
export default function SectionHubPage() {
  const params = useParams<{ section?: string }>();
  const { data: session } = useSession();
  const slug = params?.section ?? "";
  const visible = visibleSections(session?.role, session?.user?.email ?? undefined, session?.is_oc);
  const hub = hubSections(slug, session?.role, visible);
  const sections = hub && slug === "more" ? [...hub.sections, ACCOUNT] : (hub?.sections ?? []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      {hub && sections.length > 0 ? (
        <>
          <PageHeader title={hub.label} />
          <SectionHub sections={sections} showSectionNames={sections.length > 1} />
        </>
      ) : (
        <EmptyState
          icon={Compass}
          title="Nothing here"
          description="This part of the menu doesn't exist, or there's nothing in it you can open."
        >
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
