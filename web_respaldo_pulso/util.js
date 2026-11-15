/* NORTEX — utilidades compartidas: formato, etiquetas de estado y procedencia a un toque. */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
  '"': "&quot;", "'": "&#39;" }[c]));
export const num = (x, d = 0) => (x == null || Number.isNaN(Number(x)) ? "—"
  : Number(x).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)} %`);
export const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const NOMBRES = { arroz: "Arroz", caupi: "Frijol caupí", maiz: "Maíz amarillo duro", mango: "Mango",
                         limon_sutil: "Limón sutil" };
export const ESCENARIOS = {
  deficit_bajo: { nombre: "Déficit bajo", p: "P10" },
  deficit_medio: { nombre: "Déficit medio", p: "P50" },
  deficit_alto: { nombre: "Déficit alto", p: "P90" },
};
export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                            "septiembre", "octubre", "noviembre", "diciembre"];

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
  String(d.getDate()).padStart(2, "0")}`;
export const deIso = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
export const masDias = (s, n) => { const d = typeof s === "string" ? deIso(s) : new Date(s);
  d.setDate(d.getDate() + n); return iso(d); };
export const fechaCorta = (s) => { const d = deIso(s); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };

/** Clase de color de un estado (verde, ámbar, rojo, gris, azul). El texto siempre acompaña al color. */
export function tono(t) {
  const s = String(t ?? "").toLowerCase();
  if (/con restricciones|medio|media|ejemplo|aproximado|provisional|por validar|condicionante/.test(s)) return "ambar";
  if (/no viable|alto|falta|limitada|débil|error|agotado/.test(s)) return "rojo";
  if (/por determinar|sin |—/.test(s) || !s) return "gris";
  if (/informativa|info/.test(s)) return "azul";
  if (/viable|bajo|ok|alta|buena|validado|terminad/.test(s)) return "verde";
  return "gris";
}
export const etq = (t, c) => `<span class="etq ${c ?? tono(t)}">${esc(t)}</span>`;

/** ¿El dato es real, de ejemplo o por validar? Se deduce del texto de la fuente que da la API. */
export function estadoDato(fuente) {
  const s = String(fuente ?? "");
  if (!s || /sin fuente|por determinar/i.test(s)) return "por determinar";
  if (/ejemplo/i.test(s)) return "ejemplo";
  if (/POR[_ ]VALIDAR|POR VERIFICAR|por defecto|ingresad[oa]|^parámetro$/i.test(s)) return "por validar";
  return "real";
}

/** Cifra con su procedencia a un toque. `info`: {titulo, fuente, categoria, nota, estado}. */
export function dato(texto, info = {}) {
  const estado = info.estado ?? estadoDato(info.fuente);
  const cls = estado === "real" ? "" : " dato-debil";
  return `<button type="button" class="dato${cls}" data-proc="${esc(JSON.stringify({ ...info, estado, valor: texto }))}"
    aria-label="${esc(`${info.titulo ?? "Dato"}: ${texto}. Ver de dónde sale`)}">${esc(texto)}</button>`;
}
/** Cifra de `resultados` (objeto {valor, unidad, categoria, fuente, nota}) con su procedencia. */
export function datoRes(r, titulo, { d = 0, factor = 1, unidad, comoPct = false } = {}) {
  if (!r || r.valor == null) return dato("por determinar", { titulo, fuente: r?.fuente ?? "la API no devolvió este dato",
    nota: r?.nota, categoria: r?.categoria, estado: "por determinar" });
  const u = unidad ?? (r.unidad && r.unidad !== "-" ? r.unidad : "");
  const texto = typeof r.valor !== "number" ? String(r.valor) : comoPct ? pct(r.valor) : `${num(r.valor * factor, d)}${u ? ` ${u}` : ""}`;
  return dato(texto, { titulo, fuente: r.fuente, categoria: r.categoria, nota: r.nota });
}

export function mensaje(el, texto, tipo = "") { el.className = `mensaje ${tipo}`; el.textContent = texto; }
export const cargando = (t) => `<p class="cargando" role="status"><span class="latido" aria-hidden="true"></span>${esc(t)}</p>`;
export const errorHtml = (e) => `<div class="aviso rojo" role="alert">${esc(e.message ?? e)}</div>`;

/* --- Panel de procedencia (uno para toda la página) --------------------------------------------- */
let ancla = null;
function cerrarProc() { const p = $("#proc"); if (!p.hidden) { p.hidden = true; ancla?.focus?.(); ancla = null; } }
document.addEventListener("click", (ev) => {
  const b = ev.target.closest?.("[data-proc]");
  const p = $("#proc");
  if (!b) { if (!ev.target.closest?.("#proc")) cerrarProc(); return; }
  let i; try { i = JSON.parse(b.dataset.proc); } catch { return; }
  ancla = b;
  const estado = i.estado && i.estado !== "real" ? etq(i.estado === "ejemplo" ? "dato de ejemplo" : i.estado,
    i.estado === "por determinar" ? "gris" : "ambar") : etq("dato real o calculado", "verde");
  p.innerHTML = `<button type="button" class="cerrar" aria-label="Cerrar">×</button>
    <h3>${esc(i.titulo ?? "Dato")}</h3><p class="proc-valor">${esc(i.valor)}</p>
    <p>${estado}${i.categoria ? ` ${etq(i.categoria, "azul")}` : ""}</p>
    <p><b>De dónde sale:</b> ${esc(i.fuente ?? "sin fuente declarada por la API")}</p>
    ${i.nota ? `<p class="ayuda">${esc(i.nota)}</p>` : ""}`;
  p.hidden = false;
  const r = b.getBoundingClientRect();
  if (innerWidth > 700) {
    p.style.left = `${Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 12))}px`;
    const abajo = r.bottom + 8 + p.offsetHeight < innerHeight;
    p.style.top = `${abajo ? r.bottom + 8 : Math.max(8, r.top - p.offsetHeight - 8)}px`;
    p.style.bottom = "auto";
  } else { p.style.left = p.style.top = ""; p.style.bottom = ""; }
  $(".cerrar", p).focus();
});
document.addEventListener("click", (ev) => { if (ev.target.closest?.("#proc .cerrar")) cerrarProc(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrarProc(); });
addEventListener("scroll", () => { if (innerWidth > 700) { const p = $("#proc"); if (p && !p.hidden) { p.hidden = true; ancla = null; } } },
  { passive: true });
