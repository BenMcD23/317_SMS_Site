"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

export default function JiGenerator() {
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch events on load
  useEffect(() => {
    apiFetch(`${API_BASE}/events`)
      .then(res => res.json())
      .then(data => setEvents(data))
      .catch(() => toast.error("Failed to load events"));
  }, []);

  const handleDownload = async (action: "ji" | "ao") => {
    if (!selectedEvent) {
      toast.error("Please select an event first");
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/generate-doc/${selectedEvent}/${action}`);
      
      if (!response.ok) throw new Error("Download failed");

      // Convert response to blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create hidden link and click it
      const a = document.createElement("a");
      a.href = url;
      a.download = `${action.toUpperCase()}_Event_${selectedEvent}.docx`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`${action.toUpperCase()} generated successfully!`);
    } catch (error) {
      toast.error("Error generating file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl pb-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">JI / AO Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Event</label>
            <Select onValueChange={setSelectedEvent}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an event..." />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id.toString()}>
                    {event.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button 
              disabled={loading}
              onClick={() => handleDownload("ji")}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loading ? "Generating..." : "Generate JI"}
            </Button>
            <Button 
              disabled={loading}
              onClick={() => handleDownload("ao")}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Generating..." : "Generate AO"}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <Link href="/">
              <Button variant="ghost" className="w-full">← Back to Home</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}