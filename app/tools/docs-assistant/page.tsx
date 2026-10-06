"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";

import { DocsAnswerView } from "@/components/docs-answer";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import type { DocsAnswer } from "@/lib/docs-answer";

const EXAMPLES = [
  "Can cadets sleep overnight in Army Reserve centres?",
  "What staff-to-cadet ratios apply on an overnight activity?",
  "Who can authorise cadets to travel in a staff member's own car?",
];

type Asked = { id: number; question: string; result: DocsAnswer };

export default function DocsAssistantPage() {
  const { data: session } = useSession();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  // Every answer this visit, newest first, so an earlier one can be re-read after asking another.
  const [history, setHistory] = useState<Asked[]>([]);
  const nextId = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || !session?.id_token || pending) return;
    setPending(q);
    try {
      const result = await apiRequest<DocsAnswer>(
        session.id_token,
        `${API_BASE}/chat/ask`,
        { method: "POST", body: { question: q } },
        "The docs assistant couldn't answer."
      );
      // An error body can still arrive as a 200 from a misbehaving proxy; don't render half an answer.
      if (typeof result?.answer !== "string" || !Array.isArray(result.sources)) {
        throw new Error("The docs assistant sent back an answer it couldn't read.");
      }
      setHistory((h) => [{ id: nextId.current++, question: q, result }, ...h]);
      // Cleared only on success, so a failed question is still there to retry.
      setQuestion("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
      input.current?.focus();
    }
  };

  const [latest, ...earlier] = history;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Docs Assistant"
        description="Ask about RAFAC controlled documents. Answers come only from the documents and quote the lines they rely on."
      />

      <Card>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="question">Question</FieldLabel>
                <Textarea
                  id="question"
                  ref={input}
                  rows={3}
                  maxLength={2000}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  // Enter asks, Shift+Enter is a new line — same as a chat box.
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask();
                    }
                  }}
                  placeholder="e.g. Can cadets sleep overnight in Army Reserve centres?"
                />
                <FieldDescription>
                  Each question is answered on its own, so include the detail that matters (activity, age,
                  role).
                </FieldDescription>
              </Field>
              <Button type="submit" disabled={!!pending || !session || !question.trim()}>
                {pending ? <Spinner data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
                {pending ? "Searching the documents…" : "Ask"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {!pending && !history.length && (
        <section aria-label="Example questions" className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <Button
                key={ex}
                variant="outline"
                size="sm"
                className="h-auto py-1.5 text-left whitespace-normal"
                disabled={!session}
                onClick={() => {
                  setQuestion(ex);
                  ask(ex);
                }}
              >
                {ex}
              </Button>
            ))}
          </div>
        </section>
      )}

      {pending && <PendingAnswer question={pending} />}
      {latest && <DocsAnswerView key={latest.id} question={latest.question} result={latest.result} />}

      {earlier.length > 0 && (
        <>
          <SectionHeading title="Earlier questions" className="mt-4" />
          {earlier.map((a) => (
            <DocsAnswerView key={a.id} question={a.question} result={a.result} />
          ))}
        </>
      )}
    </div>
  );
}

function PendingAnswer({ question }: { question: string }) {
  return (
    <Card aria-busy="true" aria-label="Answer loading">
      <CardHeader>
        <CardDescription>You asked</CardDescription>
        <CardTitle className="leading-snug">{question}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
        <p className="text-muted-foreground mt-2 text-xs">
          Finding the relevant passages and checking each quote against the document — usually under 10
          seconds.
        </p>
      </CardContent>
    </Card>
  );
}
