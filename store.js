/* Sincronização e armazenamento.
   O Firebase é carregado sob demanda: se não houver internet, o import falha
   em silêncio e o app segue funcionando com o espelho local (IndexedDB). */

import { firebaseConfig, configurado } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

/* preferências pequenas ficam no localStorage */
export const LS = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

export const dados = { items:{}, extra:{}, roteiro:{}, estadias:{}, docs:{} };
export let docsLocais = {};
export let cfg = LS.get("roma2026:cfg") || { code:"", name:"" };
export let online = false;
export let presentes = [];
export let motivoOffline = "";

let FB = null, db = null, uid = null, unsubs = [], ouvintes = [], cacheCarregado = false;

export const aoMudar = fn => { ouvintes.push(fn); };
const avisar = () => ouvintes.forEach(f => { try{ f(); }catch(e){ console.error(e); } });

/* ═══════ IndexedDB: espelho offline ═══════ */
const DB_NAME = "roma2026", STORE = "cache";
function idb(){
  return new Promise((ok, erro) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
export async function idbGet(k){
  try{
    const d = await idb();
    return await new Promise((ok, erro) => {
      const t = d.transaction(STORE, "readonly").objectStore(STORE).get(k);
      t.onsuccess = () => ok(t.result ?? null);
      t.onerror = () => erro(t.error);
    });
  }catch(e){ console.warn("cache indisponível", e); return null; }
}
export async function idbSet(k, v){
  try{
    const d = await idb();
    await new Promise((ok, erro) => {
      const t = d.transaction(STORE, "readwrite").objectStore(STORE).put(v, k);
      t.onsuccess = () => ok();
      t.onerror = () => erro(t.error);
    });
  }catch(e){ console.warn("cache indisponível", e); }
}
const salvarCache = () => idbSet("dados", JSON.parse(JSON.stringify(dados)));

/* ═══════ espelho local — funciona com ou sem rede ═══════ */
export async function carregarLocal(){
  if(cacheCarregado) return;
  cacheCarregado = true;
  const cache = await idbGet("dados");
  if(cache) for(const k in dados) if(cache[k]) dados[k] = cache[k];
  docsLocais = await idbGet("docsLocais") || {};
  avisar();
}

/* ═══════ Firebase sob demanda ═══════ */
async function carregarSDK(){
  if(FB) return FB;
  const [app, auth, rtdb] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-database.js")
  ]);
  FB = { ...app, ...auth, ...rtdb };
  return FB;
}

export async function iniciar(){
  await carregarLocal();

  if(!configurado){ motivoOffline = "config"; return { ok:false, motivo:"config" }; }
  if(db){ if(cfg.code && !unsubs.length) ouvir(); return { ok:true }; }

  try{
    const f = await carregarSDK();
    const app  = f.initializeApp(firebaseConfig);
    db = f.getDatabase(app);
    const auth = f.getAuth(app);
    await f.signInAnonymously(auth);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), 15000);
      f.onAuthStateChanged(auth, u => { if(u){ clearTimeout(t); uid = u.uid; res(); } });
    });
    motivoOffline = "";
    if(cfg.code) ouvir();
    return { ok:true };
  }catch(e){
    console.warn("Firebase indisponível — seguindo offline.", e);
    db = null; FB = null;
    motivoOffline = navigator.onLine ? "conexao" : "offline";
    avisar();
    return { ok:false, motivo: motivoOffline, erro:e };
  }
}

const RAMOS = ["items","extra","roteiro","estadias","docs"];
const caminho = (ramo, id) => `trips/${cfg.code}/${ramo}${id ? "/"+id : ""}`;

export function ouvir(){
  parar();
  if(!db || !cfg.code || !FB) return;
  RAMOS.forEach(ramo => {
    const u = FB.onValue(FB.ref(db, caminho(ramo)), snap => {
      dados[ramo] = snap.val() || {};
      online = true;
      salvarCache();
      avisar();
    }, err => {
      console.error(err); online = false; motivoOffline = "regras"; avisar();
    });
    unsubs.push(u);
  });
  presenca();
}
export function parar(){
  unsubs.forEach(u => { try{ u(); }catch(e){} });
  unsubs = [];
}

function presenca(){
  if(!db || !uid || !cfg.code || !FB) return;
  const meu = FB.ref(db, `trips/${cfg.code}/present/${uid}`);
  FB.set(meu, { name: cfg.name || "alguém", at: FB.serverTimestamp() }).catch(()=>{});
  FB.onDisconnect(meu).remove();
  const u = FB.onValue(FB.ref(db, `trips/${cfg.code}/present`), s => {
    const p = s.val() || {};
    presentes = Object.keys(p).filter(k => k !== uid).map(k => p[k].name);
    avisar();
  }, ()=>{});
  unsubs.push(u);
}

/* ═══════ escrita otimista: aplica local, tenta enviar ═══════ */
export async function gravar(ramo, id, valor){
  if(valor === null) delete dados[ramo][id];
  else dados[ramo][id] = valor;
  salvarCache();
  avisar();
  if(!db || !cfg.code || !FB) return { ok:false, local:true };
  try{
    if(valor === null) await FB.remove(FB.ref(db, caminho(ramo, id)));
    else await FB.set(FB.ref(db, caminho(ramo, id)), valor);
    return { ok:true };
  }catch(e){ console.error(e); return { ok:false, erro:e }; }
}

export async function gravarLote(ramo, obj){
  Object.assign(dados[ramo], obj);
  salvarCache();
  avisar();
  if(!db || !cfg.code || !FB) return { ok:false, local:true };
  try{ await FB.update(FB.ref(db, caminho(ramo)), obj); return { ok:true }; }
  catch(e){ console.error(e); return { ok:false, erro:e }; }
}

/* documentos guardados só no aparelho */
export async function gravarLocal(id, valor){
  if(valor === null) delete docsLocais[id];
  else docsLocais[id] = valor;
  await idbSet("docsLocais", docsLocais);
  avisar();
}

/* ═══════ conexão ═══════ */
export async function conectar(code, name){
  cfg = { code, name };
  LS.set("roma2026:cfg", cfg);
  if(!db){
    const r = await iniciar();
    if(!r.ok) return r;
  }
  try{
    for(const ramo of RAMOS){
      if(!Object.keys(dados[ramo]).length) continue;
      const snap = await FB.get(FB.ref(db, caminho(ramo)));
      const remoto = snap.val() || {};
      const envio = {};
      for(const id in dados[ramo]){
        const l = dados[ramo][id], r = remoto[id];
        if(!r || (l.t || 0) > (r.t || 0)) envio[id] = l;
      }
      if(Object.keys(envio).length) await FB.update(FB.ref(db, caminho(ramo)), envio);
    }
  }catch(e){ console.error(e); }
  ouvir();
  return { ok:true };
}

export function desconectar(){
  parar();
  if(db && cfg.code && uid && FB) FB.set(FB.ref(db, `trips/${cfg.code}/present/${uid}`), null).catch(()=>{});
  cfg = { code:"", name: cfg.name };
  LS.set("roma2026:cfg", cfg);
  presentes = [];
  online = false;
  avisar();
}

/* tenta reconectar quando a rede volta */
export async function religar(){
  if(!configurado) return;
  if(!db) await iniciar();
  else if(cfg.code && !unsubs.length) ouvir();
}

export const estaConectado = () => !!(db && cfg.code);
export { configurado };
