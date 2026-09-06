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

export const dados = { items:{}, extra:{}, roteiro:{}, estadias:{}, docs:{}, orcamento:{}, conf:{} };
export let docsLocais = {};
export let cfg = LS.get("roma2026:cfg") || { code:"", name:"" };
export let online = false;
export let presentes = [];
export let motivoOffline = "";

let FB = null, db = null, uid = null, unsubs = [], ouvintes = [], cacheCarregado = false;

/* ═══════ fila de pendências ═══════
   Escrita otimista sem fila mente: o app diz "salvo" e o registro pode nunca
   ter saído daqui. Toda gravação que não chega ao Firebase entra nesta fila,
   sobrevive ao fechamento do app (IndexedDB) e é reenviada quando a rede volta.
   `valor === null` é uma exclusão pendente — precisa ser reenviada também. */
let outbox = {};
const chaveOut = (ramo, id) => ramo + "/" + id;
const salvarOutbox = () => idbSet("outbox", outbox);

function enfileirar(ramo, id, valor, sub){
  /* Sem código do casal não existe destino: o app está em modo só-neste-
     aparelho por escolha, e nada está "esperando para subir". Ao conectar,
     `conectar()` sobe o que for mais recente de qualquer maneira. */
  if(!cfg.code) return;
  outbox[chaveOut(ramo, sub ? id + "/" + sub : id)] = { ramo, id, valor, sub };
  salvarOutbox();
}
function desenfileirar(ramo, id, sub){
  const k = chaveOut(ramo, sub ? id + "/" + sub : id);
  if(!(k in outbox)) return false;
  delete outbox[k]; salvarOutbox(); return true;
}
/* O snapshot do Firebase substitui o ramo inteiro. Sem reaplicar o que ainda
   não subiu, a chegada de um snapshot apagaria a edição feita offline. */
function reaplicarPendentes(ramo){
  for(const k in outbox){
    const it = outbox[k];
    if(it.ramo !== ramo) continue;
    if(it.sub){
      /* pendência de campo: o registro pode ter chegado do outro celular */
      if(dados[ramo][it.id]) escreverEm(dados[ramo][it.id], it.sub, it.valor);
      continue;
    }
    if(it.valor === null) delete dados[ramo][it.id];
    else dados[ramo][it.id] = it.valor;
  }
}

/* escreve "a/b/c" dentro de um objeto, criando os níveis que faltarem */
function escreverEm(alvo, sub, valor){
  const partes = sub.split("/");
  let no = alvo;
  for(let k = 0; k < partes.length - 1; k++){
    if(typeof no[partes[k]] !== "object" || no[partes[k]] === null) no[partes[k]] = {};
    no = no[partes[k]];
  }
  const ultima = partes[partes.length - 1];
  if(valor === null) delete no[ultima]; else no[ultima] = valor;
}

export const pendente = (ramo, id) => {
  const base = chaveOut(ramo, id);
  return base in outbox || Object.keys(outbox).some(k => k.startsWith(base + "/"));
};
export const totalPendentes = () => Object.keys(outbox).length;

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
  outbox = await idbGet("outbox") || {};
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

const RAMOS = ["items","extra","roteiro","estadias","docs","orcamento","conf"];
const caminho = (ramo, id) => `trips/${cfg.code}/${ramo}${id ? "/"+id : ""}`;

export function ouvir(){
  parar();
  if(!db || !cfg.code || !FB) return;
  RAMOS.forEach(ramo => {
    const u = FB.onValue(FB.ref(db, caminho(ramo)), snap => {
      dados[ramo] = snap.val() || {};
      reaplicarPendentes(ramo);
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

  if(!db || !cfg.code || !FB){
    enfileirar(ramo, id, valor);
    avisar();
    return { ok:false, local:true };
  }
  avisar();
  try{
    if(valor === null) await FB.remove(FB.ref(db, caminho(ramo, id)));
    else await FB.set(FB.ref(db, caminho(ramo, id)), valor);
    if(desenfileirar(ramo, id)) avisar();
    return { ok:true };
  }catch(e){
    console.error(e);
    enfileirar(ramo, id, valor);
    avisar();
    return { ok:false, erro:e };
  }
}

export async function gravarLote(ramo, obj){
  Object.assign(dados[ramo], obj);
  salvarCache();

  const enfileirarTudo = () => { for(const id in obj) enfileirar(ramo, id, obj[id]); };
  if(!db || !cfg.code || !FB){
    enfileirarTudo(); avisar();
    return { ok:false, local:true };
  }
  avisar();
  try{
    await FB.update(FB.ref(db, caminho(ramo)), obj);
    let mudou = false;
    for(const id in obj) if(desenfileirar(ramo, id)) mudou = true;
    if(mudou) avisar();
    return { ok:true };
  }catch(e){
    console.error(e); enfileirarTudo(); avisar();
    return { ok:false, erro:e };
  }
}

/* Grava um campo isolado do registro (ex.: um pagamento dentro de um item).
   Escrever o registro inteiro faz o último a salvar apagar o que o outro
   acabou de somar; escrever só o campo deixa os dois lados conviverem. */
export async function gravarSub(ramo, id, sub, valor){
  if(!dados[ramo][id]) return { ok:false, motivo:"sem registro" };
  escreverEm(dados[ramo][id], sub, valor);
  salvarCache();

  if(!db || !cfg.code || !FB){
    enfileirar(ramo, id, valor, sub); avisar();
    return { ok:false, local:true };
  }
  avisar();
  const cam = caminho(ramo, id) + "/" + sub;
  try{
    if(valor === null) await FB.remove(FB.ref(db, cam));
    else await FB.set(FB.ref(db, cam), valor);
    if(desenfileirar(ramo, id, sub)) avisar();
    return { ok:true };
  }catch(e){
    console.error(e); enfileirar(ramo, id, valor, sub); avisar();
    return { ok:false, erro:e };
  }
}

/* ═══════ reenvio ═══════ */
export async function enviarPendentes(){
  if(!db || !cfg.code || !FB) return { ok:false, restam: totalPendentes() };
  let enviados = 0;
  for(const it of Object.values(outbox)){
    const cam = caminho(it.ramo, it.id) + (it.sub ? "/" + it.sub : "");
    try{
      if(it.valor === null) await FB.remove(FB.ref(db, cam));
      else await FB.set(FB.ref(db, cam), it.valor);
      desenfileirar(it.ramo, it.id, it.sub);
      enviados++;
    }catch(e){ console.error(e); }
  }
  if(enviados) avisar();
  return { ok:true, enviados, restam: totalPendentes() };
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
  await enviarPendentes();
  ouvir();
  return { ok:true };
}

export function desconectar(){
  parar();
  outbox = {}; salvarOutbox();
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
  /* Primeiro esvazia a fila, depois escuta: se os ouvintes voltassem antes,
     o snapshot remoto chegaria por cima do que ainda não foi enviado. */
  await enviarPendentes();
  if(cfg.code && !unsubs.length) ouvir();
}

export const estaConectado = () => !!(db && cfg.code);
export { configurado };
