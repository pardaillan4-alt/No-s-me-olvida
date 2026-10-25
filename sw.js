/* Service worker: funciona sin internet y atiende los botones de las notificaciones. */
const CACHE = 'nso-v2';
const CORE = ['./', './index.html', './styles.css', './app.js', './parser.js', './config.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nso-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Red primero (para recibir mejoras), caché si no hay señal
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || caches.match('./index.html'))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  const action = e.action || 'open';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) {
      win.postMessage({ type: 'notification-action', action, id });
      if (action === 'open' && win.focus) await win.focus();
      return;
    }
    const url = new URL('./', self.registration.scope);
    if (id) { url.searchParams.set('id', id); url.searchParams.set('action', action); }
    await self.clients.openWindow(url.href);
  })());
});
