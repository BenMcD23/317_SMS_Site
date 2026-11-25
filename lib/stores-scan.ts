import { API_BASE } from "@/lib/config";
import { apiFetch, apiRequest, errorDetail } from "@/lib/api-fetch";
import type { ShelfBox, StockItem } from "@/lib/stores-types";

/**
 * Booking uniform in by its stock number (NSN): the API calls behind the Book
 * in page (the API's routers/stores_scan.py), and the small rules the page
 * applies before calling them.
 *
 * A bag's label has three barcodes: the stock number, the quantity ("1") and
 * the unit ("EACH"). The camera reads whichever it sees first, so anything
 * that isn't a 13-digit stock number is ignored here rather than looked up.
 */

export type NsnLookup = {
  nsn: string;
  formatted: string;
  /** The logs form's description, when the form lists the number. */
  description: string | null;
  /** Null for a form line the stores don't keep (gloves, coveralls). */
  itemType: string | null;
  size: string | null;
  source: "logs_form" | "added";
  addedBy: string | null;
};

export type LabelRead = {
  read: { nsn: string | null; size: string | null; description: string | null };
  match: NsnLookup | null;
  model: string;
  modelLabel: string;
};

export type BookInResult = { item: StockItem; lookup: NsnLookup | null };

export type BookInBody = {
  nsn?: string;
  itemType?: string;
  size?: string;
  box: string;
  section: string;
  quantity?: number;
};

/** The 13 digits of a stock number however it was written or scanned, or null. */
export function normaliseNsn(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

/** As labels print it: 8405-99-845-6634. */
export function formatNsn(nsn: string): string {
  return `${nsn.slice(0, 4)}-${nsn.slice(4, 6)}-${nsn.slice(6, 9)}-${nsn.slice(9)}`;
}

/** What a number means, or null if neither the logs form nor staff know it. */
export async function lookupNsn(token: string, nsn: string): Promise<NsnLookup | null> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/stores/nsns/${nsn}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error("Server unreachable.");
  }
  // 404 is the API's "nobody knows this number": the page asks what it is.
  // Anything else is a failed lookup, which must not read as "unknown".
  if (res.status === 404) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorDetail(data) ?? "Couldn't look the stock number up.");
  return data as NsnLookup;
}

export function teachNsn(token: string, nsn: string, itemType: string, size: string): Promise<NsnLookup> {
  return apiRequest<NsnLookup>(
    token,
    `${API_BASE}/stores/nsns/${nsn}`,
    { method: "PUT", body: { itemType, size } },
    "Couldn't save what that stock number is."
  );
}

export function bookIn(token: string, body: BookInBody): Promise<BookInResult> {
  return apiRequest<BookInResult>(
    token,
    `${API_BASE}/stores/stock/book-in`,
    { method: "POST", body },
    "Couldn't book that in."
  );
}

/**
 * Send a photo of a label to be read. Multipart, so it can't use apiRequest,
 * but it still goes through apiFetch for the 401 and outage handling.
 */
export async function readLabel(token: string, photo: Blob): Promise<LabelRead> {
  const form = new FormData();
  form.append("photo", photo, photo.type === "image/png" ? "label.png" : "label.jpg");
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE}/stores/nsns/read-label`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new Error("Server unreachable.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorDetail(data) ?? "Couldn't read the label.");
  return data as LabelRead;
}

// A phone photo is 3-5 MB; the label's text is legible at a fraction of that,
// and the upload is often over the drill hall's patchy signal.
const MAX_PHOTO_EDGE = 1600;

/** The photo shrunk to a JPEG no wider or taller than 1600px, or the original
 *  if this browser can't decode it (the API takes HEIC as it is). */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** The stock list with a booked-in line put in (or replaced). */
export function withLine(stock: StockItem[], line: StockItem): StockItem[] {
  return stock.some((i) => i.id === line.id)
    ? stock.map((i) => (i.id === line.id ? line : i))
    : [...stock, line];
}

/** Where the Book in page puts things: a box and section, and whether each
 *  item goes with the same item instead when that's already on a shelf. */
export type Place = { box: string; section: string; matchShelf: boolean };

/** The place last used on this device if its box still exists, else the first box. */
export function startingPlace(boxes: ShelfBox[], saved: Place | null): Place {
  const savedBox = saved ? boxes.find((b) => b.label === saved.box) : undefined;
  const start = savedBox ?? boxes[0];
  if (!start) return { box: "", section: "", matchShelf: saved?.matchShelf !== false };
  const section =
    savedBox && saved && start.sections.some((s) => s.label === saved.section)
      ? saved.section
      : (start.sections[0]?.label ?? "");
  return { box: start.label, section, matchShelf: saved?.matchShelf !== false };
}
