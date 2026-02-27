"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react"; // Import these
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react"; // Optional: for a nice icon

export default function HomePage() {
  const { data: session } = useSession();

  const tools = [
    { title: "JI/AO Generator", desc: "Generate cadet documents", href: "/ji-ao-generator" },
    { title: "SMS Scraper", desc: "Run qualification & event tools", href: "/scraper" },
    { title: "Programme Updater", desc: "Push the latest programme to the website", href: "/programme-updater" },
    { title: "Settings", desc: "Manage Bader credentials", href: "/settings" },
  ];

  return (
    <main className="container mx-auto py-10 px-4">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-10 border-b pb-6">
        <div>
          <h1 className="text-4xl font-bold">317 SMS Tools</h1>
          {session?.user && (
            <p className="text-muted-foreground">Welcome back, {session.user.name}</p>
          )}
        </div>

        <Button 
          variant="ghost" 
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* Tools Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {tools.map((tool) => (
          <Card key={tool.href} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>{tool.title}</CardTitle>
              <CardDescription>{tool.desc}</CardDescription>
              <div className="pt-4">
                <Link href={tool.href}>
                  <Button className="w-full">Open Tool</Button>
                </Link>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}