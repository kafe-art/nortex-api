/* NORTEX — «Recorrido Guiado para el Agricultor» (≈ 2 minutos).
 *
 * Recorrido paso a paso sobre la finca de referencia `ejemplo_sl` en lenguaje claro y directo de campo.
 * Siete pasos de ~17 s:
 *   1. bienvenida → 2. satélites sobre la chacra → 3. calor en la floración → 4. agua entre turnos →
 *   5. calendario de 12 meses → 6. rotación de 3 campañas → 7. resumen claro de las 4 lecturas.
 * Todas las cifras salen en vivo de la evaluación real de la parcela activa. */

import { $, esc, num, fechaCorta, NOMBRES, reducido } from "./util.js";

const PARCELA = "ejemplo_sl", SEGUNDOS = 17;
const TITULOS = [
  "Aquí mandas tú y tus dudas del campo",
  "El cielo vigila tu tierra desde hace 30 años",
  "¿Aguantará la flor cuando apriete el calor?",
  "¿Le alcanzará el agua entre turno y turno?",
  "Elegir bien el mes cambia toda tu campaña",
  "Tres campañas seguidas cuidando tu terreno",
  "Cuentas claras para que decidas seguro",
];

export function iniciarDemo(ctx) {
  const { estado, escenas, navegar } = ctx;
  const panel = $("#demo"), boton = $("#btn-demo");
  let activo = false, paso = 0, token = 0, reloj = 0, pausado = false, voz = false, previo = null;

  const altos = (d) => (d.riesgo || []).filter((r) => r.nivel === "alto").length;
  const mirar = (sel) => document.querySelector(sel)?.scrollIntoView({ behavior: reducido() ? "instant" : "smooth", block: "center" });

  /* Los siete pasos redactados en lenguaje cercano al productor, usando los datos reales de la consulta. */
  const PASOS = [
    async () => {
      navegar("portal");
      const nombre = ctx.parcelaActiva()?.nombre || "tu parcela en San Lorenzo";
      return `<p>En lugar de perderte en mapas y tablas difíciles, aquí empezamos por lo tuyo: dinos qué quieres sembrar o cuándo piensas iniciar tu campaña.</p>
        <p>Más de 30 años de historia del clima y del suelo hacen los cálculos por ti para <b>${esc(nombre)}</b>, aquí en el valle de San Lorenzo.</p>`;
    },
    async () => {
      navegar("orbita", { silencioso: true });
      const vuelo = escenas.orbita.volar({}); const enlaces = await escenas.orbita.enlaces(); await vuelo;
      const conectados = enlaces.filter((s) => s.estado === "ok").length;
      return `<p>Desde el espacio, <b>${conectados} satélites de la NASA</b> llevan décadas anotando cómo se comporta el clima sobre tu sector en Tambogrande:</p>
        <ul>
          <li><b>Calor y evaporación:</b> cuánto quema el sol en cada época del año.</li>
          <li><b>Lluvias y aguaceros:</b> cuándo llueve de más y cómo drena tu terreno.</li>
          <li><b>Relieve y suelo:</b> la pendiente y cuánta humedad retiene tu tierra.</li>
        </ul>
        <p>Con esa memoria real del valle sabemos qué meses son seguros y cuáles son riesgosos.</p>`;
    },
    async () => {
      navegar("laboratorio", { silencioso: true });
      const d = await escenas.laboratorio.mostrar("caupi"); if (!d) throw new Error("No se pudo consultar el cultivo.");
      mirar(".tri-sol"); const e = d.extremos || {};
      return `<p>Por ejemplo, si siembras <b>frijol caupí</b> el <b>${esc(fechaCorta(d.inicio))}</b>, mira lo que pasa cuando la planta está en plena floración:</p>
        <p><b>${e.anios_calor == null ? "Falta información de calor para esta etapa" : `En ${e.anios_calor} de los últimos ${e.anios} años hizo un calor tan fuerte que pudo tumbar la flor`}.</b></p>
        <p>Así sabes desde antes de comprar la semilla si el sol de esa fecha ayuda al cuajado o te puede bajar la cosecha.</p>`;
    },
    async () => {
      const d = await escenas.laboratorio.mostrar("caupi"); mirar(".tri-suelo");
      const res = d.resultados?.[estado.escenario] || {};
      const aut = res.autonomia_entre_turnos?.valor, turno = d.insumos_efectivos?.intervalo_dias?.valor, sed = res.dias_estres?.valor;
      return `<p>Ahora veamos qué pasa bajo tierra con tus riegos. ${aut != null && turno != null
        ? `Tu suelo guarda humedad para unos <b>${num(aut, 1)} días</b>, pero si el turno de agua llega cada <b>${num(turno)} días</b>, la raíz se queda pasando sed antes del siguiente riego.`
        : esc(d.viabilidad.motivos?.[0] || "")}</p>
        <p>${sed == null ? "" : `En toda la campaña la planta sufriría <b>${num(sed)} días de falta de agua</b>. `}Si en tu comisión de regantes el turno es distinto, puedes ajustarlo arriba para ver cómo mejora tu cultivo.</p>`;
    },
    async () => {
      navegar("tiempo", { silencioso: true }); estado.cultivo = "caupi";
      const r = await escenas.tiempo.recorrer(); if (!r) throw new Error("No se pudieron calcular las fechas del año.");
      mirar("#calendario"); const tm = (d) => d.extremos?.tmax_floracion?.media_c;
      return `<p>Si sembrar en verano quema la flor, ¿qué pasa si cambiamos de mes? Aquí ves los <b>12 meses del año</b> como parcelas para comparar de un vistazo.</p>
        <p>Sembrando el <b>${esc(fechaCorta(r.primera.inicio))}</b> la floración cae en días más frescos (${tm(r.primera) == null ? "" : `<b>${num(tm(r.primera), 1)} °C</b> de máxima promedio y `}${altos(r.primera)} riesgos altos), mucho mejor que sembrar el ${esc(fechaCorta(r.ultima.inicio))}${tm(r.ultima) == null ? "" : ` (${num(tm(r.ultima), 1)} °C)`}.</p>
        <p>Cambiar el mes te libra del golpe de calor, aunque igual debes cuidar que el turno de agua alcance.</p>`;
    },
    async () => {
      navegar("secuencia", { silencioso: true }); escenas.secuencia.entrar();
      const s = await escenas.secuencia.armar({ previo: "arroz", cultivos: ["arroz", "arroz", "mango"] }); if (!s) throw new Error("La secuencia no pudo revisarse.");
      mirar("#rompecabezas");
      const avisos = s.flatMap((d, i) => (d.viabilidad.reglas_transicion || []).map((r) => `<li><b>Campaña ${i + 1} (${esc(NOMBRES[d.cultivo])}):</b> ${esc(r.texto)}</li>`));
      return `<p>Un buen agricultor piensa en las campañas que vienen. Aquí armamos tres siembras seguidas para ver si combinan bien:</p>
        <ul>${avisos.join("") || "<li>Esta rotación no presenta choques entre campañas.</li>"}</ul>
        <p>Así evitas cansar la tierra repitiendo el mismo cultivo o meterte a un frutal sin tener asegurada el agua todo el año.</p>`;
    },
    async () => {
      navegar("laboratorio", { silencioso: true });
      const d = await escenas.laboratorio.mostrar("caupi"); mirar(".cuatro");
      const m = d.conveniencia?.margen_soles_ha?.deficit_medio;
      return `<p>Para que tomes tu decisión con tranquilidad, siempre te damos cuatro respuestas claras y por separado:</p>
        <ul>
          <li><b>¿Alcanza el agua y cumple el manejo?:</b> ${esc(d.viabilidad.estado)}.</li>
          <li><b>¿Qué riesgos tuvo el clima?:</b> ${altos(d)} riesgos fuertes detectados en la historia del valle.</li>
          <li><b>¿Deja cuenta en el bolsillo?:</b> ${m == null ? "puedes subir tus costos y precios en «Mi parcela» para calcular tu ganancia por hectárea" : `alrededor de S/ ${num(m)} por hectárea`}.</li>
          <li><b>¿Qué tan completos están los datos?:</b> ${esc(d.fundamentacion.nivel)}.</li>
        </ul>`;
    },
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
      <p class="eyebrow">Guía rápida · Paso ${paso + 1} de ${PASOS.length} · Valle de San Lorenzo</p>
      <h3>${esc(TITULOS[paso])}</h3><div class="demo-texto">${html}</div>
      <div class="fila-botones">
        <button type="button" data-demo="pausa">${pausado ? "Continuar" : "Pausar"}</button>
        <button type="button" data-demo="voz" aria-pressed="${voz}">${voz ? "Voz activada" : "Escuchar con voz"}</button>
        <button type="button" class="primario" data-demo="sig" ${cargando ? "disabled" : ""}>${paso === PASOS.length - 1 ? "Terminar" : "Siguiente"}</button>
        <button type="button" data-demo="salir">Salir</button></div>`;
    $("[data-demo=pausa]", panel).onclick = () => { pausado = !pausado; if (pausado) { clearTimeout(reloj); speechSynthesis?.pause(); } else { speechSynthesis?.resume(); programar(); }
      $("[data-demo=pausa]", panel).textContent = pausado ? "Continuar" : "Pausar"; };
    $("[data-demo=voz]", panel).onclick = () => { voz = !voz; if (voz) hablar($(".demo-texto", panel).innerHTML); else speechSynthesis?.cancel();
      const b = $("[data-demo=voz]", panel); b.textContent = voz ? "Voz activada" : "Escuchar con voz"; b.setAttribute("aria-pressed", voz); };
    $("[data-demo=sig]", panel).onclick = avanzar; $("[data-demo=salir]", panel).onclick = salir;
  }
  async function mostrar() {
    const t = ++token; clearTimeout(reloj);
    barra("<p>Calculando con la historia climática de tu parcela en San Lorenzo…</p>", true);
    try {
      const html = await PASOS[paso]();
      if (t !== token) return;
      barra(html); hablar(html); programar();
    } catch (e) {
      if (t !== token) return;
      pausado = true; barra(`<p class="aviso rojo">${esc(e.message)}</p>`);
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
      panel.innerHTML = `<h3>Recorrido guiado no disponible</h3><p>Selecciona o registra primero una parcela en San Lorenzo para ver el recorrido.</p>
        <div class="fila-botones"><button type="button" id="demo-cerrar">Cerrar</button></div>`;
      $("#demo-cerrar").onclick = () => { panel.hidden = true; }; return;
    }
    activo = true; paso = 0; pausado = false; boton.hidden = true; document.body.classList.add("en-demo");
    const anio = new Date().getFullYear() + 1;
    previo = { parcela: estado.parcela, cultivo: estado.cultivo, escenario: estado.escenario, escena: estado.escena,
      ajustes: ctx.fijarAjustes({ inicio: `${anio}-01-15` }) };
    estado.cultivo = "caupi"; estado.escenario = "deficit_medio"; estado.volado = true;
    if (estado.parcela !== PARCELA) await ctx.elegirParcela(PARCELA);
    mostrar();
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && activo) salir(); });
}
