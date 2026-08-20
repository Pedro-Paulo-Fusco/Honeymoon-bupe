import { dados, gravar, cfg } from "../store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast, dataBR, diaSemana } from "../util.js";

/* roteiro/{id} = { dia:"2026-10-02", cidade, titulo, nota, t, paradas:{pid:{h,n,d}} } */

const ordenados = () => Object.entries(dados.roteiro)
  .map(([id, d]) => ({ id, ...d }))
  .sort((a,b) => (a.dia||"").localeCompare(b.dia||""));

const paradasDe = d => Object.entries(d.paradas || {})
  .map(([id, p]) => ({ id, ...p }))
  .sort((a,b) => (a.h||"99:99").localeCompare(b.h||"99:99"));

function formDia(d){
  return `
    ${campo("d-dia", "Data", "date", d?.dia || "")}
    ${campo("d-cidade", "Cidade", "text", d?.cidade || "", 'maxlength="40" placeholder="Roma" list="cidades"')}
    <datalist id="cidades">${[...new Set(Object.values(dados.roteiro).map(x=>x.cidade).filter(Boolean))]
      .map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
    ${campo("d-titulo", "Título do dia (opcional)", "text", d?.titulo || "", 'maxlength="60" placeholder="Roma antiga"')}
    ${campo("d-nota", "Observações do dia (opcional)", "textarea", d?.nota || "", 'maxlength="600"')}`;
}

function novoDia(){
  modal({
    titulo: "Novo dia de roteiro", corpo: formDia(null), salvar: "Adicionar",
    onSalvar: async back => {
      const dia = back.querySelector("#d-dia").value;
      if(!dia){ toast("Escolha a data do dia."); return false; }
      await gravar("roteiro", "r" + uid(), {
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

function formParada(p){
  return `
    ${campo("p-h", "Horário", "time", p?.h || "")}
    ${campo("p-n", "O quê", "text", p?.n || "", 'maxlength="80" placeholder="Coliseu"')}
    ${campo("p-d", "Detalhe (opcional)", "textarea", p?.d || "", 'maxlength="400" placeholder="Ingresso já comprado, entrada pelo Arco de Constantino"')}`;
}

function novaParada(diaId){
  modal({
    titulo: "Nova parada", corpo: formParada(null), salvar: "Adicionar",
    onSalvar: async back => {
      const n = back.querySelector("#p-n").value.trim();
      if(!n){ toast("Escreva o que é a parada."); return false; }
      const d = dados.roteiro[diaId];
      const paradas = { ...(d.paradas || {}) };
      paradas["p" + uid()] = {
        h: back.querySelector("#p-h").value,
        n, d: back.querySelector("#p-d").value.trim()
      };
      await gravar("roteiro", diaId, { ...d, paradas, t: agora() });
    }
  });
}

function editarParada(diaId, p){
  modal({
    titulo: "Editar parada", corpo: formParada(p),
    onSalvar: async back => {
      const n = back.querySelector("#p-n").value.trim();
      if(!n){ toast("A parada precisa de um nome."); return false; }
      const d = dados.roteiro[diaId];
      const paradas = { ...(d.paradas || {}) };
      paradas[p.id] = { h: back.querySelector("#p-h").value, n, d: back.querySelector("#p-d").value.trim() };
      await gravar("roteiro", diaId, { ...d, paradas, t: agora() });
    },
    extra: { label:"Excluir", onClick: async () => {
      const d = dados.roteiro[diaId];
      const paradas = { ...(d.paradas || {}) };
      delete paradas[p.id];
      await gravar("roteiro", diaId, { ...d, paradas, t: agora() });
      toast("Parada excluída");
    }}
  });
}

/* ── filtro por cidade ── */
let filtro = null;   // null = todas

function cidades(){
  const cont = {};
  Object.values(dados.roteiro).forEach(d => {
    const c = (d.cidade || "").trim();
    if(c) cont[c] = (cont[c] || 0) + 1;
  });
  return Object.entries(cont).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function barraFiltros(el, total){
  const cs = cidades();
  if(cs.length < 2) return;              // filtro só faz sentido com 2+ cidades
  if(filtro && !cs.some(([c]) => c === filtro)) filtro = null;

  const nav = document.createElement("div");
  nav.className = "filtros";
  const bt = (rot, n, ativo, valor) => {
    const b = document.createElement("button");
    b.className = "chip" + (ativo ? " ativo" : "");
    b.innerHTML = `${esc(rot)}<span class="n">${n}</span>`;
    b.onclick = () => { filtro = valor; render(el); };
    return b;
  };
  nav.appendChild(bt("Todas", total, filtro === null, null));
  cs.forEach(([c, n]) => nav.appendChild(bt(c, n, filtro === c, c)));
  el.appendChild(nav);
}

export function render(el){
  const todos = ordenados();
  const dias = filtro ? todos.filter(d => (d.cidade || "").trim() === filtro) : todos;
  el.innerHTML = "";

  barraFiltros(el, todos.length);

  if(!todos.length){
    el.insertAdjacentHTML("beforeend", `<div class="vazio">
      <p>O roteiro ainda está em branco.</p>
      <small>Crie um dia, escolha a cidade e vá acrescentando as paradas. Elas se organizam sozinhas pelo horário.</small>
    </div>`);
  } else if(!dias.length){
    el.insertAdjacentHTML("beforeend", `<div class="vazio">
      <p>Nenhum dia em ${esc(filtro)}.</p>
      <small>Toque em “Todas” para ver o roteiro inteiro.</small>
    </div>`);
  }

  let cidadeAtual = null;
  dias.forEach(d => {
    if(d.cidade && d.cidade !== cidadeAtual){
      cidadeAtual = d.cidade;
      const h = document.createElement("p");
      h.className = "cidade-sep";
      h.textContent = d.cidade;
      el.appendChild(h);
    }

    const paradas = paradasDe(d);
    const card = document.createElement("section");
    card.className = "card dia";
    card.innerHTML = `
      <div class="dia-head">
        <div class="dia-data"><b>${esc(dataBR(d.dia))}</b><span>${esc(diaSemana(d.dia))}</span></div>
        <div class="dia-tit">
          <h2>${esc(d.titulo || d.cidade || "Sem título")}</h2>
          ${d.nota ? `<p class="dia-nota">${nl(d.nota)}</p>` : ""}
        </div>
        <button class="mini" aria-label="Editar dia">✎</button>
      </div>
      <div class="paradas">
        ${paradas.length ? paradas.map(p => `
          <div class="parada" data-p="${p.id}">
            <span class="hora">${esc(p.h || "—")}</span>
            <span class="parada-txt"><b>${esc(p.n)}</b>${p.d ? `<small>${nl(p.d)}</small>` : ""}</span>
          </div>`).join("")
        : `<p class="sem">Nenhuma parada ainda.</p>`}
      </div>
      <button class="add-inline">+ adicionar parada</button>`;

    card.querySelector(".dia-head .mini").onclick = () => editarDia(d);
    card.querySelector(".add-inline").onclick = () => novaParada(d.id);
    card.querySelectorAll(".parada").forEach(node => {
      const p = paradas.find(x => x.id === node.dataset.p);
      node.onclick = () => editarParada(d.id, p);
    });
    el.appendChild(card);
  });

  const add = document.createElement("button");
  add.className = "add-grande";
  add.textContent = "+ novo dia de roteiro";
  add.onclick = novoDia;
  el.appendChild(add);
}
