"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <main className="container max-w-2xl mx-auto py-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Bader Login Settings</CardTitle>
          <CardDescription>Configure your SMS scraper credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          {/* Role Account Section */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-semibold text-lg">Role Account</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="role_user">Username</Label>
                <Input id="role_user" placeholder="e.g. 317_adj" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role_pass">Password</Label>
                <Input id="role_pass" type="password" />
              </div>
            </div>
          </div>

          {/* Personal Account Section */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-semibold text-lg">Personal Account</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="pers_user">Username</Label>
                <Input id="pers_user" placeholder="e.g. j.bloggs100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pers_pass">Password</Label>
                <Input id="pers_pass" type="password" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button className="w-full bg-primary py-6 text-lg">
              Save All Credentials
            </Button>
            <Link href="/" className="w-full">
              <Button variant="outline" className="w-full">Cancel</Button>
            </Link>
          </div>
          
        </CardContent>
      </Card>
    </main>
  );
}