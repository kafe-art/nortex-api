/* NORTEX — Escena 1 · «El Portal de la Chacra».
 *
 * Entrada a pantalla completa: dos puertas grandes con inclinación 3D (util.inclinar) que responden al
 * dedo o al ratón. No hay mapa: el satélite llega después, como revelación (app.porLaPuerta).
 * El cielo del portal se tiñe con un dato real: la Tmax media histórica del mes en curso para la
 * parcela activa (GET /parcelas/{id}/serie/power?variable=tmax&agregado=mensual). Si no hay serie,
 * el cielo queda neutro y no se rotula nada. */

import { leer } from "../api.js";
import { $, $$, num, dato, inclinar, calor01, MESES_LARGO } from "../util.js";

export function crearPortal(ctx) {
  const { estado, ambiente } = ctx;
  $$(".puerta").forEach((p) => { inclinar(p, 10); p.onclick = () => ctx.porLaPuerta(p.dataset.puerta); });
  const nota = document.createElement("p"); nota.className = "portal-cielo ayuda"; $(".portal").append(nota);

  async function cielo() {
    const id = estado.parcela, v = estado.version;
    nota.innerHTML = ""; ambiente.calor(null);
    if (!id) return;
    try {
      const filas = await leer(`/parcelas/${id}/serie/power?variable=tmax&agregado=mensual`);
      if (v !== estado.version || estado.escena !== "portal") return;
      const mes = new Date().getMonth() + 1, delMes = filas.filter((f) => f.mes === mes && Number.isFinite(f.media));
      if (!delMes.length) return;
      const dias = delMes.reduce((a, f) => a + f.dias, 0), media = delMes.reduce((a, f) => a + f.media * f.dias, 0) / dias;
      ambiente.calor(calor01(media));
      nota.innerHTML = `El cielo se tiñe con la historia de ${MESES_LARGO[mes - 1]} en esta chacra: máxima media de ${dato(`${num(media, 1)} °C`, {
        titulo: `Tmax media histórica · ${MESES_LARGO[mes - 1]}`, fuente: "NASA POWER · /serie/power · agregado mensual",
        nota: `${delMes.length} años (${delMes[0].anio}–${delMes.at(-1).anio}). Historia del mes, no el tiempo de hoy.`, categoria: "modelado" })}.`;
    } catch { /* sin serie: cielo neutro, sin rótulo */ }
  }
  return { entrar: cielo, refrescar: cielo };
}
