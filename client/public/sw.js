// Minimal service worker for the client portal's installable PWA.
// Scope is set to /portal/ at registration time (see ClientLayout.vue), so
// this never intercepts admin/staff traffic. Network-first with no offline
// cache yet — the existing IndexedDB write queue (src/offline/queue.ts)
// already handles offline writes independently of this file. This worker's
// only present job is to satisfy Chrome's installability requirement (a
// registered SW with a fetch handler); push notification handling (Phase C)
// will be added here later.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// Appointment reminders and admin broadcasts both arrive here as a JSON
// payload { title, body, url } (see pushService.js on the server).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Pure Spa & Massage Experience", body: event.data.text() };
  }
  const url = payload.url || "/portal/home";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Pure Spa & Massage Experience", {
        body: payload.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url },
      }),
      // Tells any already-open tab to refresh its notification bell right
      // away, instead of only picking up the new item on the next page load.
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientsArr) =>
          clientsArr.forEach((client) => client.postMessage({ type: "push-received" })),
        ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/portal/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
