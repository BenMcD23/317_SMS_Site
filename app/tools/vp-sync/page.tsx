"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";

import { VpSyncOverview } from "./overview";
import { VpSyncReceiver } from "./receiver";

/** useSearchParams opts the tree into client-side rendering, so Next needs a
 *  Suspense boundary around it — without one the page fails to prerender. */
export default function VpSyncPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <VpSync />
    </Suspense>
  );
}

/** ?receive=1 is the popup the bookmarklet opens from a VP tab; anything else
 *  is the page staff visit to set up the bookmark and look at what's synced. */
function VpSync() {
  return useSearchParams().get("receive") === "1" ? <VpSyncReceiver /> : <VpSyncOverview />;
}
