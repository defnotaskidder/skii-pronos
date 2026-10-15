// Skii Pronos service worker: push alerts + a tiny offline fallback for the app shell.
const VERSION = "skii-sw-1";

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data?.text() }; }
  const title = d.title || "Skii Pronos";
  const opts = {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
    vibrate: d.kind === "goal" ? [80, 40, 80] : [40],
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url === url && "focus" in c) return c.focus(); }
    for (const c of list) { if ("navigate" in c) return c.navigate(url).then((w) => w?.focus()); }
    return self.clients.openWindow(url);
  }));
});

// network first; cached shell when offline
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin) || req.url.includes("/api/")) return;
  e.respondWith(fetch(req).then((res) => {
    if (req.mode === "navigate" || /\.(js|css|woff2|png|svg)$/.test(new URL(req.url).pathname)) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : undefined))));
});
