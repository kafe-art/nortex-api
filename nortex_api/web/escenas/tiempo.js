/* NORTEX — Escena 3 · «El Calendario de Siembra» (F1 · ¿cuándo siembro?).
 *
 * Una llamada real: POST /evaluar/f1 con paso de 30 días durante un año → 12 ventanas de siembra,
 * una por mes. El año se presenta como doce parcelas mensuales bajo un arco solar agrícola; al elegir
 * un mes, el sol recorre el cielo del valle según esa fecha de siembra.
 *
 * Tres filas rotuladas e independientes por mes (nunca fundidas en un color único):
 *   1. fila-viab    ← viabilidad.estado            (borde punteado en la parcela si es provisional)
 *   2. fila-riesgos ← un punto por cada riesgo de nivel «alto» (o 0 si no hay ninguno)
 *   3. fila-calor   ← extremos.tmax_floracion.media_c (escala térmica fija 24–36 °C; trama gris = sin dato)
 * El cielo de fondo y el sol del arco toman esa misma temperatura: al pasar de enero a junio se ve
 * cómo la floración pasa de calurosa a fresca. La lectura compara la fecha elegida con la primera en el
 * orden de la API (`tabla[0]`). */

import { evaluar } from "../api.js";
import { $, $$, esc, num, pct, dato, tono, NOMBRES, MESES, resorte, limitar, mezclarColor, calor01, colorCalor,
  deIso, iso, masDias, fechaCorta, errorHtml, cargando, reducido } from "../util.js";
import { cultivoVivo } from "../visuales/cultivos.js";
import { montarAutopsia, cuatroMini } from "../visuales/autopsia.js";

const COLOR_TONO = { verde: "#2E7D32", ambar: "#F59E0B", rojo: "#D84315", gris: "#5B6660", azul: "#0288D1" };

export function crearTiempo(ctx) {
  const { estado, ambiente } = ctx;
  const arco = $("#arco"), calendario = $("#calendario"), lectura = $("#tiempo-lectura"), zona = $("#tiempo-autopsia"), fichas = $("#tiempo-cultivos");
  let ticket = 0, resp = null, ventanas = [], sel = 0, autopsia = null, espera = 0, solEl = null;

  /** 12 ventanas: desde el día 15 del mes próximo, cada 30 días (la API admite hasta 366 días). */
  function rango() {
    const h = new Date(); const desde = iso(new Date(h.getFullYear(), h.getMonth() + 1, 15));
    return { desde, hasta: masDias(desde, 330), paso_dias: 30 };
  }
  const cuerpo = () => ({ aoi_id: estado.parcela, cultivo: estado.cultivo, ...rango(), ...ctx.opciones() });

  const pasoSol = resorte({ rigidez: 120, amortiguacion: 18, alCambiar: (p) => {
    if (!solEl || !ventanas.length) return;
    const u = ventanas.length > 1 ? limitar(p / (ventanas.length - 1), 0, 1) : 0.5;
    const x = 80 + 800 * u, y = 168 - 356 * u * (1 - u);
    solEl.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  } });

  function pintarFichas() {
    fichas.innerHTML = estado.cultivos.map((c) => `<button type="button" class="ficha" role="radio" aria-checked="${c.id === estado.cultivo}" data-cultivo="${esc(c.id)}">
      ${cultivoVivo(c.id)}<span>${esc(c.nombre)}</span></button>`).join("");
    $$(".ficha", fichas).forEach((b) => { b.onclick = () => { estado.cultivo = b.dataset.cultivo; cargar(); }; });
  }

  function dibujar() {
    arco.innerHTML = `<svg viewBox="0 0 960 220" aria-hidden="true">
      <defs>
        <linearGradient id="arco-cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" id="arco-cielo-sup" stop-color="#DDF0F7"/>
          <stop offset="1" stop-color="#FAFBF3"/>
        </linearGradient>
      </defs>
      <rect width="960" height="220" fill="url(#arco-cielo)"/>
      <path class="arco-campo" d="M0 184 Q240 166 480 178 T960 182 V220 H0Z"/>
      <g class="arco-surco">
        <path d="M480 178 L60 220"/><path d="M480 178 L270 220"/><path d="M480 178 L480 220"/>
        <path d="M480 178 L690 220"/><path d="M480 178 L900 220"/>
      </g>
      <path class="arco-camino" d="M80 168 Q480 -10 880 168"/>
      <g class="arco-sol" id="arco-sol"><circle class="aura" r="34"/><circle r="18"/></g>
      <text x="480" y="132" class="arco-temp" id="arco-temp"></text>
      <text x="480" y="156" class="arco-sub" id="arco-sub"></text>
    </svg>`;
    solEl = $("#arco-sol", arco);

    calendario.innerHTML = ventanas.map((w, i) => {
      const d = w.d, f = deIso(d.inicio), t = tono(d.viabilidad.estado);
      const altos = (d.riesgo || []).filter((r) => r.nivel === "alto").length;
      const tm = d.extremos?.tmax_floracion?.media_c;
      const puntos = altos ? Array.from({ length: Math.min(6, altos) }, () => "<i></i>").join("") : "0";
      return `<button type="button" class="mes-parcela ${d.viabilidad.definitiva === false ? "sin-confirmar" : ""}" role="radio"
        aria-checked="false" data-i="${i}"
        aria-label="${esc(`${fechaCorta(d.inicio)}: ${d.viabilidad.estado}, ${altos} riesgos altos${tm == null ? "" : `, floración ${num(tm, 1)} °C`}`)}">
        ${w.orden === 0 ? '<span class="primera">1.ª opción</span>' : ""}
        <b>${esc(MESES[f.getMonth()])}</b>
        <small>${f.getDate()} · ${String(f.getFullYear()).slice(2)}</small>
        <span class="fila-viab" data-tono="${t}" style="--k:${COLOR_TONO[t]}" title="Viabilidad: ${esc(d.viabilidad.estado)}"></span>
        <span class="fila-riesgos" title="${altos} riesgos altos">${puntos}</span>
        <span class="fila-calor ${tm == null ? "sin-dato" : ""}" title="${tm == null ? "Calor en floración por determinar" : `Tmax media en floración: ${num(tm, 1)} °C`}">
          <i style="--k:${colorCalor(calor01(tm))}"></i>
          <span>${tm == null ? "s/d" : `${num(tm, 0)}°`}</span>
        </span>
      </button>`;
    }).join("");
    $$(".mes-parcela", calendario).forEach((b) => { b.onclick = () => elegir(Number(b.dataset.i)); });
  }

  /** Selecciona la ventana `i` (0..11) y actualiza arco solar, lectura, cielo y autopsia. */
  function elegir(i, { inmediato = false, enfocarBtn = false } = {}) {
    if (!ventanas.length) return;
    sel = ((i % ventanas.length) + ventanas.length) % ventanas.length;
    const w = ventanas[sel], d = w.d;
    inmediato ? pasoSol.fijar(sel) : pasoSol.ir(sel);

    const botones = $$(".mes-parcela", calendario);
    botones.forEach((b, k) => {
      const activo = k === sel;
      b.setAttribute("aria-checked", activo);
      b.tabIndex = activo ? 0 : -1;
    });
    if (enfocarBtn) botones[sel]?.focus();

    const tm = d.extremos?.tmax_floracion?.media_c, t = calor01(tm), col = colorCalor(t);
    ambiente.calor(t);
    $("#arco-cielo-sup", arco)?.setAttribute("stop-color", t == null ? "#E6ECE8" : mezclarColor("#DDF0F7", "#FFE0B2", t));
    if (solEl) {
      solEl.setAttribute("data-nivel", d.extremos?.nivel_calor ?? "");
      $$("circle", solEl).forEach((c) => c.setAttribute("fill", col));
    }
    const tempEl = $("#arco-temp", arco), subEl = $("#arco-sub", arco);
    if (tempEl) tempEl.textContent = tm == null ? "s/d" : `${num(tm, 1)} °C`;
    if (subEl) subEl.textContent = `${fechaCorta(d.inicio)} · ${tm == null ? "floración sin dato térmico" : "Tmax media histórica en floración"}`;

    leer(w);
    clearTimeout(espera);
    espera = setTimeout(() => {
      autopsia?.destruir();
      autopsia = montarAutopsia(zona, { decision: d, catalogo: estado.cultivos, economia: estado.economia, escenario: estado.escenario,
        alCambiarEscenario: (e) => { estado.escenario = e; }, titulo: `Si siembras el ${fechaCorta(d.inicio)}` });
    }, inmediato ? 0 : 200);
  }

  function leer(w) {
    const d = w.d, primera = ventanas.find((x) => x.orden === 0), e = d.extremos || {};
    const fila = resp.tabla[w.orden] || {}, filaP = resp.tabla[0] || {};
    const altos = (x) => (x.riesgo || []).filter((r) => r.nivel === "alto").length;
    const cob = (f) => (f.cobertura_deficit_medio == null ? "cobertura por determinar" : `el riego cubre ${pct(f.cobertura_deficit_medio)} de la demanda`);
    const comparacion = w.orden === 0
      ? `<p class="comparacion mejor">Esta es la <b>primera fecha en el orden de la API</b> para ${esc(NOMBRES[d.cultivo])}: ${altos(d)} riesgos altos y ${cob(fila)}.</p>`
      : `<p class="comparacion">La API pone primero el <b>${esc(fechaCorta(primera.d.inicio))}</b> (${esc(primera.d.viabilidad.estado)}, ${altos(primera.d)} riesgos altos, ${cob(filaP)}).
          Esta fecha: ${esc(d.viabilidad.estado)}, ${altos(d)} riesgos altos, ${cob(fila)}.</p>
         <button type="button" class="primario" id="ir-primera">Ir al ${esc(fechaCorta(primera.d.inicio))}</button>`;
    lectura.innerHTML = `<div>
        <p class="eyebrow">Siembra el</p><h3>${esc(fechaCorta(d.inicio))}</h3>
        <p class="orden-api">${w.orden + 1}.º de ${ventanas.length} en el orden de la API <small>(${esc(resp.regla_orden)})</small></p>
        ${cuatroMini(d)}
      </div>
      <div>
        <p class="calor-linea ${e.umbral_calor_validado === false ? "provisional" : ""}">Floración (${esc(e.ventana_floracion || "sin dato")}): máxima media histórica de ${
          e.tmax_floracion ? dato(`${num(e.tmax_floracion.media_c, 1)} °C`, { titulo: "Tmax media en la floración", fuente: "extremos.tmax_floracion · clima corregido",
            nota: `P90: ${num(e.tmax_floracion.p90_c, 1)} °C · ${pct(e.tmax_floracion.fraccion_dias_sobre_umbral)} de los días sobre el umbral de ${num(e.umbral_calor_c, 1)} °C.`, categoria: "observado" })
            : dato("por determinar", { titulo: "Tmax media en la floración", fuente: "la ficha no trae ventana de floración", estado: "por determinar" })}${
          e.anios_calor != null ? ` · calor peligroso en ${e.anios_calor} de ${e.anios} años` : ""}${e.umbral_calor_validado === false ? " · umbral por validar con INIA" : ""}</p>
        ${comparacion}
        <div class="fila-botones giro-botones"><button type="button" id="giro-antes" aria-label="Mes anterior">‹ mes anterior</button><button type="button" id="giro-despues" aria-label="Mes siguiente">mes siguiente ›</button></div>
      </div>`;
    $("#ir-primera", lectura)?.addEventListener("click", () => elegir(ventanas.indexOf(primera)));
    $("#giro-antes", lectura).onclick = () => elegir(sel - 1);
    $("#giro-despues", lectura).onclick = () => elegir(sel + 1);
  }

  async function cargar() {
    const t = ++ticket, v = estado.version;
    pintarFichas();
    if (!estado.parcela) { arco.innerHTML = ""; calendario.innerHTML = ""; lectura.innerHTML = errorHtml("Elige una chacra primero (Mi parcela)."); zona.innerHTML = ""; return; }
    lectura.innerHTML = cargando(`Evaluando 12 meses de siembra para ${NOMBRES[estado.cultivo]}…`);
    arco.setAttribute("aria-busy", "true");
    try {
      const r = await evaluar("f1", cuerpo());
      if (t !== ticket || v !== estado.version) return;
      resp = r;
      ventanas = (r.decisiones || []).map((d) => ({ d,
        orden: (r.tabla || []).findIndex((f) => f.inicio === d.inicio) })).sort((a, b) => a.d.inicio.localeCompare(b.d.inicio));
      if (!ventanas.length) { arco.innerHTML = ""; calendario.innerHTML = ""; lectura.innerHTML = errorHtml("La API no devolvió ventanas para esta consulta."); return; }
      dibujar();
      elegir(0, { inmediato: true });                        // empieza en la fecha más próxima; el usuario explora los 12 meses
    } catch (e) {
      if (t === ticket && v === estado.version) { arco.innerHTML = ""; calendario.innerHTML = ""; ventanas = []; zona.innerHTML = ""; lectura.innerHTML = errorHtml(e); }
    } finally { if (t === ticket) arco.removeAttribute("aria-busy"); }
  }

  calendario.addEventListener("keydown", (ev) => {
    const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (paso) { ev.preventDefault(); elegir(sel + paso, { enfocarBtn: true }); }
    if (ev.key === "Home") { ev.preventDefault(); elegir(0, { enfocarBtn: true }); }
    if (ev.key === "End") { ev.preventDefault(); elegir(ventanas.length - 1, { enfocarBtn: true }); }
  });

  return {
    entrar: cargar, refrescar: cargar,
    salir() { autopsia?.destruir(); autopsia = null; zona.innerHTML = ""; },
    precargar: () => (estado.parcela ? evaluar("f1", cuerpo()) : null),
    /** Para la demostración: recorre el año hasta la primera fecha de la API y devuelve ambas decisiones. */
    async recorrer() {
      await cargar(); if (!ventanas.length) return null;
      const primera = ventanas.find((w) => w.orden === 0), inicio = ventanas[0];
      if (!reducido()) await new Promise((r) => setTimeout(r, 1400));
      elegir(ventanas.indexOf(primera));
      return { primera: primera.d, inicio: inicio.d, ultima: ventanas.reduce((m, w) => (w.orden > m.orden ? w : m)).d };
    },
  };
}
