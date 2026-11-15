/* NORTEX — «La Autopsia del Suelo y el Cielo»: una decisión de la API, contada sin tablas.
 *
 * Recibe UNA decisión tal como la devuelve POST /evaluar/f1 o /evaluar/f2 y monta:
 *   1. el tríptico visual  → sol (visuales/sol.js), corte del suelo (suelo.js) y balanza (balanza.js);
 *   2. las CUATRO dimensiones en cuatro tarjetas independientes: viabilidad, riesgo, conveniencia y
 *      fundamentación. No se promedian, no se suman y no hay semáforo compuesto (regla 1 de NORTEX);
 *   3. reglas de transición, advertencias y un desplegable con todas las cifras y sus fuentes.
 * Lo provisional se marca con borde punteado ámbar; lo que falta se dice «por determinar».
 * Devuelve {destruir()} para detener el canvas al cambiar de decisión. */

import { $, esc, etq, datoRes, NOMBRES, ESCENARIOS, estadoDato, fechaCorta } from "../util.js";
import { sol } from "./sol.js";
import { modeloSuelo, leyendaSuelo, pintarSuelo, altSuelo } from "./suelo.js";
import { balanza, costoDe } from "./balanza.js";

/** Resumen de las cuatro dimensiones (para cartas, anillo y fichas). Cuatro celdas, nunca una sola. */
export function cuatroMini(d) {
  const r = d.riesgo || [], m = d.conveniencia?.margen_soles_ha?.deficit_medio;
  const altos = r.filter((x) => x.nivel === "alto").length, medios = r.filter((x) => x.nivel === "medio").length;
  return `<dl class="cuatro-mini">
    <div><dt>Viabilidad</dt><dd>${etq(d.viabilidad.estado)}</dd></div>
    <div><dt>Riesgo</dt><dd><b>${altos}</b> altos · <b>${medios}</b> medios</dd></div>
    <div><dt>Conveniencia</dt><dd>${m == null ? etq("por determinar", "gris") : `S/ ${Math.round(m).toLocaleString("es-PE")}/ha`}</dd></div>
    <div><dt>Fundamentación</dt><dd>${etq(d.fundamentacion.nivel)}</dd></div></dl>`;
}

const INSUMO = { dotacion: "dotación", parametros_cultivo: "parámetros del cultivo", economia: "economía" };
const reglaHtml = (r) => `<li class="regla ${r.tipo === "condicionante" ? "condicionante" : "informativa"}">
  <b>${esc(r.regla)}</b> ${etq(r.tipo, r.tipo === "condicionante" ? "ambar" : "azul")}<p>${esc(r.texto)}</p>
  ${r.efecto ? `<small>Efecto sobre la viabilidad: ${esc(r.efecto)}</small>` : "<small>No cambia la viabilidad.</small>"}</li>`;

export function montarAutopsia(el, { decision: d, catalogo, economia, escenario = "deficit_medio", alCambiarEscenario, titulo }) {
  let pintor = null, esc_ = ESCENARIOS[escenario] ? escenario : "deficit_medio";
  const cat = (catalogo || []).find((c) => c.id === d.cultivo);

  function pintar() {
    pintor?.destruir();
    const res = d.resultados?.[esc_] || {};
    const clima = (d.clima_escenarios || []).find((c) => c.escenario === esc_);
    const intervalo = d.insumos_efectivos?.intervalo_dias;
    const zr = cat?.parametros?.zr_m;
    const m = modeloSuelo({ res, zr, intervalo, clima, tipo: cat?.tipo, cultivo: d.cultivo,
      exceso: (d.riesgo || []).find((x) => /Exceso de lluvia/i.test(x.factor)) });
    const provisional = d.viabilidad.definitiva === false;
    const turnoEjemplo = estadoDato(intervalo?.fuente) !== "real";
    const insumos = d.fundamentacion.insumos || {};

    el.innerHTML = `<article class="autopsia" data-cultivo="${esc(d.cultivo)}">
      <header class="aut-cab">
        <div><p class="eyebrow">${esc(titulo || "La autopsia del suelo y el cielo")}</p>
          <h3>${esc(NOMBRES[d.cultivo] || d.cultivo)} <small>· siembra ${esc(fechaCorta(d.inicio))}</small></h3></div>
        <div class="escenarios" role="radiogroup" aria-label="Año histórico de referencia">
          ${Object.entries(ESCENARIOS).map(([k, s]) => `<button type="button" role="radio" aria-checked="${k === esc_}" data-esc="${k}">
            ${s.nombre}<small>${s.p}${(d.clima_escenarios || []).find((c) => c.escenario === k)?.anio_analogo
              ? ` · como ${(d.clima_escenarios || []).find((c) => c.escenario === k).anio_analogo}` : ""}</small></button>`).join("")}
        </div>
      </header>
      <p class="ayuda">${esc(d.escenarios?.[0]?.nota || "Los escenarios son años históricos; un percentil no es una probabilidad.")}
        Describe toda la campaña con historia, no el tiempo de los próximos días.</p>

      <div class="triptico">
        <section class="tri tri-sol" aria-label="El sol de la floración"><p class="eyebrow">El sol de la floración</p>
          ${sol({ extremos: d.extremos, riesgo: d.riesgo })}</section>
        <section class="tri tri-suelo ${turnoEjemplo ? "provisional" : ""}" aria-label="La sed de la raíz"><p class="eyebrow">La sed de la raíz</p>
          <figure class="suelo"><canvas role="img" aria-label="${esc(altSuelo(m))}"></canvas>
            ${leyendaSuelo(m, { res, intervalo, zr })}</figure>
          ${turnoEjemplo ? '<p class="sello-provisional">Turno o dotación de ejemplo: falta el dato de la junta</p>' : ""}</section>
        <section class="tri tri-balanza" aria-label="La balanza de la cosecha"><p class="eyebrow">La balanza de la cosecha</p>
          ${balanza({ conveniencia: d.conveniencia, escenario: esc_, costo: costoDe(economia, d.cultivo) })}</section>
      </div>

      <h4 class="cuatro-titulo">Cuatro lecturas separadas</h4>
      <p class="cuatro-sub">Ninguna resume ni promedia a las otras. Abre cada dimensión para ver sus motivos y evidencias.</p>
      <div class="cuatro">
        <details class="dim dim-viabilidad ${provisional ? "provisional" : ""}" open>
          <summary><span class="dim-num">01</span><span class="dim-nombre">Viabilidad</span><span class="dim-valor">${etq(d.viabilidad.estado)}${provisional ? etq("provisional", "ambar") : ""}</span></summary>
          <div class="dim-cuerpo">
            <ul>${(d.viabilidad.motivos || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
            ${provisional && d.viabilidad.pendiente?.length ? `<p class="ayuda"><b>Para que sea definitiva falta:</b></p><ul class="pendiente">${
              d.viabilidad.pendiente.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          </div>
        </details>
        <details class="dim dim-riesgo">
          <summary><span class="dim-num">02</span><span class="dim-nombre">Riesgo · frecuencia histórica</span><span class="dim-valor">${
            (() => { const r = d.riesgo || [], a = r.filter((x) => x.nivel === "alto").length, m_ = r.filter((x) => x.nivel === "medio").length;
              return `${etq(`${a} altos`, a ? "rojo" : "verde")}${m_ ? ` ${etq(`${m_} medios`, "ambar")}` : ""}`; })()}</span></summary>
          <div class="dim-cuerpo">
            <ul class="riesgos">${(d.riesgo || []).map((r) => `<li data-nivel="${esc(r.nivel)}">
              <button type="button" class="riesgo" data-proc="${esc(JSON.stringify({ titulo: r.factor, valor: `nivel ${r.nivel}`,
                fuente: r.fuente, nota: r.evidencia, estado: /POR[_ ]VALIDAR|por confirmar/i.test(r.evidencia + r.fuente) ? "por validar" : "real" }))}">
                ${etq(r.nivel)}<span>${esc(r.factor)}</span></button></li>`).join("") || "<li>La API no devolvió riesgos.</li>"}</ul>
            <p class="ayuda">Toca un riesgo para leer su evidencia.</p>
          </div>
        </details>
        <details class="dim dim-conveniencia">
          <summary><span class="dim-num">03</span><span class="dim-nombre">Conveniencia</span><span class="dim-valor">${d.conveniencia?.margen_soles_ha?.[esc_] == null ? etq("por determinar", "gris")
            : `S/ ${Math.round(d.conveniencia.margen_soles_ha[esc_]).toLocaleString("es-PE")} por ha`}</span></summary>
          <div class="dim-cuerpo">
            <p>${esc((d.conveniencia?.nota || d.conveniencia?.metodo || "").trim())}</p>
          </div>
        </details>
        <details class="dim dim-fundamentacion">
          <summary><span class="dim-num">04</span><span class="dim-nombre">Fundamentación</span><span class="dim-valor">${etq(d.fundamentacion.nivel)}</span></summary>
          <div class="dim-cuerpo">
            <ul class="insumos">${Object.entries(insumos).map(([k, v]) => `<li data-nivel="${esc(v)}"><span>${esc(INSUMO[k] || k.replace(/_/g, " "))}</span><i></i><b>${esc(v)}</b></li>`).join("")}</ul>
            ${d.fundamentacion.faltantes?.length ? `<details><summary>Qué falta para afirmarlo mejor</summary><ul>${
              d.fundamentacion.faltantes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
          </div>
        </details>
      </div>

      ${(d.viabilidad.reglas_transicion || []).length ? `<ul class="reglas">${d.viabilidad.reglas_transicion.map(reglaHtml).join("")}</ul>` : ""}
      ${(d.advertencias || []).length ? `<details class="advertencias"><summary>Lo que debes tener presente (${d.advertencias.length})</summary><ul>${
        d.advertencias.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
      <details class="cifras"><summary>Todas las cifras del escenario, con su fuente</summary>
        <div class="datos-tecnicos">${Object.entries(res).map(([k, v]) => `<p><span>${esc(k.replace(/_/g, " "))}</span>${datoRes(v, k, { d: 2 })}</p>`).join("")}
          ${Object.entries(d.insumos_efectivos || {}).map(([k, v]) => `<p><span>insumo · ${esc(k.replace(/_/g, " "))}</span>${datoRes(v, k, { d: 3 })}</p>`).join("")}</div>
        <p class="ayuda">Prueba histórica (hindcast): ${esc(d.hindcast?.veredicto ?? "por determinar")}${d.hindcast?.aciertos != null
          ? ` · ${esc(d.hindcast.aciertos)} de ${esc(d.hindcast.anios_probados)} años` : ""}.</p>
        <ul class="procedencia">${Object.entries(d.procedencia || {}).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("")}</ul>
      </details>
    </article>`;

    pintor = pintarSuelo($("canvas", el), m);
    el.querySelectorAll("[data-esc]").forEach((b) => { b.onclick = () => { esc_ = b.dataset.esc; alCambiarEscenario?.(esc_); pintar(); }; });
  }
  pintar();
  return { destruir() { pintor?.destruir(); pintor = null; }, get escenario() { return esc_; } };
}

