// Saving an API response as a file — shared by every page that downloads a
// generated document, so the filename parsing and the blob dance live once.

/**
 * The filename a Content-Disposition header names, or `fallback`.
 *
 * Prefers RFC 5987 `filename*=UTF-8''…`, which the API sends for names that
 * aren't plain ASCII ("Müller", "Café – plan.pdf"); `filename="…"` then holds
 * only an ASCII stand-in.
 */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const extended = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Malformed percent-encoding — fall through to the plain name.
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"/i) ?? header.match(/filename\s*=\s*([^;]+)/i);
  return plain?.[1].trim() || fallback;
}

/**
 * Hand a fetched file to the browser as a download. Fetched-then-saved rather
 * than a plain link because the API needs the bearer token, which a navigation
 * can't carry.
 */
export async function saveResponseAsFile(res: Response, fallbackName: string): Promise<string> {
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition"), fallbackName);
  saveBlob(await res.blob(), filename);
  return filename;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Rows as CSV, columns in the order first seen across the rows. Every cell is
 * quoted when it holds a comma, quote or line break, and a leading =, +, - or
 * @ is defused so a cadet's name can't run as a spreadsheet formula.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    let text = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(text) && typeof v !== "number") text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns, ...rows.map((r) => columns.map((c) => r[c]))]
    .map((line) => line.map(cell).join(","))
    .join("\r\n");
}

/** Save rows as a .csv the user can open in Excel. The BOM makes Excel read it
 *  as UTF-8, or "Zoë" arrives as "ZoÃ«". */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  saveBlob(new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" }), filename);
}
