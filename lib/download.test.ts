// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { filenameFromDisposition, saveResponseAsFile } from "@/lib/download";

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
