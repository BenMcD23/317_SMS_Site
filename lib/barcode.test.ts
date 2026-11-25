import { describe, expect, it, vi } from "vitest";

const ponyfill = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(),
  constructed: [] as unknown[],
}));

vi.mock("barcode-detector/ponyfill", () => ({
  prepareZXingModule: ponyfill.prepareZXingModule,
  BarcodeDetector: class {
    constructor(options: unknown) {
      ponyfill.constructed.push(options);
    }
    detect = async () => [];
  },
}));

import { BARCODE_FORMATS, ZXING_WASM_URL, createDetector } from "@/lib/barcode";

function nativeDetector(supported: string[] | Error) {
  const made: unknown[] = [];
  const Native = class {
    constructor(options: unknown) {
      made.push(options);
    }
    detect = async () => [];
    static getSupportedFormats = async () => {
      if (supported instanceof Error) throw supported;
      return supported;
    };
  };
  vi.stubGlobal("BarcodeDetector", Native);
  return made;
}

describe("createDetector", () => {
  it("uses the browser's own reader when it reads Code 128 (Chrome on Android)", async () => {
    const made = nativeDetector(["code_128", "qr_code", "aztec"]);
    await createDetector();
    expect(made).toEqual([{ formats: ["code_128", "qr_code"] }]);
    expect(ponyfill.prepareZXingModule).not.toHaveBeenCalled();
  });

  it("uses ours where there's no built-in reader (iPhones)", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    ponyfill.constructed.length = 0;
    await createDetector();
    expect(ponyfill.constructed).toEqual([{ formats: [...BARCODE_FORMATS] }]);
  });

  it("uses ours when the built-in one can't read the bags' Code 128", async () => {
    nativeDetector(["qr_code"]);
    ponyfill.constructed.length = 0;
    await createDetector();
    expect(ponyfill.constructed).toHaveLength(1);
  });

  it("uses ours when the built-in one can't say what it reads", async () => {
    nativeDetector(new Error("not supported"));
    ponyfill.constructed.length = 0;
    await createDetector();
    expect(ponyfill.constructed).toHaveLength(1);
  });

  it("loads its WebAssembly from this site, not the CDN the CSP blocks", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    ponyfill.prepareZXingModule.mockClear();
    await createDetector();
    const { overrides } = ponyfill.prepareZXingModule.mock.calls[0][0];
    expect(overrides.locateFile("zxing_reader.wasm", "https://cdn.jsdelivr.net/x/")).toBe(ZXING_WASM_URL);
    // Anything else it asks for keeps the library's own path.
    expect(overrides.locateFile("other.js", "/p/")).toBe("/p/other.js");
  });
});
