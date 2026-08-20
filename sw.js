/* Service worker — versão 3.
   Ao editar qualquer arquivo do app, suba este número. */
const CACHE  = "bupe2026-v3";
const EXTERN = "bupe2026-ext-v3";

const SHELL = [
  "./","./index.html","./styles.css","./app.js","./store.js","./util.js","./data.js",
  "./firebase-config.js","./manifest.json",
  "./views/checklist.js","./views/roteiro.js","./views/estadias.js","./views/docs.js",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png","./icons/favicon.png"
];

/* SDK do Firebase e fontes: guardados à parte, porque são de outro domínio
   e uma falha neles não pode derrubar a instalação do service worker. */
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const EXTERNOS = [
  SDK + "firebase-app.js",
  SDK + "firebase-auth.js",
  SDK + "firebase-database.js"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    const x = await caches.open(EXTERN);
    await Promise.all(EXTERNOS.map(u =>
      fetch(u, { mode:"cors" }).then(r => r.ok && x.put(u, r)).catch(()=>{})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE && k !== EXTERN).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const ehSDK    = u => u.startsWith(SDK);
const ehFonte  = u => u.includes("fonts.googleapis.com") || u.includes("fonts.gstatic.com");
const ehBanco  = u => u.includes("firebaseio.com") || u.includes("identitytoolkit") ||
                      u.includes("firebaseapp.com") || u.includes("googleapis.com/identitytoolkit");

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const u = req.url;

  /* banco e login: sempre rede, nunca cache */
  if(ehBanco(u)) return;

  /* SDK e fontes: cache primeiro, para o app abrir offline */
  if(ehSDK(u) || ehFonte(u)){
    e.respondWith((async () => {
      const c = await caches.open(EXTERN);
      const hit = await c.match(req);
      if(hit) return hit;
      try{
        const r = await fetch(req);
        if(r.ok) c.put(req, r.clone());
        return r;
      }catch(err){
        return hit || Response.error();
      }
    })());
    return;
  }

  /* arquivos do app: rede primeiro, cache como rede de segurança */
  e.respondWith((async () => {
    try{
      const r = await fetch(req);
      const c = await caches.open(CACHE);
      c.put(req, r.clone()).catch(()=>{});
      return r;
    }catch(err){
      const hit = await caches.match(req);
      if(hit) return hit;
      if(req.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }
  })());
});
