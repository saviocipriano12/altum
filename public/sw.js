/* Navigation fallback adapted from GoogleChrome/samples (Apache-2.0).
 * Copyright 2015, 2019 Google Inc. All Rights Reserved.
 * Modified for Altum: client-only scope, isolated caches and no private data cache.
 * License and pinned source: lib/vendor/googlechrome-offline/.
 */
const SW_VERSION = "altum-client-v5";
const STATIC_CACHE = `static-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";

const STATIC_ASSETS = [
  OFFLINE_URL,
  "/site.webmanifest",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: "reload" }))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.includes("altum-client") && key !== STATIC_CACHE).map((key) => caches.delete(key)));
      if ("navigationPreload" in self.registration) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/pwa/")) return true;
  if (url.pathname.endsWith(".woff2")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/")) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/cliente/")) {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) return preloadResponse;
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match(OFFLINE_URL)) || new Response("Sem conexão. Reconecte e recarregue a Altum.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })()
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then(async (response) => {
            const cache = await caches.open(STATIC_CACHE);
            if (response.ok) await cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached || Response.error());

        return cached || network;
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = String(event.notification?.data?.url || "/cliente/painel");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const target = new URL(targetUrl, self.location.origin);
      const absolute = target.origin === self.location.origin && target.pathname.startsWith("/cliente/") ? target.href : new URL("/cliente/painel", self.location.origin).href;
      for (const client of clients) {
        if (client.url === absolute && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absolute);
      }
      return undefined;
    })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "ALTUM Cliente",
    body: "Nova atualizacao operacional disponivel.",
    tag: "altum-generic",
    url: "/cliente/painel",
  };

  try {
    const data = event.data.json();
    payload = {
      title: String(data.title || payload.title),
      body: String(data.body || payload.body),
      tag: String(data.tag || payload.tag),
      url: String(data.url || payload.url),
    };
  } catch {
    const text = event.data.text();
    if (text) payload.body = text;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      data: { url: payload.url },
    })
  );
});
