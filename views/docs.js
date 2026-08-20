import { dados, docsLocais, gravar, gravarLocal, cfg, estaConectado } from "../store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast,
         comprimirImagem, lerArquivo, pesoDataURL, kb, dataBR } from "../util.js";

/* docs sincronizados: dados.docs/{id}
   docs só do aparelho: docsLocais/{id}
   { titulo, tipo, dono, num, validade, nota, arq:{d,mime,nome}, local:bool, t, w } */

const TIPOS = ["Passaporte","RG / CNH","Passagem aérea","Seguro viagem","Reserva","Vacinação","Outro"];
const LIMITE = 1200 * 1024;

function todos(){
  const s = Object.entries(dados.docs).map(([id, d]) => ({ id, ...d, local:false }));
  const l = Object.entries(docsLocais).map(([id, d]) => ({ id, ...d, local:true }));
  return [...s, ...l].sort((a,b) =>
    TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo) || (a.titulo||"").localeCompare(b.titulo||""));
}

function form(d){
  return `
    ${campo("x-tit", "Título", "text", d?.titulo || "", 'maxlength="60" placeholder="Passaporte do Pedro"')}
    <label for="x-tipo">Tipo</label>
    <select id="x-tipo">${TIPOS.map(t =>
      `<option ${d?.tipo===t?"selected":""}>${esc(t)}</option>`).join("")}</select>
    ${campo("x-dono", "De quem", "text", d?.dono || "", 'maxlength="30" placeholder="Pedro"')}
    ${campo("x-num", "Número / código", "text", d?.num || "", 'maxlength="40"')}
    ${campo("x-val", "Validade (opcional)", "date", d?.validade || "")}
    ${campo("x-nota", "Observações", "textarea", d?.nota || "", 'maxlength="400"')}
    <label for="x-arq">Arquivo (foto ou PDF)</label>
    <input id="x-arq" type="file" accept="image/*,application/pdf">
    ${d?.arq ? `<p class="conf">Já tem arquivo anexado: ${esc(d.arq.nome || "arquivo")} · ${kb(pesoDataURL(d.arq.d))}. Escolher outro substitui.</p>` : ""}
    <div class="onde">
      <label class="radio"><input type="radio" name="x-onde" value="local" ${d?.local !== false ? "checked":""}>
        <span><b>Só neste aparelho</b><small>Não sobe para a nuvem. Mais seguro para passaporte e RG, mas sua esposa não vê.</small></span></label>
      <label class="radio"><input type="radio" name="x-onde" value="nuvem" ${d?.local === false ? "checked":""}>
        <span><b>Sincronizar com o outro celular</b><small>Fica visível para quem tiver o código do casal. Bom para passagens e vouchers.</small></span></label>
    </div>`;
}

async function processarArquivo(input, anterior){
  const f = input.files[0];
  if(!f) return anterior || null;
  if(f.type.startsWith("image/")){
    let d = await comprimirImagem(f, 1800, 0.75);
    if(pesoDataURL(d) > LIMITE) d = await comprimirImagem(f, 1300, 0.62);
    if(pesoDataURL(d) > LIMITE) throw new Error("Imagem grande demais mesmo comprimida. Tente fotografar de novo, mais de perto.");
    return { d, mime:"image/jpeg", nome: f.name };
  }
  if(f.type === "application/pdf"){
    if(f.size > LIMITE) throw new Error(`PDF de ${kb(f.size)}. O limite aqui é ${kb(LIMITE)} — tire um print da página que interessa.`);
    return { d: await lerArquivo(f), mime:"application/pdf", nome: f.name };
  }
  throw new Error("Só aceito imagem ou PDF.");
}

function ler(back){
  return {
    titulo:   back.querySelector("#x-tit").value.trim(),
    tipo:     back.querySelector("#x-tipo").value,
    dono:     back.querySelector("#x-dono").value.trim(),
    num:      back.querySelector("#x-num").value.trim(),
    validade: back.querySelector("#x-val").value,
    nota:     back.querySelector("#x-nota").value.trim()
  };
}

function novo(){
  modal({
    titulo: "Novo documento", corpo: form(null), salvar: "Salvar",
    onSalvar: async back => {
      const v = ler(back);
      if(!v.titulo){ toast("Dê um título ao documento."); return false; }
      toast("Processando arquivo…");
      const arq = await processarArquivo(back.querySelector("#x-arq"), null);
      const naNuvem = back.querySelector('input[name="x-onde"]:checked').value === "nuvem";
      const reg = { ...v, arq, t: agora(), w: cfg.name || "" };
      if(naNuvem){
        if(!estaConectado()){ toast("Conecte-se antes de sincronizar um documento."); return false; }
        await gravar("docs", "d" + uid(), reg);
      } else {
        await gravarLocal("d" + uid(), reg);
      }
      toast("Documento salvo");
    }
  });
}

function editar(doc){
  modal({
    titulo: "Editar documento", corpo: form(doc),
    onSalvar: async back => {
      const v = ler(back);
      if(!v.titulo){ toast("O título é obrigatório."); return false; }
      const arq = await processarArquivo(back.querySelector("#x-arq"), doc.arq);
      const naNuvem = back.querySelector('input[name="x-onde"]:checked').value === "nuvem";
      const reg = { ...v, arq, t: agora(), w: cfg.name || "" };

      /* mudou de lugar? remove do antigo */
      if(naNuvem && doc.local){
        if(!estaConectado()){ toast("Conecte-se antes de sincronizar."); return false; }
        await gravarLocal(doc.id, null);
        await gravar("docs", doc.id, reg);
      } else if(!naNuvem && !doc.local){
        await gravar("docs", doc.id, null);
        await gravarLocal(doc.id, reg);
      } else if(naNuvem){
        await gravar("docs", doc.id, reg);
      } else {
        await gravarLocal(doc.id, reg);
      }
    },
    extra: { label:"Excluir", onClick: async () => {
      if(!await confirmar(`Excluir "${doc.titulo}"?`)) return;
      if(doc.local) await gravarLocal(doc.id, null);
      else await gravar("docs", doc.id, null);
      toast("Documento excluído");
    }}
  });
}

function abrir(doc){
  if(!doc.arq) return editar(doc);
  if(doc.arq.mime === "application/pdf"){
    const w = window.open();
    if(w) w.document.write(`<iframe src="${doc.arq.d}" style="border:0;width:100%;height:100%;position:fixed;inset:0"></iframe>`);
    else toast("O navegador bloqueou a nova aba.");
    return;
  }
  modal({
    titulo: doc.titulo,
    corpo: `<img class="foto-grande" src="${doc.arq.d}" alt="">
            <p class="conf">${esc(doc.arq.nome || "")} · ${kb(pesoDataURL(doc.arq.d))}</p>`,
    salvar: "Fechar", onSalvar: () => {}
  });
}

export function render(el){
  const lista = todos();
  el.innerHTML = `<div class="aviso-doc">
    <b>Sobre guardar passaporte e RG aqui</b>
    Documentos marcados como <b>“só neste aparelho”</b> nunca saem do celular — nem para a nuvem, nem para o outro celular.
    Os marcados como <b>sincronizar</b> ficam legíveis para quem souber o código do casal. Para passagens e vouchers, sincronizar é prático.
    Para documento de identidade, o padrão local é a escolha mais prudente.
  </div>`;

  if(!lista.length){
    el.insertAdjacentHTML("beforeend", `<div class="vazio">
      <p>Nenhum documento guardado.</p>
      <small>Fotos de passaporte, passagens, apólice do seguro, comprovantes. Tudo abre offline.</small>
    </div>`);
  }

  let tipoAtual = null;
  lista.forEach(doc => {
    if(doc.tipo !== tipoAtual){
      tipoAtual = doc.tipo;
      const h = document.createElement("p");
      h.className = "cidade-sep";
      h.textContent = doc.tipo;
      el.appendChild(h);
    }
    const card = document.createElement("section");
    card.className = "card doc";
    const venc = doc.validade ? dataBR(doc.validade) : "";
    card.innerHTML = `
      <div class="doc-row">
        <div class="doc-thumb ${doc.arq ? "" : "sem"}">
          ${doc.arq
            ? (doc.arq.mime === "application/pdf"
                ? `<span class="pdf">PDF</span>`
                : `<img src="${doc.arq.d}" alt="" loading="lazy">`)
            : `<span class="pdf">—</span>`}
        </div>
        <div class="doc-txt">
          <h2>${esc(doc.titulo)}</h2>
          <span class="when">${esc(doc.dono || "")}${doc.num ? ` · ${esc(doc.num)}` : ""}</span>
          ${venc ? `<span class="when">válido até ${esc(venc)}</span>` : ""}
          ${doc.nota ? `<p class="nota">${nl(doc.nota)}</p>` : ""}
          <span class="tag ${doc.local ? "opt" : ""}">${doc.local ? "só neste aparelho" : "sincronizado"}</span>
        </div>
        <button class="mini" aria-label="Editar">✎</button>
      </div>`;
    card.querySelector(".doc-thumb").onclick = () => abrir(doc);
    card.querySelector(".doc-txt").onclick = () => abrir(doc);
    card.querySelector(".mini").onclick = e => { e.stopPropagation(); editar(doc); };
    el.appendChild(card);
  });

  const add = document.createElement("button");
  add.className = "add-grande";
  add.textContent = "+ novo documento";
  add.onclick = novo;
  el.appendChild(add);
}
