"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { z } from "zod";
import { Check } from "lucide-react";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorAlert } from "@/components/error-alert";
import { ROUTE_LABEL, type Route, type UniformedApplication, addUniformed } from "@/lib/applications";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/use-api-query";

// What /staff answers with. Only the roster fields the picker needs.
type StaffRow = { cin: number; firstName: string; lastName: string; rank: string | null };

const NO_STAFF: StaffRow[] = [];

const fullName = (s: StaffRow) => `${s.firstName} ${s.lastName}`;

const schema = z.object({
  name: z.string().trim().min(1, "Pick who's applying").max(200, "200 characters at most"),
  route: z.enum(["snco", "cfc"]),
  complete: z.boolean(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", route: "snco", complete: false };

/**
 * Adds an adult applicant to track, picked from the SMS staff roster (they're
 * on it as a civilian instructor or similar before they apply for uniform), and
 * which route they're applying for: officer (CFC) applicants also sit the
 * Region board. Someone appointed before SMS tracked it can go straight on the
 * Complete list. `taken` is the names already being tracked, left off the list
 * so nobody gets two applications.
 */
export function AddApplicantDialog({
  open,
  onOpenChange,
  onAdded,
  taken = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (app: UniformedApplication) => void;
  taken?: string[];
}) {
  const { data: session } = useSession();
  // Staff are a few dozen, so the whole roster comes down once (when the dialog
  // first opens) and cmdk filters it as they type.
  const roster = useApiQuery<StaffRow[]>(["staff", "roster"], "/staff", { enabled: open });
  const staff = Array.isArray(roster.data) ? roster.data : NO_STAFF;
  const choices = useMemo(() => {
    const tracked = new Set(taken.map((n) => n.trim().toLowerCase()));
    return staff
      .filter((s) => !tracked.has(fullName(s).toLowerCase()))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [staff, taken]);
  const { control, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  function close() {
    reset(EMPTY);
    setSubmitError(null);
    onOpenChange(false);
  }

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      onAdded(await addUniformed(session?.id_token ?? "", values.name, values.route, values.complete));
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't add the applicant.");
    }
  });

  const nameError = formState.errors.name?.message;
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add applicant</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Pick someone from the staff list who&apos;s applying to join as uniformed staff. Officer
            applicants also sit the Region board.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form id="add-applicant" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="applicant-name">Staff member</FieldLabel>
            {roster.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : roster.error ? (
              <ErrorAlert message={roster.error.message} title="Could not load the staff list" />
            ) : (
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <Command
                    className={cn("h-auto rounded-md border", nameError && "border-destructive")}
                    // Rank and CIN are searchable too, but the name is what's kept.
                    filter={(value, search, keywords) =>
                      [value, ...(keywords ?? [])]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.trim().toLowerCase())
                        ? 1
                        : 0
                    }
                  >
                    <CommandInput
                      id="applicant-name"
                      placeholder="Search staff…"
                      aria-invalid={!!nameError || undefined}
                    />
                    <CommandList className="max-h-56">
                      <CommandEmpty>
                        {staff.length === 0
                          ? "Nobody on the staff list yet. It fills when the staff scraper runs."
                          : choices.length === 0
                            ? "Everyone on the staff list already has an application."
                            : "No staff member found."}
                      </CommandEmpty>
                      {choices.map((s) => {
                        const name = fullName(s);
                        return (
                          <CommandItem
                            key={s.cin}
                            value={`${name} ${s.cin}`}
                            keywords={s.rank ? [s.rank] : undefined}
                            onSelect={() => field.onChange(name)}
                            className="min-h-9"
                          >
                            <Check
                              className={cn("size-4", field.value === name ? "opacity-100" : "opacity-0")}
                            />
                            <span className="flex-1 truncate">{name}</span>
                            {s.rank && <span className="text-muted-foreground text-xs">{s.rank}</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandList>
                  </Command>
                )}
              />
            )}
            <FieldError>{nameError}</FieldError>
          </Field>
          <Field>
            <FieldLabel id="applicant-route">Applying as</FieldLabel>
            <Controller
              control={control}
              name="route"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby="applicant-route"
                  value={field.value}
                  // Radix sends "" when the pressed one is tapped again; keep it.
                  onValueChange={(v) => v && field.onChange(v as Route)}
                  className="w-full"
                >
                  {(Object.keys(ROUTE_LABEL) as Route[]).map((r) => (
                    <ToggleGroupItem key={r} value={r} className="h-9 flex-1">
                      {ROUTE_LABEL[r]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </Field>
          <Controller
            control={control}
            name="complete"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="applicant-complete"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="applicant-complete">Already complete</FieldLabel>
                  <FieldDescription>
                    Goes straight on the Complete list, with no steps ticked.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
          <ErrorAlert message={submitError} title="Applicant not added" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-applicant" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Adding…" : "Add applicant"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
