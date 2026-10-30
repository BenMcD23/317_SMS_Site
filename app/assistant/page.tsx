"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Bot, Check, Copy, History, Plus, Printer, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { AiMarkdown } from "@/components/ai-markdown";
import { AnswerChart } from "@/components/assistant/answer-chart";
import { AnswerTable } from "@/components/assistant/answer-table";
import { ChatList } from "@/components/assistant/chat-list";
import { RenameChatDialog } from "@/components/assistant/rename-chat-dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-fetch";
import {
  askStream,
  linkCadets,
  sourcesLine,
  type AnswerMessage,
  type ChatDetail,
  type ChatSummary,
} from "@/lib/assistant";
import { API_BASE } from "@/lib/config";
import { formatTimestamp } from "@/lib/format";
import { usePersonalDataHidden } from "@/lib/privacy";
import { useApiQuery } from "@/lib/use-api-query";

const EXAMPLES = [
  "Give me a report on parade turnout by month this year",
  "Whose first aid or WHTs run out in the next three months?",
  "Which NCOs are overdue an appraisal?",
  "Which cadets turn 18 in the next year?",
];

/** useSearchParams needs a Suspense boundary or the page fails to prerender. */
export default function AssistantPage() {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <Assistant />
    </Suspense>
  );
}

/**
 * The open chat lives in the URL (?chat=12), so a reload or a link reopens
 * it. Read from the URL once, then held in state: switching chats re-renders
 * straight away rather than waiting on Next to notice the URL change.
 */
function useChatParam(): [number | null, (id: number | null) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const [id, setId] = useState<number | null>(() => {
    const raw = Number(params.get("chat"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  const set = (next: number | null) => {
    setId(next);
    window.history.replaceState(null, "", next ? `${pathname}?chat=${next}` : pathname);
  };
  return [id, set];
}

function Assistant() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [hidePersonal] = usePersonalDataHidden();
  const [chatId, setChatId] = useChatParam();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLElement>(null);

  const chats = useApiQuery<ChatSummary[]>(["assistant-chats"], "/assistant/chats");
  const chat = useApiQuery<ChatDetail>(["assistant-chat", chatId], `/assistant/chats/${chatId}`, {
    enabled: chatId !== null,
    // A deleted or someone else's chat is a 404 that won't fix itself.
    retry: false,
  });
  const messages = chatId === null ? [] : (chat.data?.messages ?? []);
  const token = session?.id_token;

  // Bring the newest answer (or the loading placeholder) into view: on a phone
  // the thread is taller than the screen, and it lands below the fold.
  useEffect(() => {
    latest.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [messages.length, pending]);

  const open = (id: number | null) => {
    setChatId(id);
    setError(null);
    setListOpen(false);
    input.current?.focus();
  };

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["assistant-chats"] });

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || !token || pending) return;
    setPending(q);
    setStep(null);
    setError(null);
    try {
      const reply = await askStream(
        `${API_BASE}/assistant/ask/stream`,
        token,
        { question: q, chat_id: chatId, hide_personal: hidePersonal },
        setStep
      );
      // Shown straight away from the reply rather than refetched: the chat on
      // the server is exactly what was there plus these two messages.
      queryClient.setQueryData<ChatDetail>(["assistant-chat", reply.chat.id], (old) => ({
        ...reply.chat,
        messages: [
          ...(old?.messages ?? (chatId === reply.chat.id ? messages : [])),
          reply.question,
          reply.answer,
        ],
      }));
      refreshList();
      if (chatId !== reply.chat.id) setChatId(reply.chat.id);
      // Cleared only on success, so a failed question is still there to retry.
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
      setStep(null);
      input.current?.focus();
    }
  };

  const updateChat = async (target: ChatSummary, change: { title?: string; pinned?: boolean }) => {
    if (!token) return;
    await apiRequest(
      token,
      `${API_BASE}/assistant/chats/${target.id}`,
      { method: "PATCH", body: change },
      "Couldn't update the chat."
    );
    refreshList();
    queryClient.invalidateQueries({ queryKey: ["assistant-chat", target.id] });
  };

  const togglePin = async (target: ChatSummary) => {
    try {
      await updateChat(target, { pinned: !target.pinned });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDelete = (target: ChatSummary) =>
    confirm(`Delete "${target.title}"? It can't be got back.`, async () => {
      if (!token) return;
      try {
        await apiRequest(
          token,
          `${API_BASE}/assistant/chats/${target.id}`,
          { method: "DELETE" },
          "Couldn't delete the chat."
        );
        queryClient.removeQueries({ queryKey: ["assistant-chat", target.id] });
        refreshList();
        if (target.id === chatId) open(null);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const rate = async (answer: AnswerMessage, value: 1 | -1) => {
    if (!token || chatId === null) return;
    // Pressing the same thumb again takes the rating back.
    const next = answer.feedback === value ? null : value;
    const key = ["assistant-chat", chatId];
    const setFeedback = (feedback: 1 | -1 | null) =>
      queryClient.setQueryData<ChatDetail>(key, (old) =>
        old
          ? { ...old, messages: old.messages.map((m) => (m.id === answer.id ? { ...m, feedback } : m)) }
          : old
      );
    setFeedback(next);
    try {
      await apiRequest(
        token,
        `${API_BASE}/assistant/messages/${answer.id}/feedback`,
        { method: "PUT", body: { value: next } },
        "Couldn't save your rating."
      );
    } catch (e) {
      setFeedback(answer.feedback);
      toast.error((e as Error).message);
    }
  };

  const list = (
    <ChatList
      chats={chats.data}
      loading={chats.isLoading}
      error={chats.error}
      activeId={chatId}
      onOpen={open}
      onRename={setRenaming}
      onTogglePin={togglePin}
      onDelete={onDelete}
    />
  );
  const lastAnswer = [...messages].reverse().find((m): m is AnswerMessage => m.role === "assistant");
  const title = chat.data?.title;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Assistant"
        description="Ask about cadets, attendance, qualifications, stores, events and policy, or ask for a report or a chart. Answers come from the squadron's records, and it can't change anything."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" className="lg:hidden" onClick={() => setListOpen(true)}>
              <History data-icon="inline-start" />
              Chats
            </Button>
            {messages.length > 0 && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer data-icon="inline-start" />
                Print
              </Button>
            )}
            <Button variant="outline" onClick={() => open(null)} disabled={!!pending || chatId === null}>
              <Plus data-icon="inline-start" />
              New chat
            </Button>
          </div>
        }
      />

      {/* On paper, the chat's name and when, in place of the list and buttons. */}
      {title && (
        <p className="print-only text-sm">
          <strong>{title}</strong>
          {chat.data && ` · ${formatTimestamp(chat.data.updated_at)}`}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] print:grid-cols-1">
        <aside aria-label="Saved chats" className="no-print hidden lg:block">
          {list}
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {chatId !== null && chat.error && (
            <ErrorAlert
              title="Couldn't open that chat"
              message={
                chat.error.message === "Chat not found" ? "It may have been deleted." : chat.error.message
              }
            />
          )}

          {chatId !== null && chat.isLoading && <ThreadSkeleton />}

          {chatId === null && !pending && (
            <EmptyState
              icon={Bot}
              title="Ask a question"
              description="It looks things up in the records and the RAFAC documents, and can draw charts and tables. Follow-up questions carry on from the last answer."
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

          {messages.length > 0 && (
            <ol aria-label="Conversation" className="flex flex-col gap-6">
              {messages.map((m, i) => (
                <li key={m.id}>
                  {m.role === "user" ? (
                    <QuestionBubble text={m.content} />
                  ) : (
                    <Answer
                      message={m}
                      question={messages[i - 1]?.content ?? ""}
                      onRate={(v) => rate(m, v)}
                      ref={i === messages.length - 1 && !pending ? latest : undefined}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}

          {pending && <PendingTurn question={pending} step={step} ref={latest} />}

          {!pending && lastAnswer && lastAnswer.follow_ups.length > 0 && (
            <section aria-label="Suggested questions" className="no-print flex flex-wrap gap-2">
              {lastAnswer.follow_ups.map((f) => (
                <Button
                  key={f}
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 max-w-full shrink py-1.5 text-left whitespace-normal"
                  onClick={() => ask(f)}
                >
                  {f}
                </Button>
              ))}
            </section>
          )}

          <ErrorAlert title="No answer" message={error} />

          <form
            className="no-print"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="question">
                  {messages.length ? "Follow-up question" : "Question"}
                </FieldLabel>
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
                  {hidePersonal
                    ? "Personal data is hidden, so it won't look up dates of birth or emails."
                    : "It can see cadets' dates of birth and emails, but not phone numbers, parents' details or medical information."}{" "}
                  Check anything important against the cadet&apos;s record.
                </FieldDescription>
              </Field>
              <Button type="submit" className="h-9" disabled={!!pending || !session || !question.trim()}>
                {pending ? <Spinner data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
                {pending ? "Looking it up…" : "Ask"}
              </Button>
            </FieldGroup>
          </form>
        </div>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="gap-2 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Chats</SheetTitle>
            <SheetDescription>Pick one to carry on where you left off.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
        </SheetContent>
      </Sheet>

      <RenameChatDialog
        key={renaming?.id ?? "closed"}
        chat={renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        onSave={(target, newTitle) => updateChat(target, { title: newTitle })}
      />
      {confirmDialog}
    </div>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="bg-muted max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-pretty whitespace-pre-wrap">
        <span className="sr-only">You asked: </span>
        {text}
      </p>
    </div>
  );
}

function Answer({
  message,
  question,
  onRate,
  ref,
}: {
  message: AnswerMessage;
  question: string;
  onRate: (value: 1 | -1) => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const [copied, setCopied] = useState(false);
  const sources = sourcesLine(message.calls);
  const cadets = message.cadets ?? [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  // Each cadet the answer names opens their record.
  const decorate = (text: string) =>
    linkCadets(text, cadets).map((part, i) =>
      part.kind === "cadet" ? (
        <Link key={i} href={`/cadets/${part.cin}`} className="underline underline-offset-4">
          {part.text}
        </Link>
      ) : (
        part.text
      )
    );

  return (
    <article ref={ref} aria-label={`Answer to: ${question}`} className="flex scroll-mt-20 flex-col gap-3">
      <div className="[&_p]:text-foreground">
        <AiMarkdown text={message.content} decorate={decorate} />
      </div>
      {message.charts.map((c, i) => (
        <AnswerChart key={`c${i}`} chart={c} />
      ))}
      {message.tables.map((t, i) => (
        <AnswerTable key={`t${i}`} table={t} cadets={cadets} />
      ))}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <p className="text-muted-foreground mr-1 text-xs">
          {sources ?? "Answered without checking the records"}
          {message.model_label && ` · ${message.model_label}`}
          {message.fallback && " (backup model)"}
        </p>
        <div className="no-print flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label="Good answer"
            aria-pressed={message.feedback === 1}
            onClick={() => onRate(1)}
          >
            <ThumbsUp className={message.feedback === 1 ? "text-primary fill-current" : undefined} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label="Bad answer"
            aria-pressed={message.feedback === -1}
            onClick={() => onRate(-1)}
          >
            <ThumbsDown className={message.feedback === -1 ? "text-primary fill-current" : undefined} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-8"
            onClick={copy}
            aria-label="Copy answer"
          >
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function PendingTurn({
  question,
  step,
  ref,
}: {
  question: string;
  step: string | null;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      ref={ref}
      aria-busy="true"
      aria-label="Answer loading"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <QuestionBubble text={question} />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {/* Announced as it changes, so a screen reader hears the progress too. */}
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <Spinner />
        {step ? `${step}…` : "Starting…"}
      </p>
    </section>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Chat loading">
      <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
