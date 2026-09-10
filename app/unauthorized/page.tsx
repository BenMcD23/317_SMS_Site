import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ShieldX } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <EmptyState
        icon={ShieldX}
        title="Not authorised"
        description="Your account doesn't have permission to view this page. If you think it should, speak to the squadron staff team."
      >
        <Button variant="outline" asChild>
          <Link href="/">Back to dashboard</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
