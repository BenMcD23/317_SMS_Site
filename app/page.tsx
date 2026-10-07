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
    <section className="no-print flex flex-col gap-3">
      <SectionHeading title="Tools" />
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {QUICK_TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group bg-card hover:border-primary/40 flex min-w-0 items-center gap-3 rounded-lg border px-4 py-3 shadow-xs transition-colors"
          >
            <span className="bg-muted text-muted-foreground group-hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-colors">
              <t.icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{t.title}</span>
              <span className="text-muted-foreground truncate text-xs">{t.desc}</span>
            </span>
            <ArrowRight className="text-muted-foreground/0 group-hover:text-muted-foreground ml-auto size-4 shrink-0 transition-all group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
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
        description="Squadron overview"
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

            <section className="flex flex-col gap-3">
              <SectionHeading title="Badges" />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">At a glance</CardTitle>
                    <CardAction>
                      <StatsLink />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <BadgeGlance cohort={stats} />
                  </CardContent>
                </Card>
                <Card>
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
