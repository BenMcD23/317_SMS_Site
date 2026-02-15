"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

// Mock data - in a real app, you'd fetch this from your DB
const events = [
  { id: "1", title: "Annual Camp 2026" },
  { id: "2", title: "Radio Course - Level 1" },
  { id: "3", title: "Squadron Range Day" },
];

export default function JiGenerator() {
  return (
    <main className="container max-w-xl mx-auto py-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">JI / AO Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Event</label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Choose an event..." />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button className="w-full bg-blue-600 hover:bg-blue-700">
              Generate JI
            </Button>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
              Generate AO
            </Button>
          </div>

          <div className="pt-4 border-t">
            <Link href="/">
              <Button variant="ghost" className="w-full">← Back to Home</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}