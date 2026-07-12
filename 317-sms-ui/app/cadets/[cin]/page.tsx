"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
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
  AlertTriangle,
  Ban,
} from "lucide-react";
import { UniformIssuancesCard } from "@/components/uniform-issuances-card";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

// ─── Types ────────────────────────────────────────────────────────────────────

type Qualification = {
  id: number;
  qualification_name: string;
  achieved_date: string | null;
  expires_date: string | null;
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
  classification: string | null;
  banned: boolean;
  qualifications: Qualification[];
  events: CadetEvent[];
  assessments: Assessment[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function age(dob: string | null) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function expiryStatus(expires_date: string | null): "expired" | "soon" | "ok" | "none" {
  if (!expires_date) return "none";
  const d = new Date(expires_date);
  const now = new Date();
  if (d < now) return "expired";
  if (d < new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)) return "soon";
  return "ok";
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
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
            <Button
              size="icon" variant="ghost"
              className="size-8 shrink-0 text-success hover:text-success"
              onClick={handleSave} disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
            </Button>
            <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={handleCancel} disabled={saving}>
              <X />
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

function StatPill({
  label, value, variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "muted";
}) {
  return (
    <div className={cn(
      "rounded-lg border px-3 py-2 text-center",
      variant === "success" && "border-success/30 bg-success/10",
      variant === "muted" && "border-muted bg-muted/40",
      variant === "default" && "border bg-card",
    )}>
      <p className={cn("text-xl font-semibold tabular-nums", variant === "success" && "text-success")}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
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
      const cadetRes = await apiFetch(`${API_BASE}/cadets/${cin}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!cadetRes.ok) throw new Error((await cadetRes.json()).detail ?? cadetRes.statusText);
      setCadet(await cadetRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load cadet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCadet(); }, [token, cin]);

  const patchField = async (field: string, value: string) => {
    const res = await apiFetch(`${API_BASE}/cadets/${cin}`, {
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

  const [banLoading, setBanLoading] = useState(false);
  const toggleBan = async () => {
    if (!cadet || !token) return;
    setBanLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/cadets/${cin}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ banned: !cadet.banned }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      setCadet((prev) => prev ? { ...prev, banned: !prev.banned } : prev);
    } finally {
      setBanLoading(false);
    }
  };

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
        <ErrorAlert message={error ?? "Cadet not found."} title="Could not load cadet" />
      </div>
    );
  }

  const passedAssessments = cadet.assessments.filter((a) => a.passed === true).length;
  const attendedEvents = cadet.events.filter((e) => e.attended).length;
  const cadetAge = age(cadet.date_of_birth);
  const expiredCount = cadet.qualifications.filter(q => expiryStatus(q.expires_date) === "expired").length;
  const expiringSoonCount = cadet.qualifications.filter(q => expiryStatus(q.expires_date) === "soon").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">

      <PageHeader
        title={`${cadet.first_name} ${cadet.last_name}`}
        description={
          <>
            CIN {cadet.cin}
            {cadet.rank && <> · {cadet.rank}</>}
            {cadet.flight && <> · {cadet.flight} Flight</>}
          </>
        }
        actions={
          <Button
            size="sm"
            variant={cadet.banned ? "destructive" : "outline"}
            className={cn(
              !cadet.banned && "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
            onClick={toggleBan}
            disabled={banLoading}
          >
            {banLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Ban data-icon="inline-start" />}
            <span className="hidden sm:inline">{cadet.banned ? "Remove ban" : "Ban from events"}</span>
            <span className="sm:hidden">{cadet.banned ? "Unban" : "Ban"}</span>
          </Button>
        }
      />

      {cadet.banned && (
        <Alert variant="destructive">
          <Ban />
          <AlertTitle>This cadet is currently banned from events.</AlertTitle>
        </Alert>
      )}

      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <Alert>
          <AlertTriangle className="text-warning" />
          <AlertTitle>
            {expiredCount > 0 && (
              <>{expiredCount} qualification{expiredCount !== 1 ? "s" : ""} expired{expiringSoonCount > 0 ? " · " : ""}</>
            )}
            {expiringSoonCount > 0 && <>{expiringSoonCount} expiring within 60 days</>}
          </AlertTitle>
        </Alert>
      )}

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
              <Calendar className="h-3 w-3" /> Date of Birth
            </p>
            <span className="text-sm font-medium">
              {cadet.date_of_birth
                ? `${formatDate(cadet.date_of_birth)}${cadetAge !== null ? ` (${cadetAge})` : ""}`
                : "—"}
            </span>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Shield className="h-3 w-3" /> Rank
            </p>
            <span className="text-sm font-medium">{cadet.rank ?? "—"}</span>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Plane className="h-3 w-3" /> Flight
            </p>
            <span className="text-sm font-medium">{cadet.flight ?? "—"}</span>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Award className="h-3 w-3" /> Classification
            </p>
            <span className="text-sm font-medium">{cadet.classification || "Junior Cadet"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Qualifications table */}
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
        <CardContent className="p-0">
          {cadet.qualifications.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No qualifications recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Qualification</TableHead>
                  <TableHead>Date awarded</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cadet.qualifications.map((q) => {
                  const status = expiryStatus(q.expires_date);
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="pl-6 font-medium">{q.qualification_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(q.achieved_date)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap",
                          status === "expired" && "font-medium text-destructive",
                          status === "soon" && "font-medium text-warning",
                          (status === "ok" || status === "none") && "text-muted-foreground",
                        )}
                      >
                        {q.expires_date ? formatDate(q.expires_date) : "N/A"}
                      </TableCell>
                      <TableCell>
                        {status === "expired" && (
                          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                            Expired
                          </Badge>
                        )}
                        {status === "soon" && (
                          <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning">
                            Expires soon
                          </Badge>
                        )}
                        {status === "ok" && (
                          <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                            Valid
                          </Badge>
                        )}
                        {status === "none" && <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
            <p className="text-sm text-muted-foreground">No assessments recorded.</p>
          ) : (
            <div className="divide-y">
              {cadet.assessments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="shrink-0">
                    {a.passed === true ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : a.passed === false ? (
                      <XCircle className="size-4 text-destructive" />
                    ) : (
                      <div className="size-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
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
                      <span className="font-mono text-sm font-semibold">{a.total_score}/50</span>
                    )}
                    {a.passed !== null && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-2",
                          a.passed
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-destructive/40 bg-destructive/10 text-destructive"
                        )}
                      >
                        {a.passed ? "Pass" : "Fail"}
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
            <p className="text-sm text-muted-foreground">No events recorded.</p>
          ) : (
            <div className="divide-y">
              {cadet.events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="shrink-0">
                    {e.attended ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <XCircle className="size-4 text-muted-foreground/40" />
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

      <UniformIssuancesCard baseUrl={`/api/stores/issuances/${cin}`} />

    </div>
  );
}