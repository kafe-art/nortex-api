/* NORTEX — Escena 2 · «El Laboratorio de Cultivos» (F2 · ¿qué siembro?).
 *
 * Una sola llamada real: POST /evaluar/f2 con los cinco cultivos del catálogo. La respuesta trae una
 * decisión por cultivo, así que al deslizar la baraja el suelo y el cielo cambian al instante, sin red.
 *
 * Orquestación:
 *   · La baraja 3D (coverflow) se mueve con un resorte (util.resorte): `pos` es la posición continua y
 *     cada carta se coloca con translate/rotateY según su distancia a `pos`. Arrastre, rueda, flechas
 *     y toque cambian el objetivo del resorte.
 *   · El orden de las cartas es el de `tabla` (el orden que decide la API). No se reordena aquí.
 *   · Metáforas de cada carta, todas con dato real y procedencia al tocar:
 *       gotas   ← tabla[].demanda_neta_mm (relativa al cultivo más sediento de esta consulta)
 *       soles   ← extremos.frecuencia_calor (fracción de años con calor en floración)
 *       monedas ← costo_soles_ha de GET /datos/economia; sin plantilla económica: candado
 *   · Al asentarse la carta se monta su autopsia (visuales/autopsia.js) y el cielo de fondo se tiñe
 *     con extremos.tmax_floracion.media_c. */

import { evaluar } from "../api.js";
import { $, $$, esc, num, pct, NOMBRES, resorte, inclinar, limitar, calor01, fechaCorta, errorHtml, cargando } from "../util.js";
import { cultivoVivo } from "../visuales/cultivos.js";
import { montarAutopsia } from "../visuales/autopsia.js";
import { costoDe } from "../visuales/balanza.js";

const ICONOS = {
  gota: '<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
  sol: '<circle cx="12" cy="12" r="4.500"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  moneda: '<circle cx="12" cy="12" r="8"/><path d="M12 7.500v9M9.500 10c0-1.500 5-1.500 5 0s-5 1.500-5 3 5 1.500 5 0"/>',
  candado: '<path d="M8 11V8a4 4 0 018 0v3"/><rect x="6" y="11" width="12" height="9" rx="2"/>',
};
/** Fila de 5 iconos; `llenos` encendidos. `null` = por determinar (huecos y punteados). */
const fila = (icono, llenos) => `<span class="iconos iconos-${icono}${llenos == null ? " sin-dato" : ""}" aria-hidden="true">${
  Array.from({ length: 5 }, (_, i) => `<svg viewBox="0 0 24 24" class="${llenos != null && i < llenos ? "lleno" : ""}">${ICONOS[icono]}</svg>`).join("")}</span>`;
const metafora = (clase, cuerpo, etiqueta, info) => `<li><button type="button" class="metafora ${clase}"
  data-proc="${esc(JSON.stringify(info))}" aria-label="${esc(`${etiqueta}: ${info.valor}. Ver de dónde sale`)}">${cuerpo}<small>${esc(etiqueta)}</small></button></li>`;

export function crearLaboratorio(ctx) {
  const { estado, ambiente } = ctx;
  const baraja = $("#baraja"), zona = $("#lab-autopsia");
  let ticket = 0, resp = null, orden = [], activo = 0, autopsia = null, espera = 0, cartas = [], elegido = null;

  const cuerpo = () => ({ aoi_id: estado.parcela, inicio: estado.inicio, cultivos: estado.cultivos.map((c) => c.id), ...ctx.opciones() });
  const pos = resorte({ rigidez: 150, amortiguacion: 19, alCambiar: colocar });

  /** Coloca cada carta en el espacio 3D según su distancia `o` a la posición del resorte. */
  function colocar(x) {
    cartas.forEach((el, i) => {
      const o = i - x, a = Math.abs(o);
      el.style.transform = `translateX(${o * 62}%) translateZ(${-a * 170}px) rotateY(${limitar(o, -1.4, 1.4) * -30}deg) scale(${1 - Math.min(0.2, a * 0.08)})`;
      el.style.zIndex = String(100 - Math.round(a * 10));
      el.style.opacity = String(1 - Math.min(0.72, a * 0.3));
    });
  }

  function carta(d, i) {
    const cat = estado.cultivos.find((c) => c.id === d.cultivo), fila_ = resp.tabla[i] || {};
    const maxSed = Math.max(...resp.tabla.map((t) => t.demanda_neta_mm || 0));
    const sed = fila_.demanda_neta_mm, gotas = sed == null || !maxSed ? null : Math.max(1, Math.round((sed / maxSed) * 5));
    const f = d.extremos?.frecuencia_calor, soles = f == null ? null : f === 0 ? 0 : Math.max(1, Math.round(f * 5));
    const costo = costoDe(estado.economia, d.cultivo);
    const maxCosto = Math.max(0, ...estado.cultivos.map((c) => costoDe(estado.economia, c.id)?.costo_soles_ha || 0));
    const umbralPend = d.extremos?.umbral_calor_validado === false;
    return `<div class="carta" role="option" data-i="${i}" aria-selected="false" id="carta-${esc(d.cultivo)}">
      <div class="carta-cuerpo">
        <span class="carta-orden">${i + 1}.º en el orden de la API</span>
        ${cultivoVivo(d.cultivo)}
        <h3>${esc(cat?.nombre || NOMBRES[d.cultivo])}</h3>
        <p class="cientifico"><i>${esc(cat?.cientifico || "")}</i> · ${cat?.ciclo_dias ? `${cat.ciclo_dias} días` : esc(cat?.tipo || "")}</p>
        <ul class="metaforas">
          ${metafora("", fila("gota", gotas), "Sed de la campaña", { titulo: "Demanda neta de agua", valor: sed == null ? "por determinar" : `${num(sed)} mm`,
            fuente: "POST /evaluar/f2 · tabla.demanda_neta_mm (Σ máx(0, ETc − lluvia), déficit medio)", categoria: "simulado",
            nota: "Las gotas comparan los cultivos de esta consulta: 5 gotas = el más sediento.", estado: sed == null ? "por determinar" : "real" })}
          ${metafora(umbralPend || soles == null ? "provisional" : "", fila("sol", soles), "Años con calor en floración", { titulo: "Calor en floración · frecuencia histórica",
            valor: f == null ? "por determinar" : `${d.extremos.anios_calor} de ${d.extremos.anios} años (${pct(f)})`, fuente: `extremos.frecuencia_calor · umbral ${
              d.extremos?.umbral_calor_c ?? "—"} °C (${d.extremos?.umbral_calor_origen ?? "sin umbral"})`, categoria: "observado",
            nota: f == null ? "La ficha no trae ventana de floración o umbral." : "Cada sol ≈ 1 de cada 5 años. Umbral por validar con INIA mientras no esté validado.",
            estado: f == null ? "por determinar" : umbralPend ? "por validar" : "real" })}
          ${metafora(costo ? "" : "bloqueada", costo ? fila("moneda", Math.max(1, Math.round((costo.costo_soles_ha / maxCosto) * 5)))
            : `<span class="iconos iconos-candado" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONOS.candado}</svg></span>`, "Inversión por hectárea", {
            titulo: "Costo de producción", valor: costo ? `S/ ${num(costo.costo_soles_ha)} por ha` : "por determinar", fuente: costo?.fuente ?? "GET /datos/economia sin filas para este cultivo",
            nota: costo ? "Dato declarado (SIEA / MIDAGRI)." : "Falta la plantilla económica (rendimiento, precio y costo).", estado: costo ? "real" : "por determinar" })}
        </ul>
        ${d.viabilidad.definitiva === false ? '<span class="sello-provisional">resultado provisional</span>' : ""}
      </div></div>`;
  }

  function enfocar(i, { inmediato = false } = {}) {
    if (!orden.length) return;
    activo = limitar(Math.round(i), 0, orden.length - 1);
    inmediato ? pos.fijar(activo) : pos.ir(activo);
    const d = orden[activo]; estado.cultivo = elegido = d.cultivo;
    cartas.forEach((el, k) => { el.classList.toggle("activa", k === activo); el.setAttribute("aria-selected", k === activo); });
    baraja.setAttribute("aria-activedescendant", cartas[activo].id);
    ambiente.calor(calor01(d.extremos?.tmax_floracion?.media_c));
    clearTimeout(espera);                                    // la autopsia espera a que la carta se asiente
    espera = setTimeout(() => {
      autopsia?.destruir();
      autopsia = montarAutopsia(zona, { decision: d, catalogo: estado.cultivos, economia: estado.economia,
        escenario: estado.escenario, alCambiarEscenario: (e) => { estado.escenario = e; } });
    }, inmediato ? 0 : 160);
  }

  async function cargar() {
    const t = ++ticket, v = estado.version, p = ctx.parcelaActiva();
    $("#lab-contexto").innerHTML = p ? `${esc(p.nombre)} · siembra el <button type="button" class="enlace" id="lab-fecha">${esc(fechaCorta(estado.inicio))}</button> · compara los cinco cultivos del valle`
      : "Elige o registra una chacra para empezar.";
    $("#lab-fecha")?.addEventListener("click", () => ctx.abrirAjustes(true));
    if (!estado.parcela) { baraja.innerHTML = ""; zona.innerHTML = errorHtml("Elige una chacra primero (Mi parcela)."); return; }
    if (!resp) zona.innerHTML = cargando("Consultando el motor de NORTEX con la historia de tu chacra…");
    baraja.setAttribute("aria-busy", "true");
    try {
      const r = await evaluar("f2", cuerpo());
      if (t !== ticket || v !== estado.version) return;
      resp = r;
      // Orden de la API: cada fila de `tabla` con su decisión. Nada se reordena en el navegador.
      orden = (r.tabla || []).map((f) => (r.decisiones || []).find((d) => d.cultivo === f.cultivo && d.inicio === f.inicio)).filter(Boolean);
      if (!orden.length) { baraja.innerHTML = ""; zona.innerHTML = errorHtml("La API no devolvió decisiones para esta consulta."); return; }
      baraja.innerHTML = orden.map(carta).join("");
      cartas = $$(".carta", baraja);
      cartas.forEach((el) => inclinar($(".carta-cuerpo", el), 7));
      $("#lab-contexto").insertAdjacentHTML("beforeend", ` · <span title="Regla de orden de la API">orden: ${esc(r.regla_orden)}</span>`);
      const previo = orden.findIndex((d) => d.cultivo === elegido);   // sin elección previa: la primera del orden de la API
      enfocar(previo >= 0 ? previo : 0, { inmediato: true });
    } catch (e) {
      if (t === ticket && v === estado.version) { baraja.innerHTML = ""; cartas = []; orden = []; resp = null; zona.innerHTML = errorHtml(e); }
    } finally { if (t === ticket) baraja.removeAttribute("aria-busy"); }
  }

  /* Gestos: arrastre con seguimiento directo y suelta con resorte; toque = elegir esa carta. */
  let arrastre = null;
  baraja.addEventListener("pointerdown", (ev) => {
    if (!cartas.length || ev.target.closest("[data-proc]")) return;
    arrastre = { x: ev.clientX, pos: pos.valor, movido: false, carta: ev.target.closest(".carta") };
  });
  addEventListener("pointermove", (ev) => {
    if (!arrastre) return;
    const dx = ev.clientX - arrastre.x;
    if (Math.abs(dx) > 6) arrastre.movido = true;
    if (arrastre.movido) pos.fijar(limitar(arrastre.pos - dx / (cartas[0].offsetWidth * 0.62), -0.4, cartas.length - 0.6));
  });
  addEventListener("pointerup", () => {
    if (!arrastre) return;
    const a = arrastre; arrastre = null;
    if (a.movido) enfocar(pos.valor); else if (a.carta) enfocar(Number(a.carta.dataset.i));
  });
  baraja.addEventListener("keydown", (ev) => {
    const paso = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
    if (paso) { ev.preventDefault(); enfocar(activo + paso); }
    if (ev.key === "Home") { ev.preventDefault(); enfocar(0); }
    if (ev.key === "End") { ev.preventDefault(); enfocar(orden.length - 1); }
  });
  let rueda = 0;
  baraja.addEventListener("wheel", (ev) => {
    if (Math.abs(ev.deltaX) < Math.abs(ev.deltaY) || Date.now() - rueda < 320) return;
    ev.preventDefault(); rueda = Date.now(); enfocar(activo + Math.sign(ev.deltaX));
  }, { passive: false });

  return {
    entrar: cargar, refrescar: cargar,
    salir() { autopsia?.destruir(); autopsia = null; zona.innerHTML = ""; resp = null; },
    precargar: () => (estado.parcela ? evaluar("f2", cuerpo()) : null),
    /** Para la demostración: enfoca un cultivo y devuelve su decisión. */
    async mostrar(cultivo) {
      await cargar(); const i = orden.findIndex((d) => d.cultivo === cultivo);
      if (i >= 0) enfocar(i, { inmediato: true });
      await new Promise((r) => setTimeout(r, 60));          // deja montar la autopsia antes de desplazarse a ella
      return orden[i >= 0 ? i : activo];
    },
  };
}
