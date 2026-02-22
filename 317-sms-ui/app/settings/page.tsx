"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE } from "@/lib/config";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  
  // Independent toggles for each password field
  const [showRolePass, setShowRolePass] = useState(false);
  const [showPersPass, setShowPersPass] = useState(false);
  
  const [creds, setCreds] = useState({
    role_user: "",
    role_pass: "",
    pers_user: "",
    pers_pass: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreds({ ...creds, [e.target.id]: e.target.value });
  };

  const handleSave = async () => {
    if (!session?.id_token) {
      toast.error("No ID Token found. Please log out and back in.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/save-credentials`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.id_token}`
        },
        body: JSON.stringify(creds),
      });

      if (response.ok) {
        toast.success("Credentials saved to database!");
      } else {
        toast.error("Failed to save credentials.");
      }
    } catch (error) {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

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
                <Input id="role_user" value={creds.role_user} onChange={handleChange} placeholder="e.g. 317_adj" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role_pass">Password</Label>
                <div className="relative">
                  <Input 
                    id="role_pass" 
                    type={showRolePass ? "text" : "password"} 
                    value={creds.role_pass} 
                    onChange={handleChange}
                    className="pr-10" // Add padding so text doesn't overlap icon
                  />
                  <button
                    type="button"
                    onClick={() => setShowRolePass(!showRolePass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showRolePass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Personal Account Section */}
          <div className="space-y-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-semibold text-lg">Personal Account</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="pers_user">Username</Label>
                <Input id="pers_user" value={creds.pers_user} onChange={handleChange} placeholder="e.g. j.bloggs100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pers_pass">Password</Label>
                <div className="relative">
                  <Input 
                    id="pers_pass" 
                    type={showPersPass ? "text" : "password"} 
                    value={creds.pers_pass} 
                    onChange={handleChange}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPersPass(!showPersPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPersPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              className="w-full bg-primary py-6 text-lg" 
              onClick={handleSave} 
              disabled={loading || !session}
            >
              {loading ? "Saving..." : "Save All Credentials"}
            </Button>
            <div className="pt-4 border-t">
              <Link href="/">
                <Button variant="ghost" className="w-full">← Back to Home</Button>
              </Link>
            </div>
          </div>
          
        </CardContent>
      </Card>
    </main>
  );
}