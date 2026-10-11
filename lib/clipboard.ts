/**
 * Copy text to the clipboard, resolving to whether it worked. The Clipboard API
 * is missing on plain-http pages and rejects when permission is denied, so
 * callers show "copy it by hand" rather than a false "Copied".
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
