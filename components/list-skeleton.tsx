import { Skeleton } from "@317/ui-common/components/ui/skeleton";
import { cn } from "@317/ui-common/lib/utils";

/** Placeholder for a list or table while it loads — one bar per expected row. */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-12 w-full", className)} />
      ))}
    </div>
  );
}
