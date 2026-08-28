"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { Download, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { AoPreview, JiPreview, type Fields } from "./document-preview";

type Event317 = { id: number; title: string };
type Action = "ji" | "ao";
type BothFields = { ji: Fields; ao: Fields };

const DOC_LABEL: Record<Action, string> = { ji: "JI", ao: "AO" };

export default function JiGenerator() {
  const { data: session } = useSession();
  const token = session?.id_token as string | undefined;

  const [events, setEvents] = useState<Event317[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [fields, setFields] = useState<BothFields | null>(null);
  const [loadingFields, setLoadingFields] = useState(false);
  const [tab, setTab] = useState<Action>("ji");
  const [generating, setGenerating] = useState<Action | null>(null);
  const [aiLoading, setAiLoading] = useState<Action | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch(`${API_BASE}/events`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(setEvents)
      .catch(() => toast.error("Failed to load events"));
  }, [token]);

  // Defaults come from the API rather than being rebuilt here, so the preview
  // starts out as exactly what the document would say untouched.
  const loadFields = useCallback(
    async (eventId: string) => {
      if (!token || !eventId) return;
      setLoadingFields(true);
      try {
        const res = await apiFetch(`${API_BASE}/generate-doc/${eventId}/fields`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        setFields(await res.json());
      } catch {
        setFields(null);
        toast.error("Could not load this event's details");
      } finally {
        setLoadingFields(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (selectedEvent) loadFields(selectedEvent);
    else setFields(null);
  }, [selectedEvent, loadFields]);

  const set = (action: Action) => (key: string, value: string) =>
    setFields((prev) => (prev ? { ...prev, [action]: { ...prev[action], [key]: value } } : prev));

  const handleAi = async (action: Action) => {
    if (!fields || !selectedEvent) return;
    setAiLoading(action);
    try {
      const res = await apiFetch(`${API_BASE}/generate-doc/${selectedEvent}/${action}/ai-description`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "AI generation failed");
      set(action)("description", data.description);
      toast.success("Description written — edit it before generating if you need to.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setAiLoading(null);
    }
  };

  const handleGenerate = async (action: Action) => {
    if (!fields || !selectedEvent) {
      toast.error("Please select an event first");
      return;
    }
    setGenerating(action);
    try {
      const response = await apiFetch(`${API_BASE}/generate-doc/${selectedEvent}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fields[action] }),
      });
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${DOC_LABEL[action]}_Event_${selectedEvent}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`${DOC_LABEL[action]} generated.`);
    } catch {
      toast.error("Error generating file.");
    } finally {
      setGenerating(null);
    }
  };

  const previewProps = (action: Action) => ({
    f: fields![action],
    set: set(action),
    onAi: () => handleAi(action),
    aiLoading: aiLoading === action,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="JI / AO Generator"
        description="Check and edit every section, then generate the Word document"
      />

      <Card>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="event">Event</FieldLabel>
            <Select value={selectedEvent} onValueChange={setSelectedEvent}>
              <SelectTrigger id="event">
                <SelectValue placeholder="Choose an event…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id.toString()}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Events come from the cadet event scraper — run it if something is missing.
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      {!selectedEvent ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No event selected</EmptyTitle>
            <EmptyDescription>
              Pick an event above to see how its joining instruction and admin order will read.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loadingFields || !fields ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Action)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="ji">Joining Instruction</TabsTrigger>
              <TabsTrigger value="ao">Admin Order</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" onClick={() => loadFields(selectedEvent)}>
              <RotateCcw data-icon="inline-start" />
              Reset to event data
            </Button>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            The highlighted boxes are editable and appear exactly where they will in the document. Edits apply to this
            download only — they are not saved back to the event.
          </p>

          <TabsContent value="ji" className="mt-4">
            <JiPreview {...previewProps("ji")} />
          </TabsContent>
          <TabsContent value="ao" className="mt-4">
            <AoPreview {...previewProps("ao")} />
          </TabsContent>

          <div className="mt-6 flex justify-end">
            <Button size="lg" disabled={generating !== null} onClick={() => handleGenerate(tab)}>
              {generating === tab ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              Generate {DOC_LABEL[tab]}
            </Button>
          </div>
        </Tabs>
      )}
    </div>
  );
}
