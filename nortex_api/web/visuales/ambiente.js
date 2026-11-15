/* NORTEX — atmósfera de San Lorenzo en Canvas 2D: cielo en gradiente y polvo que arrastra la brisa.
 *
 * Es la capa de fondo de toda la experiencia. Solo recibe dos órdenes desde las escenas:
 *   ambiente.calor(t)  → 0 fresco … 1 caluroso, o null (sin dato): tiñe el cielo. El valor sale de la API
 *                        (Tmax media histórica en floración de la decisión enfocada); cada escena lo rotula.
 *   ambiente.modo(m)   → "dia" (chacra) u "orbita" (noche satelital con estrellas).
 * El polvo es decorativo y no representa ninguna medición. Se detiene con la pestaña oculta y con
 * «reducir movimiento» se dibuja un solo cuadro. */

import { reducido, mezclar, limitar } from "../util.js";

const CIELOS = {
  // [cenit, medio, horizonte] en RGB (tonos claros diurnos; órbita conserva el cielo espacial)
  fresco: [[198, 229, 242], [229, 243, 236], [250, 251, 243]],
  templado: [[217, 238, 198], [244, 247, 218], [250, 251, 243]],
  caluroso: [[246, 224, 182], [252, 238, 206], [250, 251, 243]],
  orbita: [[8, 12, 20], [12, 18, 28], [16, 24, 38]],
};

export function crearAmbiente(canvas) {
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1, raf = 0, t0 = 0;
  let calorObj = 0.5, calorAct = 0.5, sinDato = false, orbitaObj = 0, orbitaAct = 0;
  let polvo = [], estrellas = [];

  function medir() {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(limitar(w / 14, 26, 90));           // menos partículas en pantallas chicas
    polvo = Array.from({ length: n }, () => nueva(true));
    estrellas = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random() * 0.8,
      r: Math.random() * 1.2 + 0.3, f: Math.random() * 6 }));
  }
  function nueva(inicio) {
    return { x: inicio ? Math.random() * w : -10, y: h * (0.25 + Math.random() * 0.75), r: Math.random() * 1.8 + 0.4,
      vx: 12 + Math.random() * 34, vy: -4 + Math.random() * 8, a: Math.random() * 0.45 + 0.1, f: Math.random() * 6 };
  }
  const capa = (i) => {
    const a = calorAct < 0.5 ? CIELOS.fresco[i] : CIELOS.templado[i];
    const b = calorAct < 0.5 ? CIELOS.templado[i] : CIELOS.caluroso[i];
    const t = calorAct < 0.5 ? calorAct * 2 : (calorAct - 0.5) * 2;
    const dia = a.map((x, k) => mezclar(x, b[k], t));
    return `rgb(${dia.map((x, k) => Math.round(mezclar(x, CIELOS.orbita[i][k], orbitaAct))).join(",")})`;
  };

  function dibujar(t, dt) {
    calorAct = mezclar(calorAct, calorObj, Math.min(1, dt * 2.2));
    orbitaAct = mezclar(orbitaAct, orbitaObj, Math.min(1, dt * 2.2));
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, capa(0)); g.addColorStop(0.55, capa(1)); g.addColorStop(1, capa(2));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    if (orbitaAct > 0.02) {                                   // estrellas de la noche satelital
      ctx.fillStyle = "#fff";
      for (const s of estrellas) {
        ctx.globalAlpha = orbitaAct * (0.35 + 0.35 * Math.sin(t * 0.8 + s.f));
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 7); ctx.fill();
      }
    }
    if (orbitaAct < 0.98) {                                   // resplandor del sol sobre el horizonte
      const cx = w * 0.72, cy = h * 0.42, r = Math.max(w, h) * 0.55;
      const sol = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const fuerza = (1 - orbitaAct) * (sinDato ? 0.16 : 0.22 + calorAct * 0.28);
      sol.addColorStop(0, `rgba(255,${Math.round(220 - calorAct * 55)},${Math.round(90 - calorAct * 50)},${fuerza})`);
      sol.addColorStop(1, "rgba(255,200,80,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = sol; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#8C9E5E";                              // polen / brisa suave en el valle
      for (const p of polvo) {
        p.x += p.vx * dt; p.y += (p.vy + Math.sin(t * 0.9 + p.f) * 6) * dt;
        if (p.x > w + 10) Object.assign(p, nueva(false));
        ctx.globalAlpha = (1 - orbitaAct) * p.a * 0.55 * (0.6 + 0.4 * Math.sin(t * 1.3 + p.f));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function cuadro(ms) {
    const dt = Math.min(0.05, (ms - t0) / 1000 || 0.016); t0 = ms;
    dibujar(ms / 1000, dt);
    raf = requestAnimationFrame(cuadro);
  }
  function arrancar() {
    cancelAnimationFrame(raf); raf = 0;
    if (reducido() || document.hidden) { calorAct = calorObj; orbitaAct = orbitaObj; dibujar(0, 0); return; }
    t0 = performance.now(); raf = requestAnimationFrame(cuadro);
  }
  addEventListener("resize", () => { medir(); arrancar(); });
  document.addEventListener("visibilitychange", arrancar);
  medir(); arrancar();

  return {
    calor(t) { sinDato = t == null; calorObj = t == null ? 0.35 : limitar(t); if (!raf) arrancar(); },
    modo(m) { orbitaObj = m === "orbita" ? 1 : 0; if (!raf) arrancar(); },
  };
}
