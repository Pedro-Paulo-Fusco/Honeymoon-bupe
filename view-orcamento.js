import { ORCAMENTO } from "./data.js";
import { dados, gravar, gravarLote, cfg, LS } from "./store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast } from "./util.js";
import { separador, linhaCSV, semAcento } from "./importador.js";

/* orcamento/{id} = { cat, n, q, vu, br, pg, obs, t, w }
     vu = valor unitário em €   ·   br = valor total já em R$ (quando não há €)
     pg = quanto já foi pago, em R$
   conf/cambio = { v:6.2, t } */

/* ═══════ câmbio ═══════ */
export const cambio = () => {
  const c = dados.conf && dados.conf.cambio;
  const v = c && Number(c.v);
  return v && v > 0 ? v : ORCAMENTO.cambioPadrao;
};

const brl = n => "R$ " + (n || 0).toLocaleString("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 });
const eur = n => "€ " + (n || 0).toLocaleString("pt-BR", { minimumFractionDigits:0, maximumFractionDigits:0 });

/* ═══════ cálculo ═══════ */
export function totalItem(i){
  const q = Number(i.q) || 1;
  const euros = (Number(i.vu) || 0) * q;
  const direto = Number(i.br) || 0;          /* valor já em real: total, não unitário */
  const reais = direto ? direto : euros * cambio();
  const pago = Number(i.pg) || 0;
  return { euros, reais, pago, saldo: reais - pago };
}

export function totais(){
  let reais = 0, euros = 0, pago = 0;
  Object.values(dados.orcamento || {}).forEach(i => {
    const t = totalItem(i);
    reais += t.reais; euros += t.euros; pago += t.pago;
  });
  return {
    reais, euros, pago, saldo: reais - pago,
    porPessoa: reais / (ORCAMENTO.pessoas || 1),
    porDia:    reais / (ORCAMENTO.dias || 1),
    pct: reais ? Math.min(100, Math.round(pago / reais * 100)) : 0
  };
}

/* ═══════ agrupamento ═══════ */
function porCategoria(){
  const mapa = {};
  Object.entries(dados.orcamento || {}).forEach(([id, i]) => {
    const c = (i.cat || "Outros").trim();
    (mapa[c] = mapa[c] || []).push({ id, ...i });
  });
  const ordem = ORCAMENTO.categorias;
  return Object.entries(mapa)
    .map(([cat, itens]) => {
      let r = 0, p = 0;
      itens.forEach(i => { const t = totalItem(i); r += t.reais; p += t.pago; });
      itens.sort((a,b) => (a.t || 0) - (b.t || 0));
      return { cat, itens, reais:r, pago:p, quitada: r > 0 && p >= r - 0.01 };
    })
    .sort((a,b) => {
      const ia = ordem.indexOf(a.cat), ib = ordem.indexOf(b.cat);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.cat.localeCompare(b.cat);
    });
}

/* ═══════ estado da tela ═══════ */
let abertas = LS.get("bupe:catAbertas") || {};
const aberta = c => !!abertas[c];

/* ═══════ formulários ═══════ */
const listaCats = () => {
  const usadas = [...new Set([...ORCAMENTO.categorias,
    ...Object.values(dados.orcamento || {}).map(i => i.cat).filter(Boolean)])];
  return `<datalist id="cats">${usadas.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`;
};

function form(i, catSugerida){
  return `
    ${campo("o-n", "Item", "text", i?.n || "", 'maxlength="120" placeholder="Gôndola em Veneza (30 min)"')}
    ${campo("o-cat", "Categoria", "text", i?.cat || catSugerida || "", 'maxlength="50" list="cats"')}
    ${listaCats()}
    <div class="dupla">
      <div>${campo("o-q", "Qtd.", "number", i?.q ?? 1, 'min="1" step="1"')}</div>
      <div>${campo("o-vu", "Valor unit. (€)", "number", i?.vu ?? "", 'min="0" step="0.01" placeholder="90"')}</div>
    </div>
    ${campo("o-br", "…ou valor total já em R$", "number", i?.br ?? "", 'min="0" step="0.01" placeholder="Use só quando o preço não for em euro"')}
    ${campo("o-pg", "Já pago (R$)", "number", i?.pg ?? "", 'min="0" step="0.01"')}
    ${campo("o-obs", "Observação", "textarea", i?.obs || "", 'maxlength="400"')}
    <p class="conf">Preencha <b>valor unit. (€)</b> ou <b>valor em R$</b> — não os dois.
    O câmbio de hoje (${cambio().toLocaleString("pt-BR",{minimumFractionDigits:2})}) converte os euros automaticamente.</p>`;
}

function ler(back){
  const num = id => {
    const v = back.querySelector(id).value.trim().replace(",", ".");
    return v === "" ? "" : Number(v);
  };
  return {
    n:   back.querySelector("#o-n").value.trim(),
    cat: back.querySelector("#o-cat").value.trim() || "Outros",
    q:   num("#o-q") || 1,
    vu:  num("#o-vu") || "",
    br:  num("#o-br") || "",
    pg:  num("#o-pg") || "",
    obs: back.querySelector("#o-obs").value.trim()
  };
}

function novoItem(cat){
  modal({
    titulo: "Novo item do orçamento", corpo: form(null, cat), salvar: "Adicionar",
    onSalvar: async back => {
      const v = ler(back);
      if(!v.n){ toast("Dê um nome ao item."); return false; }
      if(!v.vu && !v.br){ toast("Informe o valor em euro ou em real."); return false; }
      abertas[v.cat] = true; LS.set("bupe:catAbertas", abertas);
      await gravar("orcamento", "o" + uid(), { ...v, t: agora(), w: cfg.name || "" });
      toast("Item adicionado");
    }
  });
}

function editarItem(i){
  modal({
    titulo: "Editar item", corpo: form(i),
    onSalvar: async back => {
      const v = ler(back);
      if(!v.n){ toast("O item precisa de um nome."); return false; }
      await gravar("orcamento", i.id, { ...dados.orcamento[i.id], ...v, t: agora() });
    },
    extra: { label:"Excluir", onClick: async () => {
      if(!await confirmar(`Excluir "${i.n}" do orçamento?`)) return;
      await gravar("orcamento", i.id, null); toast("Item excluído");
    }}
  });
}

function quitar(i){
  const t = totalItem(i);
  modal({
    titulo: "Registrar pagamento",
    corpo: `
      <p class="conf"><b>${esc(i.n)}</b><br>Total: ${brl(t.reais)} · já pago: ${brl(t.pago)}</p>
      ${campo("o-pago", "Total pago até agora (R$)", "number", t.pago || "", 'min="0" step="0.01"')}
      <button class="add-inline" id="o-tudo">marcar como totalmente pago (${brl(t.reais)})</button>`,
    salvar: "Salvar",
    onSalvar: async back => {
      const v = back.querySelector("#o-pago").value.trim().replace(",", ".");
      await gravar("orcamento", i.id, { ...dados.orcamento[i.id], pg: v === "" ? "" : Number(v), t: agora() });
      toast("Pagamento registrado");
    }
  });
  document.getElementById("o-tudo").onclick = e => {
    e.preventDefault();
    document.getElementById("o-pago").value = t.reais.toFixed(2);
  };
}

function editarCambio(){
  modal({
    titulo: "Câmbio EUR → BRL",
    corpo: `${campo("o-cambio", "Quantos reais vale 1 euro", "number", cambio(), 'min="0.1" step="0.01"')}
      <p class="conf">Tudo que está em euro é convertido por esta taxa. Vale atualizar quando o câmbio mexer bastante — não precisa ser todo dia.</p>`,
    onSalvar: async back => {
      const v = Number(back.querySelector("#o-cambio").value.replace(",", "."));
      if(!v || v <= 0){ toast("Informe uma taxa válida."); return false; }
      await gravar("conf", "cambio", { v, t: agora(), w: cfg.name || "" });
      toast("Câmbio atualizado");
    }
  });
}

/* ═══════ importação de CSV ═══════ */
const COLS = {
  cat: ["categoria","cat","grupo","tipo"],
  n:   ["item","descricao","nome","o que","parada"],
  q:   ["qtd","qtd.","quantidade","qt"],
  vu:  ["valor unit (eur)","valor unit.(€)","valor unit","unitario","eur","euro","valor euro","preco"],
  br:  ["valor total (brl)","subtotal(r$)","valor r$","brl","real","reais","valor total"],
  pg:  ["ja pago (brl)","ja pago(r$)","ja pago","pago"],
  obs: ["observacao","observacoes","obs","nota","detalhe"]
};

function mapearCols(cab){
  const cols = cab.map(semAcento), mapa = {}, usadas = new Set();
  const tentar = (campo, casa) => {
    if(mapa[campo] !== undefined) return;
    for(let i = 0; i < cols.length; i++){
      if(usadas.has(i)) continue;
      if(COLS[campo].some(a => casa(cols[i], a))){ mapa[campo] = i; usadas.add(i); return; }
    }
  };
  ["cat","q","vu","br","pg","obs","n"].forEach(c => tentar(c, (x,a) => x === a));
  ["cat","q","vu","br","pg","obs","n"].forEach(c => tentar(c, (x,a) => x.startsWith(a)));
  return mapa;
}

const numero = v => {
  const t = String(v ?? "").replace(/[^\d,.\-]/g, "").trim();
  if(!t) return "";
  const n = Number(t.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return isNaN(n) ? "" : n;
};

function lerOrcamentoCSV(texto){
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if(!linhas.length) return [];
  const sep = separador(linhas[0]);
  if(!sep) return [];
  const cab = linhaCSV(linhas[0], sep);
  const mapa = mapearCols(cab);
  if(mapa.n === undefined) return [];
  const out = [];
  linhas.slice(1).forEach(l => {
    const c = linhaCSV(l, sep);
    const pega = k => mapa[k] !== undefined ? (c[mapa[k]] || "") : "";
    const n = pega("n").trim();
    if(!n) return;
    out.push({
      cat: pega("cat").trim() || "Outros", n,
      q:  numero(pega("q")) || 1,
      vu: numero(pega("vu")) || "",
      br: numero(pega("br")) || "",
      pg: numero(pega("pg")) || "",
      obs: pega("obs").trim()
    });
  });
  return out;
}

function abrirImportacao(redesenhar){
  modal({
    titulo: "Importar orçamento",
    corpo: `
      <p class="conf">CSV com colunas <i>categoria, item, qtd, valor unit (EUR), valor total (BRL), já pago (BRL), observação</i>.
      A ordem não importa — reconheço pelo cabeçalho.</p>
      <label for="oi-arq">Escolher arquivo</label>
      <input id="oi-arq" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain">
      <label for="oi-txt">…ou colar aqui</label>
      <textarea id="oi-txt" rows="6" placeholder="categoria;item;qtd;valor unit (EUR);valor total (BRL);ja pago (BRL);observacao"></textarea>`,
    salvar: "Analisar",
    onSalvar: async back => {
      const arq = back.querySelector("#oi-arq").files[0];
      let texto = back.querySelector("#oi-txt").value;
      if(arq) texto = await arq.text();
      if(!texto.trim()){ toast("Escolha um arquivo ou cole o conteúdo."); return false; }
      const itens = lerOrcamentoCSV(texto);
      if(!itens.length){ toast("Não reconheci nenhum item. Confira o cabeçalho."); return false; }
      setTimeout(() => previa(itens, redesenhar), 80);
    }
  });
}

function previa(itens, redesenhar){
  const cx = cambio();
  let reais = 0, pago = 0;
  itens.forEach(i => {
    const q = i.q || 1;
    reais += i.br ? i.br : (i.vu || 0) * q * cx;
    pago  += i.pg || 0;
  });
  const cats = [...new Set(itens.map(i => i.cat))];
  const jaTem = Object.keys(dados.orcamento || {}).length;

  modal({
    titulo: "Conferir antes de importar",
    corpo: `
      <p class="conf"><b>${itens.length}</b> itens em <b>${cats.length}</b> categoria(s).
      Total ${brl(reais)} · já pago ${brl(pago)}.</p>
      <div class="prev">${cats.map(c => {
        const n = itens.filter(i => i.cat === c).length;
        return `<div class="prev-dia"><b>${esc(c)}</b><span>${n} item${n>1?"s":""}</span></div>`;
      }).join("")}</div>
      ${jaTem ? `
      <div class="onde">
        <label class="radio"><input type="radio" name="oi-modo" value="somar" checked>
          <span><b>Acrescentar ao que já existe</b><small>Mantém os ${jaTem} itens atuais e soma os novos.</small></span></label>
        <label class="radio"><input type="radio" name="oi-modo" value="substituir">
          <span><b>Substituir o orçamento inteiro</b><small>Apaga os ${jaTem} itens atuais e usa só os do arquivo.</small></span></label>
      </div>` : ""}`,
    salvar: `Importar ${itens.length} itens`,
    onSalvar: async back => {
      const r = back.querySelector('input[name="oi-modo"]:checked');
      if(r && r.value === "substituir"){
        for(const id of Object.keys(dados.orcamento || {})) await gravar("orcamento", id, null);
      }
      const lote = {};
      itens.forEach((i, k) => {
        lote["o" + uid()] = { ...i, t: agora() + k, w: cfg.name || "" };
      });
      await gravarLote("orcamento", lote);
      itens.forEach(i => { abertas[i.cat] = true; });
      LS.set("bupe:catAbertas", abertas);
      toast(`${itens.length} itens importados`);
      redesenhar();
    }
  });
}

/* ═══════ render ═══════ */
export function render(el){
  const grupos = porCategoria();
  const t = totais();
  el.innerHTML = "";

  /* painel de totais */
  const painel = document.createElement("section");
  painel.className = "orc-topo";
  painel.innerHTML = `
    <div class="orc-total">
      <small>Total da viagem</small>
      <b>${brl(t.reais)}</b>
      <span>${eur(t.euros)} em euro + valores já em real</span>
    </div>
    <div class="orc-barra"><i style="width:${t.pct}%"></i></div>
    <div class="orc-linha">
      <span>Pago <b>${brl(t.pago)}</b></span>
      <span class="dir">Falta <b>${brl(t.saldo)}</b></span>
    </div>
    <div class="orc-grade">
      <div><small>por pessoa</small><b>${brl(t.porPessoa)}</b></div>
      <div><small>por dia (${ORCAMENTO.dias})</small><b>${brl(t.porDia)}</b></div>
      <div class="clic" id="orc-cambio"><small>câmbio €</small><b>${cambio().toLocaleString("pt-BR",{minimumFractionDigits:2})}</b></div>
    </div>`;
  el.appendChild(painel);
  painel.querySelector("#orc-cambio").onclick = editarCambio;

  if(!grupos.length){
    el.insertAdjacentHTML("beforeend", `<div class="vazio">
      <p>Orçamento vazio.</p>
      <small>Adicione itens um a um ou importe a planilha que você já tem em CSV.</small>
    </div>`);
  }

  grupos.forEach(g => {
    const ab = aberta(g.cat);
    const sec = document.createElement("section");
    sec.className = "tappa" + (g.quitada ? " done" : "") + (ab ? " open" : "");
    sec.innerHTML = `
      <button class="head" aria-expanded="${ab}">
        <span class="head-txt">
          <h2>${esc(g.cat)}</h2>
          <span class="when">${g.itens.length} item${g.itens.length>1?"s":""}${
            g.pago > 0 ? ` · ${brl(g.pago)} pago` : ""}</span>
        </span>
        <span class="pill">${brl(g.reais)}</span>
        <span class="chev"></span>
      </button>
      <div class="body"></div>`;

    const head = sec.querySelector(".head");
    head.onclick = () => {
      if(abertas[g.cat]) delete abertas[g.cat]; else abertas[g.cat] = true;
      LS.set("bupe:catAbertas", abertas);
      render(el);
    };

    const body = sec.querySelector(".body");
    g.itens.forEach(i => {
      const ti = totalItem(i);
      const quitado = ti.reais > 0 && ti.pago >= ti.reais - 0.01;
      const row = document.createElement("div");
      row.className = "orc-item" + (quitado ? " quitado" : "");
      row.innerHTML = `
        <span class="orc-txt">
          <b>${esc(i.n)}</b>
          <small>${(Number(i.q)||1) > 1 ? `${i.q} × ` : ""}${
            i.vu ? eur(i.vu) : "valor em real"}${
            ti.pago > 0 && !quitado ? ` · pago ${brl(ti.pago)}` : ""}</small>
          ${i.obs ? `<em>${nl(i.obs)}</em>` : ""}
        </span>
        <span class="orc-val">
          <b>${brl(ti.reais)}</b>
          ${quitado ? `<i class="ok">pago</i>` : `<i>falta ${brl(ti.saldo)}</i>`}
        </span>`;
      row.onclick = () => editarItem(i);
      const val = row.querySelector(".orc-val");
      val.onclick = e => { e.stopPropagation(); quitar(i); };
      body.appendChild(row);
    });

    const add = document.createElement("button");
    add.className = "add-inline";
    add.textContent = "+ adicionar item nesta categoria";
    add.onclick = e => { e.stopPropagation(); novoItem(g.cat); };
    body.appendChild(add);

    el.appendChild(sec);
  });

  const add = document.createElement("button");
  add.className = "add-grande";
  add.textContent = "+ novo item de orçamento";
  add.onclick = () => novoItem("");
  el.appendChild(add);

  const imp = document.createElement("button");
  imp.className = "add-inline importar";
  imp.textContent = "⇪ importar orçamento de um CSV";
  imp.onclick = () => abrirImportacao(() => render(el));
  el.appendChild(imp);
}
