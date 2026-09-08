import { LUGARES } from "./data.js";
import { dados, gravar, gravarLote, pendente, cfg, LS } from "./store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast, autoria, dataBR } from "./util.js";
import { separador, linhaCSV, semAcento } from "./importador.js";

/* lugares/{id} = { n, tipo, cidade, hora, preco, nota, fui, t, w }
   `fui` guarda QUANDO vocês foram (timestamp). 0 ou ausente = ainda não.

   A aba existe para uma pergunta feita em pé na rua: sobrou uma hora aqui,
   o que presta por perto? Por isso ela não abre numa lista alfabética —
   abre na cidade de hoje, lida do roteiro, e só depois no resto. */

const TIPOS = LUGARES.tipos;
const ordemTipo = t => { const i = TIPOS.indexOf(t); return i < 0 ? 99 : i; };

const mapaURL = l => "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent([l.n, l.cidade].filter(Boolean).join(", "));

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

/* ═══════ o que o roteiro sabe sobre as cidades ═══════ */
function cidadesDoDia(d){
  const out = [];
  const add = c => { c = (c||"").trim(); if(c && !out.includes(c)) out.push(c); };
  Object.values(d.paradas || {}).forEach(p => add(p.c));
  add(d.cidade);
  return out;
}

/* cidades de hoje, se hoje for um dia do roteiro */
function cidadesDeHoje(){
  const hoje = hojeISO();
  const dia = Object.values(dados.roteiro || {}).find(d => d.dia === hoje);
  return dia ? cidadesDoDia(dia) : [];
}

/* ordem cronológica das cidades ao longo da viagem */
function ordemDasCidades(){
  const ordem = [];
  Object.values(dados.roteiro || {})
    .sort((a,b) => String(a.dia||"").localeCompare(String(b.dia||"")))
    .forEach(d => cidadesDoDia(d).forEach(c => { if(!ordem.includes(c)) ordem.push(c); }));
  return ordem;
}

/* ═══════ estado da tela (só neste aparelho) ═══════ */
let filtroTipo = LS.get("bupe:lugarTipo") || null;
let esconderFeitos = !!LS.get("bupe:lugarEsconde");
let fechadas = LS.get("bupe:lugarFechadas") || {};

const todos = () => Object.entries(dados.lugares || {}).map(([id, l]) => ({ id, ...l }));

/* ═══════ formulário ═══════ */
const listaCidades = () => {
  const usadas = [...new Set([...ordemDasCidades(), ...todos().map(l => l.cidade)].filter(Boolean))];
  return `<datalist id="cidades-lugar">${usadas.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`;
};

function form(l){
  return `
    ${campo("g-n", "Nome do lugar", "text", l?.n || "", 'maxlength="80" placeholder="Gelateria del Teatro"')}
    <label for="g-tipo">Tipo</label>
    <select id="g-tipo">${TIPOS.map(t =>
      `<option ${l?.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    ${campo("g-cidade", "Cidade", "text", l?.cidade || "", 'maxlength="40" list="cidades-lugar" placeholder="Roma"')}
    ${listaCidades()}
    <div class="dupla">
      <div>${campo("g-hora", "Horário", "text", l?.hora || "", 'maxlength="30" placeholder="fecha 23h"')}</div>
      <div>${campo("g-preco", "Preço", "text", l?.preco || "", 'maxlength="16" placeholder="€€"')}</div>
    </div>
    ${campo("g-nota", "Por que vale a pena", "textarea", l?.nota || "",
      'maxlength="400" placeholder="Quem indicou, o que pedir, o que evitar…"')}`;
}

function ler(back){
  return {
    n:      back.querySelector("#g-n").value.trim(),
    tipo:   back.querySelector("#g-tipo").value,
    cidade: back.querySelector("#g-cidade").value.trim(),
    hora:   back.querySelector("#g-hora").value.trim(),
    preco:  back.querySelector("#g-preco").value.trim(),
    nota:   back.querySelector("#g-nota").value.trim()
  };
}

function novo(cidadeSugerida){
  modal({
    titulo: "Novo lugar",
    corpo: form({ cidade: cidadeSugerida || cidadesDeHoje()[0] || "" }),
    onSalvar: async back => {
      const v = ler(back);
      if(!v.n){ toast("O lugar precisa de um nome."); return false; }
      await gravar("lugares", "g" + uid(), { ...v, fui: 0, t: agora(), w: cfg.name || "" });
      toast("Lugar guardado");
    }
  });
}

function editar(l){
  modal({
    titulo: "Editar lugar",
    corpo: form(l),
    onSalvar: async back => {
      const v = ler(back);
      if(!v.n){ toast("O lugar precisa de um nome."); return false; }
      await gravar("lugares", l.id, { ...dados.lugares[l.id], ...v, t: agora() });
    },
    extra: { label: "Excluir", onClick: async () => {
      if(!await confirmar(`Excluir "${l.n}"?`)) return;
      const antes = dados.lugares[l.id];
      await gravar("lugares", l.id, null);
      toast("Lugar excluído", { label: "Desfazer",
        onClick: () => gravar("lugares", l.id, antes) });
    }}
  });
}

async function alternarFui(l){
  const foi = !!l.fui;
  await gravar("lugares", l.id, { ...dados.lugares[l.id], fui: foi ? 0 : agora(), t: agora() });
  if(!foi) toast(`${l.n} — marcado como visitado`);
}

/* ═══════ importação ═══════ */
const COLS = {
  n:      ["nome","lugar","local","estabelecimento","titulo"],
  tipo:   ["tipo","categoria","o que e","genero"],
  cidade: ["cidade","onde","local"],
  hora:   ["horario","hora","funcionamento","abre","fecha"],
  preco:  ["preco","faixa","custo","valor"],
  nota:   ["nota","observacao","obs","por que","detalhe","comentario","indicacao"]
};

/* Como as indicações realmente chegam: "pizzaria", "trattoria", "sorveteria",
   "caffè". Nenhuma dessas palavras é o nome oficial do tipo, e cair tudo em
   "Outro" tornaria o filtro inútil logo na primeira lista colada. */
const APELIDOS = {
  "🍝 Restaurante":      ["restaurante","trattoria","osteria","cantina","pizzaria","pizza","ristorante","jantar","almoco"],
  "🍦 Gelateria":        ["gelateria","gelato","sorveteria","sorvete","gelados"],
  "☕ Café / Bar":       ["cafe","caffe","bar","cafeteria","aperitivo","coffee"],
  "🥐 Padaria / Doceria":["padaria","panificio","forno","doceria","pasticceria","confeitaria","doces"],
  "🍷 Enoteca":          ["enoteca","vinho","vinhos","wine","vinoteca","adega"],
  "🛍️ Loja":            ["loja","shopping","brecho","mercado","ateliê","atelie","compras","souvenir"]
};

/* devolve o tipo oficial, ou null quando não reconhece nada */
function acharTipo(bruto){
  const t = semAcento(bruto);
  if(!t) return null;
  const exato = TIPOS.find(op => semAcento(op.replace(/[^\p{L}\p{N}\s/]/gu, "")) === t);
  if(exato) return exato;
  for(const [tipo, palavras] of Object.entries(APELIDOS)){
    if(palavras.some(p => t === p || t.startsWith(p) || p.startsWith(t))) return tipo;
  }
  return null;
}
const casarTipo = bruto => acharTipo(bruto) || TIPOS[TIPOS.length - 1];

function mapearCols(cab){
  const cols = cab.map(semAcento), mapa = {}, usadas = new Set();
  const chaves = ["tipo","cidade","hora","preco","nota","n"];
  const tentar = (campo, casa) => {
    if(mapa[campo] !== undefined) return;
    for(let i = 0; i < cols.length; i++){
      if(usadas.has(i)) continue;
      if(COLS[campo].some(a => casa(cols[i], a))){ mapa[campo] = i; usadas.add(i); return; }
    }
  };
  chaves.forEach(c => tentar(c, (x,a) => x === a));
  chaves.forEach(c => tentar(c, (x,a) => x.startsWith(a)));
  return mapa;
}

function lerCSV(texto){
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if(!linhas.length) return [];
  const sep = separador(linhas[0]);
  const out = [];

  if(sep){
    const mapa = mapearCols(linhaCSV(linhas[0], sep));
    if(mapa.n !== undefined){
      linhas.slice(1).forEach(l => {
        const c = linhaCSV(l, sep);
        const pega = k => mapa[k] !== undefined ? (c[mapa[k]] || "") : "";
        const n = pega("n").trim();
        if(!n) return;
        out.push({
          n, tipo: casarTipo(pega("tipo")), cidade: pega("cidade").trim(),
          hora: pega("hora").trim(), preco: pega("preco").trim(), nota: pega("nota").trim()
        });
      });
      return out;
    }
  }

  /* Sem cabeçalho reconhecível, trata cada linha como um lugar. É como a
     maioria das indicações chega: uma lista solta colada do WhatsApp. */
  linhas.forEach(l => {
    const partes = l.split(/\s+[—–-]\s+|\s*[;|]\s*/).map(x => x.trim()).filter(Boolean);
    const n = (partes[0] || "").trim();
    if(!n) return;
    /* Se o segundo pedaço era o tipo, ele não deve aparecer de novo na nota —
       "cafe · o melhor espresso" repete o que a etiqueta já diz. */
    const resto = partes.slice(1);
    const tipo = acharTipo(resto[0] || "");
    if(tipo) resto.shift();
    out.push({ n, tipo: tipo || TIPOS[TIPOS.length - 1], cidade: "",
               hora: "", preco: "", nota: resto.join(" · ") });
  });
  return out;
}

function abrirImportacao(redesenhar){
  modal({
    titulo: "Importar lugares",
    corpo: `
      <p class="conf">CSV com colunas <i>nome, tipo, cidade, horário, preço, nota</i> —
      a ordem não importa, reconheço pelo cabeçalho.<br>
      Sem cabeçalho, cada linha vira um lugar: <i>Gelateria del Teatro — gelateria — perto da Piazza Navona</i>.</p>
      <label for="gi-arq">Escolher arquivo</label>
      <input id="gi-arq" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain">
      <label for="gi-txt">…ou colar aqui</label>
      <textarea id="gi-txt" rows="6" placeholder="Gelateria del Teatro — gelateria — indicação da Bia&#10;Roscioli — restaurante — reservar com antecedência"></textarea>`,
    salvar: "Analisar",
    onSalvar: async back => {
      const arq = back.querySelector("#gi-arq").files[0];
      let texto = back.querySelector("#gi-txt").value;
      if(arq) texto = await arq.text();
      if(!texto.trim()){ toast("Escolha um arquivo ou cole a lista."); return false; }
      const itens = lerCSV(texto);
      if(!itens.length){ toast("Não reconheci nenhum lugar."); return false; }
      setTimeout(() => previa(itens, redesenhar), 80);
    }
  });
}

function previa(itens, redesenhar){
  const porTipo = [...new Set(itens.map(i => i.tipo))].sort((a,b) => ordemTipo(a) - ordemTipo(b));
  const jaTem = Object.keys(dados.lugares || {}).length;
  modal({
    titulo: "Conferir antes de importar",
    corpo: `
      <p class="conf">${itens.length} lugar${itens.length > 1 ? "es" : ""} reconhecido${itens.length > 1 ? "s" : ""}.</p>
      <div class="prev">${porTipo.map(t => {
        const n = itens.filter(i => i.tipo === t).length;
        return `<div class="prev-dia"><b>${esc(t)}</b><span>${n}</span></div>`;
      }).join("")}</div>
      ${jaTem ? `
      <div class="onde">
        <label class="radio"><input type="radio" name="gi-modo" value="somar" checked>
          <span><b>Acrescentar ao que já existe</b><small>Mantém os ${jaTem} lugares atuais e soma os novos.</small></span></label>
        <label class="radio"><input type="radio" name="gi-modo" value="substituir">
          <span><b>Substituir a lista inteira</b><small>Apaga os ${jaTem} lugares atuais e usa só os do arquivo.</small></span></label>
      </div>` : ""}`,
    salvar: `Importar ${itens.length}`,
    onSalvar: async back => {
      const r = back.querySelector('input[name="gi-modo"]:checked');
      if(r && r.value === "substituir"){
        for(const id of Object.keys(dados.lugares || {})) await gravar("lugares", id, null);
      }
      const lote = {};
      itens.forEach((i, k) => {
        lote["g" + uid()] = { ...i, fui: 0, t: agora() + k, w: cfg.name || "" };
      });
      await gravarLote("lugares", lote);
      toast(`${itens.length} lugares importados`);
      redesenhar();
    }
  });
}

/* ═══════ tela ═══════ */
function cartao(l){
  const foi = !!l.fui;
  const card = document.createElement("section");
  card.className = "card lugar" + (foi ? " visitado" : "");
  card.innerHTML = `
    <div class="lugar-head">
      <div class="lugar-txt">
        <h2>${esc(l.n)}</h2>
        <span class="tag">${esc(l.tipo || "")}</span>
        ${pendente("lugares", l.id) ? `<span class="tag pend">não enviado</span>` : ""}
        ${(l.hora || l.preco) ? `<span class="lugar-meta">${
          [l.hora, l.preco].filter(Boolean).map(esc).join(" · ")}</span>` : ""}
        ${autoria(l, cfg.name)}
      </div>
      <button class="mini" aria-label="Editar ${esc(l.n)}">✎</button>
    </div>
    ${l.nota ? `<p class="nota">${nl(l.nota)}</p>` : ""}
    ${foi ? `<p class="fomos">Vocês foram em ${esc(dataBR(new Date(l.fui).toISOString().slice(0,10)))}</p>` : ""}
    <div class="acoes">
      <a class="acao" href="${mapaURL(l)}" target="_blank" rel="noopener">Abrir no mapa</a>
      <button class="acao ${foi ? "on" : ""}" data-fui>${foi ? "✓ já fomos" : "marcar que fomos"}</button>
    </div>`;
  card.querySelector(".mini").onclick = () => editar(l);
  card.querySelector("[data-fui]").onclick = () => alternarFui(l);
  return card;
}

function secao(el, titulo, sub, lista, chave, abertaPorPadrao){
  const aberta = chave in fechadas ? !fechadas[chave] : abertaPorPadrao;
  const sec = document.createElement("section");
  sec.className = "tappa lugar-grupo" + (aberta ? " open" : "");
  const head = document.createElement("button");
  head.className = "head";
  head.setAttribute("aria-expanded", aberta ? "true" : "false");
  head.innerHTML =
    `<span class="head-txt"><h2>${esc(titulo)}</h2>${sub ? `<span class="when">${esc(sub)}</span>` : ""}</span>
     <span class="pill">${lista.length}</span>
     <span class="chev"></span>`;
  head.onclick = () => {
    const ab = sec.classList.toggle("open");
    head.setAttribute("aria-expanded", ab ? "true" : "false");
    fechadas[chave] = !ab;
    LS.set("bupe:lugarFechadas", fechadas);
  };
  sec.appendChild(head);

  const body = document.createElement("div");
  body.className = "body";
  lista.forEach(l => body.appendChild(cartao(l)));
  const add = document.createElement("button");
  add.className = "add-inline";
  add.textContent = "+ adicionar lugar aqui";
  add.onclick = () => novo(lista[0]?.cidade || "");
  body.appendChild(add);
  sec.appendChild(body);
  el.appendChild(sec);
}

export function render(el){
  el.innerHTML = "";
  const lista = todos();
  const redesenhar = () => render(el);

  if(!lista.length){
    el.innerHTML = `<div class="vazio">
      <p>Nenhuma indicação guardada ainda.</p>
      <small>Restaurantes, gelaterias, lojas — o que amigos indicaram e vocês não querem
      perder. Quando sobrar um tempo no meio do dia, esta aba mostra primeiro o que fica
      na cidade de hoje.</small>
    </div>`;
    const botoes = document.createElement("div");
    botoes.className = "btns lugar-btns";
    const b1 = document.createElement("button");
    b1.className = "btn"; b1.textContent = "Adicionar o primeiro";
    b1.onclick = () => novo();
    const b2 = document.createElement("button");
    b2.className = "btn ghost"; b2.textContent = "Colar uma lista";
    b2.onclick = () => abrirImportacao(redesenhar);
    botoes.append(b1, b2);
    el.appendChild(botoes);
    return;
  }

  /* filtros por tipo — só os que existem de fato */
  const tiposPresentes = [...new Set(lista.map(l => l.tipo).filter(Boolean))]
    .sort((a,b) => ordemTipo(a) - ordemTipo(b));
  const visitados = lista.filter(l => l.fui).length;

  const chips = document.createElement("div");
  chips.className = "chips";
  const chip = (rotulo, ativo, aoClicar, extra = "") => {
    const b = document.createElement("button");
    b.className = "chip" + (ativo ? " on" : "");
    b.innerHTML = esc(rotulo) + (extra ? `<i>${esc(extra)}</i>` : "");
    b.onclick = aoClicar;
    chips.appendChild(b);
  };
  chip("Todos", !filtroTipo, () => {
    filtroTipo = null; LS.set("bupe:lugarTipo", null); redesenhar();
  }, String(lista.length));
  tiposPresentes.forEach(t => chip(t, filtroTipo === t, () => {
    filtroTipo = filtroTipo === t ? null : t;
    LS.set("bupe:lugarTipo", filtroTipo); redesenhar();
  }, String(lista.filter(l => l.tipo === t).length)));
  if(visitados) chip(esconderFeitos ? "mostrar visitados" : "esconder visitados", esconderFeitos, () => {
    esconderFeitos = !esconderFeitos;
    LS.set("bupe:lugarEsconde", esconderFeitos); redesenhar();
  });
  el.appendChild(chips);

  let filtrada = filtroTipo ? lista.filter(l => l.tipo === filtroTipo) : lista;
  if(esconderFeitos) filtrada = filtrada.filter(l => !l.fui);

  /* não visitados primeiro; depois por tipo e nome */
  const ordenar = a => a.sort((x, y) =>
    (x.fui ? 1 : 0) - (y.fui ? 1 : 0) ||
    ordemTipo(x.tipo) - ordemTipo(y.tipo) ||
    (x.n || "").localeCompare(y.n || ""));

  const hoje = cidadesDeHoje();
  const daHoje = hoje.length
    ? ordenar(filtrada.filter(l => hoje.includes((l.cidade || "").trim())))
    : [];

  if(daHoje.length){
    secao(el, `Hoje · ${hoje.join(" e ")}`,
      "onde vocês estão agora", daHoje, "hoje", true);
  }

  /* demais cidades, na ordem em que a viagem passa por elas */
  const resto = filtrada.filter(l => !daHoje.includes(l));
  const ordemViagem = ordemDasCidades();
  const cidades = [...new Set(resto.map(l => (l.cidade || "").trim()))]
    .sort((a, b) => {
      if(!a) return 1;
      if(!b) return -1;
      const ia = ordemViagem.indexOf(a), ib = ordemViagem.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

  cidades.forEach(c => {
    const daCidade = ordenar(resto.filter(l => (l.cidade || "").trim() === c));
    if(!daCidade.length) return;
    const feitos = daCidade.filter(l => l.fui).length;
    secao(el, c || "Sem cidade definida",
      feitos ? `${feitos} de ${daCidade.length} já visitados` : "",
      daCidade, "c:" + c, !daHoje.length);
  });

  if(!daHoje.length && !cidades.length){
    el.insertAdjacentHTML("beforeend",
      `<div class="vazio"><p>Nada com esse filtro.</p>
       <small>Toque em “Todos” para ver a lista inteira.</small></div>`);
  }

  const botoes = document.createElement("div");
  botoes.className = "btns lugar-btns";
  const b1 = document.createElement("button");
  b1.className = "btn"; b1.textContent = "+ novo lugar";
  b1.onclick = () => novo();
  const b2 = document.createElement("button");
  b2.className = "btn ghost"; b2.textContent = "Importar lista";
  b2.onclick = () => abrirImportacao(redesenhar);
  botoes.append(b1, b2);
  el.appendChild(botoes);
}
