/**
 * The 317 SMS service worker. Three jobs, nothing more:
 *
 * 1. Offline page. A page load with no signal gets /offline.html instead of
 *    the browser's dinosaur. Everything else goes to the network untouched:
 *    pages and data are never served from a cache, so nobody sees a stale
 *    roster and thinks it is live.
 * 2. Push. Shows the notifications the API sends (core/push.py there).
 * 3. Notification taps open the page the notification is about, reusing an
 *    open window of the app if there is one.
 *
 * Plain JS in public/ so it is served as-is from /sw.js, the scope root.
 * Bump CACHE when offline.html changes so phones fetch the new one.
 */

const CACHE = "sms-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "317 SMS", {
      body: data.body || "",
      // Same tag replaces the last one ("3 new orders" rather than a stack).
      tag: data.tag,
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

/** Only ever open our own pages, whatever the payload says. */
function sameOriginUrl(url) {
  try {
    const target = new URL(url || "/", self.location.origin);
    return target.origin === self.location.origin ? target.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w || open).navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
