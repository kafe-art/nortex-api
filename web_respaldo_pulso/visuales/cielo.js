/* El cielo de la floración. Sol ← días con Tmax sobre el umbral en la floración del año análogo
 * (`clima_escenarios`); aguacero ← lluvia máxima en 5 días frente al umbral local de «1 vez cada
 * 5 años» (`extremos.umbral_rx5day_mm`). El texto cuenta la historia (frecuencia), no un pronóstico. */
import { esc, num, dato, etq } from "../util.js";

let secuencia = 0;
export function cielo({ clima, extremos, riesgos = [] }) {
  const uid=`cielo-${++secuencia}`;
  const ext = extremos || {};
  const diasCalor = clima?.dias_calor_floracion;
  const rx5 = clima?.rx5day_mm, umbralLluvia = ext.umbral_rx5day_mm;
  const calor = diasCalor == null ? 0 : Math.min(1, diasCalor / 20);
  const razon = rx5 != null && umbralLluvia ? rx5 / umbralLluvia : 0;
  const nGotas = Math.round(Math.min(1.6, razon) * 22);
  const r = 16 + calor * 20;
  const cieloArriba = `rgb(${Math.round(123+calor*92)},${Math.round(168-calor*20)},${Math.round(185-calor*93)})`;
  let rayos = "";
  const nRayos = 8 + Math.round(calor * 8);
  for (let i = 0; i < nRayos; i++) {
    const a = (i / nRayos) * Math.PI * 2, r1 = r + 5, r2 = r + 10 + calor * 16;
    rayos += `<line x1="${(Math.cos(a) * r1).toFixed(1)}" y1="${(Math.sin(a) * r1).toFixed(1)}"
      x2="${(Math.cos(a) * r2).toFixed(1)}" y2="${(Math.sin(a) * r2).toFixed(1)}"/>`;
  }
  let gotas = "";
  for (let i = 0; i < nGotas; i++) {
    const x = 150 + ((i * 47) % 150), y = 78 + ((i * 29) % 60);
    gotas += `<line class="gota" style="animation-delay:${((i * 0.13) % 1).toFixed(2)}s" x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + 11}"/>`;
  }
  const nube = razon > 0.15 ? `<g class="nube ${clima?.exceso_lluvia ? "oscura" : ""}" transform="translate(${razon > 0.6 ? 150 : 190} 34) scale(${0.7 + Math.min(1.2, razon) * 0.5})">
      <ellipse cx="34" cy="26" rx="34" ry="15"/><ellipse cx="22" cy="16" rx="18" ry="14"/><ellipse cx="48" cy="14" rx="20" ry="16"/></g>` : "";
  let flores = "";
  for (let i = 0; i < 9; i++) flores += `<g transform="translate(${20 + i * 35} ${178 - (i % 2) * 5})">
      <path class="tallo" d="M0 22 V4"/><circle class="flor" r="5"/></g>`;
  const etiquetaAria = `Cielo de la floración. Año parecido ${clima?.anio_analogo ?? "sin dato"}: ${diasCalor ?? "sin dato de"} días de calor fuerte, lluvia máxima en 5 días ${rx5 != null ? num(rx5) + " mm" : "sin dato"}.`;
  const svg = `<svg class="v-cielo ${ext.nivel_calor === "alto" ? "arde" : ""}" viewBox="0 0 320 200" preserveAspectRatio="xMidYMin slice" role="img" aria-label="${esc(etiquetaAria)}">
    <defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${cieloArriba}"/><stop offset="1" stop-color="#f6ead4"/></linearGradient></defs>
    <rect width="320" height="200" fill="${diasCalor==null?'#777d76':`url(#${uid})`}"/>
    ${diasCalor==null?'<text x="160" y="70" text-anchor="middle" class="rotulo">Sin información de calor</text>':`<g class="sol" transform="translate(64 60)"><g class="rayos">${rayos}</g><circle r="${r.toFixed(1)}"/></g>`}
    ${nube}${gotas}
    <rect y="176" width="320" height="24" fill="#6f8f4e"/>
    <g class="flores ${calor > 0.5 ? "quemadas" : ""}">${flores}</g>
  </svg>`;

  const fCalor = riesgos.find((x) => /Calor en floraci/i.test(x.factor));
  const fLluvia = riesgos.find((x) => /Exceso de lluvia/i.test(x.factor));
  const validado = ext.umbral_calor_validado;
  const pCalor = ext.anios_calor != null && ext.anios
    ? `<p>${etq(`calor ${ext.nivel_calor}`, undefined)} En <b>${dato(`${ext.anios_calor} de ${ext.anios} años`, {
        titulo: "Años con calor fuerte en la floración", fuente: fCalor?.fuente ?? "clima corregido + ventana de floración de la ficha",
        nota: fCalor?.evidencia })}</b>
        hizo más de ${dato(`${num(ext.umbral_calor_c, 1)} °C`, { titulo: "Umbral de calor en floración",
          fuente: ext.umbral_calor_origen, estado: validado ? "real" : "por validar" })}
        al menos 3 días durante la floración${ext.peor_anio_calor ? ` (peor año: ${ext.peor_anio_calor.anio}, ${ext.peor_anio_calor.dias} días)` : ""}.
        ${validado ? "" : etq("umbral por validar con INIA", "ambar")}</p>`
    : `<p>${etq("calor: por determinar", "gris")} La ficha del cultivo no tiene umbral de calor o ventana de floración.</p>`;
  const pLluvia = ext.anios_exceso != null && ext.anios
    ? `<p>${etq(`lluvia ${ext.nivel_exceso}`)} En <b>${dato(`${ext.anios_exceso} de ${ext.anios} años`, {
        titulo: "Años con aguacero fuerte en la campaña", fuente: fLluvia?.fuente ?? ext.fuente_lluvia, nota: fLluvia?.evidencia })}</b>
        la lluvia de 5 días pasó de ${num(umbralLluvia)} mm, el aguacero que aquí se da 1 vez cada 5 años${
        ext.peor_anio_lluvia ? ` (peor año: ${ext.peor_anio_lluvia.anio}, ${num(ext.peor_anio_lluvia.rx5day_mm)} mm)` : ""}.</p>`
    : `<p>${etq("lluvia: por determinar", "gris")} No hay suficientes años completos de lluvia.</p>`;
  const pAnalogo = clima ? `<p class="ayuda">El dibujo muestra un año parecido (${clima.anio_analogo}):
      ${diasCalor != null ? `${diasCalor} días de calor fuerte en la floración` : "días de calor sin dato"} y
      ${num(rx5)} mm como lluvia máxima en 5 días. Es historia, no un pronóstico.</p>` : "";
  const sens = ext.sensibilidad_calor?.length ? `<div class="sens" aria-label="Cómo cambia el nivel de calor con el umbral">
      <span class="ayuda">Si el umbral fuera…</span>${ext.sensibilidad_calor.map((s) =>
        `<span class="sens-paso ${s.umbral_c === ext.umbral_calor_c ? "actual" : ""}"><b>${num(s.umbral_c, 0)} °C</b>
          ${etq(s.nivel)}<small>${s.anios}/${ext.anios} años</small></span>`).join("")}</div>` : "";
  return `<figure class="visual"><div class="cielo-lienzo">${svg}<canvas class="lluvia-canvas" data-lluvia="${Math.min(1.6,razon)}" aria-hidden="true"></canvas></div><figcaption><h4>El cielo de la floración</h4>${pCalor}${sens}${pLluvia}${pAnalogo}
    <p>${dato('Detalle del cielo y fuentes', {titulo:'Cielo histórico · valores y escala',fuente:riesgos.filter(r=>/Calor en floraci|Exceso de lluvia/.test(r.factor)).map(r=>r.fuente).join('; '),nota:JSON.stringify({clima,extremos})})}</p>
    <p class="ayuda">Floración: ${esc(ext.ventana_floracion ?? "por determinar")}.</p></figcaption></figure>`;
}
