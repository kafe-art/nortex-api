/* NORTEX — «La Sed de la Raíz»: corte vertical del suelo en Canvas 2D.
 *
 * Tres piezas:
 *   modeloSuelo()   pura · convierte los campos de la API en parámetros gráficos (probada en tests/).
 *   leyendaSuelo()  pura · HTML con las cifras tocables y su procedencia.
 *   pintarSuelo()   anima el corte en un <canvas> y devuelve {destruir()}.
 *
 * Qué dato mueve cada cosa (todo viene de `decision.resultados[escenario]` salvo donde se indica):
 *   profundidad de raíces ← catálogo zr_m (escala visual: 1,5 m = fondo del corte)
 *   grietas              ← dias_estres_etapa_critica y dias_estres (cantidad = mín(9, ⌈críticos/4⌉ + 1 si hay estrés))
 *   color ocre del suelo ← 1 − ks_minimo cuando no hay turnos; con turnos, el ciclo de abajo
 *   goteo y ciclo        ← insumos_efectivos.intervalo_dias (turno de la junta), autonomia_entre_turnos
 *                          y estres_por_turno: llega el agua (día 0), el suelo se seca durante la autonomía
 *                          y, si el turno tarda más, las raíces se marchitan hasta el siguiente riego.
 *   brillos azules       ← cobertura_hidrica ≥ 1
 *   charco               ← riesgo «Exceso de lluvia (potencial)» medio o alto
 *   lluvia               ← clima_escenarios[].exceso_lluvia del año análogo
 * El ciclo compara dos duraciones que entrega el motor; no es una simulación diaria en el navegador.
 * El vapor es decorativo. Se pausa fuera de pantalla y respeta «reducir movimiento». */

import { esc, num, pct, dato, datoRes, etq, azar, limitar, mezclar, mezclarColor, reducido } from "../util.js";

const PROF_MAX = 1.5;      // metros representados en el corte
const DURACION = 9;        // segundos que dura un turno de riego en pantalla

export function modeloSuelo({ res = {}, zr, intervalo, exceso, clima, tipo, cultivo } = {}) {
  const v = (k) => (typeof res[k]?.valor === "number" ? res[k].valor : null);
  const zrM = typeof zr?.valor === "number" ? zr.valor : null;
  const ks = v("ks_minimo"), dias = v("dias_estres"), criticos = v("dias_estres_etapa_critica"), ciclo = v("ciclo");
  const autonomia = v("autonomia_entre_turnos"), estresTurno = v("estres_por_turno");
  const turno = typeof intervalo?.valor === "number" ? intervalo.valor : null;
  return {
    cultivo: cultivo ?? "", perenne: tipo === "perenne",
    zr: zrM, zrEscala: zrM == null ? null : Math.min(PROF_MAX, zrM) / PROF_MAX,
    ks, sequedad: ks == null ? null : limitar(1 - ks),
    dias, criticos, ciclo,
    grietas: dias == null && criticos == null ? null : Math.min(9, Math.ceil((criticos ?? 0) / 4) + (dias > 0 ? 1 : 0)),
    largoGrieta: dias != null && ciclo > 0 ? limitar(dias / ciclo, 0.15, 1) : 0.4,
    autonomia, estresTurno, turno,
    conCiclo: turno != null && autonomia != null,          // ¿hay con qué animar los turnos?
    marchita: estresTurno != null && estresTurno > 0,
    cobertura: v("cobertura_hidrica"),
    charco: /^(medio|alto)$/.test(exceso?.nivel ?? ""),
    lluvia: clima?.exceso_lluvia === true,
    sinDatos: ks == null && dias == null,
  };
}

export function leyendaSuelo(m, { res = {}, intervalo, zr, extremos } = {}) {
  const ex = extremos || {};
  const titular = !m.conCiclo ? (m.sinDatos ? "Sin información de estrés hídrico" : "Turnos de riego por determinar")
    : m.marchita ? `El suelo aguanta ${num(m.autonomia, 1)} días y el agua llega cada ${num(m.turno)}: la raíz pasa sed`
      : `El suelo aguanta ${num(m.autonomia, 1)} días y el agua llega cada ${num(m.turno)}: alcanza entre turnos`;
  const infoTurno = { titulo: "Turno de riego usado en la evaluación", fuente: intervalo?.fuente, nota: intervalo?.nota, categoria: "declarado" };
  const infoZr = { titulo: "Profundidad de raíces (Zr)", fuente: zr?.fuente,
    estado: zr?.estado === "VALIDADO" ? "real" : "por validar", nota: "Ficha del cultivo. Escala del dibujo limitada a 1,5 m." };
  return `<figcaption>
    <b>${esc(titular)}</b>
    <ul class="suelo-fichas">
      <li><small>Turno de la junta</small>${m.turno == null ? dato("por determinar", { ...infoTurno, estado: "por determinar" })
        : dato(`cada ${num(m.turno)} días`, infoTurno)}</li>
      <li><small>Aguante del suelo</small>${datoRes(res.autonomia_entre_turnos, "Autonomía entre turnos", { d: 1 })}</li>
      <li><small>Días de sed en la campaña</small>${datoRes(res.dias_estres, "Días con estrés hídrico (Ks < 1)")}</li>
    </ul>
    <details class="suelo-mas">
      <summary>Más datos del suelo y del riego</summary>
      <ul class="suelo-fichas">
        <li><small>Sed por turno</small>${datoRes(res.estres_por_turno, "Estrés por turno", { d: 1 })}</li>
        <li><small>…en la etapa crítica</small>${datoRes(res.dias_estres_etapa_critica, "Días de estrés en la etapa crítica")}</li>
        <li><small>Riego que cubre la demanda</small>${datoRes(res.cobertura_hidrica, "Cobertura hídrica (dotación / demanda bruta)", { comoPct: true })}</li>
        <li><small>Raíces hasta</small>${m.zr == null ? dato("por determinar", { ...infoZr, estado: "por determinar" })
          : dato(`${num(m.zr, 1)} m`, infoZr)}</li>
      </ul>
    </details>
    ${ex.anios ? `<details class="suelo-mas">
      <summary>Lluvia extrema y anegamiento (${esc(ex.fuente_lluvia || "fuente no declarada")})</summary>
      <ul class="suelo-fichas">
        <li><small>Años con aguacero extremo</small>${dato(`${num(ex.anios_exceso)} de ${num(ex.anios)}`, {
          titulo: "Años con lluvia extrema en 5 días", fuente: ex.fuente_lluvia || "clima histórico",
          nota: "Cuenta años del registro histórico; no es un pronóstico.", categoria: "observado" })}</li>
        <li><small>Frecuencia histórica</small>${dato(pct(ex.frecuencia_exceso), {
          titulo: "Frecuencia de exceso", fuente: ex.fuente_lluvia || "clima histórico",
          nota: `${num(ex.anios_exceso)} de ${num(ex.anios)} años superaron el umbral.`, categoria: "observado" })}</li>
        <li><small>Umbral (5 días)</small>${dato(`${num(ex.umbral_rx5day_mm)} mm`, {
          titulo: "Umbral de lluvia acumulada en 5 días", fuente: ex.fuente_lluvia || "clima histórico",
          nota: "Lluvia acumulada en 5 días que se considera aguacero extremo.", categoria: "observado" })}</li>
        <li><small>Peor año del registro</small>${ex.peor_anio_lluvia ? dato(
          `${ex.peor_anio_lluvia.anio}: ${num(ex.peor_anio_lluvia.rx5day_mm)} mm`, {
            titulo: "Peor año de lluvia en 5 días", fuente: ex.fuente_lluvia || "clima histórico",
            nota: "Año con el mayor acumulado de 5 días.", categoria: "observado" })
          : dato("por determinar", { estado: "por determinar" })}</li>
        <li><small>Sensibilidad al anegamiento</small>${dato(ex.sensibilidad_anegamiento ?? "por determinar", {
          titulo: "Sensibilidad del cultivo al anegamiento", fuente: "ficha del cultivo",
          categoria: ex.sensibilidad_anegamiento ? "declarado" : "por determinar" })}</li>
        <li><small>Nivel de exceso</small>${etq(ex.nivel_exceso ?? "por determinar")}</li>
      </ul>
      <p class="ayuda">El charco del dibujo es potencial: refleja historia de lluvia, no agua vista en la parcela.</p>
    </details>` : ""}
    <p class="ayuda">${m.charco ? "Charco: riesgo potencial de exceso de lluvia medio o alto, no encharcamiento observado. " : ""}${
      m.cobertura != null && m.cobertura >= 1 ? `Brillos: la dotación cubre la demanda (${pct(m.cobertura)}). ` : ""}${
      m.conCiclo ? "El ciclo compara dos duraciones del motor; no es el estado de hoy." : "Sin turno o autonomía no se anima el ciclo de riego."}</p>
  </figcaption>`;
}

/* ---- Pintor ------------------------------------------------------------------------------------- */

function raices(m, cx, y0, zrPx, rnd) {
  const segs = [];
  const brote = (x, y, ang, largo, grosor, nivel) => {
    if (nivel > 4 || largo < 5) return;
    const x2 = x + Math.sin(ang) * largo, y2 = Math.min(y0 + zrPx, y + Math.cos(ang) * largo);
    segs.push({ x, y, x2, y2, grosor, fondo: (y2 - y0) / zrPx });
    if (y2 >= y0 + zrPx - 1) return;
    const hijos = nivel === 0 ? 3 : 2;
    for (let i = 0; i < hijos; i++) brote(x2, y2, ang * 0.55 + (rnd() - 0.5) * 1.5, largo * (0.62 + rnd() * 0.22), grosor * 0.62, nivel + 1);
  };
  const ejes = m.perenne ? 5 : 3;
  for (let i = 0; i < ejes; i++) brote(cx + (i - (ejes - 1) / 2) * 5, y0, (i - (ejes - 1) / 2) * 0.42, zrPx * (0.42 + rnd() * 0.16), m.perenne ? 4.500 : 3, 0);
  return segs;
}

export function pintarSuelo(canvas, m) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, raf = 0, visible = true, inicio = performance.now();
  let geo = null;
  const gotas = [], vapor = [], lluvia = [];

  function medir() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth || 320; H = canvas.clientHeight || 300;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = azar(`suelo-${m.cultivo}`);
    const y0 = H * 0.36, pxM = (H - y0 - 10) / (PROF_MAX + 0.12);
    const zrPx = (m.zrEscala ?? 0.4) * PROF_MAX * pxM, cx = W * 0.5;
    geo = { y0, pxM, zrPx, cx, segs: raices(m, cx, y0, zrPx, rnd),
      piedras: Array.from({ length: 16 }, () => ({ x: rnd() * W, y: y0 + zrPx + 8 + rnd() * Math.max(4, H - y0 - zrPx - 14), r: 1.5 + rnd() * 3.500 })),
      grietas: Array.from({ length: m.grietas ?? 0 }, (_, i) => {
        const x = W * (0.08 + 0.84 * ((i + 0.5) / (m.grietas || 1))) + (rnd() - 0.5) * 16;
        const largo = zrPx * m.largoGrieta * (0.45 + rnd() * 0.5);
        return { x, pts: Array.from({ length: 5 }, (_, k) => [(rnd() - 0.5) * 9, (largo * (k + 1)) / 5]) };
      }),
      brillos: Array.from({ length: 14 }, () => ({ x: rnd() * W, y: y0 + 6 + rnd() * Math.max(6, zrPx - 10), f: rnd() * 6 })) };
  }

  /** Estado del ciclo en el instante t (s): día del turno, humedad 0–1 y marchitez 0–1. */
  function ciclo(t) {
    if (!m.conCiclo) {
      const hum = m.ks ?? 0.5;
      return { dia: null, hum, marchitez: m.ks != null && m.ks < 0.5 ? (0.5 - m.ks) * 2 : 0 };
    }
    const dia = reducido() ? m.turno * 0.97 : ((t % DURACION) / DURACION) * m.turno;
    const sed = Math.max(0.5, m.estresTurno || 0);
    let hum, marchitez = 0;
    if (dia <= m.autonomia) hum = 1 - 0.62 * (dia / m.autonomia);
    else { const k = limitar((dia - m.autonomia) / sed); hum = 0.38 - 0.3 * k; marchitez = m.marchita ? k : 0; }
    if (m.marchita && dia < 0.7) marchitez = 1 - dia / 0.7;      // el riego la levanta
    return { dia, hum, marchitez };
  }

  function planta(marchitez) {
    const { cx, y0 } = geo;
    const verde = mezclarColor("#4CAF50", "#a0843c", marchitez), oscuro = mezclarColor("#2E7D32", "#6d5a2c", marchitez);
    ctx.lineCap = "round";
    if (m.perenne) {
      const alto = Math.min(y0 - 14, 92);
      ctx.strokeStyle = "#6d4c33"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx + 2, y0 - alto * 0.5); ctx.stroke();
      const caida = marchitez * 7;
      [[0, -0.74, 30, oscuro], [-24, -0.56, 22, verde], [24, -0.58, 23, verde], [0, -0.5, 24, oscuro]].forEach(([dx, fy, r, c]) => {
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx + dx, y0 + alto * fy + caida, r, r * (0.8 - marchitez * 0.16), 0, 0, 7); ctx.fill();
      });
    } else {
      const alto = Math.min(y0 - 12, 80);
      ctx.strokeStyle = oscuro; ctx.lineWidth = 3.500; ctx.beginPath(); ctx.moveTo(cx, y0);
      ctx.quadraticCurveTo(cx + marchitez * 10, y0 - alto * 0.6, cx + marchitez * 20, y0 - alto * (1 - marchitez * 0.22)); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const lado = i % 2 ? 1 : -1, y = y0 - alto * (0.22 + i * 0.16), x = cx + marchitez * 20 * (0.2 + i * 0.16);
        const ang = lado * (0.5 + marchitez * 0.95);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = i % 2 ? verde : oscuro; ctx.beginPath(); ctx.ellipse(lado * 14, -3, 15, 5.500 - marchitez * 1.5, 0, 0, 7); ctx.fill(); ctx.restore();
      }
    }
  }

  function dibujar(t, dt) {
    const { y0, zrPx, cx, pxM } = geo, { dia, hum, marchitez } = ciclo(t);
    const seco = 1 - hum;
    ctx.clearRect(0, 0, W, H);

    // Estratos: capa superficial, zona de raíces (color según la humedad) y subsuelo en tonos tierra cálidos.
    const capa = 0.12 * pxM;
    ctx.fillStyle = "#523D2E"; ctx.fillRect(0, y0 + zrPx, W, H - y0 - zrPx);
    const zona = ctx.createLinearGradient(0, y0, 0, y0 + zrPx);
    zona.addColorStop(0, mezclarColor("#6B4E39", "#C99F67", seco));
    zona.addColorStop(1, mezclarColor("#5A402E", "#A67C49", seco * 0.8));
    ctx.fillStyle = m.sinDatos ? "#8A827A" : zona; ctx.fillRect(0, y0, W, zrPx);
    ctx.fillStyle = m.sinDatos ? "#9B938B" : mezclarColor("#7A5941", "#D6AF79", seco); ctx.fillRect(0, y0, W, capa);
    if (m.sinDatos) {                                          // trama neutra: no hay dato, no hay color
      ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 1;
      for (let x = -H; x < W; x += 12) { ctx.beginPath(); ctx.moveTo(x, y0 + zrPx); ctx.lineTo(x + zrPx, y0); ctx.stroke(); }
    }
    ctx.fillStyle = "rgba(255,255,255,.12)";
    for (const p of geo.piedras) { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.4, p.r, 0, 0, 7); ctx.fill(); }

    // Frente húmedo tras el riego (primer día del turno).
    if (dia != null && dia < 1.6) {
      const avance = limitar(dia / 1.2), g = ctx.createLinearGradient(0, y0, 0, y0 + zrPx * avance + 1);
      g.addColorStop(0, `rgba(2,136,209,${0.5 * (1 - dia / 1.6)})`); g.addColorStop(1, "rgba(2,136,209,0)");
      ctx.fillStyle = g; ctx.fillRect(0, y0, W, zrPx * avance);
    }
    // Brillos: la dotación cubre la demanda.
    if (m.cobertura != null && m.cobertura >= 1) {
      ctx.fillStyle = "#B3E5FC";
      for (const b of geo.brillos) { ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.4 + b.f)); ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // Grietas: se abren a medida que el suelo se seca.
    ctx.strokeStyle = "#332218"; ctx.lineJoin = "round";
    for (const gr of geo.grietas) {
      ctx.lineWidth = 0.8 + seco * 3.200; ctx.beginPath(); ctx.moveTo(gr.x, y0);
      for (const [dx, dy] of gr.pts) ctx.lineTo(gr.x + dx, y0 + dy * (0.45 + 0.55 * seco));
      ctx.stroke();
    }
    // Línea de profundidad de raíces.
    ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255,248,235,.65)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y0 + zrPx); ctx.lineTo(W, y0 + zrPx); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,248,235,.92)"; ctx.font = "600 11px system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(m.zr == null ? "raíces: por determinar" : `raíces · ${num(m.zr, 1)} m`, 8, y0 + zrPx - 6);

    // Raíces: claras con agua, pardas y más cortas cuando se marchitan.
    const color = mezclarColor("#FAF0D7", "#7D5B42", marchitez);
    ctx.strokeStyle = color; ctx.lineCap = "round";
    for (const s of geo.segs) {
      if (s.grosor < 1.2 && s.fondo > 1 - marchitez * 0.45) continue;   // las raicillas profundas se retraen
      ctx.globalAlpha = s.grosor < 1.2 ? 1 - marchitez * 0.5 : 1; ctx.lineWidth = Math.max(0.7, s.grosor);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Charco potencial por exceso de lluvia.
    if (m.charco) {
      ctx.fillStyle = "rgba(2,136,209,.55)"; ctx.beginPath(); ctx.ellipse(W * 0.8, y0 + 2, W * 0.11, 4.500, 0, 0, 7); ctx.fill();
    }
    planta(marchitez);

    // Partículas: goteo del turno, vapor (decorativo) y lluvia del año análogo.
    if (dt > 0) {
      if (dia != null && dia < 1 && Math.random() < 0.6) gotas.push({ x: W * (0.1 + Math.random() * 0.8), y: y0 - 60 - Math.random() * 30, v: 150 + Math.random() * 80 });
      if (Math.random() < seco * 0.35) vapor.push({ x: Math.random() * W, y: y0, a: 0.5, v: 12 + Math.random() * 14, f: Math.random() * 6 });
      if (m.lluvia && Math.random() < 0.5) lluvia.push({ x: Math.random() * (W + 40), y: -8, v: 260 });
    }
    ctx.fillStyle = "#0288D1";
    for (let i = gotas.length - 1; i >= 0; i--) {
      const g = gotas[i]; g.y += g.v * dt;
      if (g.y >= y0) { gotas.splice(i, 1); continue; }
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 2, 4, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#5B6660";
    for (let i = vapor.length - 1; i >= 0; i--) {
      const p = vapor[i]; p.y -= p.v * dt; p.a -= dt * 0.28;
      if (p.a <= 0) { vapor.splice(i, 1); continue; }
      ctx.globalAlpha = p.a * 0.28; ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 2 + p.f) * 5, p.y, 2.200, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 0.55; ctx.strokeStyle = "#0288D1"; ctx.lineWidth = 1.2;
    for (let i = lluvia.length - 1; i >= 0; i--) {
      const l = lluvia[i]; l.y += l.v * dt; l.x -= l.v * dt * 0.25;
      if (l.y >= y0) { lluvia.splice(i, 1); continue; }
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x - 3, l.y + 10); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Contador del turno (sobre el cielo claro del tercio superior).
    ctx.textAlign = "right"; ctx.font = "700 12px system-ui, sans-serif";
    if (dia != null) {
      const conAgua = dia <= m.autonomia;
      ctx.fillStyle = conAgua ? "#0B5C97" : "#B3391A";
      ctx.fillText(`día ${Math.max(1, Math.ceil(dia))} de ${Math.round(m.turno)}`, W - 10, 18);
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillText(conAgua ? (dia < 1 ? "llega el turno de agua" : "con agua útil") : "sin agua útil: la raíz pasa sed", W - 10, 33);
    } else {
      ctx.fillStyle = "#4F6156"; ctx.fillText(m.sinDatos ? "sin información de estrés" : "turnos por determinar", W - 10, 18);
    }
  }

  function cuadro(ms) {
    const t = (ms - inicio) / 1000;
    dibujar(t, Math.min(0.05, cuadro.prev ? (ms - cuadro.prev) / 1000 : 0.016)); cuadro.prev = ms;
    raf = requestAnimationFrame(cuadro);
  }
  function arrancar() {
    cancelAnimationFrame(raf); raf = 0; cuadro.prev = 0;
    if (reducido() || !visible || document.hidden) { dibujar(reducido() ? 0 : (performance.now() - inicio) / 1000, 0); return; }
    raf = requestAnimationFrame(cuadro);
  }
  const ro = new ResizeObserver(() => { medir(); dibujar((performance.now() - inicio) / 1000, 0); });
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; arrancar(); });
  const alOcultar = () => arrancar();
  medir(); ro.observe(canvas); io.observe(canvas); document.addEventListener("visibilitychange", alOcultar);
  dibujar(0, 0); arrancar();

  return { destruir() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", alOcultar); } };
}

/** Texto alternativo del canvas (lo mismo que se ve, en palabras). */
export function altSuelo(m) {
  if (m.sinDatos) return "Corte del suelo sin información de estrés hídrico.";
  const partes = [`Corte del suelo con raíces hasta ${m.zr == null ? "profundidad por determinar" : `${num(m.zr, 1)} metros`}`];
  if (m.conCiclo) partes.push(`el turno de riego llega cada ${num(m.turno)} días y el suelo aguanta ${num(m.autonomia, 1)}`);
  if (m.marchita) partes.push(`las raíces se marchitan ${num(m.estresTurno, 1)} días por turno`);
  if (m.dias != null) partes.push(`${num(m.dias)} días de estrés en la campaña`);
  if (m.charco) partes.push("charco por riesgo potencial de exceso de lluvia");
  return partes.join("; ") + ".";
}
