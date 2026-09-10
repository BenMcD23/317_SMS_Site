import { cn } from "@/lib/utils";

/**
 * One figure with a label. `size="lg"` is the dashboard KPI tile; the default
 * is the compact reading used in rows of attendance figures. `tone` colours the
 * tile, and the label always says what it is — colour is never the only signal.
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
        "flex flex-col rounded-lg border",
        large ? "bg-card gap-1 px-5 py-4 shadow-xs" : "px-3 py-2",
        tone === "primary" && "border-primary/30 bg-primary/5",
        tone === "success" && "border-success/30 bg-success/10",
        tone === "warning" && "border-warning/30 bg-warning/10",
        tone === "destructive" && "border-destructive/30 bg-destructive/10",
        !tone && !large && "bg-card",
        className
      )}
    >
      {large && <p className="text-muted-foreground text-sm">{label}</p>}
      <p
        className={cn(
          "font-semibold tabular-nums",
          large ? "text-3xl tracking-tight" : tone === "primary" ? "text-2xl" : "text-xl",
          tone === "primary" && "text-primary",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive"
        )}
      >
        {value}
      </p>
      {!large && <p className="text-muted-foreground mt-0.5 text-[11px]">{label}</p>}
      {hint && (
        <p className={cn("text-muted-foreground", large ? "text-xs" : "text-[11px] opacity-70")}>{hint}</p>
      )}
    </div>
  );
}
