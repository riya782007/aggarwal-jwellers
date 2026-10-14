/* Internal console: only a public, static offline notice is cached. */
const CACHE = 'aggarwal-offline-v1';
const OFFLINE = '/internal-offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE, { cache: 'reload' }))));
});
// No skipWaiting/clients.claim: never reload or take over an active bill.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('aggarwal-offline-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const internal = url.pathname === '/login' || url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  // Never intercept API calls, server actions, assets, retail pages or Supabase.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || !internal) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const notice = await caches.match(OFFLINE, { cacheName: CACHE });
    return notice || new Response('No connection. Reconnect and reload to continue.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }));
});
