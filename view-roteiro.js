import { dados, gravar, pendente, cfg, LS } from "./store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast, dataBR, diaSemana, autoria } from "./util.js";
import { abrirImportador } from "./importador.js";

/* roteiro/{id} = { dia, cidade, titulo, nota, t, paradas:{pid:{h,n,d,c}} }
   c = cidade da parada. Um mesmo dia pode passar por várias cidades. */

const ordenados = () => Object.entries(dados.roteiro)
  .map(([id, d]) => ({ id, ...d }))
  .sort((a,b) => (a.dia||"").localeCompare(b.dia||""));

const paradasDe = d => Object.entries(d.paradas || {})
  .map(([id, p]) => ({ id, ...p }))
  .sort((a,b) => (a.h||"99:99").localeCompare(b.h||"99:99"));

/* cidade efetiva de uma parada: a dela, ou a do dia */
const cidadeDa = (p, d) => ((p.c || "").trim() || (d.cidade || "").trim());

/* cidades do dia, na ordem em que aparecem no relógio */
function cidadesDoDia(d){
  const out = [];
  const add = c => { c = (c||"").trim(); if(c && !out.includes(c)) out.push(c); };
  paradasDe(d).forEach(p => add(p.c));
  if(!out.length) add(d.cidade);
  else if((d.cidade||"").trim() && !out.includes(d.cidade.trim())) out.unshift(d.cidade.trim());
  return out;
}

const todasCidades = () => {
  const s = new Set();
  Object.values(dados.roteiro).forEach(d => cidadesDoDia(d).forEach(c => s.add(c)));
  return [...s].sort((a,b) => a.localeCompare(b));
};

/* ── onde a viagem está hoje ──
   O app já contava os dias no cabeçalho e nunca comparava nada com a data
   real aqui dentro. Durante a viagem esta é a pergunta da aba: em que ponto
   disto tudo eu estou? */
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const ehHoje    = d => !!d.dia && d.dia === hojeISO();
const ehPassado = d => !!d.dia && d.dia <  hojeISO();
const temHoje   = () => ordenados().some(ehHoje);

/* primeiro dia ainda por vir — vira "a seguir" quando hoje não é dia de roteiro */
function proximoDia(){
  if(temHoje()) return null;
  const h = hojeISO();
  return ordenados().find(d => (d.dia || "") > h) || null;
}

/* ── estado da tela (só neste aparelho) ── */
let filtro  = LS.get("bupe:filtroCidade") || null;
let abertos = LS.get("bupe:diasAbertos")  || {};

/* O dia de hoje nasce aberto. Uma escolha manual sempre vence — por isso o
   fechado é gravado como false, e não apagado da lista. */
const estaAberto = d => (d.id in abertos) ? !!abertos[d.id] : ehHoje(d);
function alternarDia(d, el){
  abertos[d.id] = !estaAberto(d);
  LS.set("bupe:diasAbertos", abertos);
  render(el);
}

/* ═══════ formulários ═══════ */
const listaCidades = () =>
  `<datalist id="cidades">${todasCidades().map(c=>`<option value="${esc(c)}">`).join("")}</datalist>`;

function formDia(d){
  return `
    ${campo("d-dia", "Data", "date", d?.dia || "")}
    ${campo("d-cidade", "Cidade principal", "text", d?.cidade || "", 'maxlength="40" placeholder="Florença" list="cidades"')}
    ${listaCidades()}
    <p class="conf">Se o dia passar por mais de uma cidade, deixe a principal aqui e informe a cidade de cada parada individualmente.</p>
    ${campo("d-titulo", "Título do dia (opcional)", "text", d?.titulo || "", 'maxlength="60" placeholder="Bate-volta a Veneza"')}
    ${campo("d-nota", "Observações do dia (opcional)", "textarea", d?.nota || "", 'maxlength="600"')}`;
}

function novoDia(el){
  modal({
    titulo: "Novo dia de roteiro", corpo: formDia(null), salvar: "Adicionar",
    onSalvar: async back => {
      const dia = back.querySelector("#d-dia").value;
      if(!dia){ toast("Escolha a data do dia."); return false; }
      const id = "r" + uid();
      abertos[id] = true;
      LS.set("bupe:diasAbertos", abertos);
      await gravar("roteiro", id, {
        dia,
        cidade: back.querySelector("#d-cidade").value.trim(),
        titulo: back.querySelector("#d-titulo").value.trim(),
        nota:   back.querySelector("#d-nota").value.trim(),
        t: agora(), w: cfg.name || "", paradas: {}
      });
      toast("Dia criado");
    }
  });
}

function editarDia(d){
  modal({
    titulo: "Editar dia", corpo: formDia(d),
    onSalvar: async back => {
      const dia = back.querySelector("#d-dia").value;
      if(!dia){ toast("A data é obrigatória."); return false; }
      await gravar("roteiro", d.id, {
        ...dados.roteiro[d.id], dia,
        cidade: back.querySelector("#d-cidade").value.trim(),
        titulo: back.querySelector("#d-titulo").value.trim(),
        nota:   back.querySelector("#d-nota").value.trim(),
        t: agora()
      });
    },
    extra: { label:"Excluir dia", onClick: async () => {
      if(!await confirmar("Excluir este dia e todas as paradas dele?")) return;
      const antes = dados.roteiro[d.id];
      await gravar("roteiro", d.id, null);
      toast("Dia excluído", { label:"Desfazer",
        onClick: () => gravar("roteiro", d.id, antes) });
    }}
  });
}

function formParada(p, dia){
  return `
    ${campo("p-h", "Horário", "time", p?.h || "")}
    ${campo("p-n", "O quê", "text", p?.n || "", 'maxlength="80" placeholder="Basílica de San Marco"')}
    ${campo("p-c", "Cidade desta parada", "text", p?.c ?? "", `maxlength="40" list="cidades" placeholder="${esc(dia?.cidade || "Veneza")}"`)}
    ${listaCidades()}
    ${campo("p-d", "Detalhe (opcional)", "textarea", p?.d || "", 'maxlength="400" placeholder="Ingresso com hora marcada, entrada pela lateral"')}`;
}

function novaParada(diaId){
  const d = dados.roteiro[diaId];
  modal({
    titulo: "Nova parada", corpo: formParada(null, d), salvar: "Adicionar",
    onSalvar: async back => {
      const n = back.querySelector("#p-n").value.trim();
      if(!n){ toast("Escreva o que é a parada."); return false; }
      const atual = dados.roteiro[diaId];
      const paradas = { ...(atual.paradas || {}) };
      paradas["p" + uid()] = {
        h: back.querySelector("#p-h").value,
        n, c: back.querySelector("#p-c").value.trim(),
        d: back.querySelector("#p-d").value.trim()
      };
      await gravar("roteiro", diaId, { ...atual, paradas, t: agora() });
    }
  });
}

function editarParada(diaId, p){
  const d = dados.roteiro[diaId];
  modal({
    titulo: "Editar parada", corpo: formParada(p, d),
    onSalvar: async back => {
      const n = back.querySelector("#p-n").value.trim();
      if(!n){ toast("A parada precisa de um nome."); return false; }
      const atual = dados.roteiro[diaId];
      const paradas = { ...(atual.paradas || {}) };
      paradas[p.id] = {
        h: back.querySelector("#p-h").value, n,
        c: back.querySelector("#p-c").value.trim(),
        d: back.querySelector("#p-d").value.trim()
      };
      await gravar("roteiro", diaId, { ...atual, paradas, t: agora() });
    },
    extra: { label:"Excluir", onClick: async () => {
      const atual = dados.roteiro[diaId];
      const paradas = { ...(atual.paradas || {}) };
      delete paradas[p.id];
      await gravar("roteiro", diaId, { ...atual, paradas, t: agora() });
      toast("Parada excluída");
    }}
  });
}

/* ═══════ filtro por cidade ═══════ */
function contagemCidades(){
  const cont = {};
  Object.values(dados.roteiro).forEach(d => {
    cidadesDoDia(d).forEach(c => { cont[c] = (cont[c] || 0) + 1; });
  });
  return Object.entries(cont).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const diaTemCidade = (d, c) => cidadesDoDia(d).includes(c);

function barraTopo(el, total){
  const cs = contagemCidades();
  if(!total) return;
  if(filtro && !cs.some(([c]) => c === filtro)){ filtro = null; LS.set("bupe:filtroCidade", null); }

  const nav = document.createElement("div");
  nav.className = "filtros";
  const chip = (rot, n, ativo, valor) => {
    const b = document.createElement("button");
    b.className = "chip" + (ativo ? " ativo" : "");
    b.innerHTML = `${esc(rot)}${n != null ? `<span class="n">${n}</span>` : ""}`;
    b.onclick = () => { filtro = valor; LS.set("bupe:filtroCidade", valor); render(el); };
    return b;
  };
  if(cs.length){
    nav.appendChild(chip("Todas", total, filtro === null, null));
    cs.forEach(([c, n]) => nav.appendChild(chip(c, n, filtro === c, c)));
  }

  const visiveis = ordenados().filter(d => !filtro || diaTemCidade(d, filtro));
  const algumAberto = visiveis.some(estaAberto);
  const tudo = document.createElement("button");
  tudo.className = "chip acao-chip";
  tudo.textContent = algumAberto ? "Recolher tudo" : "Abrir tudo";
  tudo.onclick = () => {
    visiveis.forEach(d => { abertos[d.id] = !algumAberto; });
    LS.set("bupe:diasAbertos", abertos);
    render(el);
  };
  nav.appendChild(tudo);

  /* volta para hoje depois de rolar o roteiro inteiro */
  if(temHoje()){
    const hoje = document.createElement("button");
    hoje.className = "chip acao-chip hoje-chip";
    hoje.textContent = "Hoje";
    hoje.onclick = () => {
      if(filtro){ filtro = null; LS.set("bupe:filtroCidade", null); render(el); }
      irParaHoje(true);
    };
    nav.appendChild(hoje);
  }
  el.appendChild(nav);
}

/* ═══════ lista de paradas, agrupada por cidade quando houver mais de uma ═══════ */
function htmlParadas(d, paradas, varias){
  if(!paradas.length) return `<p class="sem">Nenhuma parada ainda.</p>`;
  let html = "", cidadeAnterior = null;
  paradas.forEach(p => {
    const c = cidadeDa(p, d);
    if(varias && c && c !== cidadeAnterior){
      html += `<p class="parada-cidade">${esc(c)}</p>`;
      cidadeAnterior = c;
    }
    html += `
      <div class="parada" data-p="${p.id}">
        <span class="hora">${esc(p.h || "—")}</span>
        <span class="parada-txt"><b>${esc(p.n)}</b>${p.d ? `<small>${nl(p.d)}</small>` : ""}</span>
      </div>`;
  });
  return html;
}

/* ═══════ ancorar em hoje ═══════ */
/* A barra fixa cobre o topo da tela; rolar até a borda do cartão o esconderia
   embaixo dela. 150px é a barra recolhida com folga. */
const ALTURA_BARRA = 150;

export function irParaHoje(sempre){
  const card = document.getElementById("dia-hoje");
  if(!card) return false;
  const r = card.getBoundingClientRect();
  /* já dá para ver? então não mexe na tela do usuário */
  const visivel = r.top >= ALTURA_BARRA && r.top < window.innerHeight * 0.6;
  if(visivel && !sempre) return true;

  const alvo = Math.max(0, r.top + window.scrollY - ALTURA_BARRA);
  const partiuDe = window.scrollY;
  window.scrollTo({ top: alvo, behavior: "smooth" });
  /* Rolagem suave é animada pelo compositor e não anda com a página oculta —
     um PWA restaurado do segundo plano abriria no topo. Se em 350ms não saiu
     do lugar, vai de uma vez. */
  setTimeout(() => {
    if(Math.abs(window.scrollY - partiuDe) < 4 && Math.abs(alvo - partiuDe) >= 4){
      window.scrollTo({ top: alvo, behavior: "instant" });
    }
  }, 350);
  return true;
}

/* chamado pelo app quando esta aba entra em cena.
   setTimeout e não requestAnimationFrame: rAF não dispara com a aba oculta. */
export function aoEntrar(){
  setTimeout(() => irParaHoje(false), 0);
}

/* ═══════ render ═══════ */
export function render(el){
  const todos = ordenados();
  const dias  = filtro ? todos.filter(d => diaTemCidade(d, filtro)) : todos;
  el.innerHTML = "";

  barraTopo(el, todos.length);

  if(!todos.length){
    el.insertAdjacentHTML("beforeend", `<div class="vazio">
      <p>O roteiro ainda está em branco.</p>
      <small>Crie um dia e vá acrescentando paradas. Cada parada pode ter a própria cidade, então bate-volta funciona.</small>
    </div>`);
  } else if(!dias.length){
    el.insertAdjacentHTML("beforeend", `<div class="vazio">
      <p>Nenhum dia em ${esc(filtro)}.</p>
      <small>Toque em “Todas” para ver o roteiro inteiro.</small>
    </div>`);
  }

  const prox = proximoDia();
  dias.forEach(d => {
    const todasParadas = paradasDe(d);
    const cidades = cidadesDoDia(d);
    const varias  = cidades.length > 1;

    /* com filtro ativo, o dia mostra só as paradas daquela cidade */
    const paradas = filtro
      ? todasParadas.filter(p => cidadeDa(p, d) === filtro)
      : todasParadas;

    const aberto = estaAberto(d);
    const hoje = ehHoje(d);
    const aSeguir = prox && prox.id === d.id;
    const card = document.createElement("section");
    card.className = "card dia" + (aberto ? " aberto" : "")
      + (hoje ? " hoje" : "") + (ehPassado(d) ? " passado" : "");
    if(hoje) card.id = "dia-hoje";

    const resumo = paradas.length
      ? `${paradas.length} parada${paradas.length>1?"s":""}${paradas[0].h ? " · a partir das "+esc(paradas[0].h) : ""}`
      : "sem paradas ainda";

    card.innerHTML = `
      <div class="dia-head">
        <div class="dia-data">
          ${hoje ? `<em class="marca">hoje</em>` : aSeguir ? `<em class="marca prox">a seguir</em>` : ""}
          <b>${esc(dataBR(d.dia))}</b><span>${esc(diaSemana(d.dia))}</span>
        </div>
        <div class="dia-tit">
          <h2>${esc(d.titulo || cidades.join(" · ") || "Sem título")}</h2>
          <span class="when">${resumo}</span>
          ${autoria(d, cfg.name)}
          ${pendente("roteiro", d.id) ? `<span class="tag pend">não enviado</span>` : ""}
          ${cidades.length ? `<span class="rota">${cidades.map(c =>
            `<i class="cid${filtro === c ? " on" : ""}">${esc(c)}</i>`).join('<b>→</b>')}</span>` : ""}
        </div>
        <span class="chev"></span>
        <button class="mini" aria-label="Editar dia">✎</button>
      </div>
      <div class="dia-body">
        ${d.nota ? `<p class="dia-nota">${nl(d.nota)}</p>` : ""}
        ${filtro && todasParadas.length !== paradas.length
          ? `<p class="filtrado">Mostrando só as paradas em ${esc(filtro)} · ${todasParadas.length - paradas.length} oculta(s)</p>` : ""}
        <div class="paradas">${htmlParadas(d, paradas, varias && !filtro)}</div>
        <button class="add-inline">+ adicionar parada</button>
      </div>`;

    card.querySelector(".dia-head").onclick = e => {
      if(e.target.closest(".mini")) return;
      alternarDia(d, el);
    };
    card.querySelector(".dia-head .mini").onclick = e => { e.stopPropagation(); editarDia(d); };
    card.querySelector(".add-inline").onclick = () => novaParada(d.id);
    card.querySelectorAll(".parada").forEach(node => {
      const p = todasParadas.find(x => x.id === node.dataset.p);
      node.onclick = () => editarParada(d.id, p);
    });
    el.appendChild(card);
  });

  const add = document.createElement("button");
  add.className = "add-grande";
  add.textContent = "+ novo dia de roteiro";
  add.onclick = () => novoDia(el);
  el.appendChild(add);

  const imp = document.createElement("button");
  imp.className = "add-inline importar";
  imp.textContent = "⇪ importar de um arquivo (CSV ou texto)";
  imp.onclick = () => abrirImportador(() => render(el));
  el.appendChild(imp);
}
