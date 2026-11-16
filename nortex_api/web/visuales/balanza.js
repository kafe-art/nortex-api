/* NORTEX — «La Balanza de la Cosecha».
 *
 * Dos platos: lo que cuesta sembrar y el margen proyectado, en soles por hectárea.
 *   · plato derecho ← decision.conveniencia.margen_soles_ha[escenario]   (lo calcula el motor)
 *   · plato izquierdo ← costo_soles_ha más reciente de GET /datos/economia (dato declarado SIEA/MIDAGRI)
 * La barra se inclina hacia el plato más pesado (ángulo acotado a ±14°) y oscila con CSS.
 * Sin plantilla económica la conveniencia es «por determinar»: la balanza queda nivelada, con candado,
 * y explica qué falta. Nunca se inventan precios. Función pura: devuelve HTML. */

import { esc, num, dato, limitar } from "../util.js";

const plato = (x, clase, etiqueta) => `<g class="plato ${clase}">
  <path d="M${x - 34} 0l34 -46 34 46" class="cuerda"/><path d="M${x - 40} 0h80a40 16 0 01-80 0z" class="cuenco"/>
  <text x="${x}" y="34" class="plato-txt">${etiqueta}</text></g>`;

export function balanza({ conveniencia, escenario = "deficit_medio", costo, dotacion } = {}) {
  const c = conveniencia || {};
  const margen = c.margen_soles_ha?.[escenario];
  const calculado = c.estado === "calculado" && margen != null;
  const costoV = costo?.costo_soles_ha;
  // Inclinación: positivo = pesa más el margen. Solo compara dos cifras reales; sin costo, no se inclina.
  const angulo = calculado && costoV > 0 ? limitar((margen - costoV) / (Math.abs(margen) + costoV), -1, 1) * 14
    : calculado ? Math.sign(margen) * 8 : 0;
  const dosis = dotacion?.valor != null ? `; dotación usada ${num(dotacion.valor)} m³/ha (${dotacion.fuente ?? "sin fuente"})` : "";
  const agua = c.agua_m3_ha == null ? "" : `<span>Agua de la campaña: ${dato(`${num(c.agua_m3_ha)} m³/ha`, {
    titulo: "Agua usada (déficit medio)",
    fuente: `riego bruto del balance FAO-56${dosis}`,
    categoria: "simulado",
    nota: "Lámina de riego de la campaña pasada a m³ por hectárea; no es la dotación asignada ni una medición." })}</span>`;

  const hist = !c.historial ? "" : `<span>En tu parcela: ${dato(
    `${num(c.historial.media_t_ha, 2)} t/ha en ${num(c.historial.n)} campaña(s)`, {
      titulo: "Rendimiento cosechado en la parcela",
      fuente: c.historial.fuente,
      categoria: "declarado",
      nota: `Última campaña: ${c.historial.ultimo_t_ha} t/ha · mejor: ${c.historial.max_t_ha} t/ha` +
        `${c.historial.campanias?.length ? ` · ${c.historial.campanias.join(", ")}` : ""}. Dato declarado, no medido por NORTEX.`,
    })}</span>`;
  const aviso = c.aviso_historial ? `<span class="aviso-dato">${esc(c.aviso_historial)}</span>` : "";

  const svg = `<svg viewBox="0 0 240 150" role="img" aria-label="${calculado
    ? `Margen proyectado ${num(margen)} soles por hectárea` : "Conveniencia por determinar: falta la plantilla económica"}">
    <path d="M120 142V40" class="poste"/><path d="M92 142h56" class="base"/>
    <g class="brazo" style="--angulo:${angulo.toFixed(1)}deg">
      <path d="M40 40h160" class="barra"/><circle cx="120" cy="40" r="6" class="eje"/>
      <g transform="translate(0 88)">${plato(40, "plato-costo", "costo")}${plato(200, "plato-margen", "margen")}</g>
    </g>
    ${calculado ? "" : `<g class="candado" transform="translate(120 84)">
      <path d="M-9 -4v-8a9 9 0 0118 0v8" fill="none"/><rect x="-13" y="-4" width="26" height="20" rx="4"/><circle cx="0" cy="5" r="2.500"/></g>`}
  </svg>`;

  if (!calculado) {
    return `<figure class="balanza balanza-cerrada">${svg}<figcaption>
      <b>Conveniencia: por determinar</b>
      <span>${esc((c.nota || "Sin rendimiento, precio y costo de referencia (SIEA/MIDAGRI).").trim())}</span>
      <span>Carga la plantilla «economia» en Mi parcela para abrir el candado.</span>${hist}${aviso}${agua}
      ${dato("por determinar", { titulo: "Margen económico", fuente: c.fuente ?? "sin plantilla económica",
        nota: c.nota, estado: "por determinar" })}</figcaption></figure>`;
  }
  const info = { titulo: `Margen económico · ${escenario.replace("_", " ")}`, fuente: c.fuente, nota: c.metodo, categoria: "simulado" };
  return `<figure class="balanza" data-signo="${margen >= 0 ? "favor" : "contra"}">${svg}<figcaption>
    <b>Margen proyectado: ${dato(`S/ ${num(margen)} por ha`, info)}</b>
    <span>Costo de sembrar: ${costoV == null ? dato("por determinar", { titulo: "Costo de producción",
      fuente: "GET /datos/economia sin costo para este cultivo", estado: "por determinar" })
      : dato(`S/ ${num(costoV)} por ha`, { titulo: "Costo de producción declarado", fuente: costo.fuente,
        nota: `${costo.ambito ?? ""} ${costo.anio ?? ""}`.trim() })}</span>
    ${c.margen_soles_m3 == null ? "" : `<span>Por cada m³ de agua: ${dato(`S/ ${num(c.margen_soles_m3, 2)}`, info)}</span>`}
    ${c.nota ? `<span>${esc(c.nota)}</span>` : ""}${hist}${aviso}${agua}</figcaption></figure>`;
}

/** Fila de economía más reciente de un cultivo (GET /datos/economia). */
export function costoDe(filas, cultivo) {
  return [...(filas || [])].filter((f) => f.cultivo === cultivo && f.costo_soles_ha != null)
    .sort((a, b) => (a.anio - b.anio) || (a.id - b.id)).at(-1);
}
