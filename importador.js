/* Importa roteiro de CSV, TSV ou texto corrido.
   Duas etapas: analisar → conferir a prévia → gravar. */

import { dados, gravarLote, cfg } from "./store.js";
import { esc, uid, agora, modal, toast, dataBR, diaSemana } from "./util.js";

/* ═══════ normalização ═══════ */
const semAcento = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

function normData(v){
  const t = String(v||"").trim();
  if(!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);                 // 2026-10-02
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/);  // 02/10/2026 · 02/10
  if(m){
    let ano = m[3] || "2026";
    if(ano.length === 2) ano = "20" + ano;
    return `${ano}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  }
  const MES = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  m = semAcento(t).match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3})/);      // 02 out · 2 de outubro
  if(m && MES[m[2]]) return `2026-${String(MES[m[2]]).padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return "";
}

function normHora(v){
  const t = String(v||"").trim();
  if(!t) return "";
  const m = t.match(/^(\d{1,2})\s*[:hH.]\s*(\d{0,2})/);
  if(!m) return "";
  const h = Math.min(23, parseInt(m[1],10));
  const min = (m[2] || "0").padEnd(2,"0");
  return `${String(h).padStart(2,"0")}:${min.slice(0,2)}`;
}

/* ═══════ CSV ═══════ */
function separador(linha){
  const cand = [";", "\t", ",", "|"];
  let melhor = ",", max = 0;
  cand.forEach(c => {
    const n = linha.split(c).length - 1;
    if(n > max){ max = n; melhor = c; }
  });
  return max ? melhor : null;
}

function linhaCSV(linha, sep){
  const out = []; let atual = "", aspas = false;
  for(let i = 0; i < linha.length; i++){
    const c = linha[i];
    if(c === '"'){
      if(aspas && linha[i+1] === '"'){ atual += '"'; i++; }
      else aspas = !aspas;
    } else if(c === sep && !aspas){ out.push(atual); atual = ""; }
    else atual += c;
  }
  out.push(atual);
  return out.map(x => x.trim());
}

const CAMPOS = {
  data:    ["data","dia","date"],
  cidade:  ["cidade","city","local","localidade"],
  hora:    ["hora","horario","time","h"],
  nome:    ["parada","o que","oque","atividade","titulo","nome","programa","item","descricao curta","evento"],
  detalhe: ["detalhe","detalhes","descricao","observacao","observacoes","obs","nota","notas","comentario"],
  tituloDia:["titulo do dia","tema","tema do dia","resumo"]
};

/* a ordem importa: os nomes mais específicos são resolvidos primeiro,
   e uma coluna já usada não é reaproveitada por outro campo */
const PRIORIDADE = ["data","cidade","hora","tituloDia","detalhe","nome"];

function mapear(cabecalho){
  const mapa = {}, usadas = new Set();
  const cols = cabecalho.map(semAcento);

  const tentar = (campo, casa) => {
    if(mapa[campo] !== undefined) return;
    for(let i = 0; i < cols.length; i++){
      if(usadas.has(i)) continue;
      if(CAMPOS[campo].some(a => casa(cols[i], a))){
        mapa[campo] = i; usadas.add(i); return;
      }
    }
  };
  /* 1ª passada: nome exato. 2ª: começa com. */
  PRIORIDADE.forEach(c => tentar(c, (col, a) => col === a));
  PRIORIDADE.forEach(c => tentar(c, (col, a) => col.startsWith(a)));
  return mapa;
}

function lerCSV(texto){
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if(!linhas.length) return [];
  const sep = separador(linhas[0]);
  if(!sep) return null;                       // não é tabular

  const primeira = linhaCSV(linhas[0], sep);
  const mapa = mapear(primeira);
  const temCabecalho = Object.keys(mapa).length >= 2;
  const cols = temCabecalho ? mapa : { data:0, cidade:1, hora:2, nome:3, detalhe:4 };
  const corpo = temCabecalho ? linhas.slice(1) : linhas;

  const linhasOK = [];
  corpo.forEach(l => {
    const c = linhaCSV(l, sep);
    const pega = k => cols[k] !== undefined ? (c[cols[k]] || "") : "";
    const data = normData(pega("data"));
    let nome = pega("nome").trim();
    let detalhe = pega("detalhe").trim();
    if(!nome && detalhe){ nome = detalhe; detalhe = ""; }   // só há descrição
    if(!data && !nome) return;
    linhasOK.push({
      data, cidade: pega("cidade").trim(), hora: normHora(pega("hora")),
      nome, detalhe, tituloDia: pega("tituloDia").trim()
    });
  });
  return linhasOK;
}

/* ═══════ texto corrido ═══════
   02/10/2026 — Florença — Chegada em Florença
   12:35 Desembarque em Roma
   15:00 Check-in | Madame Isabella Belfiore                        */
function lerTexto(texto){
  const linhas = texto.split(/\r?\n/);
  const out = [];
  let data = "", cidade = "", titulo = "";
  linhas.forEach(bruta => {
    const l = bruta.trim();
    if(!l) return;
    const partes = l.split(/\s*[—–|]\s*|\s+-\s+/);
    const talvezData = normData(partes[0]);
    if(talvezData){                                   // linha de dia
      data = talvezData;
      cidade = partes[1] ? partes[1].trim() : cidade;
      titulo = partes[2] ? partes[2].trim() : "";
      return;
    }
    if(!data) return;                                 // ainda não há dia
    const mh = l.match(/^(\d{1,2}\s*[:hH.]\s*\d{0,2})\s*[-–—:]?\s*(.+)$/);
    let hora = "", resto = l;
    if(mh){ hora = normHora(mh[1]); resto = mh[2].trim(); }
    const p2 = resto.split(/\s*[|—–]\s*/);
    out.push({
      data, cidade, hora,
      nome: p2[0].trim(),
      detalhe: p2.slice(1).join(" — ").trim(),
      tituloDia: titulo
    });
  });
  return out;
}

/* ═══════ agrupar por dia ═══════ */
function agrupar(linhas){
  const dias = {};
  linhas.forEach(l => {
    if(!l.data) return;
    if(!dias[l.data]) dias[l.data] = { dia:l.data, cidade:"", titulo:"", paradas:[], cont:{} };
    const d = dias[l.data];
    if(l.cidade){ d.cont[l.cidade] = (d.cont[l.cidade] || 0) + 1; }
    if(!d.titulo && l.tituloDia) d.titulo = l.tituloDia;
    if(l.nome) d.paradas.push({ h:l.hora, n:l.nome, d:l.detalhe, c:l.cidade || "" });
  });
  const lista = Object.values(dias);
  lista.forEach(d => {
    const ord = Object.entries(d.cont).sort((a,b) => b[1] - a[1]);
    d.cidade = ord.length ? ord[0][0] : "";          /* base do dia: a mais frequente */
    /* trajeto: cidades na ordem em que aparecem no relógio */
    const porHora = [...d.paradas].sort((a,b) => (a.c && b.c ? 0 : 0) ||
      (a.h || "99:99").localeCompare(b.h || "99:99"));
    d.cidades = [];
    porHora.forEach(p => { if(p.c && !d.cidades.includes(p.c)) d.cidades.push(p.c); });
    if(!d.cidades.length && d.cidade) d.cidades = [d.cidade];
    delete d.cont;
  });
  return lista.sort((a,b) => a.dia.localeCompare(b.dia));
}

/* ═══════ gravação ═══════ */
async function aplicar(dias, modo){
  const existentes = Object.entries(dados.roteiro)
    .map(([id, d]) => ({ id, ...d }));
  const lote = {};

  dias.forEach(novo => {
    const antigo = existentes.find(x => x.dia === novo.dia);
    const id = antigo ? antigo.id : "r" + uid();
    const paradas = (modo === "somar" && antigo) ? { ...(antigo.paradas || {}) } : {};
    novo.paradas.forEach(p => {
      paradas["p" + uid()] = { h:p.h || "", n:p.n, d:p.d || "", c:p.c || "" };
    });
    lote[id] = {
      dia: novo.dia,
      cidade: novo.cidade || (antigo ? antigo.cidade || "" : ""),
      titulo: novo.titulo || (antigo ? antigo.titulo || "" : ""),
      nota:   antigo ? antigo.nota || "" : "",
      paradas, t: agora(), w: cfg.name || ""
    };
  });

  await gravarLote("roteiro", lote);
  return Object.keys(lote).length;
}

/* ═══════ interface ═══════ */
const MODELO = `data;cidade;hora;parada;detalhe
02/10/2026;Florença;12:35;Desembarque em Roma;
02/10/2026;Florença;15:00;Check-in;Madame Isabella Belfiore
02/10/2026;Florença;15:45;Borgo Stretto + Mercato Centrale;Rua medieval e mercado coberto
03/10/2026;Florença;09:00;Galleria dell'Accademia;Ingresso com hora marcada`;

function baixarModelo(){
  const blob = new Blob(["\ufeff" + MODELO], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "modelo-roteiro.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function previa(dias, aoConcluir){
  const nParadas = dias.reduce((s,d) => s + d.paradas.length, 0);
  const cidades = [...new Set(dias.map(d => d.cidade).filter(Boolean))];
  const jaExistem = dias.filter(d =>
    Object.values(dados.roteiro).some(x => x.dia === d.dia)).length;

  const amostra = dias.slice(0, 6).map(d => `
    <div class="prev-dia">
      <b>${esc(dataBR(d.dia))} · ${esc(diaSemana(d.dia))}</b>
      <span>${esc((d.cidades && d.cidades.length ? d.cidades.join(" → ") : d.cidade) || "sem cidade")} · ${d.paradas.length} parada${d.paradas.length>1?"s":""}</span>
      <small>${esc(d.paradas.slice(0,3).map(p => (p.h ? p.h+" " : "") + p.n).join(" · "))}${d.paradas.length>3?" …":""}</small>
    </div>`).join("");

  modal({
    titulo: "Conferir antes de importar",
    corpo: `
      <p class="conf"><b>${dias.length}</b> dia${dias.length>1?"s":""} e <b>${nParadas}</b> parada${nParadas>1?"s":""}${
        cidades.length ? ` · ${esc(cidades.join(", "))}` : ""}.</p>
      <div class="prev">${amostra}${dias.length>6?`<p class="sem">e mais ${dias.length-6} dia(s)…</p>`:""}</div>
      ${jaExistem ? `
former      <label for="i-modo">${jaExistem} dia(s) já existem no roteiro</label>
      <div class="onde">
        <label class="radio"><input type="radio" name="i-modo" value="somar" checked>
          <span><b>Somar às paradas existentes</b><small>Mantém o que já está lá e acrescenta o que vem do arquivo.</small></span></label>
        <label class="radio"><input type="radio" name="i-modo" value="substituir">
          <span><b>Substituir esses dias</b><small>Apaga as paradas atuais desses dias e usa só as do arquivo.</small></span></label>
      </div>` : ""}`.replace("former",""),
    salvar: `Importar ${nParadas} parada${nParadas>1?"s":""}`,
    onSalvar: async back => {
      const r = back.querySelector('input[name="i-modo"]:checked');
      const n = await aplicar(dias, r ? r.value : "somar");
      toast(`${n} dia${n>1?"s":""} importado${n>1?"s":""}`);
      aoConcluir();
    }
  });
}

export function abrirImportador(aoConcluir){
  modal({
    titulo: "Importar roteiro",
    corpo: `
      <p class="conf">Aceita <b>CSV</b>, <b>TSV</b> ou texto colado. Se o arquivo tiver cabeçalho,
      eu reconheço colunas como <i>data, cidade, hora, parada, detalhe</i> em qualquer ordem.</p>
      <label for="i-arq">Escolher arquivo</label>
      <input id="i-arq" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain">
      <label for="i-txt">…ou colar aqui</label>
      <textarea id="i-txt" rows="7" placeholder="02/10/2026 — Florença — Chegada&#10;12:35 Desembarque em Roma&#10;15:00 Check-in | Madame Isabella Belfiore"></textarea>
      <button class="add-inline" id="i-modelo">baixar um CSV de exemplo</button>`,
    salvar: "Analisar",
    onSalvar: async back => {
      const arq = back.querySelector("#i-arq").files[0];
      let texto = back.querySelector("#i-txt").value;
      if(arq) texto = await arq.text();
      if(!texto || !texto.trim()){ toast("Escolha um arquivo ou cole o roteiro."); return false; }

      let linhas = lerCSV(texto);
      if(linhas === null || !linhas.length) linhas = lerTexto(texto);
      const dias = agrupar(linhas);
      if(!dias.length){
        toast("Não consegui identificar datas. Confira o formato ou baixe o exemplo.");
        return false;
      }
      setTimeout(() => previa(dias, aoConcluir), 80);
    }
  });
  document.getElementById("i-modelo").onclick = e => { e.preventDefault(); baixarModelo(); };
}
