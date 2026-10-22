// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { downloadCsv, filenameFromDisposition, saveResponseAsFile, toCsv } from "@/lib/download";

describe("filenameFromDisposition", () => {
  it.each([
    ['attachment; filename="HTD_SMITH.docx"', "HTD_SMITH.docx"],
    ["attachment; filename=plain.pdf", "plain.pdf"],
    ["attachment; filename=plain.pdf; size=3", "plain.pdf"],
    [`attachment; filename="Muller.docx"; filename*=UTF-8''M%C3%BCller.docx`, "Müller.docx"],
    [`inline; filename*=utf-8''Caf%C3%A9%20%E2%80%93%20plan.pdf`, "Café – plan.pdf"],
    [`attachment; filename="fallback.pdf"; filename*=UTF-8''%E0%A4%A`, "fallback.pdf"],
  ])("%s", (header, expected) => {
    expect(filenameFromDisposition(header, "default.bin")).toBe(expected);
  });

  it("uses the fallback when there is nothing usable", () => {
    expect(filenameFromDisposition(null, "f.docx")).toBe("f.docx");
    expect(filenameFromDisposition("", "f.docx")).toBe("f.docx");
    expect(filenameFromDisposition("attachment", "f.docx")).toBe("f.docx");
  });
});

describe("saveResponseAsFile", () => {
  it("clicks a download link named from the header and frees the blob URL", async () => {
    const create = vi.fn(() => "blob:1");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const res = new Response("data", { headers: { "Content-Disposition": 'attachment; filename="x.pdf"' } });

    expect(await saveResponseAsFile(res, "fallback.pdf")).toBe("x.pdf");
    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("x.pdf");
    expect(link.href).toBe("blob:1");
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });
});

describe("toCsv", () => {
  it("heads the columns in the order first seen, across every row", () => {
    expect(toCsv([{ a: 1 }, { b: 2, a: 3 }])).toBe("a,b\r\n1,\r\n3,2");
  });

  it("quotes cells holding commas, quotes or line breaks", () => {
    expect(toCsv([{ name: 'Smith, "Jo"', note: "two\nlines" }])).toBe(
      'name,note\r\n"Smith, ""Jo""","two\nlines"'
    );
  });

  it("leaves missing and null cells empty rather than writing 'null'", () => {
    expect(toCsv([{ a: null, b: undefined, c: 0 }])).toBe("a,b,c\r\n,,0");
  });

  // A name like "=HYPERLINK(...)" would otherwise run as a formula in Excel.
  it("defuses text that a spreadsheet would run as a formula", () => {
    expect(toCsv([{ name: "=cmd()", other: "+44", at: "@x", dash: "-1" }])).toBe(
      "name,other,at,dash\r\n'=cmd(),'+44,'@x,'-1"
    );
  });

  it("keeps negative numbers as numbers", () => {
    expect(toCsv([{ change: -3 }])).toBe("change\r\n-3");
  });

  it("keeps non-ASCII names intact", () => {
    expect(toCsv([{ name: "Zoë Ó Briain" }])).toBe("name\r\nZoë Ó Briain");
  });

  it("is empty for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("downloadCsv", () => {
  it("saves a UTF-8 CSV with a byte-order mark so Excel reads accents", async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:x";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadCsv("cadets.csv", [{ name: "Zoë" }]);
    expect(click).toHaveBeenCalled();
    expect(blob!.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("name\r\nZoë");
  });
});
