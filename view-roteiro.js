import { dados, gravar, cfg, LS } from "./store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast, dataBR, diaSemana } from "./util.js";
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

/* ── estado da tela (só neste aparelho) ── */
let filtro  = LS.get("bupe:filtroCidade") || null;
let abertos = LS.get("bupe:diasAbertos")  || {};

const estaAberto = id => !!abertos[id];
function alternarDia(id, el){
  if(abertos[id]) delete abertos[id]; else abertos[id] = true;
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
      await gravar("roteiro", d.id, null); toast("Dia excluído");
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
  const algumAberto = visiveis.some(d => estaAberto(d.id));
  const tudo = document.createElement("button");
  tudo.className = "chip acao-chip";
  tudo.textContent = algumAberto ? "Recolher tudo" : "Abrir tudo";
  tudo.onclick = () => {
    visiveis.forEach(d => { if(algumAberto) delete abertos[d.id]; else abertos[d.id] = true; });
    LS.set("bupe:diasAbertos", abertos);
    render(el);
  };
  nav.appendChild(tudo);
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

  dias.forEach(d => {
    const todasParadas = paradasDe(d);
    const cidades = cidadesDoDia(d);
    const varias  = cidades.length > 1;

    /* com filtro ativo, o dia mostra só as paradas daquela cidade */
    const paradas = filtro
      ? todasParadas.filter(p => cidadeDa(p, d) === filtro)
      : todasParadas;

    const aberto = estaAberto(d.id);
    const card = document.createElement("section");
    card.className = "card dia" + (aberto ? " aberto" : "");

    const resumo = paradas.length
      ? `${paradas.length} parada${paradas.length>1?"s":""}${paradas[0].h ? " · a partir das "+esc(paradas[0].h) : ""}`
      : "sem paradas ainda";

    card.innerHTML = `
      <div class="dia-head">
        <div class="dia-data"><b>${esc(dataBR(d.dia))}</b><span>${esc(diaSemana(d.dia))}</span></div>
        <div class="dia-tit">
          <h2>${esc(d.titulo || cidades.join(" · ") || "Sem título")}</h2>
          <span class="when">${resumo}</span>
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
      alternarDia(d.id, el);
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
