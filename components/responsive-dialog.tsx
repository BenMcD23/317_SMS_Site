"use client";

import { createContext, useContext } from "react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * A dialog on a laptop, a bottom sheet on a phone. On parade night a centred
 * modal on a 390px screen puts its buttons under the keyboard and its close
 * button out of thumb reach; a sheet keeps the form and its actions at the
 * bottom, where the thumb is, and can be swiped away.
 *
 * Same parts as `Dialog` (`ResponsiveDialogContent`, `…Header`, `…Title`,
 * `…Description`, `…Footer`, `…Close`) so a dialog switches by changing its
 * imports. `className` on the content only applies to the dialog; the sheet
 * is always full width.
 */

const SheetMode = createContext(false);

export function ResponsiveDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const sheet = useIsMobile();
  const Root = sheet ? Drawer : Dialog;
  return (
    <SheetMode.Provider value={sheet}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </SheetMode.Provider>
  );
}

export function ResponsiveDialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  if (useContext(SheetMode)) {
    return (
      <DrawerContent>
        {/* The body scrolls between a fixed header and footer, so a long form
            never pushes its buttons off the bottom of the sheet. */}
        <div className="flex min-h-0 flex-col overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    );
  }
  return <DialogContent className={className}>{children}</DialogContent>;
}

export function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return useContext(SheetMode) ? (
    <DrawerHeader className={cn("px-0 text-left", className)} {...props} />
  ) : (
    <DialogHeader className={className} {...props} />
  );
}

export function ResponsiveDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  return useContext(SheetMode) ? <DrawerTitle {...props} /> : <DialogTitle {...props} />;
}

export function ResponsiveDialogDescription(props: React.ComponentProps<typeof DialogDescription>) {
  return useContext(SheetMode) ? <DrawerDescription {...props} /> : <DialogDescription {...props} />;
}

export function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  // In the sheet the buttons stack full width in DOM order, so the primary
  // action (last, by convention) sits at the bottom, nearest the thumb.
  return useContext(SheetMode) ? (
    <DrawerFooter className={cn("px-0 [&>*]:w-full", className)} {...props} />
  ) : (
    <DialogFooter className={className} {...props} />
  );
}

export function ResponsiveDialogClose(props: React.ComponentProps<typeof DialogClose>) {
  return useContext(SheetMode) ? <DrawerClose {...props} /> : <DialogClose {...props} />;
}
