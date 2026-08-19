/* ═══════ utilidades gerais ═══════ */

export const $  = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

export const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

/* quebra de linha preservada em textos livres */
export const nl = s => esc(s).replace(/\n/g, "<br>");

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const agora = () => Date.now();

/* ── datas ── */
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIAS  = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

export function dataBR(iso){
  if(!iso) return "";
  const [Y,M,D] = iso.split("-").map(Number);
  if(!Y) return iso;
  return `${String(D).padStart(2,"0")} ${MESES[M-1]}`;
}
export function diaSemana(iso){
  if(!iso) return "";
  const [Y,M,D] = iso.split("-").map(Number);
  if(!Y) return "";
  return DIAS[new Date(Y, M-1, D).getDay()];
}
export function noites(inIso, outIso){
  if(!inIso || !outIso) return 0;
  const a = new Date(inIso), b = new Date(outIso);
  const n = Math.round((b - a) / 864e5);
  return n > 0 ? n : 0;
}

/* ── tamanho legível ── */
export const kb = bytes => bytes > 1048576
  ? (bytes/1048576).toFixed(1) + " MB"
  : Math.round(bytes/1024) + " KB";

/* peso aproximado de uma data URL base64 */
export const pesoDataURL = d => Math.round((d.length - (d.indexOf(",")+1)) * 0.75);

/* ═══════ compressão de imagem no próprio aparelho ═══════ */
export function comprimirImagem(file, maxLado = 1500, q = 0.72){
  return new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onerror = () => erro(new Error("Não consegui ler o arquivo"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => erro(new Error("Arquivo de imagem inválido"));
      img.onload = () => {
        let { width:w, height:h } = img;
        const escala = Math.min(1, maxLado / Math.max(w, h));
        w = Math.round(w * escala); h = Math.round(h * escala);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        ok(c.toDataURL("image/jpeg", q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function lerArquivo(file){
  return new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onerror = () => erro(new Error("Não consegui ler o arquivo"));
    fr.onload = () => ok(fr.result);
    fr.readAsDataURL(file);
  });
}

/* ═══════ modal ═══════ */
let modalAtual = null;

export function modal({ titulo, corpo, salvar = "Salvar", onSalvar, extra }){
  fecharModal();
  const back = document.createElement("div");
  back.className = "backdrop";
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-head">
        <h3>${esc(titulo)}</h3>
        <button class="x" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">${corpo}</div>
      <div class="modal-foot">
        ${extra ? `<button class="btn danger" data-extra>${esc(extra.label)}</button>` : ""}
        <button class="btn ghost" data-cancel>Cancelar</button>
        <button class="btn" data-ok>${esc(salvar)}</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  document.body.style.overflow = "hidden";
  modalAtual = back;

  const fechar = () => fecharModal();
  back.querySelector(".x").onclick = fechar;
  back.querySelector("[data-cancel]").onclick = fechar;
  back.onclick = e => { if(e.target === back) fechar(); };
  if(extra) back.querySelector("[data-extra]").onclick = async () => {
    await extra.onClick(); fechar();
  };
  back.querySelector("[data-ok]").onclick = async () => {
    const btn = back.querySelector("[data-ok]");
    btn.disabled = true; btn.textContent = "Salvando…";
    try{
      const r = await onSalvar(back);
      if(r !== false) fechar();
      else { btn.disabled = false; btn.textContent = salvar; }
    }catch(e){
      console.error(e);
      btn.disabled = false; btn.textContent = salvar;
      alerta(e.message || "Não deu certo. Tente de novo.");
    }
  };
  document.addEventListener("keydown", escKey);
  setTimeout(() => { const f = back.querySelector("input,textarea,select"); if(f) f.focus(); }, 60);
  return back;
}
function escKey(e){ if(e.key === "Escape") fecharModal(); }
export function fecharModal(){
  if(modalAtual){ modalAtual.remove(); modalAtual = null; }
  document.body.style.overflow = "";
  document.removeEventListener("keydown", escKey);
}

/* ═══════ avisos ═══════ */
let toastT = null;
export function toast(msg){
  let t = $("#toast");
  if(!t){
    t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800);
}
export const alerta = msg => toast(msg);

export function confirmar(msg){
  return new Promise(ok => {
    modal({
      titulo: "Confirmar",
      corpo: `<p class="conf">${esc(msg)}</p>`,
      salvar: "Sim, continuar",
      onSalvar: () => { ok(true); }
    });
    const back = modalAtual;
    back.querySelector("[data-cancel]").addEventListener("click", () => ok(false));
    back.querySelector(".x").addEventListener("click", () => ok(false));
  });
}

/* campo de formulário */
export const campo = (id, label, tipo = "text", valor = "", extra = "") =>
  `<label for="${id}">${esc(label)}</label>
   ${tipo === "textarea"
     ? `<textarea id="${id}" rows="3" ${extra}>${esc(valor)}</textarea>`
     : `<input id="${id}" type="${tipo}" value="${esc(valor)}" ${extra}>`}`;
