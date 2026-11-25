/**
 * A barcode reader for the camera: the browser's own BarcodeDetector where it
 * has one that reads Code 128 (Chrome on Android), else the zxing-wasm
 * ponyfill (iPhones, which have none, and desktop browsers).
 *
 * The ponyfill fetches its WebAssembly from a CDN by default, which the CSP
 * rightly blocks; it's served from this site instead (/zxing, a copy of the
 * installed package's file that tests/barcode-wasm.test.ts keeps in step).
 * It's imported only when needed, so Android never downloads it.
 */

/** Code 128 is what the clothing bags use; the rest are common on other packets. */
export const BARCODE_FORMATS = ["code_128", "code_39", "ean_13", "data_matrix", "qr_code"] as const;

export const ZXING_WASM_URL = "/zxing/zxing_reader.wasm";

export type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

type NativeDetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

export async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (supported.includes("code_128")) {
        return new Native({ formats: BARCODE_FORMATS.filter((f) => supported.includes(f)) });
      }
    } catch {
      // A native detector that can't list its formats: use ours.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_URL : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: [...BARCODE_FORMATS] });
}
