import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <ShieldX className="h-12 w-12 text-destructive" />
      <h1 className="text-2xl font-semibold">Not Authorised</h1>
      <p className="text-muted-foreground">You do not have permission to view this page.</p>
      <Link href="/">
        <Button variant="outline">← Back to Dashboard</Button>
      </Link>
    </div>
  );
}
