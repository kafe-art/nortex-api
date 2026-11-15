/* Turnos de riego: una gota llega cada `intervalo` días; el suelo aguanta `autonomia_entre_turnos`.
 * Si el turno es más largo, la planta se marchita entre gotas (`estres_por_turno`). */
import { esc, num, dato, datoRes, etq } from "../util.js";

/** @param intervalo {valor, fuente} o null si no se conoce. */
export function turnos({ res, intervalo, riesgo }) {
  const aut = res.autonomia_entre_turnos?.valor, est = res.estres_por_turno?.valor;
  if (aut == null) {
    return `<figure class="visual"><figcaption><h4>Turnos de riego</h4><p>${etq("por determinar", "gris")}
      El motor no calcula cuánto aguanta el suelo entre riegos para este cultivo.</p></figcaption></figure>`;
  }
  const dias = intervalo?.valor ?? null;
  const total = Math.max(dias ?? 0, aut) * 2 || 1;
  const X = (d) => 20 + (d / total) * 280;
  let cuerpo = "";
  const ciclos = dias ? [0, dias] : [0];
  for (const d0 of ciclos) {
    const finVerde = Math.min(d0 + aut, dias ? d0 + dias : d0 + aut);
    cuerpo += `<rect class="aguanta" x="${X(d0)}" y="62" width="${X(finVerde) - X(d0)}" height="12" rx="4"/>`;
    if (dias && est > 0) {
      cuerpo += `<rect class="sed" x="${X(finVerde) + 2}" y="62" width="${Math.max(0, X(d0 + dias) - X(finVerde) - 4)}" height="12" rx="4"/>
        <g class="mustia" transform="translate(${(X(finVerde) + X(d0 + dias)) / 2} 58)"><path d="M0 0 C 0 -10, 2 -16, 8 -18"/><path d="M8 -18 c 6 2, 8 8, 6 12 c -4 -3, -6 -7, -6 -12Z"/></g>`;
    }
  }
  const gotas = (dias ? [0, dias, dias * 2] : [0]).map((d) => `<g class="gota-turno" transform="translate(${X(d)} 34)">
      <path d="M0 -14 C 7 -4, 9 2, 0 8 C -9 2, -7 -4, 0 -14Z"/></g>
      <text x="${X(d)}" y="92" text-anchor="middle" class="rotulo">día ${num(d, 0)}</text>`).join("");
  const aria = dias ? `Turnos de riego: el agua llega cada ${num(dias, 0)} días y el suelo aguanta ${num(aut, 1)} días.`
    : `El suelo aguanta ${num(aut, 1)} días entre riegos; no se conoce el intervalo de turnos.`;
  const svg = `<svg class="v-turnos" viewBox="0 0 320 100" role="img" aria-label="${esc(aria)}">
    <line x1="20" y1="68" x2="300" y2="68" class="eje"/>${cuerpo}${gotas}
    ${dias ? `<circle class="hoy" r="5" cy="68"><animate attributeName="cx" from="20" to="300" dur="8s" repeatCount="indefinite"/></circle>` : ""}
  </svg>`;
  const iv = dias ? dato(`${num(dias, 0)} días`, { titulo: "Intervalo entre turnos de riego", fuente: intervalo.fuente }) : null;
  const texto = dias
    ? `<p>El agua llega cada <b>${iv}</b>. El suelo aguanta <b>${datoRes(res.autonomia_entre_turnos, "Autonomía entre turnos", { d: 1 })}</b>.
       ${est > 0 ? `Quedan <b>${datoRes(res.estres_por_turno, "Días de sed por turno", { d: 1 })}</b> de sed entre riego y riego.`
         : "El suelo aguanta hasta el siguiente riego."}</p>`
    : `<p>El suelo aguanta <b>${datoRes(res.autonomia_entre_turnos, "Autonomía entre turnos", { d: 1 })}</b> sin riego.
       Intervalo de turnos: ${etq("por determinar", "gris")} (cargue los turnos de la comisión).</p>`;
  return `<figure class="visual">${svg}<figcaption><h4>Turnos de riego</h4>${texto}
    ${riesgo ? `<p class="ayuda">Riesgo global de la decisión (referencia: déficit medio): ${etq(`riesgo ${riesgo.nivel}`)} ${esc(riesgo.evidencia)}</p>` : ""}</figcaption></figure>`;
}
