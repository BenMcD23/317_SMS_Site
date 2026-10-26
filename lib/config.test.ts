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

  it("isOc trusts only the API's answer carried on the session", async () => {
    const { isOc } = await loadConfig({});
    expect(isOc({ is_oc: true })).toBe(true);
    expect(isOc({ is_oc: false })).toBe(false);
    expect(isOc({})).toBe(false);
    expect(isOc(null)).toBe(false);
  });
});
