"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderPlus, Link2, Pencil, Plus, QrCode, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { SectionDialog, SubjectDialog } from "@/components/classifications/qr-dialogs";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { downloadQr, QrImage } from "@/components/qr-code";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { copyText } from "@/lib/clipboard";
import {
  categoriesOf,
  deleteSection,
  deleteSubject,
  lessonLabel,
  lessonUrl,
  qrFileName,
  saveSection,
  saveSubject,
  THEORY_KEYS,
  type CustomSubject,
  type LessonCode,
  type SectionForm,
  type SubjectForm,
  type TheorySection,
} from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

function LessonQr({ lesson, url }: { lesson: LessonCode; url: string }) {
  const label = lessonLabel(lesson, lesson.part);
  const alt = `QR code for ${lesson.name} ${label}`;

  async function download() {
    if (!(await downloadQr(url, qrFileName(lesson, lesson.part)))) toast.error("Couldn't make the image.");
  }

  async function copy() {
    if (await copyText(url)) toast.success("Link copied.");
    else toast.error("Couldn't copy — the link is under the code.");
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* The code itself is the download button: the one thing anyone does here. */}
      <button
        type="button"
        onClick={download}
        aria-label={`Download ${alt}`}
        title="Download for your slides"
        className="group focus-visible:ring-ring/50 relative w-full rounded-md outline-none focus-visible:ring-[3px]"
      >
        <QrImage url={url} alt={alt} />
        <span className="bg-background/85 text-foreground absolute inset-0 flex items-center justify-center gap-1.5 rounded-md text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Download className="size-4" />
          Download
        </span>
      </button>
      <p className="text-sm font-medium">{label}</p>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground h-7 px-2 text-xs"
        onClick={copy}
        aria-label={`Copy link for ${lesson.name} ${label}`}
      >
        <Link2 className="size-3.5" />
        Copy link
      </Button>
    </div>
  );
}

const STEPS = [
  "Click a code to download it, and put it on that lesson's slides.",
  "At the lesson, cadets scan it with their phone camera and sign in.",
  "It's ticked off on Theory progress. Codes never change, so do this once.",
];

/**
 * Every lesson's check-in QR, to put on its slides. A cadet scans it, signs in
 * to the cadet portal, and the lesson is recorded against them. The codes
 * never change, so slides made once keep working.
 *
 * Staff can add sections and sets of codes beside the built-in syllabus. The
 * built-in ones (and Leading and Senior/Master, the classification syllabus)
 * are fixed; added ones can be renamed, given more lessons or retired.
 */
export function LessonQrCodes() {
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const { data, isLoading, error } = useApiQuery<LessonCode[]>(THEORY_KEYS.codes, "/cadets/theory/qr-codes", {
    staleTime: Infinity,
  });
  const sectionsQuery = useApiQuery<TheorySection[]>(THEORY_KEYS.sections, "/cadets/theory/sections");
  const customQuery = useApiQuery<CustomSubject[]>(THEORY_KEYS.custom, "/cadets/theory/subjects");
  const codes = Array.isArray(data) ? data : [];
  const sections = Array.isArray(sectionsQuery.data) ? sectionsQuery.data : [];
  const custom = Array.isArray(customQuery.data) ? customQuery.data : [];
  // Sections from the API include empty ones staff just added; the codes alone
  // are the fallback if that list didn't load.
  const categories = sections.length
    ? categoriesOf(sections.map((s) => ({ category: s.name })))
    : categoriesOf(codes);
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked && categories.includes(picked) ? picked : (categories[0] ?? "");
  const current = sections.find((s) => s.name === category);
  const addable = sections.filter((s) => s.can_add);

  const [sectionDialog, setSectionDialog] = useState<{
    open: boolean;
    section: TheorySection | null;
    n: number;
  }>({
    open: false,
    section: null,
    n: 0,
  });
  const [subjectDialog, setSubjectDialog] = useState<{
    open: boolean;
    subject: CustomSubject | null;
    n: number;
  }>({
    open: false,
    subject: null,
    n: 0,
  });
  const openSection = (section: TheorySection | null) =>
    setSectionDialog((d) => ({ open: true, section, n: d.n + 1 }));
  const openSubject = (subject: CustomSubject | null) =>
    setSubjectDialog((d) => ({ open: true, subject, n: d.n + 1 }));

  // Every theory list reads the catalogue: progress, recording and the night's plan too.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["theory"] });

  async function onSaveSection(values: SectionForm) {
    const editing = sectionDialog.section;
    const saved = await saveSection(token, values, editing?.id ?? undefined);
    toast.success(editing ? `Renamed to ${saved.name}` : `${saved.name} added`);
    setSectionDialog((d) => ({ ...d, open: false }));
    setPicked(saved.name);
    await refresh();
  }

  function onDeleteSection(section: TheorySection) {
    confirm(`Delete the ${section.name} section?`, async () => {
      try {
        await deleteSection(token, section.id!);
        toast.success(`${section.name} deleted`);
        setSectionDialog((d) => ({ ...d, open: false }));
        setPicked(null);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the section.");
      }
    });
  }

  async function onSaveSubject(values: SubjectForm) {
    const editing = subjectDialog.subject;
    const saved = await saveSubject(token, values, editing?.key);
    toast.success(editing ? `${saved.name} saved` : `Codes made for ${saved.name}`);
    setSubjectDialog((d) => ({ ...d, open: false }));
    setPicked(saved.category);
    await refresh();
  }

  function onDeleteSubject(subject: CustomSubject) {
    confirm(`Delete ${subject.name} and its codes?`, async () => {
      try {
        await deleteSubject(token, subject.key);
        toast.success(`${subject.name} deleted`);
        setSubjectDialog((d) => ({ ...d, open: false }));
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete it.");
      }
    });
  }

  if (!lessonUrl("x")) {
    return (
      <Alert>
        <TriangleAlert />
        <AlertTitle>The cadet portal&apos;s address isn&apos;t set</AlertTitle>
        <AlertDescription>
          Set NEXT_PUBLIC_PORTAL_URL to the portal&apos;s address (e.g. https://portal.example.com) in the
          site&apos;s environment and redeploy. The codes would otherwise point nowhere.
        </AlertDescription>
      </Alert>
    );
  }

  // One card per subject, its lessons side by side.
  const subjects = [...new Map(codes.filter((c) => c.category === category).map((c) => [c.key, c])).values()];
  const retired = custom.filter((s) => !s.active && s.category === category);
  const customByKey = new Map(custom.map((s) => [s.key, s]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Subjects"
          className="flex-wrap"
          value={category}
          onValueChange={(v) => v && setPicked(v)}
        >
          {categories.map((c) => (
            <ToggleGroupItem key={c} value={c} className="px-3">
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openSection(null)}>
            <FolderPlus />
            Add section
          </Button>
          <Button onClick={() => openSubject(null)} disabled={!addable.length}>
            <Plus />
            Add QR codes
          </Button>
        </div>
      </div>

      {current && !current.built_in && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">A section you added.</span>
          <Button variant="link" className="h-auto p-0" onClick={() => openSection(current)}>
            {current.subjects === 0 ? "Rename or delete it" : "Rename it"}
          </Button>
        </div>
      )}
      {current && !current.can_add && (
        <p className="text-muted-foreground text-sm">
          The classification syllabus: these subjects and their codes are fixed.
        </p>
      )}

      <ol className="bg-muted/40 grid gap-3 rounded-lg border p-4 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <ErrorAlert message={error?.message} title="Couldn't load the codes" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : subjects.length === 0 && !error ? (
        <EmptyState
          icon={QrCode}
          title={`No QR codes in ${category || "this section"} yet`}
          description="Add a set of codes for something taught here: one code per lesson."
        >
          {current?.can_add && <Button onClick={() => openSubject(null)}>Add QR codes</Button>}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {subjects.map((s) => {
            const editable = s.custom ? customByKey.get(s.key) : undefined;
            return (
              <Card key={s.key} className="gap-0 py-0">
                <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
                  <CardTitle className="text-base">
                    <h3>{s.name}</h3>
                  </CardTitle>
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => openSubject(editable)}
                    >
                      <Pencil />
                    </Button>
                  )}
                </CardHeader>
                <CardContent
                  className={cn(
                    "grid gap-3 border-t px-4 py-4",
                    // A one-lesson subject is one code; keep it the size a lesson's would be.
                    s.parts === 1
                      ? "mx-auto w-1/2 grid-cols-1"
                      : s.parts === 2
                        ? "grid-cols-2"
                        : "grid-cols-3"
                  )}
                >
                  {codes
                    .filter((c) => c.key === s.key)
                    .map((lesson) => (
                      <LessonQr key={lesson.part} lesson={lesson} url={lessonUrl(lesson.code)!} />
                    ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {retired.length > 0 && (
        <section aria-labelledby="retired-heading" className="flex flex-col gap-2">
          <h3 id="retired-heading" className="text-sm font-semibold">
            Retired
          </h3>
          <ul className="bg-card divide-y rounded-lg border">
            {retired.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-muted-foreground text-sm">
                  {s.name} ({s.parts} {s.parts === 1 ? "lesson" : "lessons"}, codes not working)
                </span>
                <Button variant="outline" size="sm" className="h-8" onClick={() => openSubject(s)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SectionDialog
        key={`section-${sectionDialog.n}`}
        open={sectionDialog.open}
        onOpenChange={(open) => setSectionDialog((d) => ({ ...d, open }))}
        section={sectionDialog.section}
        onSave={onSaveSection}
        onDelete={sectionDialog.section ? () => onDeleteSection(sectionDialog.section!) : undefined}
      />
      <SubjectDialog
        key={`subject-${subjectDialog.n}`}
        open={subjectDialog.open}
        onOpenChange={(open) => setSubjectDialog((d) => ({ ...d, open }))}
        subject={subjectDialog.subject}
        sections={addable}
        defaultSection={current?.can_add ? current.name : undefined}
        onSave={onSaveSubject}
        onDelete={subjectDialog.subject ? () => onDeleteSubject(subjectDialog.subject!) : undefined}
      />
      {confirmDialog}
    </div>
  );
}
