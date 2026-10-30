"use client";

import { MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatSummary } from "@/lib/assistant";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The signed-in person's saved assistant chats: pinned first, then most
 * recent. A whole row opens its chat; its menu (always visible, as a phone
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
  onDelete,
}: {
  chats: ChatSummary[] | undefined;
  loading: boolean;
  error: Error | null;
  activeId: number | null;
  onOpen: (id: number) => void;
  onRename: (chat: ChatSummary) => void;
  onTogglePin: (chat: ChatSummary) => void;
  onDelete: (chat: ChatSummary) => void;
}) {
  if (error) return <ErrorAlert title="Couldn't load your chats" message={error.message} />;
  if (loading || !chats) return <ListSkeleton rows={4} className="h-10" />;
  if (!chats.length)
    return (
      <p className="text-muted-foreground flex items-center gap-2 px-1 py-2 text-sm">
        <MessageSquare className="size-4 shrink-0" />
        Your chats appear here, to carry on later.
      </p>
    );

  return (
    <ul aria-label="Your chats" className="flex flex-col gap-1">
      {chats.map((chat) => {
        const active = chat.id === activeId;
        return (
          <li key={chat.id} className="flex items-center gap-1">
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
                {chat.pinned && (
                  <Pin aria-label="Pinned" className="text-muted-foreground size-3.5 shrink-0" />
                )}
                <span className="truncate text-sm font-medium">{chat.title}</span>
              </span>
              <span className="text-muted-foreground text-xs">{formatTimestamp(chat.updated_at)}</span>
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
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(chat)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
