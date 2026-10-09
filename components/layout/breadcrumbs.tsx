"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { breadcrumbsFor } from "@/lib/navigation";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Header trail derived from the nav model: Section › Group › Page. */
export function HeaderBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length === 0) return null;

  return (
    <>
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList className="text-sm">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            // Ancestors collapse away on narrow screens; the page itself always
            // shows. Every separator goes with them, or the page reads "› Orders".
            const hide = last ? undefined : "hidden md:flex";
            return (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator className="hidden md:flex" />}
                <BreadcrumbItem className={hide}>
                  {/* A last crumb with a link means we're on a record below that
                      page (a cadet, a box) — keep it clickable as the way back. */}
                  {last && !crumb.href ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}
