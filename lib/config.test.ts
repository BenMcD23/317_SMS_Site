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

  it("the server uses API_INTERNAL_BASE when it's set, so a preview pod skips the tailnet", async () => {
    const { API_BASE } = await loadConfig({
      NEXT_PUBLIC_API_BASE: "https://pv-x-api.example.ts.net",
      API_INTERNAL_BASE: "http://api:8000",
    });
    expect(API_BASE).toBe("http://api:8000");
  });

  it("the server falls back to the public address when API_INTERNAL_BASE is blank", async () => {
    const { API_BASE } = await loadConfig({
      NEXT_PUBLIC_API_BASE: "https://smsapi.317atc.co.uk",
      API_INTERNAL_BASE: "",
    });
    expect(API_BASE).toBe("https://smsapi.317atc.co.uk");
  });

  it("only next dev and the preview image may offer the dev sign-in", async () => {
    expect((await loadConfig({ NODE_ENV: "development" })).devSignInBuild()).toBe(true);
    expect(
      (await loadConfig({ NODE_ENV: "production", NEXT_PUBLIC_PREVIEW_BUILD: "" })).devSignInBuild()
    ).toBe(false);
    expect(
      (await loadConfig({ NODE_ENV: "production", NEXT_PUBLIC_PREVIEW_BUILD: "1" })).devSignInBuild()
    ).toBe(true);
  });

  it("isOc matches the configured OC case-insensitively", async () => {
    const { isOc } = await loadConfig({ NEXT_PUBLIC_OC_EMAIL: "OC@317atc.co.uk" });
    expect(isOc("oc@317ATC.co.uk")).toBe(true);
    expect(isOc("staff@317atc.co.uk")).toBe(false);
    expect(isOc(null)).toBe(false);
    expect(isOc("")).toBe(false);
  });

  it("isOc accepts a comma-separated list", async () => {
    const { isOc } = await loadConfig({ NEXT_PUBLIC_OC_EMAIL: "oc@317atc.co.uk, Extra@317atc.co.uk" });
    expect(isOc("oc@317atc.co.uk")).toBe(true);
    expect(isOc("extra@317atc.co.uk")).toBe(true);
    expect(isOc("staff@317atc.co.uk")).toBe(false);
  });

  it("isOc is never true when no OC is configured", async () => {
    const { isOc } = await loadConfig({ NEXT_PUBLIC_OC_EMAIL: "" });
    expect(isOc("")).toBe(false);
    expect(isOc("anyone@317atc.co.uk")).toBe(false);
  });
});
