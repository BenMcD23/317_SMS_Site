"use client";

import { useEffect, useState } from "react";
import { Check, MessageSquare, MoreVertical, RotateCcw } from "lucide-react";

import { EmptyState } from "@317/ui-common/components/empty-state";
import { Button } from "@317/ui-common/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@317/ui-common/components/ui/dropdown-menu";
import { cn } from "@317/ui-common/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatRelative } from "@/lib/format";
import { programmeApi, type Comment, type Programme, type Thread } from "@/lib/programme-builder";
import { CommentBody, PersonAvatar } from "@/components/programme-builder/comment-body";
import { CommentComposer, type MentionPerson } from "@/components/programme-builder/comment-composer";
import type { useProgramme } from "@/components/programme-builder/use-programme";

/** What new comments attach to: a session, a night, or (null) the programme. */
export type CommentFocus = { slotId?: number; nightId?: number; quote: string } | null;

type Run = ReturnType<typeof useProgramme>["run"];

/**
 * The comment threads down the side of the programme, as in Google Docs: open
 * threads first, each with what it's about (tap to find it on the grid),
 * replies, and Resolve. Everyone who can see the programme can comment,
 * reply, resolve and reopen; only the writer edits a comment, and staff can
 * delete any. Mentions and replies email people from the API.
 */
export function CommentsPanel({
  programme,
  people,
  focus,
  onClearFocus,
  onShow,
  highlight,
  replyTo,
  run,
  confirm,
}: {
  programme: Programme;
  people: MentionPerson[];
  focus: CommentFocus;
  onClearFocus: () => void;
  /** Scroll the grid to a session or night. */
  onShow: (where: { slotId?: number | null; nightId?: number | null }) => void;
  /** A thread to bring into view: the link in an email. */
  highlight: number | null;
  /** A thread whose reply box opens straight away ("Reply" in an email). */
  replyTo: number | null;
  run: Run;
  confirm: (message: string, action: () => void) => void;
}) {
  const [show, setShow] = useState<"open" | "resolved">("open");
  const month = programme.month;

  const anchored = (t: Thread) =>
    !focus ||
    (focus.slotId ? t.slot_id === focus.slotId : focus.nightId ? t.night_id === focus.nightId : true);
  const threads = programme.comments.filter(anchored);
  const open = threads.filter((t) => !t.resolved_at);
  const resolved = threads.filter((t) => t.resolved_at);
  // A linked thread that's resolved still opens: switch to where it is.
  const linked = programme.comments.find((t) => t.id === highlight);
  const showing = linked?.resolved_at && show === "open" && !focus ? "resolved" : show;
  const shown = showing === "open" ? open : resolved;

  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`thread-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, showing]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        {focus ? (
          <div className="flex items-start justify-between gap-2">
            <p className="border-chart-4 text-muted-foreground border-l-2 pl-2 text-sm">{focus.quote}</p>
            <Button variant="ghost" size="sm" onClick={onClearFocus}>
              All comments
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            On the whole programme. To comment on a night or a session, use its comment button.
          </p>
        )}
        <CommentComposer
          key={focus ? `${focus.slotId}-${focus.nightId}` : "programme"}
          people={people}
          label={focus ? `Comment on ${focus.quote}` : "Comment on the programme"}
          allowAssign
          autoFocus={!!focus}
          onSubmit={(body, assign) =>
            run((t) =>
              programmeApi.comment(t, month, {
                body,
                assign,
                ...(focus?.slotId
                  ? { slot_id: focus.slotId }
                  : focus?.nightId
                    ? { night_id: focus.nightId }
                    : {}),
              })
            )
          }
        />
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Which comments"
        value={showing}
        onValueChange={(v) => v && setShow(v as "open" | "resolved")}
        className="self-start"
      >
        <ToggleGroupItem value="open" className="px-3">
          Open {open.length}
        </ToggleGroupItem>
        <ToggleGroupItem value="resolved" className="px-3">
          Resolved {resolved.length}
        </ToggleGroupItem>
      </ToggleGroup>

      {shown.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={showing === "open" ? "No open comments" : "Nothing resolved yet"}
          description={
            showing === "open"
              ? "Ask a question or @ someone, and they'll get an email with a link straight to it."
              : "Resolved threads are kept here, and reopen if anyone replies."
          }
        />
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Comment threads">
          {shown.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              people={people}
              month={month}
              highlighted={t.id === highlight}
              replyOpen={t.id === replyTo}
              onShow={onShow}
              run={run}
              confirm={confirm}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ThreadCard({
  thread,
  people,
  month,
  highlighted,
  replyOpen,
  onShow,
  run,
  confirm,
}: {
  thread: Thread;
  people: MentionPerson[];
  month: string;
  highlighted: boolean;
  replyOpen: boolean;
  onShow: (where: { slotId?: number | null; nightId?: number | null }) => void;
  run: Run;
  confirm: (message: string, action: () => void) => void;
}) {
  const [replying, setReplying] = useState(replyOpen);
  const resolved = !!thread.resolved_at;
  const anchored = thread.slot_id || thread.night_id;

  return (
    <li
      id={`thread-${thread.id}`}
      aria-label={`Comment by ${thread.author.name}`}
      className={cn(
        "bg-card flex flex-col gap-3 rounded-lg border p-3 transition-shadow",
        highlighted && "ring-primary ring-2",
        resolved && "bg-muted/40"
      )}
    >
      {thread.quote &&
        (anchored ? (
          <button
            type="button"
            onClick={() => onShow({ slotId: thread.slot_id, nightId: thread.night_id })}
            className="border-chart-4 text-muted-foreground hover:text-foreground min-h-8 border-l-2 pl-2 text-left text-xs"
          >
            {thread.quote}
          </button>
        ) : (
          <p className="border-chart-4 text-muted-foreground border-l-2 pl-2 text-xs">{thread.quote}</p>
        ))}
      {thread.assignee && !resolved && (
        <p className="text-primary text-xs font-semibold">Assigned to {thread.assignee.name}</p>
      )}
      <CommentRow
        comment={thread}
        people={people}
        run={run}
        confirm={confirm}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={resolved ? "Reopen" : thread.assignee ? "Mark as done" : "Resolve"}
            title={resolved ? "Reopen" : thread.assignee ? "Mark as done" : "Resolve"}
            onClick={() =>
              run((t) => programmeApi.resolve(t, thread.id, !resolved), resolved ? "Reopened." : "Resolved.")
            }
          >
            {resolved ? <RotateCcw /> : <Check />}
          </Button>
        }
      />
      {thread.replies.map((r) => (
        <CommentRow key={r.id} comment={r} people={people} run={run} confirm={confirm} />
      ))}
      {resolved && <p className="text-muted-foreground text-xs">Resolved by {thread.resolved_by}</p>}
      {replying ? (
        <CommentComposer
          people={people}
          label={`Reply to ${thread.author.name}`}
          placeholder={resolved ? "Reply to reopen it" : "Reply, or @ someone"}
          submitLabel="Reply"
          autoFocus
          onCancel={() => setReplying(false)}
          onSubmit={async (body) => {
            const ok = await run((t) => programmeApi.comment(t, month, { body, parent_id: thread.id }));
            if (ok) setReplying(false);
            return ok;
          }}
        />
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setReplying(true)}>
          Reply
        </Button>
      )}
    </li>
  );
}

function CommentRow({
  comment,
  people,
  actions,
  run,
  confirm,
}: {
  comment: Comment;
  people: MentionPerson[];
  actions?: React.ReactNode;
  run: Run;
  confirm: (message: string, action: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex gap-2">
      <PersonAvatar name={comment.author.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{comment.author.name}</p>
            <p className="text-muted-foreground text-xs">
              {formatRelative(comment.created_at)}
              {comment.edited_at && " · edited"}
            </p>
          </div>
          {actions}
          {(comment.can_edit || comment.can_delete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More for ${comment.author.name}'s comment`}
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {comment.can_edit && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
                )}
                {comment.can_delete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      confirm(
                        comment.parent_id ? "Delete this reply?" : "Delete this comment and its replies?",
                        () => void run((t) => programmeApi.deleteComment(t, comment.id), "Deleted.")
                      )
                    }
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <CommentComposer
            people={people}
            label="Edit comment"
            initial={comment.body}
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const ok = await run((t) => programmeApi.editComment(t, comment.id, body));
              if (ok) setEditing(false);
              return ok;
            }}
          />
        ) : (
          <CommentBody body={comment.body} />
        )}
      </div>
    </div>
  );
}
