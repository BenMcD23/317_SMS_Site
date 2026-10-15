import { cn } from "@/lib/utils";

/**
 * One bordered block split into cells by hairlines — the stat strips and the
 * dashboard's tool list — instead of a grid of separate boxed cards.
 *
 * Each cell draws its top and left edge and is pulled 1px up and left, so the
 * block's own border clips the outer ones: the dividers stay right however the
 * grid wraps, and a short last row leaves blank card rather than a grey hole.
 * Pass the column counts (`sm:grid-cols-2 lg:grid-cols-4`) in `className`.
 */
export function DividedGrid({
  as: Tag = "div",
  children,
  className,
  ...props
}: {
  as?: "div" | "ul";
  children: React.ReactNode;
  className?: string;
} & React.AriaAttributes) {
  return (
    <Tag
      className={cn(
        "bg-card grid grid-cols-2 overflow-hidden rounded-lg border",
        "[&>*]:-mt-px [&>*]:-ml-px [&>*]:border-t [&>*]:border-l",
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
