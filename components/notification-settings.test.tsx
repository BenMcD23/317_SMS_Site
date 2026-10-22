// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { NotificationSettings } from "@/components/notification-settings";
import { keyBytes } from "@/lib/push";

// A real-shaped P-256 public key (65 bytes, base64url), as the API sends it.
const PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const STAFF_TOPICS = [
  { key: "orders", label: "New orders", description: "A cadet orders kit" },
  { key: "session_plans", label: "Session plans to review", description: "An NCO submits one" },
];

type Sub = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
};

function fakeSub(endpoint = "https://push.example/me", key = keyBytes(PUBLIC_KEY)): Sub {
  return {
    endpoint,
    options: { applicationServerKey: key.buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

/** A browser with push support; `sub` is what's already subscribed. */
function browser({ sub = null as Sub | null, permission = "default", grant = "granted" } = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => sub),
    subscribe: vi.fn(async () => (sub = fakeSub())),
  };
  const reg = { pushManager };
  const serviceWorker = { getRegistration: vi.fn(async () => reg), register: vi.fn(async () => reg) };
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  const Notification = { permission, requestPermission: vi.fn(async () => grant) };
  vi.stubGlobal("Notification", Notification);
  vi.stubGlobal("PushManager", function PushManager() {});
  return { pushManager, Notification };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

type Route = (init: RequestInit | undefined) => Response;

function api(routes: Record<string, Route>) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const route = routes[`${init?.method ?? "GET"} ${path}`];
    return route ? route(init) : json(404, { detail: "no route" });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const config =
  (over: object = {}) =>
  () =>
    json(200, { enabled: true, publicKey: PUBLIC_KEY, topics: STAFF_TOPICS, ...over });
const deviceSwitch = () => screen.findByRole("switch", { name: /Notifications on this device/ });
const bodyOf = (fetch: ReturnType<typeof api>, key: string) =>
  JSON.parse(
    fetch.mock.calls.find(([u, i]) => `${i?.method ?? "GET"} ${new URL(u).pathname}` === key)![1]!
      .body as string
  );

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("notification settings", () => {
  it("says so when the browser can't take notifications", async () => {
    vi.stubGlobal("PushManager", undefined);
    render(<NotificationSettings />);
    expect(await screen.findByText("This browser can't show notifications.")).toBeInTheDocument();
  });

  it("tells an iPhone user to add the app to the Home Screen first", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
    );
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    render(<NotificationSettings />);
    expect(await screen.findByText(/add 317 SMS to your Home Screen first/)).toBeInTheDocument();
  });

  it("says when the server has no push keys", async () => {
    browser();
    api({ "GET /push/config": config({ enabled: false, publicKey: null }) });
    render(<NotificationSettings />);
    expect(await screen.findByText(/aren't set up on the server/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows the API's error when the settings can't load", async () => {
    browser();
    api({ "GET /push/config": () => json(500, { detail: "Database down" }) });
    render(<NotificationSettings />);
    expect(await screen.findByText("Database down")).toBeInTheDocument();
  });

  it("turning it on asks permission, subscribes with the server's key and signs up for every topic", async () => {
    const { pushManager, Notification } = browser();
    const fetch = api({
      "GET /push/config": config(),
      "PUT /push/subscriptions": (init) =>
        json(200, { subscribed: true, topics: JSON.parse(init!.body as string).topics }),
    });
    render(<NotificationSettings />);
    const device = await deviceSwitch();
    expect(device).not.toBeChecked();
    expect(screen.queryByRole("switch", { name: /New orders/ })).not.toBeInTheDocument();

    await userEvent.click(device);
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(PUBLIC_KEY),
    });
    expect(bodyOf(fetch, "PUT /push/subscriptions")).toEqual({
      endpoint: "https://push.example/me",
      keys: { p256dh: "p", auth: "a" },
      topics: ["orders", "session_plans"],
    });
    expect(await deviceSwitch()).toBeChecked();
    expect(screen.getByRole("switch", { name: /New orders/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Session plans to review/ })).toBeChecked();
    expect(toast.success).toHaveBeenCalledWith("Notifications on for this device");
  });

  it("saying no to the permission prompt leaves it off and explains", async () => {
    const { pushManager } = browser({ grant: "denied" });
    const fetch = api({ "GET /push/config": config() });
    render(<NotificationSettings />);
    await userEvent.click(await deviceSwitch());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("blocked for this site"));
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetch.mock.calls.some(([, i]) => i?.method === "PUT")).toBe(false);
    expect(await deviceSwitch()).not.toBeChecked();
  });

  it("disables the switch when the site is already blocked", async () => {
    browser({ permission: "denied" });
    api({ "GET /push/config": config() });
    render(<NotificationSettings />);
    expect(await deviceSwitch()).toBeDisabled();
    expect(
      screen.getByText(/Allow them in your browser's site settings, then come back/)
    ).toBeInTheDocument();
  });

  it("a device already signed up shows its topics, and a topic switch saves the new set", async () => {
    browser({ sub: fakeSub(), permission: "granted" });
    const fetch = api({
      "GET /push/config": config(),
      "POST /push/subscriptions/lookup": () =>
        json(200, { subscribed: true, topics: ["orders", "session_plans"] }),
      "PUT /push/subscriptions": (init) =>
        json(200, { subscribed: true, topics: JSON.parse(init!.body as string).topics }),
    });
    render(<NotificationSettings />);
    expect(await deviceSwitch()).toBeChecked();
    expect(bodyOf(fetch, "POST /push/subscriptions/lookup")).toEqual({ endpoint: "https://push.example/me" });

    await userEvent.click(screen.getByRole("switch", { name: /New orders/ }));
    expect(bodyOf(fetch, "PUT /push/subscriptions").topics).toEqual(["session_plans"]);
    await waitFor(() => expect(screen.getByRole("switch", { name: /New orders/ })).not.toBeChecked());
  });

  it("a browser subscription the server doesn't know about shows as off", async () => {
    browser({ sub: fakeSub(), permission: "granted" });
    api({
      "GET /push/config": config(),
      "POST /push/subscriptions/lookup": () => json(200, { subscribed: false, topics: [] }),
    });
    render(<NotificationSettings />);
    expect(await deviceSwitch()).not.toBeChecked();
  });

  it("an old subscription made with another server key is replaced", async () => {
    const old = fakeSub("https://push.example/old", new Uint8Array(65).fill(1));
    const { pushManager } = browser({ sub: old, permission: "granted" });
    api({
      "GET /push/config": config(),
      "POST /push/subscriptions/lookup": () => json(200, { subscribed: false, topics: [] }),
      "PUT /push/subscriptions": () => json(200, { subscribed: true, topics: ["orders"] }),
    });
    render(<NotificationSettings />);
    await userEvent.click(await deviceSwitch());
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
  });

  it("turning it off forgets the device on the server, then in the browser", async () => {
    const sub = fakeSub();
    browser({ sub, permission: "granted" });
    const fetch = api({
      "GET /push/config": config(),
      "POST /push/subscriptions/lookup": () => json(200, { subscribed: true, topics: ["orders"] }),
      "POST /push/subscriptions/delete": () => new Response(null, { status: 204 }),
    });
    render(<NotificationSettings />);
    await userEvent.click(await deviceSwitch());
    expect(bodyOf(fetch, "POST /push/subscriptions/delete")).toEqual({ endpoint: "https://push.example/me" });
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(await deviceSwitch()).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Send a test" })).not.toBeInTheDocument();
  });

  it("if the server can't forget the device it stays on, rather than silently still sending", async () => {
    const sub = fakeSub();
    browser({ sub, permission: "granted" });
    api({
      "GET /push/config": config(),
      "POST /push/subscriptions/lookup": () => json(200, { subscribed: true, topics: ["orders"] }),
      "POST /push/subscriptions/delete": () => json(500, { detail: "Database down" }),
    });
    render(<NotificationSettings />);
    await userEvent.click(await deviceSwitch());
    expect(toast.error).toHaveBeenCalledWith("Database down");
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(await deviceSwitch()).toBeChecked();
  });

  it("send a test reports success, or the server's reason", async () => {
    browser({ sub: fakeSub(), permission: "granted" });
    let answer = json(200, { sent: 1 });
    api({
      "GET /push/config": config(),
      "POST /push/subscriptions/lookup": () => json(200, { subscribed: true, topics: [] }),
      "POST /push/test": () => answer,
    });
    render(<NotificationSettings />);
    const button = await screen.findByRole("button", { name: "Send a test" });
    await userEvent.click(button);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Test sent"));

    answer = json(502, { detail: "The push service didn't accept the message" });
    await userEvent.click(button);
    expect(toast.error).toHaveBeenCalledWith("The push service didn't accept the message");
  });

  it("an NCO is offered only the topics the API offers them", async () => {
    browser({ sub: fakeSub(), permission: "granted" });
    api({
      "GET /push/config": config({
        topics: [{ key: "my_session_plans", label: "My session plans", description: "d" }],
      }),
      "POST /push/subscriptions/lookup": () => json(200, { subscribed: true, topics: ["my_session_plans"] }),
    });
    render(<NotificationSettings />);
    await deviceSwitch();
    expect(screen.getAllByRole("switch").map((s) => s.getAttribute("id"))).toEqual([
      "push-device",
      "push-topic-my_session_plans",
    ]);
  });
});
