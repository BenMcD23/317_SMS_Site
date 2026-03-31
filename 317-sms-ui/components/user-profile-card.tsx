"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, X, Check, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type UserProfile = {
  rank: string;
  initials: string;
  surname: string;
  jpa_number: string;
  appointment: string;
  no: string;
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
  no: "",
  sqn_vgs_no: "",
  wing_ccf: "",
  home_address: "",
  car_reg: "",
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value || <span className="text-muted-foreground/50">—</span>}</p>
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

  // Edit state — only for home_address and car_reg
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ home_address: "", car_reg: "" });
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

  const startEdit = () => {
    setDraft({ home_address: profile.home_address, car_reg: profile.car_reg });
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
        setProfile((p) => ({ ...p, ...draft }));
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

      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile…
          </div>
        ) : (
          <>
            {/* ── Non-editable identity fields ──────────────────────────────── */}
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <ReadOnlyField label="Rank" value={profile.rank} />
                <ReadOnlyField label="Initials" value={profile.initials} />
                <ReadOnlyField label="Surname" value={profile.surname} />
                <ReadOnlyField label="JPA Number" value={profile.jpa_number} />
                <ReadOnlyField label="Appointment" value={profile.appointment} />
                <ReadOnlyField label="No" value={profile.no} />
                <ReadOnlyField label="Sqn / VGS No" value={profile.sqn_vgs_no} />
                <ReadOnlyField label="Wing / CCF" value={profile.wing_ccf} />
              </div>
            </div>

            {/* ── Editable fields ───────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
              {editing ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="home-address">Home Address</Label>
                    <Input
                      id="home-address"
                      value={draft.home_address}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, home_address: e.target.value }))
                      }
                      placeholder="e.g. 1 High Street, Town, AB1 2CD"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="car-reg">Car Registration</Label>
                    <Input
                      id="car-reg"
                      value={draft.car_reg}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, car_reg: e.target.value.toUpperCase() }))
                      }
                      placeholder="e.g. AB12 CDE"
                      className="uppercase"
                    />
                  </div>
                </>
              ) : (
                <>
                  <ReadOnlyField label="Home Address" value={profile.home_address} />
                  <ReadOnlyField label="Car Registration" value={profile.car_reg} />
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
