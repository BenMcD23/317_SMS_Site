"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, X, Check, Loader2, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type UserProfile = {
  rank: string;
  initials: string;
  surname: string;
  jpa_number: string;
  appointment: string;
  sqn_vgs_no: string;
  wing_ccf: string;
  home_address: string;
  car_reg: string;
};

const empty: UserProfile = {
  rank: "",
  initials: "",
  surname: "",
  jpa_number: "",
  appointment: "",
  sqn_vgs_no: "",
  wing_ccf: "",
  home_address: "",
  car_reg: "",
};

const FIELD_LABELS: { key: keyof UserProfile; label: string }[] = [
  { key: "rank",        label: "Rank" },
  { key: "initials",    label: "Initials" },
  { key: "surname",     label: "Surname" },
  { key: "jpa_number",  label: "JPA Number" },
  { key: "appointment", label: "Appointment" },
  { key: "sqn_vgs_no",  label: "Sqn / VGS No" },
  { key: "wing_ccf",    label: "Wing / CCF" },
  { key: "home_address", label: "Home Address" },
  { key: "car_reg",     label: "Car Registration" },
];

function ReadOnlyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value ? (
        <p className={`text-sm font-medium ${multiline ? "whitespace-pre-wrap" : "truncate"}`}>{value}</p>
      ) : (
        <p className="text-sm font-medium"><span className="text-muted-foreground/50">—</span></p>
      )}
    </div>
  );
}

export function UserProfileCard({
  onHomeAddressChange,
}: {
  onHomeAddressChange?: (address: string) => void;
} = {}) {
  const { data: session } = useSession();

  const [profile, setProfile] = useState<UserProfile>(empty);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UserProfile>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.id_token) return;

    apiFetch(`${API_BASE}/settings/user-profile`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data) {
          const merged = { ...empty, ...data };
          setProfile(merged);
          onHomeAddressChange?.(merged.home_address);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  const missingFields = FIELD_LABELS.filter(({ key }) => !profile[key]);

  const startEdit = () => {
    setDraft({ ...profile });
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!session?.id_token) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/settings/user-profile`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setProfile({ ...draft });
        onHomeAddressChange?.(draft.home_address);
        setEditing(false);
        toast.success("Profile updated.");
      } else {
        toast.error("Failed to save profile.");
      }
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof UserProfile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = key === "car_reg" ? e.target.value.toUpperCase() : e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Your Details</CardTitle>
          </div>
          {!editing && !loading && (
            <Button variant="ghost" size="sm" onClick={startEdit} className="gap-1.5 text-xs">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {editing && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                disabled={saving}
                className="gap-1.5 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={saving}
                className="gap-1.5 text-xs"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile…
          </div>
        ) : editing ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELD_LABELS.filter(({ key }) => key !== "home_address" && key !== "car_reg").map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`profile-${key}`}>{label}</Label>
                  <Input
                    id={`profile-${key}`}
                    value={draft[key]}
                    onChange={setField(key)}
                    placeholder={label}
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="profile-home_address">Home Address</Label>
                <Textarea
                  id="profile-home_address"
                  value={draft.home_address}
                  onChange={(e) => setDraft((d) => ({ ...d, home_address: e.target.value }))}
                  placeholder={"House number and street\nTown, City\nPostcode"}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-car_reg">Car Registration</Label>
                <Input
                  id="profile-car_reg"
                  value={draft.car_reg}
                  onChange={setField("car_reg")}
                  placeholder="e.g. AB12 CDE"
                  className="uppercase"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {missingFields.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Complete all fields to generate the Word document.{" "}
                  <button
                    type="button"
                    onClick={startEdit}
                    className="font-medium underline underline-offset-2 hover:no-underline"
                  >
                    Fill in missing fields
                  </button>
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {FIELD_LABELS.map(({ key, label }) => (
                <ReadOnlyField key={key} label={label} value={profile[key]} multiline={key === "home_address"} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
