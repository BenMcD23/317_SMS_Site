import { cn } from "@317/ui-common/lib/utils";
import { initials, splitBody } from "@/lib/programme-builder";

/** A comment as people read it: text with each @mention as a chip. */
export function CommentBody({ body, className }: { body: string; className?: string }) {
  return (
    <p className={cn("text-sm break-words whitespace-pre-wrap", className)}>
      {splitBody(body).map((part, i) =>
        "mention" in part ? (
          <span key={i} className="bg-primary/10 text-primary rounded px-1 font-medium">
            @{part.mention.name}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  );
}

/** A round badge with someone's initials, as Docs shows beside a comment. */
export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary text-primary-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
