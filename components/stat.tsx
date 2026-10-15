import { cn } from "@/lib/utils";
import { DividedGrid } from "@/components/divided-grid";

/**
 * One figure with a label. Stats sit in a `StatGroup` — one bordered strip
 * split by hairlines — rather than each drawing its own tile: a row of
 * identical boxes made every dashboard look the same and buried the numbers.
 * `size="lg"` is the headline figure; `tone` colours the figure only, and the
 * label always says what it is, so colour is never the only signal.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
  size = "sm",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "destructive";
  size?: "sm" | "lg";
  className?: string;
}) {
  const large = size === "lg";
  return (
    <div
      className={cn(
        "bg-card flex min-w-0 flex-col gap-1",
        large ? "px-3 py-3 sm:px-5 sm:py-4" : "px-4 py-3",
        className
      )}
    >
      <p className="text-muted-foreground text-sm text-pretty">{label}</p>
      <p
        className={cn(
          "leading-none font-semibold tracking-tight tabular-nums",
          large ? "text-2xl sm:text-3xl" : "text-xl",
          tone === "primary" && "text-primary",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive"
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{hint}</p>}
    </div>
  );
}

/** The strip a set of `Stat`s sits in. Pass column counts in `className`. */
export function StatGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <DividedGrid className={className}>{children}</DividedGrid>;
}
