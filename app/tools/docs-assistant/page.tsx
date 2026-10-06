"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

type Source = {
  n: number;
  filename: string;
  location: string;
  url: string;
  snippet: string;
};

type Answer = { answer: string; sources: Source[] };

export default function DocsAssistantPage() {
  const { data: session } = useSession();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (!q || !session?.id_token) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(
        await apiRequest<Answer>(
          session.id_token,
          `${API_BASE}/chat/ask`,
          { method: "POST", body: { question: q } },
          "The docs assistant couldn't answer."
        )
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Docs Assistant"
        description="Ask questions about RAFAC controlled documents. Answers come only from the documents and cite them."
      />

      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="question">Question</FieldLabel>
              <Textarea
                id="question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                // Enter asks, Shift+Enter is a new line — same as a chat box.
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                placeholder="e.g. Can cadets sleep overnight in Army Reserve centres?"
              />
            </Field>
            <Button onClick={ask} disabled={loading || !session || !question.trim()}>
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? "Searching the documents…" : "Ask"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Answer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed whitespace-pre-wrap">{result.answer}</p>
              <p className="text-muted-foreground mt-4 text-xs">
                AI-generated from the documents below. Check the source before acting on it.
              </p>
            </CardContent>
          </Card>

          {result.sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-4">
                  {result.sources.map((s) => (
                    <li key={s.n} className="flex gap-3">
                      <span className="text-muted-foreground w-6 shrink-0 text-right font-mono text-sm">
                        [{s.n}]
                      </span>
                      <div className="min-w-0">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                        >
                          {s.filename}
                          <ExternalLink className="size-3.5" />
                        </a>
                        {s.location && <span className="text-muted-foreground text-sm"> · {s.location}</span>}
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{s.snippet}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
