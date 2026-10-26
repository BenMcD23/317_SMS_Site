import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

/**
 * Push notifications on this device: the browser half of turning them on and
 * off, and of choosing topics. The API keeps the subscription and sends
 * (routers/push.py and core/push.py there); public/sw.js shows them.
 */

export type PushTopic = { key: string; label: string; description: string };
export type PushConfig = { enabled: boolean; publicKey: string | null; topics: PushTopic[] };
export type PushState = { subscribed: boolean; topics: string[] };

export const SW_URL = "/sw.js";

/** Whether this browser can take push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iPhones and iPads only allow push in an app added to the Home Screen, not in
 * a Safari tab, and Safari there has no PushManager until then. Spotted so the
 * page can say how, instead of just "not supported".
 */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installed;
}

/** The service worker that receives pushes, registering it if this is its first run. */
export async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register(SW_URL);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** The browser takes the server's key as raw bytes; the API hands it over base64url. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

export function getPushConfig(token: string): Promise<PushConfig> {
  return apiRequest(
    token,
    `${API_BASE}/push/config`,
    { method: "GET" },
    "Couldn't load notification settings."
  );
}

export function lookupDevice(token: string, endpoint: string): Promise<PushState> {
  return apiRequest(token, `${API_BASE}/push/subscriptions/lookup`, { method: "POST", body: { endpoint } });
}

function saveDevice(token: string, sub: PushSubscription, topics: string[]): Promise<PushState> {
  const { endpoint, keys } = sub.toJSON();
  return apiRequest(
    token,
    `${API_BASE}/push/subscriptions`,
    { method: "PUT", body: { endpoint, keys, topics } },
    "Couldn't save notification settings."
  );
}

/**
 * Ask permission, subscribe this browser and register it with the API. An
 * old subscription made with another server key (the keys were changed) is
 * replaced, because the browser refuses to subscribe again over it.
 */
export async function enablePush(token: string, publicKey: string, topics: string[]): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked for this site. Allow them in your browser's site settings.");
  }
  const key = keyBytes(publicKey);
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return saveDevice(token, sub, topics);
}

export async function setPushTopics(token: string, topics: string[]): Promise<PushState> {
  const sub = await currentSubscription();
  if (!sub) throw new Error("Notifications are off on this device. Turn them on again.");
  return saveDevice(token, sub, topics);
}

/** Forget this device on the API first: if that fails it is still subscribed, and says so. */
export async function disablePush(token: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await apiRequest(
    token,
    `${API_BASE}/push/subscriptions/delete`,
    { method: "POST", body: { endpoint: sub.endpoint } },
    "Couldn't turn notifications off."
  );
  await sub.unsubscribe();
}

export function sendTestPush(token: string): Promise<{ sent: number }> {
  return apiRequest(token, `${API_BASE}/push/test`, { method: "POST" }, "Couldn't send a test notification.");
}
