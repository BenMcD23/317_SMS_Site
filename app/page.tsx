"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { reauth } from "@/lib/api-fetch";
import { useApiQuery } from "@/lib/use-api-query";
import type { Award, SquadronStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { DividedGrid } from "@/components/divided-grid";
import { BadgesToGive } from "@/components/badges/badges-to-give";
import { BadgeGlance } from "@/components/stats/badge-glance";
import { SquadronKpis } from "@/components/stats/kpis";
import { RecentAwards } from "@/components/stats/qual-lists";
import { ArrowRight, ChartLine, FileText, DatabaseZap, Calendar, Newspaper } from "lucide-react";

const AWARDS_DAYS = 30;

const QUICK_TOOLS = [
  {
    title: "JI/AO Generator",
    desc: "Generate joining instructions and admin orders",
    href: "/tools/ji-ao-generator",
    icon: FileText,
  },
  {
    title: "Bader Scrapers",
    desc: "Sync cadet and event data from SMS",
    href: "/tools/scraper",
    icon: DatabaseZap,
  },
  {
    title: "Programme",
    desc: "Publish the monthly programme to the website",
    href: "/tools/programme-updater",
    icon: Calendar,
  },
  {
    title: "Newsletter",
    desc: "Manage published newsletters",
    href: "/tools/newsletter-updater",
    icon: Newspaper,
  },
];

function QuickTools() {
  return (
    <section className="no-print flex flex-col gap-3" aria-labelledby="tools-heading">
      <SectionHeading title={<span id="tools-heading">Tools</span>} />
      <DividedGrid as="ul" className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_TOOLS.map((t) => (
          <li key={t.href} className="flex">
            <Link
              href={t.href}
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-start gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <t.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{t.title}</span>
                <span className="text-muted-foreground text-xs text-pretty">{t.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </DividedGrid>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <Skeleton className="h-24" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </div>
  );
}

function StatsLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/stats">
        Trends and filters
        <ArrowRight />
      </Link>
    </Button>
  );
}

export default function HomePage() {
  const { data: session } = useSession({ required: true });

  useEffect(() => {
    if (session?.error) {
      reauth("/");
    }
  }, [session?.error]);

  const { data: stats = null, isLoading: loading } = useApiQuery<SquadronStats>(
    ["stats", "current"],
    "/stats/current"
  );
  const { data: awardsData } = useApiQuery<Award[]>(
    ["stats", "awards", AWARDS_DAYS],
    `/stats/awards?days=${AWARDS_DAYS}`
  );
  // An error body in place of the list would otherwise crash the feed.
  const awards = Array.isArray(awardsData) ? awardsData : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        title="Dashboard"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/stats">
              <ChartLine />
              Squadron stats
            </Link>
          </Button>
        }
      />
      {loading ? (
        <DashboardSkeleton />
      ) : (
        stats && (
          <>
            <SquadronKpis stats={stats} />

            {session?.role === "staff" && <QuickTools />}

            {/* Badge orders are staff-only in the API, so NCOs don't get an empty 403 box. */}
            {session?.role === "staff" && <BadgesToGive />}

            <section className="flex flex-col gap-3">
              <SectionHeading title="Badges" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                  <CardHeader>
                    <CardTitle className="text-base">Who holds what</CardTitle>
                    <CardAction>
                      <StatsLink />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <BadgeGlance cohort={stats} />
                  </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Gained in the last {AWARDS_DAYS} days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RecentAwards awards={awards} limit={6} empty="No badges gained this month." />
                  </CardContent>
                </Card>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
