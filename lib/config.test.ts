import { describe, expect, it, vi } from "vitest";

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return import("@/lib/config");
}

describe("config", () => {
  it("defaults the API to localhost", async () => {
    const { API_BASE } = await loadConfig({ NEXT_PUBLIC_API_BASE: "" });
    expect(API_BASE).toBe("http://localhost:8000");
  });

  it("isOc matches the configured OC case-insensitively", async () => {
    const { isOc } = await loadConfig({ NEXT_PUBLIC_OC_EMAIL: "OC@317atc.co.uk" });
    expect(isOc("oc@317ATC.co.uk")).toBe(true);
    expect(isOc("staff@317atc.co.uk")).toBe(false);
    expect(isOc(null)).toBe(false);
    expect(isOc("")).toBe(false);
  });

  it("isOc is never true when no OC is configured", async () => {
    const { isOc } = await loadConfig({ NEXT_PUBLIC_OC_EMAIL: "" });
    expect(isOc("")).toBe(false);
    expect(isOc("anyone@317atc.co.uk")).toBe(false);
  });
});
