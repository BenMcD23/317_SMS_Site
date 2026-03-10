"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Pencil,
  Save,
  X,
  User,
  Mail,
  Calendar,
  Shield,
  Award,
  ClipboardList,
  Plane,
  ChevronRight,
} from "lucide-react";
import { API_BASE } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

type Qualification = {
  id: number;
  qualification_name: string;
  achieved_date: string | null;
};

type CadetEvent = {
  id: number;
  event_name: string;
  event_date: string | null;
  attended: boolean;
};

type Assessment = {
  id: number;
  assessment_type: string;
  created_at: string;
  passed: boolean | null;
  total_score: number | null;
  exercise_name: string | null;
  assessor_name: string | null;
};

type CadetDetail = {
  cin: number;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  rank: string | null;
  flight: string | null;
  qualifications: Qualification[];
  events: CadetEvent[];
  assessments: Assessment[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function age(dob: string | null) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  icon: Icon,
  placeholder = "—",
  type = "text",
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => Promise<void>;
  icon?: React.ElementType;
  placeholder?: string;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value ?? "");
    setEditing(false);
    setError(null);
  };

  return (
    <div className="group/field">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      {editing ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleCancel} disabled={saving}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", !value && "text-muted-foreground italic")}>
            {value || placeholder}
          </span>
          <button
            type="button"
            onClick={() => { setDraft(value ?? ""); setEditing(true); }}
            className="opacity-0 group-hover/field:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, variant = "default" }: { label: string; value: string | number; variant?: "default" | "success" | "muted" }) {
  return (
    <div className={cn(
      "rounded-lg border px-3 py-2 text-center",
      variant === "success" && "border-green-200 bg-green-50",
      variant === "muted" && "border-muted bg-muted/40",
      variant === "default" && "border bg-card",
    )}>
      <p className={cn("text-xl font-bold tabular-nums", variant === "success" && "text-green-700")}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CadetOverviewPage() {
  const { data: session } = useSession();
  const params = useParams();
  const cin = Number(params?.cin);

  const [cadet, setCadet] = useState<CadetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = session?.id_token;

  const fetchCadet = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cadets/${cin}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      setCadet(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load cadet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCadet(); }, [token, cin]);

  const patchField = async (field: string, value: string) => {
    const res = await fetch(`${API_BASE}/cadets/${cin}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ [field]: value || null }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(detail?.detail ?? "Failed to save");
    }
    setCadet((prev) => prev ? { ...prev, [field]: value || null } : prev);
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-16">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error || !cadet) {
    return (
      <div className="mx-auto max-w-3xl pb-16">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "Cadet not found."}
        </div>
      </div>
    );
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const passedAssessments = cadet.assessments.filter((a) => a.passed === true).length;
  const attendedEvents = cadet.events.filter((e) => e.attended).length;
  const cadetAge = age(cadet.date_of_birth);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {cadet.first_name} {cadet.last_name}
          </h1>
          <p className="text-muted-foreground">
            CIN {cadet.cin}
            {cadet.rank && <> · {cadet.rank}</>}
            {cadet.flight && <> · {cadet.flight} Flight</>}
          </p>
        </div>
        {cadet.rank && (
          <Badge variant="secondary" className="mt-1 shrink-0 text-sm px-3 py-1">
            {cadet.rank}
          </Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Qualifications" value={cadet.qualifications.length} />
        <StatPill label="Events Attended" value={`${attendedEvents} / ${cadet.events.length}`} />
        <StatPill label="Assessments Passed" value={passedAssessments} variant={passedAssessments > 0 ? "success" : "muted"} />
        {cadetAge !== null && <StatPill label="Age" value={cadetAge} />}
      </div>

      {/* Personal details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <EditableField
            label="Email"
            value={cadet.email}
            onSave={(v) => patchField("email", v)}
            icon={Mail}
            placeholder="No email set"
            type="email"
          />
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Calendar className="h-3 w-3" />
              Date of Birth
            </p>
            <span className="text-sm font-medium">
              {cadet.date_of_birth
                ? `${formatDate(cadet.date_of_birth)}${cadetAge !== null ? ` (${cadetAge})` : ""}`
                : "—"}
            </span>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Shield className="h-3 w-3" />
              Rank
            </p>
            <span className="text-sm font-medium">{cadet.rank ?? "—"}</span>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Plane className="h-3 w-3" />
              Flight
            </p>
            <span className="text-sm font-medium">{cadet.flight ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Qualifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            Qualifications
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {cadet.qualifications.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cadet.qualifications.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No qualifications recorded.</p>
          ) : (
            <div className="divide-y">
              {cadet.qualifications.map((q) => (
                <div key={q.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium">{q.qualification_name}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(q.achieved_date)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Assessments
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {cadet.assessments.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cadet.assessments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No assessments recorded.</p>
          ) : (
            <div className="divide-y">
              {cadet.assessments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="shrink-0">
                    {a.passed === true ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : a.passed === false ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize">
                      {a.assessment_type.replace(/_/g, " ")}
                      {a.exercise_name && (
                        <span className="ml-1.5 font-normal text-muted-foreground">— {a.exercise_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(a.created_at)}
                      {a.assessor_name && <> · {a.assessor_name}</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {a.total_score !== null && (
                      <span className="text-sm font-mono font-semibold">{a.total_score}/50</span>
                    )}
                    {a.passed !== null && (
                      <Badge
                        className={cn(
                          "ml-2 text-[11px]",
                          a.passed
                            ? "bg-green-500 text-white hover:bg-green-500"
                            : "bg-red-500 text-white hover:bg-red-500"
                        )}
                      >
                        {a.passed ? "PASS" : "FAIL"}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Events
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {attendedEvents} / {cadet.events.length} attended
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cadet.events.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No events recorded.</p>
          ) : (
            <div className="divide-y">
              {cadet.events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="shrink-0">
                    {e.attended ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.event_name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(e.event_date)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}