"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@317/ui-common/components/ui/button";
import { Checkbox } from "@317/ui-common/components/ui/checkbox";
import { Label } from "@317/ui-common/components/ui/label";
import { Textarea } from "@317/ui-common/components/ui/textarea";
import { cn } from "@317/ui-common/lib/utils";
import {
  fromTokens,
  insertMention,
  matchPeople,
  mentionQuery,
  toTokens,
  type PersonRef,
} from "@/lib/programme-builder";
import { PersonAvatar } from "@/components/programme-builder/comment-body";

export type MentionPerson = PersonRef & { kind: string };

/**
 * The comment box: type "@" and a name to mention a staff member or NCO, as
 * in Google Docs. Arrow keys and Enter pick from the list; Ctrl/⌘+Enter
 * sends. Starting a thread with someone mentioned offers "Assign to" them,
 * which emails them an action item instead of a mention.
 *
 * Mentions stay readable ("@Sgt Sarah Hughes") while typing and become the
 * API's tokens only when sent, so deleting a name un-mentions them.
 */
export function CommentComposer({
  people,
  label,
  placeholder = "Comment, or @ someone",
  initial = "",
  submitLabel = "Comment",
  allowAssign = false,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  people: MentionPerson[];
  /** The box's accessible name. */
  label: string;
  placeholder?: string;
  /** A stored body to edit. */
  initial?: string;
  submitLabel?: string;
  allowAssign?: boolean;
  autoFocus?: boolean;
  /** Resolves true when it's saved, to clear the box. */
  onSubmit: (body: string, assign: boolean) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const start = useMemo(() => fromTokens(initial), [initial]);
  const [text, setText] = useState(start.text);
  const [picked, setPicked] = useState<PersonRef[]>(start.picked);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [assign, setAssign] = useState(false);
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes after a pick. Set straight after the render that
  // puts the name in, not on a timer, so a fast typist's next key lands after it.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && pendingCaret.current !== null) {
      el.focus();
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);
  const listId = useId();
  const assignId = useId();

  const matches = query === null ? [] : matchPeople(people, query);
  const open = matches.length > 0;
  // Who "Assign to" would assign: the first pick still in the text.
  const assignee = picked.find((p) => text.includes(`@${p.name}`)) ?? null;

  function track(value: string, caret: number) {
    setText(value);
    const q = mentionQuery(value.slice(0, caret));
    setQuery(q);
    setActive(0);
  }

  function choose(person: MentionPerson) {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const next = insertMention(text, caret, person.name);
    setText(next.text);
    setPicked((p) =>
      p.some((x) => x.key === person.key) ? p : [...p, { key: person.key, name: person.name }]
    );
    setQuery(null);
    pendingCaret.current = next.caret;
  }

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSubmit(toTokens(text.trim(), picked), allowAssign && assign && !!assignee);
    setSending(false);
    if (ok && !initial) {
      setText("");
      setPicked([]);
      setAssign(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Textarea
          ref={box}
          rows={2}
          value={text}
          autoFocus={autoFocus}
          aria-label={label}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          className="min-h-16 text-sm"
          onChange={(e) => track(e.target.value, e.target.selectionStart)}
          onClick={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive((a) => (a + step + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                choose(matches[active] as MentionPerson);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setQuery(null);
                return;
              }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
            if (e.key === "Escape" && onCancel) onCancel();
          }}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="People to mention"
            className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border shadow-md"
          >
            {matches.map((p, i) => (
              <li
                key={p.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Mouse down, not click: a click would blur the box first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p as MentionPerson);
                }}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm",
                  i === active && "bg-accent text-accent-foreground"
                )}
              >
                <PersonAvatar name={p.name} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-muted-foreground text-xs">
                  {(p as MentionPerson).kind === "staff" ? "Staff" : "NCO"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {allowAssign && assignee && (
        <div className="flex items-center gap-2">
          <Checkbox id={assignId} checked={assign} onCheckedChange={(v) => setAssign(v === true)} />
          <Label htmlFor={assignId} className="text-sm font-normal">
            Assign to {assignee.name}
          </Label>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" disabled={!text.trim() || sending} onClick={() => void send()}>
          {sending ? "Sending…" : allowAssign && assign && assignee ? "Assign" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
