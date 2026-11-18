import type { SizingDetailsJSON } from "@/lib/stores-types";

/**
 * The measurements a cadet gave when they didn't know their size, as a
 * labelled list under the item. Older orders stored plain text rather than
 * JSON, so anything that doesn't parse is shown as written.
 */
const FIT_LABELS: Record<string, string> = { bigger: "Bigger", smaller: "Smaller", same: "Same size" };

export function parseSizingDetails(str: string): SizingDetailsJSON | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as SizingDetailsJSON;
  } catch {
    return null;
  }
}

export function SizingDetailsDisplay({ raw }: { raw: string }) {
  const parsed = parseSizingDetails(raw);
  if (!parsed) return <p className="text-foreground text-xs">{raw}</p>;

  const rows: { label: string; value: string }[] = [];
  if (parsed.currentSizeUnknown) rows.push({ label: "Current size", value: "Unknown" });
  else if (parsed.currentSize) rows.push({ label: "Current size", value: parsed.currentSize });
  if (parsed.biggerSmaller)
    rows.push({ label: "Overall fit", value: FIT_LABELS[parsed.biggerSmaller] ?? parsed.biggerSmaller });
  if (parsed.chest) rows.push({ label: "Chest", value: parsed.chest });
  if (parsed.collar) rows.push({ label: "Collar", value: parsed.collar });
  if (parsed.waist) rows.push({ label: "Waist", value: parsed.waist });
  if (parsed.leg) rows.push({ label: "Leg", value: parsed.leg });
  if (parsed.seat) rows.push({ label: "Seat", value: parsed.seat });
  if (parsed.hips) rows.push({ label: "Hips", value: parsed.hips });
  if (parsed.notes) rows.push({ label: "Notes", value: parsed.notes });

  if (rows.length === 0) return <p className="text-muted-foreground text-xs italic">No sizing details</p>;

  return (
    <div className="space-y-0.5">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex gap-2 text-xs">
          <span className="text-muted-foreground w-24 shrink-0">{label}</span>
          <span className="text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
