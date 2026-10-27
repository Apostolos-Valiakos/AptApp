// Service worker for the staff app (/app/*), so it opens without a
// connection. The build (vite.config.mjs, appServiceWorker) fills in
// __BUILD_ID__ and __PRECACHE__ — the build's scripts, styles and fonts — and
// every build makes this file different, so browsers install the new one.
//
// - Pages under /app/: network first; the last good copy if the server can't
//   be reached (the app then shows the browser's saved data, see src/offline).
// - /assets/*: cache first (file names change with every build).
// - Everything else, including /api: not touched, so the offline write queue
//   still sees real network errors.
const BUILD_ID = __BUILD_ID__;
const PRECACHE = __PRECACHE__;
const CACHE = `pure-app-${BUILD_ID}`;
const SHELL = "/app-shell.html";
const NAVIGATION_TIMEOUT_MS = 5000;

const cacheShell = async (cache) => {
  try {
    const res = await fetch("/app/scheduler", { cache: "no-store" });
    if (res.ok) await cache.put(SHELL, res);
  } catch {}
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cacheShell(cache);
      // One by one: a single missing file mustn't fail the whole install.
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("pure-app-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

const page = async (request) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (res.ok) cache.put(SHELL, res.clone());
    return res;
  } catch {
    const shell = await cache.match(SHELL);
    if (shell) return shell;
    throw new Error("offline and no saved copy of the app");
  }
};

const asset = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname.startsWith("/app/")) {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(asset(request));
  }
});
