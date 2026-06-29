"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

const PLACE_OF_DUTY = "75 Oldham Rd, Failsworth, Manchester M35 0BH";
const RATE = 0.25;
const UPLIFT = 1.07;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type StaffMember = {
  cin: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  rank: string | null;
  address: string | null;
  attendance: Record<string, number> | null;
};

type MonthRow = { key: string; label: string; journeys: string };

// Best-effort split of "11, Victoria Street, Littleborough, Lancashire, OL15 9DB".
const UK_POSTCODE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i;
function splitAddress(address: string | null) {
  const parts = (address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  let postcode = "";
  if (parts.length && UK_POSTCODE.test(parts[parts.length - 1])) {
    postcode = parts.pop()!;
  }
  const city = parts.length > 1 ? parts.pop()! : "";
  const town = parts.length > 1 ? parts.pop()! : "";
  const streetHouseNum = parts.join(", ");
  return { streetHouseNum, town, city, postcode };
}

// Halves present in the attendance map, newest first. id e.g. "2026-H1".
function availableHalves(attendance: Record<string, number> | null): { id: string; label: string }[] {
  const ids = new Set<string>();
  for (const key of Object.keys(attendance ?? {})) {
    const [year, mm] = key.split("-");
    const half = Number(mm) <= 6 ? "H1" : "H2";
    ids.add(`${year}-${half}`);
  }
  return [...ids]
    .sort((a, b) => b.localeCompare(a))
    .map((id) => {
      const [year, half] = id.split("-");
      const label = half === "H1" ? `Jan–Jun ${year}` : `Jul–Dec ${year}`;
      return { id, label };
    });
}

function monthsForHalf(halfId: string, attendance: Record<string, number> | null): MonthRow[] {
  if (!halfId) return [];
  const [year, half] = halfId.split("-");
  const start = half === "H1" ? 1 : 7;
  const yy = year.slice(2);
  return Array.from({ length: 6 }, (_, i) => {
    const m = start + i;
    const mm = String(m).padStart(2, "0");
    const key = `${year}-${mm}`;
    return { key, label: `${mm}/${yy}`, journeys: String(attendance?.[key] ?? 0) };
  });
}

export default function HTDPage() {
  const { data: session } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedCin, setSelectedCin] = useState<string>("");

  const [rank, setRank] = useState("");
  const [initials, setInitials] = useState("");
  const [surname, setSurname] = useState("");
  const [serviceNumber, setServiceNumber] = useState("");
  const [streetHouseNum, setStreetHouseNum] = useState("");
  const [town, setTown] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [distance, setDistance] = useState("");
  const [bankLast3, setBankLast3] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [halfId, setHalfId] = useState("");
  const [months, setMonths] = useState<MonthRow[]>([]);

  const [calculating, setCalculating] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/staff/users")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: StaffMember[]) => setStaff(data))
      .catch(() => toast.error("Could not load staff list."));
  }, []);

  const selected = useMemo(
    () => staff.find((s) => String(s.cin) === selectedCin) ?? null,
    [staff, selectedCin],
  );
  const halves = useMemo(() => availableHalves(selected?.attendance ?? null), [selected]);

  const onSelectStaff = (cin: string) => {
    setSelectedCin(cin);
    const s = staff.find((m) => String(m.cin) === cin);
    if (!s) return;
    setRank(s.rank ?? "");
    setInitials(((s.firstName ?? "").charAt(0) + (s.lastName ?? "").charAt(0)).toUpperCase());
    setSurname((s.lastName ?? "").toUpperCase());
    setServiceNumber(String(s.cin));
    const a = splitAddress(s.address);
    setStreetHouseNum(a.streetHouseNum);
    setTown(a.town);
    setCity(a.city);
    setPostcode(a.postcode);
    setDistance("");
    const hs = availableHalves(s.attendance);
    const firstHalf = hs[0]?.id ?? "";
    setHalfId(firstHalf);
    setMonths(monthsForHalf(firstHalf, s.attendance));
  };

  const onSelectHalf = (id: string) => {
    setHalfId(id);
    setMonths(monthsForHalf(id, selected?.attendance ?? null));
  };

  const setJourneys = (key: string, value: string) =>
    setMonths((prev) => prev.map((m) => (m.key === key ? { ...m, journeys: value } : m)));

  const homeAddress = [streetHouseNum, town, city, postcode].filter(Boolean).join(", ");

  // Live preview (backend recomputes authoritatively).
  const distNum = Number(distance) || 0;
  const totalA = Math.round(distNum * RATE * UPLIFT * 100) / 100;
  const totalClaimed =
    Math.round(months.reduce((sum, m) => sum + (Number(m.journeys) || 0) * totalA, 0) * 100) / 100;

  const calculateDistance = async () => {
    if (!homeAddress.trim()) {
      toast.error("Select a staff member with an address, or fill the address fields.");
      return;
    }
    if (!session?.id_token) return;
    setCalculating(true);
    try {
      const res = await apiFetch(`${API_BASE}/form-generators/calculate-mileage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.id_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from_address: homeAddress, to_address: PLACE_OF_DUTY }),
      });
      if (res.ok) {
        const { miles } = await res.json();
        const ret = Math.round(2 * miles * 10) / 10;
        setDistance(String(ret));
        toast.success(`Return distance: ${ret} miles (2 × ${miles})`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Could not calculate distance.");
      }
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setCalculating(false);
    }
  };

  // Auto-fill the return distance once a staff member (and their address) is loaded.
  // Keyed on the selection, not the address fields, so manual edits aren't overwritten.
  useEffect(() => {
    if (selectedCin && homeAddress.trim() && session?.id_token) calculateDistance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCin, session?.id_token]);

  const generateDoc = async () => {
    if (!session?.id_token) return;
    if (!selectedCin) { toast.error("Select a staff member first."); return; }
    setGenerating(true);
    try {
      const [y, m, d] = date.split("-");
      const res = await apiFetch(`${API_BASE}/form-generators/htd`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.id_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          rank, initials, surname,
          service_number: serviceNumber,
          street_house_num: streetHouseNum, town, city, postcode,
          distance: Number(distance) || 0,
          bank_last3: bankLast3,
          date: y && m && d ? `${d}/${m}/${y}` : date,
          months: months.map((mm) => ({ label: mm.label, journeys: Number(mm.journeys) || 0 })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Failed to generate document.");
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `HTD_${surname || "claim"}.docx`;
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="HTD Travel Claim"
        description="Select a staff member, check the details, then generate the ACCTS 7101 Word document"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCin} onValueChange={onSelectStaff}>
            <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
            <SelectContent>
              {[...staff]
                .sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? ""))
                .map((s) => (
                  <SelectItem key={s.cin} value={String(s.cin)}>
                    {[s.rank, s.firstName, s.lastName].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected && (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Rank" value={rank} onChange={setRank} />
              <Field label="Initials" value={initials} onChange={setInitials} />
              <Field label="Surname" value={surname} onChange={setSurname} />
              <Field label="Service Number" value={serviceNumber} onChange={setServiceNumber} />
              <Field label="Bank — last 3 digits" value={bankLast3} onChange={setBankLast3} />
              <div className="space-y-1.5">
                <Label htmlFor="htd-date">Claim date</Label>
                <Input id="htd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Home address & distance</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="House number & street" value={streetHouseNum} onChange={setStreetHouseNum} />
              <Field label="Town" value={town} onChange={setTown} />
              <Field label="City / County" value={city} onChange={setCity} />
              <Field label="Postcode" value={postcode} onChange={setPostcode} />
              <div className="space-y-1.5">
                <Label htmlFor="htd-distance">Return distance (miles)</Label>
                <Input id="htd-distance" type="number" min="0" step="0.1" value={distance}
                  onChange={(e) => setDistance(e.target.value)} />
                {calculating && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Calculating distance…
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Attendance / journeys</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs space-y-1.5">
                <Label>Claim half</Label>
                <Select value={halfId} onValueChange={onSelectHalf}>
                  <SelectTrigger><SelectValue placeholder="Select half-year" /></SelectTrigger>
                  <SelectContent>
                    {halves.map((h) => <SelectItem key={h.id} value={h.id}>{h.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {months.map((m) => {
                  const [, mm] = m.key.split("-");
                  const name = MONTH_ABBR[Number(mm) - 1] ?? m.label;
                  return (
                    <div key={m.key} className="space-y-1.5">
                      <Label htmlFor={`j-${m.key}`}>{name} — return journeys</Label>
                      <Input id={`j-${m.key}`} type="number" min="0" value={m.journeys}
                        onChange={(e) => setJourneys(m.key, e.target.value)} />
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                Total A (per journey): £{totalA.toFixed(2)} · Total claimed: £{totalClaimed.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={generateDoc} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate Word Document
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
