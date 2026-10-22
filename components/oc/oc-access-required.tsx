"use client";

import { useSession } from "next-auth/react";
import { ShieldAlert } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isOc } from "@/lib/config";

/**
 * What everyone but the OC sees on an OC page. Shared by every page under /oc
 * so the wording and look stay the same; the API enforces the real check.
 */
export function OcAccessRequired() {
  return (
    <div className="mx-auto w-full max-w-3xl pt-16">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-destructive size-5" />
            <CardTitle>OC access required</CardTitle>
          </div>
          <CardDescription>This page is only available to the Officer Commanding.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

/**
 * Renders its children only for the OC. The page body isn't mounted for
 * anyone else, so it never fires the requests the API would refuse anyway.
 */
export function OcOnly({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  return isOc(session?.user?.email) ? <>{children}</> : <OcAccessRequired />;
}
