/* NORTEX — director de escena.
 *
 * Flujo invertido «decisión primero, satélite después»:
 *
 *   PORTAL ──puerta──► VUELO ORBITAL (solo la primera vez; mientras dura, la consulta real a
 *      │                la API ya está en camino: los haces son el indicador de carga)
 *      │                         │
 *      ├──► LABORATORIO F2  ¿qué siembro?   POST /evaluar/f2 (los 5 cultivos del catálogo)
 *      ├──► TIEMPO F1       ¿cuándo?        POST /evaluar/f1 (12 ventanas, una por mes)
 *      ├──► SECUENCIA       3 campañas      3 × POST /evaluar/f2 con historial acumulado
 *      └──► ÓRBITA          mi parcela      /parcelas, /fuentes, /serie/power, /serie/enso, /faltantes…
 *
 * Este módulo guarda el estado compartido, enruta por hash (#que, #cuando, #secuencia, #parcela),
 * lee los Ajustes (que viajan tal cual a la API) y arranca cada escena con un contexto `ctx`.
 * Cada escena expone {entrar, salir, refrescar} y se hace cargo de sus propias llamadas. */

import { api, leer, olvidar, API } from "./api.js";
import { $, $$, esc, iso, masDias, num, emitir, escuchar, reducido } from "./util.js";
import { crearAmbiente } from "./visuales/ambiente.js";
import { crearPortal } from "./escenas/portal.js";
import { crearLaboratorio } from "./escenas/laboratorio.js";
import { crearTiempo } from "./escenas/tiempo.js";
import { crearSecuencia } from "./escenas/secuencia.js";
import { crearOrbita } from "./escenas/orbita.js";
import { iniciarDemo } from "./demo.js";

const hoy = iso(new Date());
export const estado = {
  parcela: localStorage.getItem("nortexParcela") || "",
  parcelas: [], cultivos: [], economia: [], modelos: [],
  cultivo: "caupi", escenario: "deficit_medio",
  inicio: masDias(hoy, 30),          // fecha de siembra de F2 (editable en Ajustes)
  escena: "portal", version: 0,      // `version` sube cuando cambian parcela, datos o ajustes
  volado: false,                     // ¿ya se hizo el vuelo orbital en esta visita?
};

const HASH = { portal: "", laboratorio: "que", tiempo: "cuando", secuencia: "secuencia", orbita: "parcela" };
const DESDE_HASH = Object.fromEntries(Object.entries(HASH).map(([k, v]) => [v, k]));
const ambiente = crearAmbiente($("#ambiente"));
const escenas = {};

/* ---- Ajustes → cuerpo de la consulta ------------------------------------------------------------ */
const formAjustes = $("#form-ajustes");
/** Opciones que acepta la API (modelo `Opciones` de main.py). Campo vacío = no se envía. */
function opciones() {
  const o = {};
  for (const k of ["eficiencia", "umbral_calor_c", "dotacion_m3_ha", "intervalo_dias", "area_ha"]) {
    const v = formAjustes.elements[k].value; if (v !== "") o[k] = Number(v);
  }
  if (formAjustes.elements.condicion_enso.value) o.condicion_enso = formAjustes.elements.condicion_enso.value;
  return o;
}
function sincronizarControles() {
  if ($("#lab-inicio")) $("#lab-inicio").value = estado.inicio;
  if ($("#lab-riego")) $("#lab-riego").value = formAjustes.elements.eficiencia.value;
  if ($("#lab-enso")) $("#lab-enso").value = formAjustes.elements.condicion_enso.value;
}
function invalidar() { estado.version++; sincronizarControles(); emitir("invalidar"); }
function alCambiarAjustes() {
  estado.inicio = $("#aj-inicio").value || estado.inicio;
  invalidar(); escenas[estado.escena]?.refrescar?.();
}
let rebote;
formAjustes.addEventListener("input", (ev) => {
  if (ev.target.id === "sel-parcela") return;
  clearTimeout(rebote); rebote = setTimeout(alCambiarAjustes, 450);
});
formAjustes.addEventListener("reset", () => setTimeout(() => { $("#sel-parcela").value = estado.parcela; $("#aj-inicio").value = estado.inicio; alCambiarAjustes(); }));
$("#sel-parcela").onchange = (e) => elegirParcela(e.target.value);
$("#orbita-parcela")?.addEventListener("change", (e) => elegirParcela(e.target.value));
$("#lab-inicio")?.addEventListener("change", (e) => { if (e.target.value) { $("#aj-inicio").value = e.target.value; alCambiarAjustes(); } });
$("#lab-riego")?.addEventListener("change", (e) => { formAjustes.elements.eficiencia.value = e.target.value; alCambiarAjustes(); });
$("#lab-enso")?.addEventListener("change", (e) => { formAjustes.elements.condicion_enso.value = e.target.value; alCambiarAjustes(); });
$("#lab-mas-ajustes")?.addEventListener("click", () => abrirAjustes(true));
function abrirAjustes(abrir = $("#ajustes").hidden) {
  $("#ajustes").hidden = !abrir; $("#btn-ajustes").setAttribute("aria-expanded", abrir);
  if (abrir) $("#sel-parcela").focus(); else $("#btn-ajustes").focus();
}
$("#btn-ajustes").onclick = () => abrirAjustes();
$("#ajustes-cerrar").onclick = () => abrirAjustes(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#ajustes").hidden) abrirAjustes(false); });

/* ---- Navegación entre escenas ------------------------------------------------------------------- */
function navegar(nombre, { silencioso = false } = {}) {
  if (!escenas[nombre]) nombre = "portal";
  const previa = estado.escena;
  if (previa !== nombre) escenas[previa]?.salir?.();
  estado.escena = nombre;
  document.body.dataset.escena = nombre;
  $$(".escena").forEach((s) => { const activa = s.id === `esc-${nombre}`; s.hidden = !activa; s.classList.toggle("activa", activa); });
  $$(".hud-nav [data-ir]").forEach((b) => b.toggleAttribute("aria-current", b.dataset.ir === nombre));
  ambiente.modo(nombre === "orbita" ? "orbita" : "dia");
  if (!silencioso) {
    const h = HASH[nombre]; if (location.hash.slice(1) !== h) history.pushState(null, "", h ? `#${h}` : location.pathname + location.search);
    scrollTo({ top: 0, behavior: "instant" });
    escenas[nombre].entrar?.();
  }
}
addEventListener("popstate", () => navegar(DESDE_HASH[location.hash.slice(1)] ?? "portal"));
document.addEventListener("click", (ev) => { const b = ev.target.closest("[data-ir]"); if (b) navegar(b.dataset.ir); });

/** Puerta del portal: la primera vez pasa por el vuelo orbital mientras la API evalúa de verdad. */
async function porLaPuerta(destino) {
  if (!estado.parcela) return navegar("orbita");
  if (estado.volado || reducido()) return navegar(destino);
  estado.volado = true;
  const consulta = escenas[destino].precargar?.();
  consulta?.catch(() => {});                         // el error lo mostrará la escena de destino
  navegar("orbita", { silencioso: true });
  await escenas.orbita.volar({ esperar: consulta });
  navegar(destino);
}

/* ---- Parcelas ----------------------------------------------------------------------------------- */
const parcelaActiva = () => estado.parcelas.find((p) => p.aoi_id === estado.parcela);
async function elegirParcela(id) {
  estado.parcela = id; localStorage.setItem("nortexParcela", id);
  $("#sel-parcela").value = id; if ($("#orbita-parcela")) $("#orbita-parcela").value = id;
  invalidar(); emitir("parcela");
  await escenas[estado.escena]?.refrescar?.();
}
async function cargarParcelas(id) {
  estado.parcelas = await api("/parcelas");
  const opcionesHtml = '<option value="">Elige tu chacra</option>' + estado.parcelas.map((p) =>
    `<option value="${esc(p.aoi_id)}">${esc(p.nombre)}</option>`).join("");
  $("#sel-parcela").innerHTML = opcionesHtml;
  if ($("#orbita-parcela")) $("#orbita-parcela").innerHTML = opcionesHtml;
  // Por defecto: la última usada; si no, la parcela de prueba `ejemplo_sl`; si no, la primera.
  const existe = (x) => estado.parcelas.some((p) => p.aoi_id === x);
  await elegirParcela(id ?? (existe(estado.parcela) ? estado.parcela : existe("ejemplo_sl") ? "ejemplo_sl" : estado.parcelas[0]?.aoi_id || ""));
}
/** Tras importar un CSV, validar un parámetro o descargar fuentes: todo lo guardado deja de valer. */
async function datosCambiaron() {
  olvidar(); invalidar();
  [estado.cultivos, estado.economia] = await Promise.all([api("/catalogo/cultivos"), api("/datos/economia").catch(() => [])]);
}

/* ---- Ambiente sonoro opcional (viento suave, Web Audio; apagado por defecto) -------------------- */
let audio = null;
$("#btn-sonido").onclick = () => {
  const b = $("#btn-sonido");
  if (audio) { audio.ctx.close(); audio = null; b.setAttribute("aria-pressed", "false"); return; }
  const ctx = new AudioContext(), n = ctx.sampleRate * 3, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let ult = 0; for (let i = 0; i < n; i++) { ult = (ult + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = ult * 3.5; }   // ruido marrón
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const filtro = ctx.createBiquadFilter(); filtro.type = "lowpass"; filtro.frequency.value = 420;
  const gan = ctx.createGain(); gan.gain.value = 0.16;
  const lfo = ctx.createOscillator(), prof = ctx.createGain(); lfo.frequency.value = 0.11; prof.gain.value = 0.09;   // ráfagas lentas
  lfo.connect(prof).connect(gan.gain); src.connect(filtro).connect(gan).connect(ctx.destination); src.start(); lfo.start();
  audio = { ctx }; b.setAttribute("aria-pressed", "true");
};

/* ---- Arranque ----------------------------------------------------------------------------------- */
const ctx = { estado, ambiente, navegar, porLaPuerta, opciones, elegirParcela, cargarParcelas, datosCambiaron, parcelaActiva, abrirAjustes,
  /** Fija los ajustes desde código (lo usa la demostración) y devuelve los anteriores. */
  fijarAjustes({ inicio, valores = {} } = {}) {
    const previo = { inicio: estado.inicio, valores: Object.fromEntries([...formAjustes.elements].filter((e) => e.name && e.name !== "parcela" && e.name !== "inicio").map((e) => [e.name, e.value])) };
    [...formAjustes.elements].forEach((e) => { if (e.name && e.name !== "parcela" && e.name !== "inicio") e.value = valores[e.name] ?? ""; });
    if (inicio) { estado.inicio = inicio; $("#aj-inicio").value = inicio; }
    invalidar(); return previo;
  } };

async function iniciar() {
  $("#aj-inicio").value = estado.inicio; $("#aj-inicio").min = hoy;
  $("#form-validacion [name=fecha]").value = hoy;
  Object.assign(escenas, { portal: crearPortal(ctx), laboratorio: crearLaboratorio(ctx), tiempo: crearTiempo(ctx),
    secuencia: crearSecuencia(ctx), orbita: crearOrbita(ctx) });
  try {
    const [salud, cultivos, modelos, economia] = await Promise.all([api("/salud"), api("/catalogo/cultivos"), api("/modelos"),
      api("/datos/economia").catch(() => [])]);
    Object.assign(estado, { cultivos, modelos, economia });
    $("#estado-api").textContent = salud.estado === "ok" ? "API en línea" : salud.estado;
    $("#estado-api").dataset.ok = salud.estado === "ok"; $("#estado-api").title = API;
    emitir("catalogo");
    await cargarParcelas();
  } catch (e) {
    $("#estado-api").textContent = "API no disponible"; $("#estado-api").dataset.ok = "false";
    $("#portal-chacra").innerHTML = `<span class="aviso rojo">${esc(e.message)}</span>`;
  }
  navegar(DESDE_HASH[location.hash.slice(1)] ?? "portal");
  iniciarDemo({ ...ctx, escenas }); $("#btn-demo").disabled = false;
}
escuchar("parcela", () => {
  const p = parcelaActiva();
  $("#portal-chacra").innerHTML = p ? `Chacra activa: <b>${esc(p.nombre)}</b>${p.area_ha ? ` · ${num(p.area_ha, 2)} ha` : ""}${
    /ejemplo/i.test(p.aoi_id + p.nombre) ? ' · <span class="etq ambar">parcela de ejemplo</span>' : ""}`
    : "Aún no hay una chacra registrada: entra a «Mi parcela» para dibujarla.";
});
iniciar();
