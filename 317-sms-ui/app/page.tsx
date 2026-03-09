"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, MessageSquare, Calendar } from "lucide-react";

// ─── Stats ────────────────────────────────────────────────────────────────────
// Replace these hardcoded values with real data fetched from your API/DB
const STATS = [
  { label: "Total Cadets", value: "48", badge: null },
  { label: "Upcoming Events", value: "3", badge: "This month" },
  { label: "Assessments Due", value: "12", badge: "Pending" },
  { label: "JI/AOs Generated", value: "27", badge: null },
];

function StatsGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="text-3xl font-bold">{s.value}</span>
            {s.badge && (
              <Badge variant="secondary" className="mb-1">
                {s.badge}
              </Badge>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Quick tools ──────────────────────────────────────────────────────────────
const QUICK_TOOLS = [
  {
    title: "JI/AO Generator",
    desc: "Generate cadet documents",
    href: "/ji-ao-generator",
    icon: FileText,
  },
  {
    title: "SMS Scraper",
    desc: "Run qualification & event tools",
    href: "/scraper",
    icon: MessageSquare,
  },
  {
    title: "Programme Updater",
    desc: "Push the latest programme to the website",
    href: "/programme-updater",
    icon: Calendar,
  },
];

function QuickTools() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Quick Access</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t.desc}</p>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { data: session } = useSession();

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {session?.user && (
          <p className="text-muted-foreground">
            Welcome back, {session.user.name}
          </p>
        )}
      </div>

      <StatsGrid />
      <QuickTools />
    </div>
  );
}