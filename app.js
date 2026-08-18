import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, onDisconnect, get, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig, configurado } from "./firebase-config.js";
import { VIAGEM, TAPPE, NUMEROS } from "./data.js";

/* ═══════════ estado ═══════════ */
/* itens: { id: { v:bool, t:ms, w:"nome" } } */
let itens = {};
let cfg = { code:"", name:"" };
let db = null, uid = null, unsub = null, unsubPresence = null;
let flashT = null;

const el = id => document.getElementById(id);
const total = TAPPE.reduce((a,t)=>a+t.items.length,0);
const agora = () => Date.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ═══════════ armazenamento local (espelho offline) ═══════════ */
const LS = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

/* ═══════════ contagem regressiva ═══════════ */
function contagem(){
  const [Y,M,D] = VIAGEM.embarque.split("-").map(Number);
  const voo = new Date(Y, M-1, D);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const d = Math.round((voo - hoje) / 864e5);
  const n = el("dias"), l = el("dias-lbl");
  if(d > 1){ n.textContent = d; l.textContent = "dias para o embarque"; }
  else if(d === 1){ n.textContent = "1"; l.textContent = "dia para o embarque"; }
  else if(d === 0){ n.textContent = "Hoje"; l.textContent = "é o dia. Buon viaggio."; }
  else if(d > -14){ n.textContent = "Ciao"; l.textContent = "vocês estão na Itália"; }
  else { n.textContent = "✓"; l.textContent = "viagem concluída"; }
}

/* ═══════════ utilidades de interface ═══════════ */
function flash(msg){
  const s = el("saved"); s.textContent = msg;
  clearTimeout(flashT); flashT = setTimeout(()=>{ s.textContent = ""; }, 2600);
}
function status(kind, msg){
  el("dot").className = "dot" + (kind ? " " + kind : "");
  el("sync-msg").innerHTML = msg;
  el("toggle-setup").textContent = cfg.code ? "Ajustar" : "Conectar";
}

/* ═══════════ merge por carimbo de tempo ═══════════ */
function merge(a, b){
  const out = { ...a };
  for(const id in b){
    if(!out[id] || (b[id].t || 0) > (out[id].t || 0)) out[id] = b[id];
  }
  return out;
}
const marcados = () => Object.keys(itens).filter(id => itens[id] && itens[id].v);

/* ═══════════ Firebase ═══════════ */
async function iniciarFirebase(){
  if(!configurado){
    el("aviso").hidden = false;
    status("err", "Firebase não configurado — funcionando só neste aparelho");
    return false;
  }
  try{
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    const auth = getAuth(app);
    await signInAnonymously(auth);
    await new Promise(res => onAuthStateChanged(auth, u => { if(u){ uid = u.uid; res(); } }));
    return true;
  }catch(e){
    console.error(e);
    status("err", "Não deu para conectar ao Firebase. Verifique a configuração.");
    return false;
  }
}

function ouvirSala(){
  if(unsub){ unsub(); unsub = null; }
  if(unsubPresence){ unsubPresence(); unsubPresence = null; }
  if(!db || !cfg.code) return;

  const salaRef = ref(db, `trips/${cfg.code}/items`);
  unsub = onValue(salaRef, snap => {
    const remoto = snap.val() || {};
    const antes = JSON.stringify(itens);
    itens = merge(itens, remoto);
    LS.set("roma2026:itens", itens);
    if(JSON.stringify(itens) !== antes) render();
    status("on", `Sincronizado · código <b>${esc(cfg.code)}</b>`);
  }, err => {
    console.error(err);
    status("err", "Sem permissão para ler a sala. Confira as regras do banco.");
  });

  // presença: mostra quem está com o app aberto
  if(uid){
    const meuRef = ref(db, `trips/${cfg.code}/present/${uid}`);
    set(meuRef, { name: cfg.name || "alguém", at: serverTimestamp() }).catch(()=>{});
    onDisconnect(meuRef).remove();
    unsubPresence = onValue(ref(db, `trips/${cfg.code}/present`), s => {
      const p = s.val() || {};
      const outros = Object.keys(p).filter(k => k !== uid).map(k => p[k].name);
      el("who").textContent = outros.length
        ? `${outros.join(" e ")} ${outros.length > 1 ? "estão" : "está"} com o app aberto agora`
        : "";
    }, ()=>{});
  }
}

/* envia para o servidor tudo que só existe localmente */
async function reconciliar(){
  if(!db || !cfg.code) return;
  try{
    const snap = await get(ref(db, `trips/${cfg.code}/items`));
    const remoto = snap.val() || {};
    const envio = {};
    for(const id in itens){
      if(!remoto[id] || (itens[id].t || 0) > (remoto[id].t || 0)) envio[id] = itens[id];
    }
    if(Object.keys(envio).length) await update(ref(db, `trips/${cfg.code}/items`), envio);
  }catch(e){ console.error(e); }
}

async function gravar(id, valor){
  itens[id] = { v: valor, t: agora(), w: cfg.name || "" };
  LS.set("roma2026:itens", itens);
  render();
  if(db && cfg.code){
    try{
      await set(ref(db, `trips/${cfg.code}/items/${id}`), itens[id]);
      flash("Salvo e sincronizado");
    }catch(e){
      flash("Salvo aqui. Envia quando voltar a conexão.");
    }
  } else {
    flash("Salvo neste aparelho");
  }
}

/* ═══════════ render ═══════════ */
function render(){
  const lista = el("lista");
  lista.innerHTML = "";

  TAPPE.forEach((tap, i) => {
    const feitos = tap.items.filter(it => itens[it.id]?.v).length;
    const pronto = feitos === tap.items.length;

    const sec = document.createElement("section");
    sec.className = "tappa" + (pronto ? " done" : " open");

    const head = document.createElement("button");
    head.className = "head";
    head.setAttribute("aria-expanded", pronto ? "false" : "true");
    head.innerHTML =
      `<span class="num">${i+1}</span>` +
      `<span class="head-txt"><h2>${esc(tap.t)}</h2><span class="when">${esc(tap.w)}</span></span>` +
      `<span class="pill">${pronto ? "tudo pronto" : feitos + "/" + tap.items.length}</span>` +
      `<span class="chev"></span>`;
    head.addEventListener("click", () => {
      const aberto = sec.classList.toggle("open");
      head.setAttribute("aria-expanded", aberto ? "true" : "false");
    });
    sec.appendChild(head);

    const body = document.createElement("div");
    body.className = "body";

    tap.items.forEach(it => {
      const on = !!itens[it.id]?.v;
      const quem = on && itens[it.id].w ? itens[it.id].w : "";
      const row = document.createElement("div");
      row.className = "item" + (on ? " on" : "");
      row.tabIndex = 0;
      row.setAttribute("role", "checkbox");
      row.setAttribute("aria-checked", on ? "true" : "false");
      row.innerHTML =
        `<span class="box"></span><span class="txt"><p>${esc(it.p)}</p>` +
        (it.s ? `<small>${esc(it.s)}</small>` : "") +
        (quem ? `<span class="by">✓ ${esc(quem)}</span>` : "") +
        (it.tag ? `<span class="tag ${it.cls || ""}">${esc(it.tag)}</span>` : "") +
        `</span>`;
      const alternar = () => gravar(it.id, !on);
      row.addEventListener("click", alternar);
      row.addEventListener("keydown", e => {
        if(e.key === " " || e.key === "Enter"){ e.preventDefault(); alternar(); }
      });
      body.appendChild(row);
    });

    sec.appendChild(body);
    lista.appendChild(sec);
  });

  const feitos = marcados().length;
  const pct = Math.round(feitos / total * 100);
  el("fill").style.width = pct + "%";
  el("prog").textContent = `${feitos} de ${total} itens`;
  el("pct").textContent = pct + "%";
  if(feitos === total) el("dias-lbl").textContent = "tudo resolvido. Buon viaggio.";
}

function montarCabecalho(){
  el("destino").innerHTML = `${esc(VIAGEM.destino)}<br><em>${esc(VIAGEM.ano)}</em>`;
  el("route").textContent = `${VIAGEM.rota}  ·  ${VIAGEM.periodo}  ·  ${VIAGEM.noites}`;
  el("facts-list").innerHTML = NUMEROS
    .map(([k,v]) => `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
}

/* ═══════════ controles ═══════════ */
el("toggle-setup").addEventListener("click", () => {
  el("setup").classList.toggle("open");
  if(!el("code").value && !cfg.code){
    el("code").value = "roma-" + Math.random().toString(36).slice(2, 7);
  }
});

el("connect").addEventListener("click", async () => {
  const code = el("code").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const name = el("name").value.trim().slice(0, 14);
  if(code.length < 6){
    status("err", "Use um código com pelo menos 6 caracteres.");
    return;
  }
  cfg = { code, name };
  LS.set("roma2026:cfg", cfg);
  status("wait", "Conectando…");
  if(!db){ const ok = await iniciarFirebase(); if(!ok) return; }
  await reconciliar();
  ouvirSala();
  el("setup").classList.remove("open");
});

el("disconnect").addEventListener("click", () => {
  if(unsub){ unsub(); unsub = null; }
  if(unsubPresence){ unsubPresence(); unsubPresence = null; }
  if(db && cfg.code && uid) set(ref(db, `trips/${cfg.code}/present/${uid}`), null).catch(()=>{});
  cfg = { code:"", name: cfg.name };
  LS.set("roma2026:cfg", cfg);
  el("who").textContent = "";
  el("setup").classList.remove("open");
  status("", "Só neste aparelho");
});

el("reset").addEventListener("click", async () => {
  const t = agora();
  const zerado = {};
  for(const id in itens) zerado[id] = { v: false, t, w: cfg.name || "" };
  itens = zerado;
  LS.set("roma2026:itens", itens);
  render();
  if(db && cfg.code){
    try{ await update(ref(db, `trips/${cfg.code}/items`), zerado); }catch(e){}
  }
  flash("Checklist zerado");
});

/* instalar na tela inicial (Android / Chrome desktop) */
let deferred = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferred = e; el("install").classList.add("show");
});
el("install").addEventListener("click", async () => {
  if(!deferred) return;
  deferred.prompt(); await deferred.userChoice;
  deferred = null; el("install").classList.remove("show");
});

window.addEventListener("online",  () => { if(cfg.code){ reconciliar(); status("on", `Sincronizado · código <b>${esc(cfg.code)}</b>`); } });
window.addEventListener("offline", () => status("wait", "Sem conexão — as marcações ficam guardadas aqui"));

/* ═══════════ início ═══════════ */
(async function init(){
  montarCabecalho();
  contagem();
  cfg   = LS.get("roma2026:cfg")   || cfg;
  itens = LS.get("roma2026:itens") || {};
  if(cfg.name) el("name").value = cfg.name;
  if(cfg.code) el("code").value = cfg.code;
  render();
  status("", cfg.code ? "Conectando…" : "Só neste aparelho");

  const ok = await iniciarFirebase();
  if(ok && cfg.code){
    await reconciliar();
    ouvirSala();
  } else if(ok){
    status("", "Só neste aparelho — toque em Conectar para sincronizar");
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
})();
