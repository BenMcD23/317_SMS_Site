"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronRight, MessageSquare, MessageSquarePlus, Plus, Trash2, User,
} from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { useConfirm } from "@/components/confirm-dialog";
import { CadetSearchInput } from "@/components/cadet-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty";
import { formatDate, formatTimestamp } from "@/lib/format";
import {
  addReply, createComment, deleteComment, deleteReply, groupByCadet, isAboutCadet,
  todayISO, type NcoComment, type NcoCommentList,
} from "@/lib/nco-comments";

type Tab = "cadets" | "by-cadet" | "general";

export default function NcoCommentsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const [tab, setTab] = useState<Tab>("cadets");
  const [dialogOpen, setDialogOpen] = useState(false);
  // Which cadet's threads the "By Cadet" tab is drilled into, by group key.
  const [openCadet, setOpenCadet] = useState<string | null>(null);
  const [cadetFilter, setCadetFilter] = useState("");

  const { data, isLoading, error } = useApiQuery<NcoCommentList>(
    ["nco-comments"],
    "/nco-comments",
  );

  const token = session?.id_token;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["nco-comments"] });

  const comments = useMemo(() => data?.comments ?? [], [data]);
  const cadetComments = useMemo(() => comments.filter(isAboutCadet), [comments]);
  const generalComments = useMemo(() => comments.filter((c) => !isAboutCadet(c)), [comments]);
  const cadetGroups = useMemo(() => groupByCadet(comments), [comments]);

  const filteredGroups = useMemo(() => {
    const q = cadetFilter.trim().toLowerCase();
    return q ? cadetGroups.filter((g) => g.name.toLowerCase().includes(q)) : cadetGroups;
  }, [cadetGroups, cadetFilter]);

  const selectedGroup = cadetGroups.find((g) => g.key === openCadet) ?? null;

  const onDelete = (comment: NcoComment) =>
    confirm(
      `Delete "${comment.subject}"? Its replies go with it.`,
      async () => {
        if (!token) return;
        try {
          await deleteComment(token, comment.id);
          toast.success("Comment deleted");
          refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete that comment.");
        }
      },
    );

  const newCommentButton = (
    <Button size="sm" onClick={() => setDialogOpen(true)}>
      <Plus /> New Comment
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="NCO Comments"
        description="Quick notes about a cadet or the squadron — every NCO and staff member can read them and reply"
        actions={newCommentButton}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => { setTab(v as Tab); setOpenCadet(null); }}
      >
        <TabsList>
          <TabsTrigger value="cadets">Cadet Comments</TabsTrigger>
          <TabsTrigger value="by-cadet">By Cadet</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load comments: {error.message}</p>
      ) : tab === "by-cadet" ? (
        selectedGroup ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpenCadet(null)}>
                <ArrowLeft /> All cadets
              </Button>
              <h2 className="text-base font-medium">{selectedGroup.name}</h2>
              {selectedGroup.flight && (
                <Badge variant="outline" className="font-normal">{selectedGroup.flight} Flight</Badge>
              )}
            </div>
            <CommentList
              comments={selectedGroup.comments}
              token={token}
              onChanged={refresh}
              onDelete={onDelete}
              emptyTitle="No comments on this cadet"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Filter cadets…"
              value={cadetFilter}
              onChange={(e) => setCadetFilter(e.target.value)}
              className="max-w-xs"
            />
            {filteredGroups.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><User /></EmptyMedia>
                  <EmptyTitle>No cadets yet</EmptyTitle>
                  <EmptyDescription>
                    {cadetFilter
                      ? "No cadet here matches that name."
                      : "Comments filed against a cadet will list them here."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredGroups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setOpenCadet(group.key)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{group.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.comments.length} comment{group.comments.length === 1 ? "" : "s"}
                        {group.comments[0].comment_date && (
                          <> · latest {formatDate(group.comments[0].comment_date)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {group.flight && (
                        <Badge variant="outline" className="font-normal">{group.flight}</Badge>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <CommentList
          comments={tab === "cadets" ? cadetComments : generalComments}
          token={token}
          onChanged={refresh}
          onDelete={onDelete}
          emptyTitle={tab === "cadets" ? "No cadet comments yet" : "No general comments yet"}
          emptyAction={newCommentButton}
        />
      )}

      <NewCommentDialog
        // Remounted per opening so the form starts clean, with today's date.
        key={dialogOpen ? "open" : "closed"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        token={token}
        onSaved={(comment) => {
          setTab(isAboutCadet(comment) ? "cadets" : "general");
          setOpenCadet(null);
          refresh();
        }}
      />
      {confirmDialog}
    </div>
  );
}

function CommentList({
  comments,
  token,
  onChanged,
  onDelete,
  emptyTitle,
  emptyAction,
}: {
  comments: NcoComment[];
  token: string | undefined;
  onChanged: () => void;
  onDelete: (comment: NcoComment) => void;
  emptyTitle: string;
  emptyAction?: React.ReactNode;
}) {
  if (comments.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>
            Drop a quick note here and any NCO or staff member can pick it up and reply.
          </EmptyDescription>
        </EmptyHeader>
        {emptyAction}
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {comments.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          token={token}
          onChanged={onChanged}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function CommentCard({
  comment,
  token,
  onChanged,
  onDelete,
}: {
  comment: NcoComment;
  token: string | undefined;
  onChanged: () => void;
  onDelete: (comment: NcoComment) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  const submitReply = async () => {
    const text = replyText.trim();
    if (!token || !text) return;
    setBusy(true);
    try {
      await addReply(token, comment.id, text);
      setReplyText("");
      setReplying(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post that reply.");
    } finally {
      setBusy(false);
    }
  };

  const removeReply = async (replyId: number) => {
    if (!token) return;
    setBusy(true);
    try {
      await deleteReply(token, comment.id, replyId);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that reply.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{comment.subject}</p>
            {isAboutCadet(comment) ? (
              <Badge variant="secondary" className="font-normal">
                <User className="size-3" /> {comment.cadet_name}
                {comment.cadet_cin === null && " (left)"}
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal">General</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {comment.comment_date ? formatDate(comment.comment_date) : "—"} · {comment.author_name}
            {comment.is_mine && " (you)"}
          </p>
        </div>
        {comment.can_delete && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete(comment)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <p className="mt-2 text-sm whitespace-pre-wrap">{comment.body}</p>

      {comment.replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l pl-3">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
                <p className="text-[11px] text-muted-foreground">
                  {reply.author_name}
                  {reply.created_at && <> · {formatTimestamp(reply.created_at)}</>}
                </p>
              </div>
              {reply.can_delete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => removeReply(reply.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {replying ? (
        <div className="mt-3 space-y-2">
          <Textarea
            autoFocus
            rows={3}
            placeholder="Add to the chain…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => { setReplying(false); setReplyText(""); }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !replyText.trim()} onClick={submitReply}>
              Reply
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setReplying(true)}
        >
          <MessageSquarePlus className="size-3" /> Reply
        </Button>
      )}
    </div>
  );
}

/** The quick-comment form: dated today, a subject, general or about a cadet,
 *  and the note itself. */
function NewCommentDialog({
  open,
  onOpenChange,
  token,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | undefined;
  onSaved: (comment: NcoComment) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [subject, setSubject] = useState("");
  const [about, setAbout] = useState<"general" | "cadet">("general");
  const [cadetCin, setCadetCin] = useState<number | null>(null);
  const [cadetName, setCadetName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const invalid =
    !date || !subject.trim() || !body.trim() || (about === "cadet" && cadetCin === null);

  const submit = async () => {
    if (!token || invalid) return;
    setSubmitting(true);
    try {
      const saved = await createComment(token, {
        subject: subject.trim(),
        body: body.trim(),
        comment_date: date,
        cadet_cin: about === "cadet" ? cadetCin : null,
      });
      toast.success("Comment posted");
      onOpenChange(false);
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post that comment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New comment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comment-date">Date</Label>
            <Input
              id="comment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment-subject">Subject</Label>
            <Input
              id="comment-subject"
              placeholder="e.g. Drill turnout"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>About</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={about}
              onValueChange={(v) => {
                if (!v) return;
                setAbout(v as "general" | "cadet");
                // Dropping back to general shouldn't quietly keep a cadet attached.
                if (v === "general") { setCadetCin(null); setCadetName(""); }
              }}
            >
              <ToggleGroupItem value="general">General</ToggleGroupItem>
              <ToggleGroupItem value="cadet">A cadet</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {about === "cadet" && (
            <div className="space-y-2">
              <Label>Cadet</Label>
              <CadetSearchInput
                token={token ?? null}
                selectedCin={cadetCin}
                selectedName={cadetName}
                onSelect={(cin, name) => { setCadetCin(cin); setCadetName(name); }}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="comment-body">Comment</Label>
            <Textarea
              id="comment-body"
              rows={5}
              placeholder="What happened?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting || invalid} onClick={submit}>Post Comment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
