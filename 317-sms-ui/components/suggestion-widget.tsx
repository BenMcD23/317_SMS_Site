"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquarePlus,
  MousePointerClick,
  Send,
  X,
} from "lucide-react";

import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// A tagged element the user clicked on the page. `label` is a human-readable
// description (aria-label / trimmed text / tag name); `selector` is a
// best-effort CSS path so the maintainer can find the exact element.
type Tag = { label: string; selector: string };

/** Short CSS-ish path to an element — enough for a human to locate it. */
function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < 4) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${node.id}`);
      break; // an id is unique — no need to walk further up
    }
    const cls =
      typeof node.className === "string"
        ? node.className.split(/\s+/).filter(Boolean).slice(0, 2)
        : [];
    if (cls.length) part += "." + cls.join(".");
    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

/** Turn a clicked element into a taggable reference. */
function describeElement(el: Element): Tag {
  const aria = el.getAttribute("aria-label")?.trim();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  let label = aria || (text ? text.slice(0, 80) : "") || el.tagName.toLowerCase();
  if (!aria && text.length > 80) label += "…";
  return { label, selector: cssPath(el) };
}

export function SuggestionWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [aboutCurrentPage, setAboutCurrentPage] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const highlightRef = useRef<HTMLDivElement>(null);

  const endPick = () => {
    setPicking(false);
    setOpen(true); // reopen the form once picking finishes/cancels
  };

  // Element-picker: while active, hovering highlights the element under the
  // cursor and a click captures it as a tag. Listeners run in the capture phase
  // so a click tags the element instead of triggering the app underneath.
  useEffect(() => {
    if (!picking) return;

    const box = highlightRef.current;
    let current: Element | null = null;

    // Ignore our own picker chrome so it can't be tagged or block picking.
    const isOwn = (el: Element | null) =>
      !el || !!el.closest("[data-suggestion-widget]");

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (isOwn(el)) {
        current = null;
        if (box) box.style.display = "none";
        return;
      }
      current = el;
      if (box && el) {
        const r = el.getBoundingClientRect();
        box.style.display = "block";
        box.style.top = `${r.top}px`;
        box.style.left = `${r.left}px`;
        box.style.width = `${r.width}px`;
        box.style.height = `${r.height}px`;
      }
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = current ?? document.elementFromPoint(e.clientX, e.clientY);
      if (el && !isOwn(el)) {
        const tag = describeElement(el);
        setTags((prev) =>
          prev.some((t) => t.selector === tag.selector) ? prev : [...prev, tag]
        );
      }
      endPick();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endPick();
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.body.style.cursor = "crosshair";

    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.cursor = "";
    };
  }, [picking]);

  const startPick = () => {
    setOpen(false); // get the dialog out of the way so the whole page is pickable
    setPicking(true);
  };

  const removeTag = (selector: string) =>
    setTags((prev) => prev.filter((t) => t.selector !== selector));

  async function submit() {
    if (!message.trim()) {
      toast.error("Please describe your suggestion first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          page_url: window.location.href,
          page_title: document.title,
          about_current_page: aboutCurrentPage,
          tagged_elements: tags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || data?.error || "Failed to send suggestion");
      }
      toast.success("Suggestion sent — thanks! A copy is on its way to your inbox.");
      setMessage("");
      setTags([]);
      setAboutCurrentPage(true);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send suggestion");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span data-suggestion-widget>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Send a suggestion"
        title="Send a suggestion"
      >
        <MessageSquarePlus />
      </Button>

      {/* Picker overlay — highlight box + instruction banner, both marked as our
          own chrome so they're never tagged. Rendered only while picking. */}
      {picking && (
        <>
          <div
            ref={highlightRef}
            data-suggestion-widget
            className="pointer-events-none fixed z-[9998] rounded-sm border-2 border-primary bg-primary/10"
            style={{ display: "none" }}
          />
          <div
            data-suggestion-widget
            className="pointer-events-none fixed left-1/2 top-4 z-[9999] -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background shadow-lg"
          >
            Click an element to tag it · press Esc to cancel
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-suggestion-widget>
          <DialogHeader>
            <DialogTitle>Send a suggestion</DialogTitle>
            <DialogDescription>
              Spotted a bug or have an idea? Let us know and a copy is emailed to
              you too.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="about-current-page"
                checked={aboutCurrentPage}
                onCheckedChange={(v) => setAboutCurrentPage(v === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label htmlFor="about-current-page" className="font-normal">
                  This is about the page I&apos;m currently on
                </Label>
                <p className="text-xs text-muted-foreground">
                  {aboutCurrentPage ? (
                    <>
                      Current page:{" "}
                      <span className="font-mono">{pathname}</span>
                    </>
                  ) : (
                    "Navigate to the page your suggestion is about, then reopen this form so we capture the right page."
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="suggestion-message">Your suggestion</Label>
              <Textarea
                id="suggestion-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the issue or idea. Tag anything on the page to point at it."
                rows={5}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Tagged elements</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startPick}
                >
                  <MousePointerClick />
                  Tag an element
                </Button>
              </div>
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Optional — click “Tag an element”, then click anything on the
                  page to reference it.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.selector}
                      variant="secondary"
                      className="max-w-full gap-1 pr-1"
                    >
                      <span className="truncate">{tag.label}</span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag.selector)}
                        aria-label={`Remove ${tag.label}`}
                        className="rounded-sm hover:bg-foreground/10"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              Send suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
