/**
 * Shrink images before upload, and refuse what can't be shrunk enough.
 *
 * The API runs on Lambda, which caps a request body at 6 MB — and there were no
 * size limits anywhere in this codebase, so without this a phone photo attached
 * to a committee receipt fails opaquely somewhere mid-upload with nothing
 * useful to show the user. Every `FormData` call site goes through
 * `prepareUpload`/`prepareUploads` so the limit is enforced in one place.
 *
 * Images are downscaled and re-encoded on a canvas; anything else (PDFs, CSVs)
 * is passed through and only size-checked, since there is nothing sensible to
 * compress.
 */

/** Hard ceiling. Under Lambda's 6 MB with room for the multipart envelope,
 *  base64 expansion at the Function URL, and the other fields in the form. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Below this an image is left completely alone — re-encoding a 200 KB
 *  signature only risks making it worse. */
const COMPRESS_THRESHOLD_BYTES = 1024 * 1024;

/** Longest edge after downscaling. Comfortably above what any of these
 *  documents are ever viewed at, and roughly a quarter of a modern phone
 *  camera's pixel count. */
const MAX_DIMENSION = 2000;

/** Quality steps for the JPEG re-encode, tried in order until one fits. */
const QUALITY_STEPS = [0.82, 0.7, 0.55];

export class FileTooLargeError extends Error {
  constructor(public readonly file: File) {
    super(
      `${file.name} is ${formatBytes(file.size)} — the limit is ` +
        `${formatBytes(MAX_UPLOAD_BYTES)}. Try a smaller file, or split it up.`,
    );
    this.name = "FileTooLargeError";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Decode to a bitmap. `createImageBitmap` is preferred because
 * `imageOrientation: "from-image"` applies the EXIF rotation phones write —
 * drawing the raw pixels instead would silently turn every portrait photo on
 * its side.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari has historically rejected the options bag — fall through.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(file: File, blob: Blob, type: string): File {
  const base = file.name.replace(/\.[^.]+$/, "");
  const ext = type === "image/png" ? "png" : "jpg";
  return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() });
}

/**
 * Downscale and re-encode an image, returning the original if that doesn't
 * actually help. Never throws for size — the caller decides what to do with a
 * result that is still too big (see `prepareUpload`).
 */
export async function compressImage(file: File): Promise<File> {
  if (!isImage(file) || file.size <= COMPRESS_THRESHOLD_BYTES) return file;

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    // An image we can't decode is one we can't shrink; let the size check
    // downstream produce the error the user sees.
    return file;
  }

  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  if (!width || !height) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();

  // PNGs keep their format on the first attempt: signatures are PNGs with a
  // transparent background, and JPEG would fill that with black.
  const keepPng = file.type === "image/png";
  const attempts: Array<{ type: string; quality?: number }> = keepPng
    ? [{ type: "image/png" }]
    : QUALITY_STEPS.map((quality) => ({ type: "image/jpeg", quality }));

  for (const attempt of attempts) {
    const blob = await toBlob(canvas, attempt.type, attempt.quality);
    if (!blob) continue;
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return blob.size < file.size ? renamed(file, blob, attempt.type) : file;
    }
  }

  if (keepPng) {
    // Last resort for a huge PNG: flatten onto white and go to JPEG. Losing
    // transparency beats being unable to upload at all, and anything this
    // large is a photo or a scan rather than a signature.
    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    const flatCtx = flat.getContext("2d");
    if (flatCtx) {
      flatCtx.fillStyle = "#ffffff";
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(canvas, 0, 0);
      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(flat, "image/jpeg", quality);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) return renamed(file, blob, "image/jpeg");
      }
    }
  }

  return file;
}

/**
 * Get a file ready to send: compress it if it's an image, then enforce the
 * ceiling. Throws `FileTooLargeError` — its message is written to be shown to
 * the user as-is.
 */
export async function prepareUpload(file: File): Promise<File> {
  const prepared = await compressImage(file);
  if (prepared.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError(prepared);
  return prepared;
}

/** `prepareUpload` for a whole selection, checking the combined size too —
 *  five 4 MB receipts in one request blow the same limit each one passes. */
export async function prepareUploads(files: File[]): Promise<File[]> {
  const prepared = await Promise.all(files.map(prepareUpload));
  const total = prepared.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Those files come to ${formatBytes(total)} together — the limit is ` +
        `${formatBytes(MAX_UPLOAD_BYTES)} per upload. Send them in smaller batches.`,
    );
  }
  return prepared;
}
