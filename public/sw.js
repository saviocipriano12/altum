const SW_VERSION = "altum-client-v3";
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
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/pwa/")) return true;
  if (url.pathname.endsWith(".css")) return true;
  if (url.pathname.endsWith(".js")) return true;
  if (url.pathname.endsWith(".woff2")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/cliente")) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return cache.match(OFFLINE_URL);
      })
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then(async (response) => {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);

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
      const absolute = new URL(targetUrl, self.location.origin).href;
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
