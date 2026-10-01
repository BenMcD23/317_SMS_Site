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
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
}
