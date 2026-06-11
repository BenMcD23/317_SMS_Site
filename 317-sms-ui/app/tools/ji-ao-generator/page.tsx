"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type Event317 = { id: number; title: string };

export default function JiGenerator() {
  const { data: session } = useSession();
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [events, setEvents] = useState<Event317[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.id_token) return;
    const headers = { Authorization: `Bearer ${session.id_token}` };
    apiFetch(`${API_BASE}/events`, { headers })
      .then(res => res.json())
      .then(data => setEvents(data))
      .catch(() => toast.error("Failed to load events"));
  }, [session?.id_token]);

  const handleDownload = async (action: "ji" | "ao") => {
    if (!selectedEvent) {
      toast.error("Please select an event first");
      return;
    }

    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${session?.id_token}` };
      const response = await apiFetch(`${API_BASE}/generate-doc/${selectedEvent}/${action}`, { headers });

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${action.toUpperCase()}_Event_${selectedEvent}.docx`;
      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`${action.toUpperCase()} generated.`);
    } catch {
      toast.error("Error generating file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 pb-16">
      <PageHeader
        title="JI / AO Generator"
        description="Generate joining instructions and admin orders from a synced event"
      />

      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="event">Event</FieldLabel>
              <Select onValueChange={setSelectedEvent}>
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
                Events come from the 317 event scraper — run it if something is missing.
              </FieldDescription>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Button disabled={loading} onClick={() => handleDownload("ji")}>
                {loading ? <Spinner data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
                Generate JI
              </Button>
              <Button variant="outline" disabled={loading} onClick={() => handleDownload("ao")}>
                {loading ? <Spinner data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
                Generate AO
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
