// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let session: { id_token?: string; error?: string } | null = null;
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session }), signIn: vi.fn() }));

const reauth = vi.fn(async () => true);
vi.mock("@/lib/api-fetch", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api-fetch")>();
  return { ...real, reauth: (...a: unknown[]) => reauth(...(a as [])) };
});

import { AUTH_LOOP_EVENT } from "@/lib/api-fetch";
import { ApiStatusBadge, useApiStatus } from "@/components/layout/api-status";

beforeEach(() => {
  reauth.mockClear();
  session = { id_token: "tok" };
});

const health = (status: number | "network") =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (status === "network") throw new TypeError("down");
      return new Response("{}", { status });
    })
  );

describe("useApiStatus", () => {
  it.each([
    [200, "ok"],
    [403, "auth-error"],
    [500, "api-down"],
    ["network" as const, "api-down"],
  ])("health %s -> %s", async (status, expected) => {
    health(status);
    const { result } = renderHook(() => useApiStatus());
    expect(result.current).toBe("checking");
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it("a 401 re-auths instead of showing an error", async () => {
    health(401);
    const { result } = renderHook(() => useApiStatus());
    await waitFor(() => expect(reauth).toHaveBeenCalledWith("/"));
    expect(result.current).toBe("checking");
  });

  it("does nothing without a token", () => {
    session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useApiStatus());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a session the server couldn't renew re-auths without a request, with consent for a dead grant", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    session = { id_token: "tok", error: "RefreshTokenExpired" };
    renderHook(() => useApiStatus());
    expect(reauth).toHaveBeenCalledWith(expect.any(String), { consent: true });
    session = { id_token: "tok2", error: "RefreshAccessTokenError" };
    renderHook(() => useApiStatus());
    expect(reauth).toHaveBeenLastCalledWith(expect.any(String), { consent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an auth loop flips to the sign-in-again state", async () => {
    health(200);
    const { result } = renderHook(() => useApiStatus());
    await waitFor(() => expect(result.current).toBe("ok"));
    act(() => void window.dispatchEvent(new Event(AUTH_LOOP_EVENT)));
    expect(result.current).toBe("auth-error");
  });
});

describe("ApiStatusBadge", () => {
  it("renders nothing while fine or still checking", () => {
    const { container, rerender } = render(<ApiStatusBadge status="ok" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ApiStatusBadge status="checking" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says when the API is offline", () => {
    render(<ApiStatusBadge status="api-down" />);
    expect(screen.getByRole("status")).toHaveTextContent("API offline");
  });

  it("sign in again forces a re-auth even inside the cooldown", async () => {
    render(<ApiStatusBadge status="auth-error" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "sign in again" }));
    expect(reauth).toHaveBeenCalledWith(expect.any(String), { force: true });
  });
});
