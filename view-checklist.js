import { TAPPE } from "./data.js";
import { dados, gravar, gravarLote, cfg } from "./store.js";
import { esc, nl, uid, agora, modal, campo, confirmar, toast } from "./util.js";

const FASE_EXTRA = "extras";

/* junta itens fixos + criados por vocês */
function fases(){
  const lista = TAPPE.map((t, i) => ({
    id: String(i), titulo: t.t, quando: t.w,
    items: t.items.map(it => ({ ...it, fixo:true }))
  }));
  lista.push({ id: FASE_EXTRA, titulo: "Outras coisas nossas", quando: "sem prazo definido", items: [] });

  for(const id in dados.extra){
    const e = dados.extra[id];
    const f = lista.find(x => x.id === String(e.fase)) || lista[lista.length-1];
    f.items.push({ id, p:e.p, s:e.s, fixo:false, criadoPor:e.w });
  }
  return lista;
}

export function progresso(){
  const f = fases();
  const todos = f.flatMap(x => x.items);
  const feitos = todos.filter(it => dados.items[it.id]?.v).length;
  return { feitos, total: todos.length };
}

async function alternar(id, marcado){
  await gravar("items", id, { v: !marcado, t: agora(), w: cfg.name || "" });
}

function formItem(fase, item){
  return `
    ${campo("f-p", "O que precisa ser feito", "text", item?.p || "", 'maxlength="120" placeholder="Comprar adaptador de tomada"')}
    ${campo("f-s", "Detalhe (opcional)", "textarea", item?.s || "", 'maxlength="500" placeholder="Onde comprar, prazo, quem fica responsável…"')}
    <label for="f-fase">Em qual etapa</label>
    <select id="f-fase">
      ${fases().map(f => `<option value="${f.id}" ${String(fase)===f.id?"selected":""}>${esc(f.titulo)}</option>`).join("")}
    </select>`;
}

function novoItem(faseId){
  modal({
    titulo: "Novo item do checklist",
    corpo: formItem(faseId, null),
    salvar: "Adicionar",
    onSalvar: async back => {
      const p = back.querySelector("#f-p").value.trim();
      if(!p){ toast("Escreva o que precisa ser feito."); return false; }
      const id = "x" + uid();
      await gravar("extra", id, {
        p, s: back.querySelector("#f-s").value.trim(),
        fase: back.querySelector("#f-fase").value,
        t: agora(), w: cfg.name || ""
      });
      toast("Item adicionado");
    }
  });
}

function editarItem(item){
  const e = dados.extra[item.id];
  modal({
    titulo: "Editar item",
    corpo: formItem(e.fase, e),
    onSalvar: async back => {
      const p = back.querySelector("#f-p").value.trim();
      if(!p){ toast("O item precisa de um título."); return false; }
      await gravar("extra", item.id, {
        ...e, p, s: back.querySelector("#f-s").value.trim(),
        fase: back.querySelector("#f-fase").value, t: agora()
      });
    },
    extra: {
      label: "Excluir",
      onClick: async () => {
        if(!await confirmar("Excluir este item do checklist?")) return;
        await gravar("extra", item.id, null);
        await gravar("items", item.id, null);
        toast("Item excluído");
      }
    }
  });
}

export function render(el){
  const lista = fases();
  el.innerHTML = "";

  lista.forEach((fase, i) => {
    if(fase.id === FASE_EXTRA && !fase.items.length) { /* mostra mesmo vazia, com o botão */ }
    const feitos = fase.items.filter(it => dados.items[it.id]?.v).length;
    const pronto = fase.items.length > 0 && feitos === fase.items.length;

    const sec = document.createElement("section");
    sec.className = "tappa" + (pronto ? " done" : " open");

    const head = document.createElement("button");
    head.className = "head";
    head.setAttribute("aria-expanded", pronto ? "false" : "true");
    head.innerHTML =
      `<span class="num">${fase.id === FASE_EXTRA ? "+" : i+1}</span>
       <span class="head-txt"><h2>${esc(fase.titulo)}</h2><span class="when">${esc(fase.quando)}</span></span>
       <span class="pill">${fase.items.length ? (pronto ? "tudo pronto" : feitos+"/"+fase.items.length) : "vazio"}</span>
       <span class="chev"></span>`;
    head.onclick = () => {
      const ab = sec.classList.toggle("open");
      head.setAttribute("aria-expanded", ab ? "true" : "false");
    };
    sec.appendChild(head);

    const body = document.createElement("div");
    body.className = "body";

    fase.items.forEach(it => {
      const on = !!dados.items[it.id]?.v;
      const quem = on && dados.items[it.id].w ? dados.items[it.id].w : "";
      const row = document.createElement("div");
      row.className = "item" + (on ? " on" : "");
      row.innerHTML =
        `<span class="box" tabindex="0" role="checkbox" aria-checked="${on}"></span>
         <span class="txt"><p>${esc(it.p)}</p>
           ${it.s ? `<small>${nl(it.s)}</small>` : ""}
           ${quem ? `<span class="by">✓ ${esc(quem)}</span>` : ""}
           ${it.tag ? `<span class="tag ${it.cls||""}">${esc(it.tag)}</span>` : ""}
           ${!it.fixo ? `<span class="tag opt">nosso</span>` : ""}
         </span>
         ${!it.fixo ? `<button class="mini" aria-label="Editar">✎</button>` : ""}`;

      const box = row.querySelector(".box");
      const marcar = () => alternar(it.id, on);
      box.onclick = marcar;
      box.onkeydown = e => { if(e.key===" "||e.key==="Enter"){ e.preventDefault(); marcar(); } };
      row.querySelector(".txt").onclick = marcar;
      const bt = row.querySelector(".mini");
      if(bt) bt.onclick = e => { e.stopPropagation(); editarItem(it); };
      body.appendChild(row);
    });

    const add = document.createElement("button");
    add.className = "add-inline";
    add.textContent = "+ adicionar item nesta etapa";
    add.onclick = () => novoItem(fase.id);
    body.appendChild(add);

    sec.appendChild(body);
    el.appendChild(sec);
  });
}
