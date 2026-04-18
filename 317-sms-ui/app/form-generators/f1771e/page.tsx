"use client";

import { useState, useId } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ChevronDown, ChevronUp, Calculator, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { UserProfileCard, type UserProfile } from "@/components/user-profile-card";

type JourneyEntry = {
  id: number;
  // Journey details
  dateOfJourney: string;
  timeOfDeparture: string;
  timeOfArrival: string;
  from: string;
  to: string;
  // Passenger/trip info
  natureOfActivity: string;
  nameRankNo: string;
  gbtHotelRef: string;
  miscExpenses: string;
  // Travel details
  numberOfPassengers: string;
  method: string;
  mileageClaimed: string;
};

let _entryCounter = 0;
const defaultEntry = (): JourneyEntry => ({
  id: ++_entryCounter,
  dateOfJourney: "",
  timeOfDeparture: "",
  timeOfArrival: "",
  from: "",
  to: "",
  natureOfActivity: "",
  nameRankNo: "",
  gbtHotelRef: "",
  miscExpenses: "",
  numberOfPassengers: "",
  method: "",
  mileageClaimed: "",
});

function EntryCard({
  entry,
  index,
  onUpdate,
  onRemove,
  canRemove,
  homeAddress,
}: {
  entry: JourneyEntry;
  index: number;
  onUpdate: (id: number, field: keyof JourneyEntry, value: string) => void;
  onRemove: (id: number) => void;
  canRemove: boolean;
  homeAddress: string;
}) {
  const uid = useId();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [calculatingMileage, setCalculatingMileage] = useState(false);

  const calculateMileage = async () => {
    if (!entry.from.trim() || !entry.to.trim()) {
      toast.error("Fill in both From and To addresses first.");
      return;
    }
    if (!session?.id_token) return;
    setCalculatingMileage(true);
    try {
      const res = await apiFetch(`${API_BASE}/form-generators/calculate-mileage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from_address: entry.from, to_address: entry.to }),
      });
      if (res.ok) {
        const { miles } = await res.json();
        onUpdate(entry.id, "mileageClaimed", String(miles));
        toast.success(`Distance calculated: ${miles} miles`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Could not calculate distance.");
      }
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setCalculatingMileage(false);
    }
  };

  const set = (field: keyof JourneyEntry) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => onUpdate(entry.id, field, e.target.value);

  const hasContent =
    entry.dateOfJourney || entry.from || entry.to || entry.nameRankNo;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Entry {index + 1}
            {hasContent && !collapsed && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {[entry.dateOfJourney, entry.from && entry.to ? `${entry.from} → ${entry.to}` : ""].filter(Boolean).join(" · ")}
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((v) => !v)}
              className="h-8 w-8 p-0"
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
            {canRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(entry.id)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-6">
          {/* Journey Details */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Journey Details
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`date-${uid}`}>Date of Journey</Label>
                <Input
                  id={`date-${uid}`}
                  type="date"
                  value={entry.dateOfJourney}
                  onChange={set("dateOfJourney")}
                />
                <p className="text-xs text-muted-foreground">DD/MM/YY</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`dep-${uid}`}>Time of Departure</Label>
                <Input
                  id={`dep-${uid}`}
                  type="time"
                  value={entry.timeOfDeparture}
                  onChange={set("timeOfDeparture")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`arr-${uid}`}>Time of Arrival</Label>
                <Input
                  id={`arr-${uid}`}
                  type="time"
                  value={entry.timeOfArrival}
                  onChange={set("timeOfArrival")}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`from-${uid}`}>From</Label>
                <Textarea
                  id={`from-${uid}`}
                  placeholder={"House number and street\nTown, City\nPostcode"}
                  value={entry.from}
                  onChange={set("from")}
                  rows={3}
                />
                {homeAddress && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onUpdate(entry.id, "from", homeAddress)}
                    className="w-full"
                  >
                    Use home address
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`to-${uid}`}>To</Label>
                <Textarea
                  id={`to-${uid}`}
                  placeholder={"House number and street\nTown, City\nPostcode"}
                  value={entry.to}
                  onChange={set("to")}
                  rows={3}
                />
                {homeAddress && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onUpdate(entry.id, "to", homeAddress)}
                    className="w-full"
                  >
                    Use home address
                  </Button>
                )}
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Trip Information */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Trip Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`nature-${uid}`}>
                  Nature of Activity and SMS Ref
                </Label>
                <Textarea
                  id={`nature-${uid}`}
                  placeholder="e.g. Training camp, SMS-1234"
                  value={entry.natureOfActivity}
                  onChange={set("natureOfActivity")}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`nrn-${uid}`}>
                  Name / Rank / No of Passenger(s)
                </Label>
                <Textarea
                  id={`nrn-${uid}`}
                  placeholder="e.g. Cdt Smith J, 1234567"
                  value={entry.nameRankNo}
                  onChange={set("nameRankNo")}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`gbt-${uid}`}>GBT Hotel Booking Ref</Label>
                <Textarea
                  id={`gbt-${uid}`}
                  placeholder="Booking reference"
                  value={entry.gbtHotelRef}
                  onChange={set("gbtHotelRef")}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`misc-${uid}`}>
                  Details of any Miscellaneous Expenses
                </Label>
                <Textarea
                  id={`misc-${uid}`}
                  placeholder="Any additional expenses..."
                  value={entry.miscExpenses}
                  onChange={set("miscExpenses")}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Travel Details */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Travel Details
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`pax-${uid}`}>Number of Passengers</Label>
                <Input
                  id={`pax-${uid}`}
                  type="number"
                  min="1"
                  placeholder="0"
                  value={entry.numberOfPassengers}
                  onChange={set("numberOfPassengers")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`method-${uid}`}>Method</Label>
                <Select value={entry.method} onValueChange={(v) => onUpdate(entry.id, "method", v)}>
                  <SelectTrigger id={`method-${uid}`}>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Electric Car","Motor Car","Motorcycle","Public Transport","Taxi","Aircraft","Bicycle"].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`mileage-${uid}`}>Mileage Claimed</Label>
                <Input
                  id={`mileage-${uid}`}
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  value={entry.mileageClaimed}
                  onChange={set("mileageClaimed")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={calculateMileage}
                  disabled={calculatingMileage}
                  className="w-full gap-1.5"
                >
                  {calculatingMileage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Calculator className="h-3.5 w-3.5" />
                  )}
                  Calculate Mileage
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

const REQUIRED_PROFILE_FIELDS: (keyof UserProfile)[] = [
  "rank", "initials", "surname", "jpa_number", "appointment", "sqn_vgs_no", "wing_ccf", "home_address",
];
const REQUIRED_JOURNEY_FIELDS: (keyof JourneyEntry)[] = [
  "dateOfJourney", "timeOfDeparture", "timeOfArrival", "from", "to", "natureOfActivity", "method", "mileageClaimed",
];
const JOURNEY_FIELD_LABELS: Partial<Record<keyof JourneyEntry, string>> = {
  dateOfJourney: "Date of Journey", timeOfDeparture: "Time of Departure", timeOfArrival: "Time of Arrival",
  from: "From", to: "To", natureOfActivity: "Nature of Activity", method: "Method", mileageClaimed: "Mileage Claimed",
};

export default function F1771ePage() {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<JourneyEntry[]>([defaultEntry()]);
  const [homeAddress, setHomeAddress] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [generating, setGenerating] = useState(false);

  const addEntry = () => setEntries((prev) => [...prev, defaultEntry()]);

  const removeEntry = (id: number) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const updateEntry = (
    id: number,
    field: keyof JourneyEntry,
    value: string
  ) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const generateDoc = async () => {
    if (!session?.id_token) return;

    // Profile validation
    if (!profile) { toast.error("Profile not loaded yet."); return; }
    const missingProfile = REQUIRED_PROFILE_FIELDS.filter((k) => !profile[k]);
    if (missingProfile.length > 0) {
      toast.error("Complete your profile details before generating.");
      return;
    }

    // Journey validation
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const missing = REQUIRED_JOURNEY_FIELDS.filter((k) => !e[k]);
      if (missing.length > 0) {
        const labels = missing.map((k) => JOURNEY_FIELD_LABELS[k] ?? k).join(", ");
        toast.error(`Entry ${i + 1}: missing ${labels}.`);
        return;
      }
    }

    // Default numberOfPassengers to "0" if blank
    const journeys = entries.map((e) => ({
      ...e,
      numberOfPassengers: e.numberOfPassengers || "0",
    }));

    setGenerating(true);
    try {
      const res = await apiFetch(`${API_BASE}/form-generators/f1771e`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ journeys }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Failed to generate document.");
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "F1771e.docx";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">F1771e Generator</h1>
        <p className="mt-1 text-muted-foreground">
          Add journey entries below, then generate the Word document.
        </p>
      </div>

      <UserProfileCard onHomeAddressChange={setHomeAddress} onProfileChange={setProfile} />

      <div className="space-y-4">
        {entries.map((entry, index) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            index={index}
            onUpdate={updateEntry}
            onRemove={removeEntry}
            canRemove={entries.length > 1}
            homeAddress={homeAddress}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={addEntry} className="gap-2">
          <Plus className="h-4 w-4" />
          Add New Entry
        </Button>

        <Button onClick={generateDoc} disabled={generating} className="gap-2">
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Generate Word Document
        </Button>
      </div>
    </div>
  );
}
