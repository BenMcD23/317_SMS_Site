import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { canAccess } from "@/lib/access";

const m = manifest();

describe("web app manifest", () => {
  it("installs as a standalone app opening on the dashboard", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.name).toBe("317 SMS");
  });

  it.each(m.icons!.map((i) => [i.src, i.sizes]))("icon %s exists at %s", (src, sizes) => {
    const file = path.join(process.cwd(), "public", src!);
    expect(fs.existsSync(file), file).toBe(true);
    // PNG width and height sit at bytes 16-23 of the IHDR chunk.
    const png = fs.readFileSync(file);
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(sizes);
  });

  it("has the 192 and 512 icons Android asks for, and a maskable one", () => {
    expect(m.icons!.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons!.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it.each(m.shortcuts!.map((s) => [s.url]))("shortcut %s is a page every NCO can open", (url) => {
    expect(canAccess("nco", url)).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "app", url, "page.tsx"))).toBe(true);
  });
});
