import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ZXING_WASM_URL } from "@/lib/barcode";

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/**
 * The barcode reader's WebAssembly is served from public/ (the CSP blocks the
 * CDN the library would fetch it from), so it's a copy of the installed
 * package's file. A dependency update that changes the file must update the
 * copy, or iPhones load a reader that doesn't match its JavaScript.
 */
describe("the barcode reader's WebAssembly", () => {
  it("is the installed zxing-wasm's own file", () => {
    // Resolved through barcode-detector, so it's the copy that package uses
    // even if npm ever nests it instead of hoisting it.
    const fromDetector = createRequire(createRequire(import.meta.url).resolve("barcode-detector/ponyfill"));
    const installed = fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm");
    const served = path.join(process.cwd(), "public", ZXING_WASM_URL);
    // To fix: cp node_modules/zxing-wasm/dist/reader/zxing_reader.wasm public/zxing/
    expect(sha256(served)).toBe(sha256(installed));
  });
});
