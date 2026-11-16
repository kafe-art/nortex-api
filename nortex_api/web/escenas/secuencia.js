/* NORTEX — Escena 4 · «La Secuencia de 3 Campañas».
 *
 * Tres fichas de rompecabezas, una por campaña. Al pulsar «Encastrar y revisar»:
 *   1. se llama a POST /evaluar/f2 una vez por ficha, en orden, con `historial` acumulado
 *      (lo sembrado antes + las campañas anteriores de la secuencia) y `renovacion_confirmada`;
 *   2. cada ficha se encaja con la anterior (CSS con rebote) cuando llega su respuesta;
 *   3. la unión se enciende con las reglas de transición que devuelve la API en
 *      `viabilidad.reglas_transicion` (RT-01…RT-05): ámbar = condicionante (cambia la viabilidad),
 *      azul = informativa (solo avisa). Sin reglas, la unión queda en calma y lo dice.
 * Son evaluaciones encadenadas: no simulan nutrientes, plagas ni salud del suelo entre campañas, y
 * las fechas iniciales son propuestas editables, no un calendario recomendado. */

import { api, evaluar } from "../api.js";
import { $, $$, esc, NOMBRES, iso, masDias, fechaCorta, errorHtml } from "../util.js";
import { cultivoVivo } from "../visuales/cultivos.js";
import { montarAutopsia, cuatroMini } from "../visuales/autopsia.js";

export function crearSecuencia(ctx) {
  const { estado } = ctx;
  const mesa = $("#rompecabezas"), zona = $("#sec-autopsia"), aviso = $("#sec-estado");
  const hoy = iso(new Date());
  const sec = { previo: "", pasos: [{ cultivo: "arroz", inicio: masDias(hoy, 30) }, { cultivo: "caupi", inicio: masDias(hoy, 210) },
    { cultivo: "maiz", inicio: masDias(hoy, 390) }] };
  let ticket = 0, salidas = [], autopsia = null, elegido = -1;

  const ids = () => estado.cultivos.map((c) => c.id);
  const nombre = (id) => estado.cultivos.find((c) => c.id === id)?.nombre || NOMBRES[id] || id;

  function pintar() {
    if (!estado.cultivos.length) { mesa.innerHTML = ""; return; }
    const opts = (sel, vacio) => (vacio ? `<option value="">${vacio}</option>` : "") + estado.cultivos.map((c) =>
      `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.nombre)}</option>`).join("");
    mesa.innerHTML = `<div class="pieza pieza-previa"><div class="pieza-cuerpo">
        <p class="eyebrow">Antes</p><div class="pieza-dibujo">${sec.previo ? cultivoVivo(sec.previo) : '<span class="sin-previo">?</span>'}</div>
        <label>Lo último que sembraste aquí<select id="sec-previo">${opts(sec.previo, "No sé / nada")}</select></label></div></div>
      ${sec.pasos.map((p, i) => `<div class="pieza" data-paso="${i}">
        <div class="union" data-union="${i}" aria-live="polite"></div>
        <div class="pieza-cuerpo">
          <p class="eyebrow">Campaña ${i + 1}</p>
          <div class="pieza-dibujo">
            <button type="button" class="giro" data-cambio="-1" aria-label="Cultivo anterior">‹</button>
            ${cultivoVivo(p.cultivo)}
            <button type="button" class="giro" data-cambio="1" aria-label="Cultivo siguiente">›</button>
          </div>
          <label>Cultivo<select data-campo="cultivo">${opts(p.cultivo)}</select></label>
          <label>Siembra<input type="date" data-campo="inicio" value="${esc(p.inicio)}" required></label>
          <div class="pieza-resultado"></div>
        </div></div>`).join("")}`;
    $("#sec-previo").onchange = (e) => { sec.previo = e.target.value; soltar(); };
    $$(".pieza[data-paso]", mesa).forEach((el) => {
      const i = Number(el.dataset.paso);
      $$("[data-cambio]", el).forEach((b) => { b.onclick = (ev) => { ev.stopPropagation();
        const l = ids(); sec.pasos[i].cultivo = l[(l.indexOf(sec.pasos[i].cultivo) + Number(b.dataset.cambio) + l.length) % l.length]; soltar(); }; });
      $$("[data-campo]", el).forEach((c) => { c.onchange = () => { sec.pasos[i][c.dataset.campo] = c.value; soltar(); }; });
      el.addEventListener("click", (ev) => { if (!ev.target.closest("button,select,input,label") && salidas[i]) abrir(i); });
    });
  }

  /** Cualquier cambio suelta las fichas: los resultados anteriores ya no corresponden. */
  function soltar() {
    ticket++; salidas = []; elegido = -1; autopsia?.destruir(); autopsia = null; zona.innerHTML = "";
    mesa.classList.remove("encastrado"); aviso.textContent = ""; pintar();
  }

  function abrir(i) {
    elegido = i;
    $$(".pieza[data-paso]", mesa).forEach((el, k) => el.classList.toggle("elegida", k === i));
    autopsia?.destruir();
    autopsia = montarAutopsia(zona, { decision: salidas[i], catalogo: estado.cultivos, economia: estado.economia, escenario: estado.escenario,
      alCambiarEscenario: (e) => { estado.escenario = e; }, titulo: `Campaña ${i + 1} · después de ${i ? nombre(sec.pasos[i - 1].cultivo) : sec.previo ? nombre(sec.previo) : "sin historial"}` });
  }

  function encender(i, d) {
    const reglas = d.viabilidad.reglas_transicion || [];
    const el = $(`.pieza[data-paso="${i}"]`, mesa);
    el.classList.add("lista");
    $(".union", el).innerHTML = reglas.length
      ? reglas.map((r) => `<button type="button" class="chispa ${r.tipo === "condicionante" ? "condicionante" : "informativa"}"
          data-proc="${esc(JSON.stringify({ titulo: `${r.regla} · regla ${r.tipo}`, valor: r.texto, fuente: "POST /evaluar/f2 · viabilidad.reglas_transicion",
            nota: r.efecto ? `Efecto sobre la viabilidad: ${r.efecto}.` : "Informativa: no cambia la viabilidad.", estado: r.tipo === "condicionante" ? "por validar" : "real" }))}">${esc(r.regla)}</button>`).join("")
      : '<span class="chispa calma">sin reglas</span>';
    $(".union", el).classList.toggle("encendida", reglas.length > 0);
    $(".pieza-resultado", el).innerHTML = `${cuatroMini(d)}${d.viabilidad.definitiva === false ? '<span class="sello-provisional">provisional</span>' : ""}
      <button type="button" class="enlace ver-autopsia">Ver su suelo y su cielo</button>`;
    $(".ver-autopsia", el).onclick = () => { abrir(i); zona.scrollIntoView({ behavior: "smooth", block: "start" }); };
  }

  async function revisar() {
    const t = ++ticket, v = estado.version;
    if (!estado.parcela) { aviso.innerHTML = errorHtml("Elige una chacra primero (Mi parcela)."); return false; }
    if (sec.pasos.some((p, i) => !p.inicio || (i && p.inicio <= sec.pasos[i - 1].inicio))) {
      aviso.innerHTML = errorHtml("Las fechas deben estar completas y en orden: cada campaña después de la anterior."); return false; }
    salidas = []; zona.innerHTML = ""; autopsia?.destruir(); autopsia = null; pintar();
    mesa.classList.add("encastrado");
    const historial = [sec.previo].filter(Boolean), renovacion_confirmada = $("#sec-renovacion").checked;
    try {
      for (const [i, p] of sec.pasos.entries()) {
        aviso.textContent = `Evaluando la campaña ${i + 1} con el historial: ${historial.map(nombre).join(" → ") || "sin historial"}…`;
        const r = await evaluar("f2", { aoi_id: estado.parcela, inicio: p.inicio, cultivos: [p.cultivo], historial: [...historial], renovacion_confirmada, ...ctx.opciones() });
        if (t !== ticket || v !== estado.version) return false;
        const d = r.decisiones?.[0];
        if (!d) throw new Error(`La API no devolvió decisión para la campaña ${i + 1}.`);
        salidas[i] = d; encender(i, d); historial.push(p.cultivo);
      }
      const total = salidas.reduce((a, d) => a + (d.viabilidad.reglas_transicion || []).length, 0);
      aviso.innerHTML = `Secuencia evaluada: ${total} ${total === 1 ? "regla de transición activada" : "reglas de transición activadas"}. Toca una regla o una ficha para ver el detalle.
        <span class="ayuda">Evaluaciones encadenadas con historial; no simulan nutrientes, plagas ni salud del suelo entre campañas.</span>`;
      return true;
    } catch (e) {
      if (t === ticket && v === estado.version) { aviso.innerHTML = errorHtml(e); mesa.classList.remove("encastrado"); }
      return false;
    }
  }
  $("#sec-ir").onclick = revisar;
  $("#sec-renovacion").onchange = soltar;

  return {
    async entrar() {
      ctx.ambiente.calor(null);
      if (estado.parcela && !sec.previo) {
        const filas = await api(`/datos/historial?aoi_id=${encodeURIComponent(estado.parcela)}`).catch(() => []);
        const ult = filas.at(-1);
        if (ult?.cultivo) sec.previo = ult.cultivo;
      }
      if (!salidas.length) pintar();
    },
    refrescar: soltar,
    salir() { autopsia?.destruir(); autopsia = null; },
    /** Para la demostración: arma una secuencia concreta y la evalúa de verdad. */
    async armar({ previo = "", cultivos }) {
      sec.previo = previo; cultivos.forEach((c, i) => { sec.pasos[i].cultivo = c; });
      $("#sec-renovacion").checked = false; soltar();
      const ok = await revisar();
      return ok ? salidas : null;
    },
    get fechas() { return sec.pasos.map((p) => fechaCorta(p.inicio)); },
  };
}

