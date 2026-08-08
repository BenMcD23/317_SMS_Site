import { cn } from "@/lib/utils";

/** One figure in a row of summary tiles. Shared by the attendance views so the
 *  squadron, per-cadet and per-NCO readings look the same. `tone` colours the
 *  tile, and the label always says what it is — colour is never the only signal. */
export function Stat({ label, value, hint, tone }: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  return (
    <div className={cn(
      "rounded-lg border px-3 py-2",
      tone === "primary" && "border-primary/30 bg-primary/5",
      tone === "success" && "border-success/30 bg-success/10",
      tone === "warning" && "border-warning/30 bg-warning/10",
      tone === "destructive" && "border-destructive/30 bg-destructive/10",
      !tone && "bg-card",
    )}>
      <p className={cn(
        "font-semibold tabular-nums",
        tone === "primary" ? "text-2xl text-primary" : "text-xl",
        tone === "success" && "text-success",
        tone === "warning" && "text-warning",
        tone === "destructive" && "text-destructive",
      )}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
