import { cn } from "@/lib/utils";

/**
 * Heading for a block within a page (the dashboard's "Badge progression", a
 * settings group). Sits between the page title and card titles in weight so
 * the three never compete.
 */
export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
