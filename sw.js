/* Service worker — versão 2. Ao editar qualquer arquivo, suba este número. */
const CACHE = "roma2026-v2";
const SHELL = [
  "./","./index.html","./styles.css","./app.js","./store.js","./util.js","./data.js",
  "./firebase-config.js","./manifest.json",
  "./views/checklist.js","./views/roteiro.js","./views/estadias.js","./views/docs.js",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png","./icons/favicon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if(e.request.method !== "GET") return;
  if(url.hostname.includes("firebaseio") || url.hostname.includes("googleapis") ||
     url.hostname.includes("gstatic") || url.hostname.includes("firebaseapp")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const c = r.clone();
      caches.open(CACHE).then(x => x.put(e.request, c)).catch(()=>{});
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
