import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A cadet's name as a link to their record. Wherever a page lists cadets
 * (an inspection, a DofE group, tonight's check-in) the next question is
 * usually about that cadet, so the name goes straight there. Underlined on
 * hover and on keyboard focus only: these sit in dense lists.
 */
export function CadetLink({
  cin,
  children,
  className,
}: {
  cin: number | string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={`/cadets/${cin}`} className={cn("hover:underline focus-visible:underline", className)}>
      {children}
    </Link>
  );
}
