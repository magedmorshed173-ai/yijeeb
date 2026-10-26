const CACHE = "yijeeb-v2";
const ASSETS = ["/", "/index.html", "/style.css", "/app.js", "/i18n.js", "/crypto.js", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  self.clients.claim().then(() =>
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // طلبات الشبكة للـ API والـ socket تمر مباشرة
  if (e.request.url.includes("/api/") || e.request.url.includes("/socket.io")) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
    const clone = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, clone));
    return res;
  }).catch(() => caches.match("/index.html"))));
});

// ===== Web Push =====
self.addEventListener("push", (e) => {
  let data = { title: "يجيب", body: "رسالة جديدة", url: "/" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url },
    vibrate: [80, 40, 80],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
