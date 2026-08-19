import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, remove, get, onDisconnect, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, configurado } from "./firebase-config.js";
import { agora } from "./util.js";

/* ═══════ estado em memória ═══════
   dados = { items, extra, roteiro, estadias, docs }
   docsLocais = documentos que o usuário escolheu não sincronizar          */

/* preferências pequenas ficam no localStorage */
export const LS = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

export const dados = { items:{}, extra:{}, roteiro:{}, estadias:{}, docs:{} };
export let docsLocais = {};
export let cfg = LS.get("roma2026:cfg") || { code:"", name:"" };
export let online = false;

let db = null, uid = null, unsubs = [], ouvintes = [];

export const aoMudar = fn => { ouvintes.push(fn); };
const avisar = () => ouvintes.forEach(f => { try{ f(); }catch(e){ console.error(e); } });

/* ═══════ IndexedDB: espelho offline (aguenta as imagens) ═══════ */
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
  }catch(e){ return null; }
}
export async function idbSet(k, v){
  try{
    const d = await idb();
    await new Promise((ok, erro) => {
      const t = d.transaction(STORE, "readwrite").objectStore(STORE).put(v, k);
      t.onsuccess = () => ok();
      t.onerror = () => erro(t.error);
    });
  }catch(e){ console.warn("cache local indisponível", e); }
}

/* ═══════ Firebase ═══════ */
export async function iniciar(){
  if(db){ if(cfg.code && !unsubs.length) ouvir(); return { ok:true }; }
  const cache  = await idbGet("dados");
  if(cache) Object.assign(dados, cache);
  docsLocais   = await idbGet("docsLocais") || {};
  avisar();

  if(!configurado) return { ok:false, motivo:"config" };
  try{
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    const auth = getAuth(app);
    await signInAnonymously(auth);
    await new Promise(r => onAuthStateChanged(auth, u => { if(u){ uid = u.uid; r(); } }));
    if(cfg.code) ouvir();
    return { ok:true };
  }catch(e){
    console.error(e);
    return { ok:false, motivo:"conexao", erro:e };
  }
}

const RAMOS = ["items","extra","roteiro","estadias","docs"];

export function ouvir(){
  parar();
  if(!db || !cfg.code) return;
  RAMOS.forEach(ramo => {
    const r = ref(db, `trips/${cfg.code}/${ramo}`);
    const u = onValue(r, snap => {
      dados[ramo] = snap.val() || {};
      online = true;
      idbSet("dados", JSON.parse(JSON.stringify(dados)));
      avisar();
    }, err => {
      console.error(err); online = false; avisar();
    });
    unsubs.push(u);
  });
  presenca();
}
export function parar(){
  unsubs.forEach(u => { try{ u(); }catch(e){} });
  unsubs = [];
}

/* ── presença ── */
export let presentes = [];
function presenca(){
  if(!db || !uid || !cfg.code) return;
  const meu = ref(db, `trips/${cfg.code}/present/${uid}`);
  set(meu, { name: cfg.name || "alguém", at: serverTimestamp() }).catch(()=>{});
  onDisconnect(meu).remove();
  const u = onValue(ref(db, `trips/${cfg.code}/present`), s => {
    const p = s.val() || {};
    presentes = Object.keys(p).filter(k => k !== uid).map(k => p[k].name);
    avisar();
  }, ()=>{});
  unsubs.push(u);
}

/* ═══════ escrita ═══════ */
function caminho(ramo, id){ return `trips/${cfg.code}/${ramo}${id ? "/"+id : ""}`; }

export async function gravar(ramo, id, valor){
  /* otimista: aplica local, depois envia */
  if(valor === null){ delete dados[ramo][id]; }
  else { dados[ramo][id] = valor; }
  idbSet("dados", JSON.parse(JSON.stringify(dados)));
  avisar();
  if(!db || !cfg.code) return { ok:false, local:true };
  try{
    if(valor === null) await remove(ref(db, caminho(ramo, id)));
    else await set(ref(db, caminho(ramo, id)), valor);
    return { ok:true };
  }catch(e){
    console.error(e);
    return { ok:false, erro:e };
  }
}

export async function gravarLote(ramo, obj){
  Object.assign(dados[ramo], obj);
  idbSet("dados", JSON.parse(JSON.stringify(dados)));
  avisar();
  if(!db || !cfg.code) return { ok:false, local:true };
  try{ await update(ref(db, caminho(ramo)), obj); return { ok:true }; }
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
  /* sobe o que só existe local */
  try{
    for(const ramo of RAMOS){
      if(!Object.keys(dados[ramo]).length) continue;
      const snap = await get(ref(db, caminho(ramo)));
      const remoto = snap.val() || {};
      const envio = {};
      for(const id in dados[ramo]){
        const l = dados[ramo][id], r = remoto[id];
        if(!r || (l.t || 0) > (r.t || 0)) envio[id] = l;
      }
      if(Object.keys(envio).length) await update(ref(db, caminho(ramo)), envio);
    }
  }catch(e){ console.error(e); }
  ouvir();
  return { ok:true };
}

export function desconectar(){
  parar();
  if(db && cfg.code && uid) set(ref(db, `trips/${cfg.code}/present/${uid}`), null).catch(()=>{});
  cfg = { code:"", name: cfg.name };
  LS.set("roma2026:cfg", cfg);
  presentes = [];
  online = false;
  avisar();
}

export const estaConectado = () => !!(db && cfg.code);
export const temFirebase   = () => !!db;
export { configurado };
