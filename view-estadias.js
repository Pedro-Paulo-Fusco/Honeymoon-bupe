import { dados, gravar, cfg } from "./store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast,
         dataBR, noites, comprimirImagem, pesoDataURL, kb } from "./util.js";

/* estadias/{id} = { n, cidade, end, entrada, saida, ref, tel, nota, fotos:{fid:{d}}, t, w } */

const LIMITE_FOTO = 900 * 1024;   // por foto, depois de comprimir

const ordenadas = () => Object.entries(dados.estadias)
  .map(([id, e]) => ({ id, ...e }))
  .sort((a,b) => (a.entrada||"9").localeCompare(b.entrada||"9"));

const mapaURL = e => "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent([e.n, e.end, e.cidade].filter(Boolean).join(", "));

function form(e){
  return `
    ${campo("h-n", "Nome da hospedagem", "text", e?.n || "", 'maxlength="70" placeholder="Pontevecchio Relais"')}
    ${campo("h-cidade", "Cidade", "text", e?.cidade || "", 'maxlength="40" placeholder="Roma"')}
    ${campo("h-end", "Endereço", "textarea", e?.end || "", 'maxlength="200" placeholder="Via dei Coronari, 12 — 00186"')}
    <div class="dupla">
      <div>${campo("h-in", "Check-in", "date", e?.entrada || "")}</div>
      <div>${campo("h-out", "Check-out", "date", e?.saida || "")}</div>
    </div>
    ${campo("h-ref", "Código da reserva", "text", e?.ref || "", 'maxlength="40"')}
    ${campo("h-tel", "Telefone / contato", "text", e?.tel || "", 'maxlength="40"')}
    ${campo("h-nota", "Observações", "textarea", e?.nota || "", 'maxlength="600" placeholder="Café da manhã até 10h, chave no cofre, andar sem elevador…"')}`;
}

function ler(back){
  return {
    n:       back.querySelector("#h-n").value.trim(),
    cidade:  back.querySelector("#h-cidade").value.trim(),
    end:     back.querySelector("#h-end").value.trim(),
    entrada: back.querySelector("#h-in").value,
    saida:   back.querySelector("#h-out").value,
    ref:     back.querySelector("#h-ref").value.trim(),
    tel:     back.querySelector("#h-tel").value.trim(),
    nota:    back.querySelector("#h-nota").value.trim()
  };
}

function nova(){
  modal({
    titulo: "Nova hospedagem", corpo: form(null), salvar: "Adicionar",
    onSalvar: async back => {
      const v = ler(back);
      if(!v.n){ toast("Dê um nome à hospedagem."); return false; }
      await gravar("estadias", "h" + uid(), { ...v, fotos:{}, t: agora(), w: cfg.name || "" });
      toast("Hospedagem salva");
    }
  });
}

function editar(e){
  modal({
    titulo: "Editar hospedagem", corpo: form(e),
    onSalvar: async back => {
      const v = ler(back);
      if(!v.n){ toast("O nome é obrigatório."); return false; }
      await gravar("estadias", e.id, { ...dados.estadias[e.id], ...v, t: agora() });
    },
    extra: { label:"Excluir", onClick: async () => {
      if(!await confirmar(`Excluir "${e.n}" e as fotos dela?`)) return;
      await gravar("estadias", e.id, null); toast("Hospedagem excluída");
    }}
  });
}

async function addFotos(id, files){
  const e = dados.estadias[id];
  const fotos = { ...(e.fotos || {}) };
  let ok = 0, pulou = 0;
  for(const f of files){
    if(!f.type.startsWith("image/")){ pulou++; continue; }
    try{
      let d = await comprimirImagem(f, 1400, 0.7);
      if(pesoDataURL(d) > LIMITE_FOTO) d = await comprimirImagem(f, 1000, 0.6);
      if(pesoDataURL(d) > LIMITE_FOTO){ pulou++; continue; }
      fotos["f" + uid()] = { d, t: agora() };
      ok++;
    }catch(err){ console.error(err); pulou++; }
  }
  if(ok) await gravar("estadias", id, { ...e, fotos, t: agora() });
  toast(ok ? `${ok} foto${ok>1?"s":""} adicionada${ok>1?"s":""}` + (pulou?` · ${pulou} ignorada${pulou>1?"s":""}`:"")
           : "Nenhuma foto foi adicionada");
}

function verFoto(estadiaId, fid){
  const e = dados.estadias[estadiaId];
  const f = e.fotos[fid];
  modal({
    titulo: e.n,
    corpo: `<img class="foto-grande" src="${f.d}" alt="">
            <p class="conf">Peso: ${kb(pesoDataURL(f.d))}</p>`,
    salvar: "Fechar",
    onSalvar: () => {},
    extra: { label:"Excluir foto", onClick: async () => {
      const fotos = { ...(e.fotos || {}) }; delete fotos[fid];
      await gravar("estadias", estadiaId, { ...e, fotos, t: agora() });
      toast("Foto excluída");
    }}
  });
}

export function render(el){
  const lista = ordenadas();
  el.innerHTML = "";

  if(!lista.length){
    el.innerHTML = `<div class="vazio">
      <p>Nenhuma hospedagem cadastrada.</p>
      <small>Guarde aqui endereço, datas, código da reserva e fotos do lugar — fica tudo acessível mesmo sem internet.</small>
    </div>`;
  }

  lista.forEach(e => {
    const fotos = Object.entries(e.fotos || {}).map(([id, f]) => ({ id, ...f }));
    const nts = noites(e.entrada, e.saida);
    const card = document.createElement("section");
    card.className = "card estadia";
    card.innerHTML = `
      <div class="est-head">
        <div>
          <h2>${esc(e.n)}</h2>
          ${e.cidade ? `<span class="when">${esc(e.cidade)}</span>` : ""}
        </div>
        <button class="mini" aria-label="Editar">✎</button>
      </div>
      ${(e.entrada || e.saida) ? `<div class="datas">
        <span><small>entrada</small><b>${esc(dataBR(e.entrada) || "—")}</b></span>
        <span class="seta">→</span>
        <span><small>saída</small><b>${esc(dataBR(e.saida) || "—")}</b></span>
        ${nts ? `<span class="nts">${nts} noite${nts>1?"s":""}</span>` : ""}
      </div>` : ""}
      ${e.end ? `<p class="end">${nl(e.end)}</p>` : ""}
      <div class="linhas">
        ${e.ref ? `<div class="linha"><small>reserva</small><b class="mono">${esc(e.ref)}</b></div>` : ""}
        ${e.tel ? `<div class="linha"><small>contato</small><a href="tel:${esc(e.tel.replace(/[^+\d]/g,""))}">${esc(e.tel)}</a></div>` : ""}
      </div>
      ${e.nota ? `<p class="nota">${nl(e.nota)}</p>` : ""}
      ${fotos.length ? `<div class="tira">${fotos.map(f =>
        `<img src="${f.d}" alt="" data-f="${f.id}" loading="lazy">`).join("")}</div>` : ""}
      <div class="acoes">
        ${(e.end || e.n) ? `<a class="acao" href="${mapaURL(e)}" target="_blank" rel="noopener">Abrir no mapa</a>` : ""}
        <label class="acao">Adicionar fotos
          <input type="file" accept="image/*" multiple hidden>
        </label>
      </div>`;

    card.querySelector(".est-head .mini").onclick = () => editar(e);
    card.querySelectorAll(".tira img").forEach(img => {
      img.onclick = () => verFoto(e.id, img.dataset.f);
    });
    const input = card.querySelector('input[type="file"]');
    input.onchange = async () => {
      if(input.files.length){ toast("Comprimindo…"); await addFotos(e.id, [...input.files]); }
      input.value = "";
    };
    el.appendChild(card);
  });

  const add = document.createElement("button");
  add.className = "add-grande";
  add.textContent = "+ nova hospedagem";
  add.onclick = nova;
  el.appendChild(add);
}
