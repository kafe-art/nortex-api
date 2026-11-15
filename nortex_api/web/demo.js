/* NORTEX — «Modo Demostración Jurado» (≈ 2 minutos).
 *
 * Recorrido cinemático guiado sobre la parcela de prueba `ejemplo_sl`. Siete pasos de ~17 s:
 * portal → vuelo orbital → laboratorio (sol) → suelo → línea del tiempo → 3 campañas → honestidad.
 * Cada paso maneja las escenas reales (las mismas funciones que usa el público) y redacta su texto con
 * lo que responde la API en ese momento: aquí no hay una sola cifra escrita a mano. Si `ejemplo_sl` no
 * existe o una consulta falla, se dice y no se sustituye por datos de demostración.
 * Narración: texto siempre; voz opcional con la síntesis del navegador (speechSynthesis, es-*).
 * Controles: pausa, siguiente, salir (Esc). Al salir se restauran parcela, ajustes y escena. */

import { $, esc, num, fechaCorta, NOMBRES, reducido } from "./util.js";

const PARCELA = "ejemplo_sl", SEGUNDOS = 17;
const TITULOS = ["La decisión va primero", "Del espacio a la chacra", "El sol de la floración", "La sed de la raíz",
  "El calendario de siembra", "Tres campañas que encajan", "La honestidad también es un resultado"];

export function iniciarDemo(ctx) {
  const { estado, escenas, navegar } = ctx;
  const panel = $("#demo"), boton = $("#btn-demo");
  let activo = false, paso = 0, token = 0, reloj = 0, pausado = false, voz = false, previo = null;

  const altos = (d) => (d.riesgo || []).filter((r) => r.nivel === "alto").length;
  const riesgo = (d, patron) => (d.riesgo || []).find((r) => patron.test(r.factor));
  const mirar = (sel) => document.querySelector(sel)?.scrollIntoView({ behavior: reducido() ? "instant" : "smooth", block: "center" });

  /* Los siete pasos. Cada uno devuelve el HTML de la narración, redactado con la respuesta de la API. */
  const PASOS = [
    async () => { navegar("portal");
      return `<p>En las herramientas de siempre, el agricultor llega a un mapa, un formulario y una tabla. <b>NORTEX invierte el orden</b>: primero la pregunta —¿qué siembro?, ¿cuándo?— y después el satélite.</p>
        <p>Todo lo que verás sale ahora mismo de la API, para la parcela de prueba <b>${esc(ctx.parcelaActiva()?.nombre || PARCELA)}</b> en Tambogrande, Piura.</p>`; },
    async () => { navegar("orbita", { silencioso: true });
      const vuelo = escenas.orbita.volar({}); const enlaces = await escenas.orbita.enlaces(); await vuelo;
      return `<p>El mapa es la revelación, no la bienvenida. Cada haz es una fuente que la API tiene archivada para esta chacra:</p>
        <ul>${enlaces.map((s) => `<li><b>${esc(s.nombre)}</b>: ${s.estado === "ok" ? `${num(s.filas)} registros${s.desde ? `, ${esc(s.desde.slice(0, 4))}–${esc(s.hasta.slice(0, 4))}` : ""}` : esc(s.estado)}</li>`).join("")}</ul>
        <p>Es historia satelital, no una señal en vivo ni un pronóstico.</p>`; },
    async () => { navegar("laboratorio", { silencioso: true });
      const d = await escenas.laboratorio.mostrar("caupi"); if (!d) throw new Error("La API no devolvió la evaluación del caupí.");
      mirar(".tri-sol"); const e = d.extremos || {}, r = riesgo(d, /Calor en floraci/i);
      return `<p>Frijol caupí sembrado el ${esc(fechaCorta(d.inicio))}. El sol vibra según la historia: <b>${e.anios_calor == null ? "calor por determinar" : `en ${e.anios_calor} de ${e.anios} años hubo calor peligroso en la floración`}</b>.</p>
        <p>${esc(r?.evidencia || "")}</p><p>${e.umbral_calor_validado === false ? "El umbral lleva borde punteado: es de literatura y está <b>por validar con INIA</b>." : ""}</p>`; },
    async () => { const d = await escenas.laboratorio.mostrar("caupi"); mirar(".tri-suelo");
      const r = riesgo(d, /turno/i), res = d.resultados?.[estado.escenario] || {};
      return `<p>El mismo cultivo, bajo tierra. ${esc(d.viabilidad.motivos?.[0] || "")}</p>
        <p><b>${esc(r ? `${r.factor}: ${r.evidencia}` : "Turnos de riego por determinar")}.</b> En el corte, el agua llega con el turno, el suelo se seca y las raíces se marchitan hasta el siguiente riego.</p>
        <p>${res.dias_estres?.valor == null ? "" : `Días con sed en la campaña: ${num(res.dias_estres.valor)}. `}El turno y la dotación son <b>datos de ejemplo</b> (borde punteado): falta el dato real de la junta.</p>`; },
    async () => { navegar("tiempo", { silencioso: true }); estado.cultivo = "caupi";
      const r = await escenas.tiempo.recorrer(); if (!r) throw new Error("La API no devolvió ventanas de siembra.");
      mirar("#calendario"); const tm = (d) => d.extremos?.tmax_floracion?.media_c;
      return `<p>Doce fechas de siembra, una por mes, evaluadas de verdad. Tres filas separadas en cada parcela mensual: viabilidad, riesgos altos y calor en floración.</p>
        <p>La API ordena primero el <b>${esc(fechaCorta(r.primera.inicio))}</b>: ${altos(r.primera)} riesgos altos${tm(r.primera) == null ? "" : ` y floración a ${num(tm(r.primera), 1)} °C de máxima media`}.
        La última del orden es el ${esc(fechaCorta(r.ultima.inicio))}: ${altos(r.ultima)} riesgos altos${tm(r.ultima) == null ? "" : `, ${num(tm(r.ultima), 1)} °C`}.</p>
        <p>Viabilidad en ambas: «${esc(r.primera.viabilidad.estado)}» y «${esc(r.ultima.viabilidad.estado)}». Cambiar la fecha baja el riesgo; no arregla por sí sola el agua.</p>`; },
    async () => { navegar("secuencia", { silencioso: true }); escenas.secuencia.entrar();
      const s = await escenas.secuencia.armar({ previo: "arroz", cultivos: ["arroz", "arroz", "mango"] }); if (!s) throw new Error("La secuencia no pudo evaluarse.");
      mirar("#rompecabezas");
      const reglas = s.flatMap((d, i) => (d.viabilidad.reglas_transicion || []).map((r) => `<li><b>${esc(r.regla)}</b> (${esc(r.tipo)}) al entrar ${esc(NOMBRES[d.cultivo])} en la campaña ${i + 1}: ${esc(r.texto)}</li>`));
      return `<p>Arroz, arroz otra vez y luego mango. Cada ficha se evalúa con lo sembrado antes, y las uniones se encienden con las reglas de transición que devuelve el motor:</p>
        <ul>${reglas.join("") || "<li>La API no activó reglas para esta secuencia.</li>"}</ul><p>Ámbar condiciona la viabilidad; azul solo informa.</p>`; },
    async () => { navegar("laboratorio", { silencioso: true });
      const d = await escenas.laboratorio.mostrar("caupi"); mirar(".cuatro");
      const m = d.conveniencia?.margen_soles_ha?.deficit_medio;
      return `<p>Cuatro lecturas, nunca un puntaje: viabilidad «${esc(d.viabilidad.estado)}»${d.viabilidad.definitiva === false ? " (provisional)" : ""}, ${altos(d)} riesgos altos,
        conveniencia ${m == null ? "<b>por determinar</b>" : `S/ ${num(m)} por ha`} y fundamentación «${esc(d.fundamentacion.nivel)}».</p>
        <p>${m == null ? `La balanza tiene candado: ${esc((d.conveniencia?.nota || "").trim())} ` : ""}Para afirmarlo mejor falta: ${esc((d.fundamentacion.faltantes || []).slice(0, 3).join("; ") || "nada declarado")}.</p>
        <p><b>NORTEX dice qué sabe, con qué dato y qué falta.</b></p>`; },
  ];

  function hablar(html) {
    speechSynthesis?.cancel();
    if (!voz || !("speechSynthesis" in globalThis)) return;
    const u = new SpeechSynthesisUtterance(Object.assign(document.createElement("div"), { innerHTML: html }).textContent.replace(/\s+/g, " "));
    u.lang = "es-PE"; u.voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("es")) || null; u.rate = 1.02;
    speechSynthesis.speak(u);
  }
  function programar() {
    clearTimeout(reloj);
    if (!pausado && activo) reloj = setTimeout(() => { if (voz && speechSynthesis?.speaking) programar(); else avanzar(); }, SEGUNDOS * 1000);
  }
  function barra(html, cargando = false) {
    panel.innerHTML = `<div class="demo-progreso"><i style="width:${((paso + (cargando ? 0 : 1)) / PASOS.length) * 100}%"></i></div>
      <p class="eyebrow">Demostración · ${paso + 1} de ${PASOS.length} · datos reales de ${esc(PARCELA)}</p>
      <h3>${esc(TITULOS[paso])}</h3><div class="demo-texto">${html}</div>
      <div class="fila-botones">
        <button type="button" data-demo="pausa">${pausado ? "Continuar" : "Pausar"}</button>
        <button type="button" data-demo="voz" aria-pressed="${voz}">${voz ? "Voz activada" : "Activar voz"}</button>
        <button type="button" class="primario" data-demo="sig" ${cargando ? "disabled" : ""}>${paso === PASOS.length - 1 ? "Terminar" : "Siguiente"}</button>
        <button type="button" data-demo="salir">Salir</button></div>`;
    $("[data-demo=pausa]", panel).onclick = () => { pausado = !pausado; if (pausado) { clearTimeout(reloj); speechSynthesis?.pause(); } else { speechSynthesis?.resume(); programar(); }
      $("[data-demo=pausa]", panel).textContent = pausado ? "Continuar" : "Pausar"; };
    $("[data-demo=voz]", panel).onclick = () => { voz = !voz; if (voz) hablar($(".demo-texto", panel).innerHTML); else speechSynthesis?.cancel();
      const b = $("[data-demo=voz]", panel); b.textContent = voz ? "Voz activada" : "Activar voz"; b.setAttribute("aria-pressed", voz); };
    $("[data-demo=sig]", panel).onclick = avanzar; $("[data-demo=salir]", panel).onclick = salir;
  }
  async function mostrar() {
    const t = ++token; clearTimeout(reloj);
    barra("<p>Consultando la API de NORTEX…</p>", true);
    try {
      const html = await PASOS[paso]();
      if (t !== token) return;
      barra(html); hablar(html); programar();
    } catch (e) {
      if (t !== token) return;
      pausado = true; barra(`<p class="aviso rojo">${esc(e.message)}</p><p>No se sustituyen datos ausentes por cifras de demostración.</p>`);
    }
  }
  function avanzar() { if (paso >= PASOS.length - 1) return salir(); paso++; mostrar(); }

  async function salir() {
    if (!activo) return;
    activo = false; token++; clearTimeout(reloj); speechSynthesis?.cancel();
    panel.hidden = true; document.body.classList.remove("en-demo"); boton.hidden = false;
    escenas.orbita.salir();
    ctx.fijarAjustes(previo.ajustes); estado.cultivo = previo.cultivo; estado.escenario = previo.escenario;
    if (previo.parcela !== estado.parcela) await ctx.elegirParcela(previo.parcela);
    navegar(previo.escena); boton.focus();
  }

  boton.onclick = async () => {
    if (activo) return;
    panel.hidden = false;
    if (!estado.parcelas.some((p) => p.aoi_id === PARCELA)) {
      panel.innerHTML = `<h3>Demostración no disponible</h3><p>La parcela <b>${esc(PARCELA)}</b> no existe en esta API. El recorrido usa solo datos reales: regístrala y descarga sus fuentes para verlo.</p>
        <div class="fila-botones"><button type="button" id="demo-cerrar">Cerrar</button></div>`;
      $("#demo-cerrar").onclick = () => { panel.hidden = true; }; return;
    }
    activo = true; paso = 0; pausado = false; boton.hidden = true; document.body.classList.add("en-demo");
    // Guarda lo del usuario y fija una consulta conocida: siembra el 15 de enero próximo, sin supuestos añadidos.
    const anio = new Date().getFullYear() + 1;
    previo = { parcela: estado.parcela, cultivo: estado.cultivo, escenario: estado.escenario, escena: estado.escena,
      ajustes: ctx.fijarAjustes({ inicio: `${anio}-01-15` }) };
    estado.cultivo = "caupi"; estado.escenario = "deficit_medio"; estado.volado = true;
    if (estado.parcela !== PARCELA) await ctx.elegirParcela(PARCELA);
    mostrar();
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && activo) salir(); });
}

