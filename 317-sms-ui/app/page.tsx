import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const tools = [
    { title: "JI/AO Generator", desc: "Generate cadet documents", href: "/ji-ao-generator" },
    { title: "SMS Scraper", desc: "Run qualification & event tools", href: "/scraper" },
    { title: "Settings", desc: "Manage Bader credentials", href: "/settings" },
  ];

  return (
    <main className="container mx-auto py-10 px-4">
      <h1 className="text-4xl font-bold mb-8 text-center">317 SMS Tools</h1>
      <div className="grid gap-6 md:grid-cols-3">
        {tools.map((tool) => (
          <Card key={tool.href} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>{tool.title}</CardTitle>
              <CardDescription>{tool.desc}</CardDescription>
              <Link href={tool.href} className="pt-4">
                <Button className="w-full">Open Tool</Button>
              </Link>
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}