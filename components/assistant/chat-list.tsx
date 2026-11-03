"use client";

import { useState } from "react";
import {
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";

import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { chatGroups, daysUntilDeletion, deletionWhen, type ChatSummary } from "@/lib/assistant";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The signed-in person's saved assistant chats, grouped (Pinned, Today,
 * Yesterday, Previous 7 days, Earlier) with a search over their names once
 * there are enough to need one. A protected chat is marked, and one in its
 * last week before the 30-day cleanup says when it goes. A whole row opens its chat; its menu (always visible, as a phone
 * has no hover) renames, pins or deletes it. Rendered beside the chat on a
 * laptop and in a sheet on a phone, so it takes everything it shows and does
 * as props.
 */
export function ChatList({
  chats,
  loading,
  error,
  activeId,
  onOpen,
  onRename,
  onTogglePin,
  onToggleProtect,
  onDelete,
}: {
  chats: ChatSummary[] | undefined;
  loading: boolean;
  error: Error | null;
  activeId: number | null;
  onOpen: (id: number) => void;
  onRename: (chat: ChatSummary) => void;
  onTogglePin: (chat: ChatSummary) => void;
  onToggleProtect: (chat: ChatSummary) => void;
  onDelete: (chat: ChatSummary) => void;
}) {
  const [query, setQuery] = useState("");
  if (error) return <ErrorAlert title="Couldn't load your chats" message={error.message} />;
  if (loading || !chats) return <ListSkeleton rows={4} className="h-10" />;
  if (!chats.length)
    return (
      <p className="text-muted-foreground flex items-center gap-2 px-1 py-2 text-sm">
        <MessageSquare className="size-4 shrink-0" />
        Your chats appear here, to carry on later.
      </p>
    );

  const q = query.trim().toLowerCase();
  const groups = chatGroups(q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats);

  return (
    <nav aria-label="Your chats" className="flex flex-col gap-3">
      {chats.length > 5 && (
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search your chats"
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>
      )}
      {!groups.length && (
        <p className="text-muted-foreground px-1 text-sm">No chats match “{query.trim()}”.</p>
      )}
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
          <h3 className="text-muted-foreground px-2 text-xs font-medium">{group.label}</h3>
          <ul className="flex flex-col gap-1">
            {group.chats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={chat.id === activeId}
                onOpen={onOpen}
                onRename={onRename}
                onTogglePin={onTogglePin}
                onToggleProtect={onToggleProtect}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function ChatRow({
  chat,
  active,
  onOpen,
  onRename,
  onTogglePin,
  onToggleProtect,
  onDelete,
}: {
  chat: ChatSummary;
  active: boolean;
  onOpen: (id: number) => void;
  onRename: (chat: ChatSummary) => void;
  onTogglePin: (chat: ChatSummary) => void;
  onToggleProtect: (chat: ChatSummary) => void;
  onDelete: (chat: ChatSummary) => void;
}) {
  const days = daysUntilDeletion(chat);
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onOpen(chat.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "hover:bg-muted flex min-h-10 min-w-0 flex-1 flex-col items-start rounded-md px-2 py-1.5 text-left",
          active && "bg-muted"
        )}
      >
        <span className="flex w-full items-center gap-1.5">
          <span className="truncate text-sm font-medium">{chat.title}</span>
        </span>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          {chat.protected && <ShieldCheck aria-label="Protected" className="size-3.5 shrink-0" />}
          {days === null ? (
            formatTimestamp(chat.updated_at)
          ) : (
            <span className="text-warning font-medium">Deletes {deletionWhen(days)}</span>
          )}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 shrink-0"
            aria-label={`More for "${chat.title}"`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(chat)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTogglePin(chat)}>
            {chat.pinned ? <PinOff /> : <Pin />}
            {chat.pinned ? "Unpin" : "Pin to top"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onToggleProtect(chat)}>
            {chat.protected ? <ShieldOff /> : <ShieldCheck />}
            {chat.protected ? "Stop protecting" : "Protect chat"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(chat)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
