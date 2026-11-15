/* NORTEX — «El Sol de la Floración».
 *
 * Traduce `decision.extremos` (frecuencia histórica de calor en los días de floración) a un astro:
 *   · color y vibración  ← extremos.nivel_calor            (bajo: calmo · medio: ámbar · alto: rojo que vibra)
 *   · corona de puntos   ← extremos.anios_calor / anios    (un punto por año del registro; encendidos = con calor)
 *   · fichas 34…38 °C    ← extremos.sensibilidad_calor     (qué pasaría con otro umbral)
 * Es historia (cuántos años pasó), no un pronóstico. Si la API no trae el dato, el sol queda apagado y
 * lo dice. Si el umbral no está validado, la ficha lleva borde punteado ámbar y «por validar con INIA».
 * Función pura: devuelve HTML. La prueba tests/web_visuals.mjs la ejercita sin navegador. */

import { esc, num, dato, etq } from "../util.js";

let serie = 0;

export function sol({ extremos, riesgo } = {}) {
  const e = extremos || {};
  const id = `sol-${++serie}`;
  const nivel = e.nivel_calor;
  const hayDato = e.anios_calor != null && e.anios > 0 && /^(bajo|medio|alto)$/.test(nivel ?? "");
  const calorRiesgo = (riesgo || []).find((r) => /Calor en floraci/i.test(r.factor));
  const info = { titulo: "Calor en floración · frecuencia histórica", fuente: calorRiesgo?.fuente
    ?? "clima corregido + ventana de floración de la ficha del cultivo", nota: calorRiesgo?.evidencia,
    categoria: "observado", estado: e.umbral_calor_validado === false ? "por validar" : undefined };

  if (!hayDato) {
    return `<figure class="sol sol-apagado" data-nivel="sin-dato">
      <svg viewBox="0 0 200 200" role="img" aria-label="Sin información de calor en floración">
        <circle cx="100" cy="100" r="40" fill="none" stroke="#8d8078" stroke-width="2" stroke-dasharray="5 6"/>
        <path d="M86 100h28" stroke="#8d8078" stroke-width="3" stroke-linecap="round"/></svg>
      <figcaption><b>Sin información de calor</b>
        <span>${esc(calorRiesgo?.evidencia || `La ficha del cultivo no trae ${e.ventana_floracion ? esc(e.ventana_floracion) : "ventana de floración"}; el sol queda por determinar.`)}</span>
        ${dato("por determinar", { ...info, estado: "por determinar" })}</figcaption></figure>`;
  }

  // Corona: un punto por año del registro; los primeros `anios_calor` se encienden (cuenta, no calendario).
  const n = e.anios, k = e.anios_calor;
  const corona = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = 100 + Math.cos(a) * 84, y = 100 + Math.sin(a) * 84;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="${i < k ? "anio-calor" : "anio-fresco"}"/>`;
  }).join("");
  const rayos = Array.from({ length: 12 }, (_, i) =>
    `<path d="M100 ${100 - 52}v-16" transform="rotate(${i * 30} 100 100)"/>`).join("");
  const umbral = e.umbral_calor_c;
  const titular = k === 0
    ? `En ninguno de ${n} años hizo calor peligroso en la floración`
    : `En ${k} de ${n} años hizo calor peligroso aquí`;
  const sens = (e.sensibilidad_calor || []).map((s) => `<li class="${s.umbral_c === umbral ? "actual" : ""}"
      data-nivel="${esc(s.nivel)}"><b>${num(s.umbral_c)} °C</b><span>${s.anios}/${n} años</span></li>`).join("");

  return `<figure class="sol" data-nivel="${esc(nivel)}">
    <svg viewBox="0 0 200 200" role="img" aria-label="${esc(titular)}. Nivel de calor: ${esc(nivel)}">
      <defs><radialGradient id="${id}"><stop offset="0" class="sol-c1"/><stop offset=".7" class="sol-c2"/><stop offset="1" class="sol-c3"/></radialGradient></defs>
      <g class="sol-corona">${corona}</g>
      <g class="sol-rayos">${rayos}</g>
      <circle class="sol-halo" cx="100" cy="100" r="58"/>
      <circle class="sol-disco" cx="100" cy="100" r="42" fill="url(#${id})"/>
      <text x="100" y="97" class="sol-cifra">${k}/${n}</text><text x="100" y="114" class="sol-sub">años</text>
    </svg>
    <figcaption>
      <b>${esc(titular)}</b>
      <span>Riesgo ${etq(nivel)} · ${esc(e.ventana_floracion || "ventana de floración de la ficha")}${
        e.peor_anio_calor ? ` · peor año ${esc(e.peor_anio_calor.anio)}: ${esc(e.peor_anio_calor.dias)} días` : ""}</span>
      <span class="${e.umbral_calor_validado === false ? "provisional" : ""}">Umbral ${dato(`${num(umbral, 1)} °C`, {
        ...info, titulo: "Umbral de calor en floración", fuente: e.umbral_calor_origen ?? info.fuente })}${
        e.umbral_calor_validado === false ? " · por validar con INIA" : " · validado"}</span>
      ${sens ? `<ul class="sol-sens" aria-label="Años con calor según el umbral">${sens}</ul>` : ""}
      ${dato("Ver la evidencia completa", info)}
    </figcaption></figure>`;
}
