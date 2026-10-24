"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Check, PenLine } from "lucide-react";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cleanInitials, type Entry } from "@/lib/activity-logs";
import { formatDate, initialsOf } from "@/lib/format";

/**
 * The assessor's initials on one entry, as on the paper sheet. One click signs
 * it as whoever's logged in; "Other initials" is for an instructor who saw it
 * but isn't at the computer. `onSign(null)` removes the sign-off.
 */
export function SignOffMenu({ entry, onSign }: { entry: Entry; onSign: (initials: string | null) => void }) {
  const { data: session } = useSession();
  const mine = initialsOf(session?.user?.name);
  const signed = entry.signed_off_initials;
  const [other, setOther] = useState(false);
  const day = formatDate(entry.date);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {signed ? (
            <Button variant="ghost" size="sm" aria-label={`Signed off by ${signed}, ${day}`}>
              <Check className="text-emerald-600" />
              {signed}
            </Button>
          ) : (
            <Button variant="outline" size="sm" aria-label={`Sign off ${day}`}>
              <PenLine />
              Sign off
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {mine && mine !== signed && (
            <DropdownMenuItem onSelect={() => onSign(mine)}>Sign off as {mine}</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setOther(true)}>Other initials…</DropdownMenuItem>
          {signed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onSign(null)}>
                Remove sign-off
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <OtherInitialsDialog
        open={other}
        day={day}
        onOpenChange={setOther}
        onSign={(initials) => {
          setOther(false);
          onSign(initials);
        }}
      />
    </>
  );
}

function OtherInitialsDialog({
  open,
  day,
  onOpenChange,
  onSign,
}: {
  open: boolean;
  day: string;
  onOpenChange: (open: boolean) => void;
  onSign: (initials: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const initials = cleanInitials(value);
    if (!initials) return setError("Enter 1 to 4 letters");
    setValue("");
    setError(null);
    onSign(initials);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Sign off with other initials</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            For the entry on {day}, when someone else assessed it.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form id="sign-off" onSubmit={submit} noValidate>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="sign-off-initials">Initials</FieldLabel>
            <Input
              id="sign-off-initials"
              className="w-28 uppercase"
              autoComplete="off"
              maxLength={8}
              value={value}
              aria-invalid={!!error || undefined}
              onChange={(e) => setValue(e.target.value)}
            />
            <FieldDescription>These go in the Initials column of the PDF.</FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </form>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="sign-off">
            Sign off
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
