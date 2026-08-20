import { VIAGEM, NUMEROS } from "./data.js";
import * as store from "./store.js";
import { $, esc, toast, modal, campo, confirmar, dataBR } from "./util.js";
import * as vChecklist from "./view-checklist.js";
import * as vRoteiro   from "./view-roteiro.js";
import * as vEstadias  from "./view-estadias.js";
import * as vDocs      from "./view-docs.js";
import * as vOrcamento from "./view-orcamento.js";

const ABAS = {
  checklist: { titulo:"Checklist", view:vChecklist },
  roteiro:   { titulo:"Roteiro",   view:vRoteiro   },
  estadias:  { titulo:"Estadias",  view:vEstadias  },
  docs:      { titulo:"Documentos",view:vDocs      },
  orcamento: { titulo:"Orçamento", view:vOrcamento }
};
let abaAtual = store.LS.get("roma2026:aba") || "checklist";

/* ═══════ tema claro / escuro ═══════ */
const CORES = { claro:"#B23A1C", escuro:"#1C0F09" };

function aplicarTema(t){
  document.documentElement.dataset.tema = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", CORES[t] || CORES.claro);
  const b = $("#tema");
  if(b) b.setAttribute("aria-label", t === "escuro" ? "Mudar para o modo claro" : "Mudar para o modo escuro");
}

function iniciarTema(){
  const salvo = store.LS.get("bupe:tema");
  const doSistema = window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  aplicarTema(salvo || doSistema);

  /* sem escolha manual, acompanha o sistema */
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ev => {
    if(!store.LS.get("bupe:tema")) aplicarTema(ev.matches ? "escuro" : "claro");
  });

  $("#tema").onclick = () => {
    const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
    store.LS.set("bupe:tema", novo);
    aplicarTema(novo);
  };
}

/* ═══════ cabeçalho ═══════ */
function contagem(){
  const [Y,M,D] = VIAGEM.embarque.split("-").map(Number);
  const voo = new Date(Y, M-1, D);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const d = Math.round((voo - hoje) / 864e5);
  const n = $("#dias"), l = $("#dias-lbl");
  if(d > 1){ n.textContent = d; l.textContent = "dias para o embarque"; }
  else if(d === 1){ n.textContent = "1"; l.textContent = "dia para o embarque"; }
  else if(d === 0){ n.textContent = "Hoje"; l.textContent = "é o dia. Buon viaggio."; }
  else if(d > -14){ n.textContent = "Ciao"; l.textContent = "vocês estão na Itália"; }
  else { n.textContent = "✓"; l.textContent = "viagem concluída"; }
}

function cabecalho(){
  $("#destino").innerHTML = `${esc(VIAGEM.destino)}<br><em>${esc(VIAGEM.ano)}</em>`;
  $("#route").textContent = `${VIAGEM.rota}  ·  ${VIAGEM.periodo}  ·  ${VIAGEM.noites}`;
  $("#facts-list").innerHTML = NUMEROS
    .map(([k,v]) => `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  contagem();
}

function barraProgresso(){
  const { feitos, total } = vChecklist.progresso();
  const pct = total ? Math.round(feitos/total*100) : 0;
  $("#fill").style.width = pct + "%";
  $("#prog").textContent = `${feitos} de ${total} itens`;
  $("#pct").textContent = pct + "%";
  if(total && feitos === total) $("#dias-lbl").textContent = "tudo resolvido. Buon viaggio.";
}

/* ═══════ status de sincronia ═══════ */
function status(){
  const dot = $("#dot"), msg = $("#sync-msg");
  const semRede = !navigator.onLine;
  if(!store.configurado){
    dot.className = "dot err";
    msg.textContent = "Firebase não configurado — só neste aparelho";
  } else if(semRede){
    dot.className = "dot wait";
    msg.textContent = "Sem conexão — funcionando offline";
  } else if(!store.cfg.code){
    dot.className = "dot";
    msg.textContent = "Só neste aparelho";
  } else if(store.online){
    dot.className = "dot on";
    msg.innerHTML = `Sincronizado · código <b>${esc(store.cfg.code)}</b>`;
  } else if(store.motivoOffline === "regras"){
    dot.className = "dot err";
    msg.textContent = "Sem permissão no banco — republique as regras";
  } else if(store.motivoOffline === "conexao"){
    dot.className = "dot err";
    msg.textContent = "Não deu para conectar. Confira domínio autorizado e login anônimo.";
  } else {
    dot.className = "dot wait";
    msg.textContent = "Conectando…";
  }
  $("#toggle-setup").textContent = store.cfg.code ? "Ajustar" : "Conectar";
  $("#who").textContent = store.presentes.length
    ? `${store.presentes.join(" e ")} ${store.presentes.length>1?"estão":"está"} com o app aberto agora`
    : "";
}

/* ═══════ abas ═══════ */
function trocarAba(id){
  abaAtual = id;
  store.LS.set("roma2026:aba", id);
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("ativa", b.dataset.aba === id));
  document.querySelectorAll(".tab").forEach(b =>
    b.setAttribute("aria-selected", b.dataset.aba === id ? "true" : "false"));
  desenhar();
  window.scrollTo({ top:0, behavior:"instant" });
}

function desenhar(){
  const el = $("#view");
  ABAS[abaAtual].view.render(el);
  barraProgresso();
  status();
  /* contadores das abas */
  const nDias = Object.keys(store.dados.roteiro).length;
  const nEst  = Object.keys(store.dados.estadias).length;
  const nDoc  = Object.keys(store.dados.docs).length + Object.keys(store.docsLocais).length;
  const nOrc  = Object.keys(store.dados.orcamento || {}).length;
  const badge = (aba, n) => {
    const b = document.querySelector(`.tab[data-aba="${aba}"] .badge`);
    if(b){ b.textContent = n || ""; b.style.display = n ? "" : "none"; }
  };
  badge("roteiro", nDias); badge("estadias", nEst); badge("docs", nDoc); badge("orcamento", nOrc);
}

/* ═══════ conexão ═══════ */
function abrirSetup(){
  const box = $("#setup");
  box.classList.toggle("open");
  if(!$("#code").value && !store.cfg.code){
    $("#code").value = "roma-" + Math.random().toString(36).slice(2, 10);
  }
}

async function conectar(){
  const code = $("#code").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const name = $("#name").value.trim().slice(0, 14);
  if(code.length < 6){ toast("Use um código com pelo menos 6 caracteres."); return; }
  $("#dot").className = "dot wait";
  $("#sync-msg").textContent = "Conectando…";
  const r = await store.conectar(code, name);
  if(!r.ok){
    $("#dot").className = "dot err";
    $("#sync-msg").textContent = r.motivo === "config"
      ? "Firebase não configurado"
      : "Não deu para conectar. Confira domínio autorizado e login anônimo.";
    return;
  }
  $("#setup").classList.remove("open");
  toast("Conectado");
}

/* ═══════ backup ═══════ */
function backup(){
  const pacote = {
    gerado: new Date().toISOString(),
    viagem: VIAGEM,
    sincronizado: store.dados,
    somenteNesteAparelho: store.docsLocais
  };
  const blob = new Blob([JSON.stringify(pacote, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `roma-2026-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Backup baixado");
}

/* ═══════ início ═══════ */
(async function init(){
  /* o service worker precisa registrar antes de qualquer espera de rede */
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(e => console.warn("SW:", e));
  }
  iniciarTema();
  cabecalho();

  document.querySelectorAll(".tab").forEach(b => {
    b.onclick = () => trocarAba(b.dataset.aba);
  });
  $("#toggle-setup").onclick = abrirSetup;
  $("#connect").onclick = conectar;
  $("#disconnect").onclick = () => {
    store.desconectar();
    $("#setup").classList.remove("open");
    toast("Desconectado");
  };
  $("#backup").onclick = backup;
  $("#reset").onclick = async () => {
    if(!await confirmar("Isso desmarca todos os itens do checklist. Roteiro, estadias e documentos não são afetados.")) return;
    const t = Date.now(), zerado = {};
    for(const id in store.dados.items) zerado[id] = { v:false, t, w: store.cfg.name || "" };
    await store.gravarLote("items", zerado);
    toast("Checklist zerado");
  };

  store.aoMudar(desenhar);

  if(store.cfg.name) $("#name").value = store.cfg.name;
  if(store.cfg.code) $("#code").value = store.cfg.code;

  /* 1º: pinta a tela com o que já está no aparelho */
  await store.carregarLocal();
  trocarAba(abaAtual);

  /* 2º: tenta o Firebase — se falhar, o app continua funcionando */
  const r = await store.iniciar();
  if(!r.ok && r.motivo === "config") $("#aviso").hidden = false;
  desenhar();

  window.addEventListener("online",  async () => { status(); await store.religar(); status(); });
  window.addEventListener("offline", status);

  /* instalar na tela inicial */
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferred = e; $("#install").classList.add("show");
  });
  $("#install").onclick = async () => {
    if(!deferred) return;
    deferred.prompt(); await deferred.userChoice;
    deferred = null; $("#install").classList.remove("show");
  };
})();
