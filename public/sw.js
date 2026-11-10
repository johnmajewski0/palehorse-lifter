/* Pale Horse offline shell cache. Never cache /api/ responses or POST/PUT. */
const CACHE_PREFIX = "palehorse-app-";
const CACHE_NAME = CACHE_PREFIX + "v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const urls = ["/", "/index.html", "/asset-manifest.json", "/manifest.json"];
      const manifestResponse = await fetch("/asset-manifest.json", { cache: "no-store" });
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        Object.values(manifest.files || {}).forEach((url) => {
          if (typeof url === "string" && url.startsWith("/") && !url.startsWith("/api/")) {
            urls.push(url);
          }
        });
      }
      await cache.addAll(Array.from(new Set(urls)));
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep only the current application cache, preserving browser meet data.
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const stored = await cache.match("/index.html");
        return stored || Response.error();
      })
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
