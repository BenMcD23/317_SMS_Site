"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowUp, Bot, RotateCcw } from "lucide-react";

import { AiMarkdown } from "@/components/ai-markdown";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-fetch";
import {
  historyFor,
  isAssistantReply,
  sourcesLine,
  type AssistantReply,
  type AssistantTurn,
} from "@/lib/assistant";
import { API_BASE } from "@/lib/config";

const EXAMPLES = [
  "Whose first aid expires in the next three months?",
  "Who in B flight has missed the most parades lately?",
  "Which uniform orders can we fill from what's on the shelf?",
  "Which Leading Cadets don't have a leadership badge yet?",
];

export default function AssistantPage() {
  const { data: session } = useSession();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // This chat, oldest first, as a chat reads. Not saved: a reload starts afresh.
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const nextId = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLElement>(null);

  // Bring the newest answer (or the loading placeholder) into view: on a phone
  // the thread is taller than the screen, and it lands below the fold.
  useEffect(() => {
    latest.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [turns.length, pending]);

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || !session?.id_token || pending) return;
    setPending(q);
    setError(null);
    try {
      const reply = await apiRequest<AssistantReply>(
        session.id_token,
        `${API_BASE}/assistant/ask`,
        { method: "POST", body: { question: q, history: historyFor(turns) } },
        "The assistant couldn't answer."
      );
      if (!isAssistantReply(reply)) throw new Error("The assistant sent back an answer it couldn't read.");
      setTurns((t) => [...t, { id: nextId.current++, question: q, reply }]);
      // Cleared only on success, so a failed question is still there to retry.
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
      input.current?.focus();
    }
  };

  const startAgain = () => {
    setTurns([]);
    setError(null);
    input.current?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Assistant"
        description="Ask about cadets, attendance, qualifications, stores and events. Answers come from the squadron's records, and it can't change anything."
        actions={
          turns.length > 0 && (
            <Button variant="outline" onClick={startAgain} disabled={!!pending}>
              <RotateCcw data-icon="inline-start" />
              New chat
            </Button>
          )
        }
      />

      {!turns.length && !pending && (
        <EmptyState
          icon={Bot}
          title="Ask a question"
          description="It looks things up in the records, so name the flight, badge or time span you mean."
        >
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <Button
                key={ex}
                variant="outline"
                size="sm"
                className="h-auto min-h-9 max-w-full shrink py-1.5 whitespace-normal"
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
        </EmptyState>
      )}

      {turns.length > 0 && (
        <ol aria-label="Conversation" className="flex flex-col gap-6">
          {turns.map((t, i) => (
            <li key={t.id}>
              <Turn turn={t} ref={i === turns.length - 1 && !pending ? latest : undefined} />
            </li>
          ))}
        </ol>
      )}

      {pending && <PendingTurn question={pending} ref={latest} />}

      <ErrorAlert title="No answer" message={error} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="question">{turns.length ? "Follow-up question" : "Question"}</FieldLabel>
            <Textarea
              id="question"
              ref={input}
              rows={2}
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
              placeholder="e.g. Who hasn't been to a parade in the last six weeks?"
            />
            <FieldDescription>
              It can&apos;t see contact details, dates of birth or medical information. Check anything
              important against the cadet&apos;s record.
            </FieldDescription>
          </Field>
          <Button type="submit" className="h-9" disabled={!!pending || !session || !question.trim()}>
            {pending ? <Spinner data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
            {pending ? "Looking it up…" : "Ask"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}

function Question({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs font-medium">You asked</p>
      <p className="font-semibold text-pretty whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function Turn({ turn, ref }: { turn: AssistantTurn; ref?: React.Ref<HTMLElement> }) {
  const { question, reply } = turn;
  const sources = sourcesLine(reply.calls);
  return (
    <article ref={ref} aria-label={question} className="flex scroll-mt-20 flex-col gap-3 border-b pb-6">
      <Question text={question} />
      <div className="[&_p]:text-foreground">
        <AiMarkdown text={reply.answer} />
      </div>
      <p className="text-muted-foreground text-xs">
        {sources ?? "Answered without checking the records"}
        {" · "}
        {reply.model_label}
        {reply.fallback && " (backup model)"}
      </p>
    </article>
  );
}

function PendingTurn({ question, ref }: { question: string; ref?: React.Ref<HTMLElement> }) {
  return (
    <section
      ref={ref}
      aria-busy="true"
      aria-label="Answer loading"
      className="flex scroll-mt-20 flex-col gap-3 border-b pb-6"
    >
      <Question text={question} />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <p className="text-muted-foreground text-xs">
        Looking it up in the squadron&apos;s records. This usually takes 10 to 30 seconds.
      </p>
    </section>
  );
}
