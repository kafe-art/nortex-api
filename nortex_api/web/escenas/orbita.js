/* NORTEX — Escena 5 · «El Vuelo Orbital NASA» y el taller de «Mi parcela».
 *
 * El mapa no es la bienvenida: es la revelación. Dos usos:
 *
 *  volar({esperar})  Interludio cinemático tras cruzar una puerta del portal:
 *     1. «espacio»  — Leaflet arranca en zoom 3 dentro de un disco (el planeta) con halo atmosférico.
 *     2. «descenso» — el disco se abre a pantalla completa (clip-path) mientras map.flyTo() baja hasta la
 *                     parcela, que late con un halo (GeoJSON de GET /parcelas).
 *     3. «enlace»   — tres haces bajan de los satélites a la chacra. Cada haz toma su estado REAL de
 *                     GET /parcelas/{id}/fuentes: POWER (clima), GPM IMERG (lluvia) y SRTM (relieve).
 *                     Brilla y pulsa si la serie está descargada; gris punteado si falta.
 *     El vuelo termina cuando acaba la animación Y llega la consulta real (`esperar`): los haces son el
 *     indicador de carga. Leaflet se descarga a demanda (no bloquea el primer pintado del portal).
 *
 *  entrar()  Vista «Mi parcela»: el mismo mapa más el panel con fuentes, descarga en segundo plano
 *     (POST /parcelas/{id}/actualizar + GET /tareas/{id}), archivo del clima (franjas de calor de
 *     /serie/power y picos ICEN de /serie/enso), solidez (/faltantes), registro de chacras (POST /parcelas),
 *     importación CSV (/importar/{modelo}) y parámetros validados (/datos/validacion_parametro). */

import { api, post, leer, API } from "../api.js";
import { $, $$, esc, num, etq, dato, errorHtml, cargando, MESES, calor01, colorCalor, reducido, escuchar } from "../util.js";

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/";
let leaflet;
function cargarLeaflet() {
  return (leaflet ??= new Promise((ok, mal) => {
    if (globalThis.L) return ok(globalThis.L);
    const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `${LEAFLET}leaflet.css`, crossOrigin: "",
      integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" });
    const js = Object.assign(document.createElement("script"), { src: `${LEAFLET}leaflet.js`, crossOrigin: "",
      integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" });
    js.onload = () => ok(globalThis.L); js.onerror = () => { leaflet = null; mal(new Error("No se pudo cargar el mapa satelital (sin conexión).")); };
    document.head.append(css, js);
  }));
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* Los tres haces del vuelo: fuentes satelitales que esta API descarga de verdad. */
const SATELITES = [
  { fuente: "power", nombre: "NASA POWER", que: "temperatura y evaporación desde 1991", x: 16 },
  { fuente: "imerg", nombre: "GPM IMERG", que: "lluvia y aguaceros desde 2001", x: 50 },
  { fuente: "srtm", nombre: "SRTM", que: "altitud y pendiente del terreno", x: 84 },
];
const NOMBRE_FUENTE = { power: "NASA POWER", imerg: "GPM IMERG", srtm: "SRTM (relieve)", soilgrids: "SoilGrids (suelo)", enso: "ICEN / ONI (El Niño)",
  estacion: "Estación NOAA Piura", senamhi_reportes: "Reportes SENAMHI (reservorio)" };

export function crearOrbita(ctx) {
  const { estado } = ctx;
  const vista = $(".orbita-vista"), texto = $("#vuelo-texto");
  let mapa = null, capa = null, contorno = null, puntos = [], fuentes = [], saltar = null;

  async function asegurarMapa() {
    if (mapa) return mapa;
    const L = await cargarLeaflet();
    mapa = L.map("mapa", { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([-5.09, -80.34], 3);
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" }).addTo(mapa);
    capa = L.featureGroup().addTo(mapa);
    contorno = L.polygon([], { color: "#FF9800", weight: 3, dashArray: "6 6" }).addTo(mapa);
    mapa.on("click", (e) => { if (!$("#det-registro").open) return; puntos.push([e.latlng.lat, e.latlng.lng]); trazar(); });
    return mapa;
  }
  function dibujarParcela() {
    const p = ctx.parcelaActiva();
    capa.clearLayers();
    if (!p?.geometria) return null;
    L.geoJSON(p.geometria, { style: { color: "#FFE0B2", weight: 3, fillColor: "#FF9800", fillOpacity: 0.18, className: "halo-parcela" },
      pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 14, color: "#FFE0B2", className: "halo-parcela" }) }).addTo(capa);
    return p;
  }

  /* ---- Haces de satélite ------------------------------------------------------------------------ */
  async function leerFuentes() {
    if (!estado.parcela) { fuentes = []; return; }
    try { fuentes = await api(`/parcelas/${estado.parcela}/fuentes`); } catch { fuentes = []; }
  }
  function pintarHaces(activos = true) {
    const de = (f) => fuentes.find((x) => x.fuente === f);
    $("#haces").innerHTML = SATELITES.map((s, i) => {
      const ok = de(s.fuente)?.estado === "ok";
      return `<g class="haz ${ok ? "conectado" : "sin-senal"}" style="--i:${i}">
        <line x1="${s.x}" y1="13" x2="50" y2="50" vector-effect="non-scaling-stroke" class="haz-base"/>
        ${ok && activos ? `<line x1="${s.x}" y1="13" x2="50" y2="50" vector-effect="non-scaling-stroke" class="haz-pulso"/>` : ""}</g>`;
    }).join("") + '<circle cx="50" cy="50" r="1.2" class="haz-destino" vector-effect="non-scaling-stroke"/>';
    $("#satelites").innerHTML = SATELITES.map((s) => {
      const f = de(s.fuente), ok = f?.estado === "ok";
      return `<li style="left:${s.x}%" class="${ok ? "conectado" : "sin-senal"}">
        <svg viewBox="0 0 48 24" aria-hidden="true"><rect x="19" y="7" width="10" height="10" rx="2"/><path d="M2 8h14v8H2zM32 8h14v8H32zM16 12h3M29 12h3M24 17v5"/></svg>
        <b>${esc(s.nombre)}</b><small>${esc(s.que)}</small>
        ${dato(ok ? (f.desde ? `${f.desde.slice(0, 4)} → ${f.hasta.slice(0, 4)}` : "conectado") : (f?.estado ?? "sin consultar"), {
          titulo: s.nombre, fuente: `GET /parcelas/${estado.parcela}/fuentes`, categoria: "observado",
          nota: ok ? `${num(f.filas)} registros${f.desde ? ` del ${f.desde} al ${f.hasta}` : ""}. Serie archivada; no es una señal en vivo.`
            : "Serie sin descargar: usa «Traer datos de la NASA» en Mi parcela.", estado: ok ? "real" : "por determinar" })}</li>`;
    }).join("");
  }

  /* ---- Vuelo ------------------------------------------------------------------------------------ */
  async function volar({ esperar } = {}) {
    const p = ctx.parcelaActiva();
    vista.dataset.fase = "espacio"; document.body.classList.add("en-vuelo");
    $("#haces").innerHTML = ""; $("#satelites").innerHTML = "";
    texto.textContent = "Órbita terrestre · buscando el valle de San Lorenzo";
    const salto = new Promise((r) => { saltar = r; });
    $("#vuelo-saltar").hidden = false; $("#vuelo-saltar").onclick = () => saltar("saltado");
    const pelicula = (async () => {
      const [, m] = await Promise.all([leerFuentes(), asegurarMapa().catch(() => null)]);
      if (!m || !p) { texto.textContent = "Sin mapa satelital por ahora; seguimos con los datos."; await pausa(900); return; }
      m.invalidateSize(); m.setView([p.lat, p.lon], 3, { animate: false }); dibujarParcela();
      await pausa(900);
      vista.dataset.fase = "descenso"; texto.textContent = `Descendiendo sobre ${p.nombre} · Tambogrande, Piura`;
      await pausa(60); m.invalidateSize();
      const llegada = new Promise((r) => m.once("moveend", r));
      const destino = capa.getLayers().length ? capa.getBounds().getCenter() : [p.lat, p.lon];
      m.flyTo(destino, 15, { duration: 4.2, easeLinearity: 0.18 });
      await Promise.race([llegada, pausa(6000)]);
      vista.dataset.fase = "enlace"; pintarHaces();
      const n = SATELITES.filter((s) => fuentes.find((f) => f.fuente === s.fuente)?.estado === "ok").length;
      texto.textContent = n ? `${n} de ${SATELITES.length} satélites enlazados con la chacra · leyendo su historia` : "Esta chacra aún no tiene series descargadas";
      await Promise.all([Promise.resolve(esperar).catch(() => {}), pausa(2300)]);
    })();
    await Promise.race([pelicula, salto]);
    $("#vuelo-saltar").hidden = true; document.body.classList.remove("en-vuelo"); vista.dataset.fase = "enlace";
  }

  /* ---- Panel «Mi parcela» ----------------------------------------------------------------------- */
  function info() {
    const p = ctx.parcelaActiva();
    $("#parcela-info").innerHTML = p ? `<p class="parcela-nombre">${esc(p.nombre)}</p><p>${dato(p.area_ha == null ? "área por determinar" : `${num(p.area_ha, 2)} ha`, {
      titulo: "Área de la parcela", fuente: "GET /parcelas · geometría declarada", nota: "Área calculada por la API a partir del contorno.", estado: p.area_ha == null ? "por determinar" : /ejemplo/i.test(p.aoi_id + p.nombre) ? "ejemplo" : "real" })}
      ${p.elevation_m == null ? "" : ` · ${dato(`${num(p.elevation_m)} m de altitud`, { titulo: "Altitud", fuente: "SRTM (NASA) · guardada al descargar las fuentes", categoria: "observado" })}`}</p>`
      : '<p class="aviso">No hay chacra elegida. Registra una abajo.</p>';
  }
  function senales(fallos = []) {
    $("#senales").innerHTML = fuentes.map((f) => {
      const fallo = fallos.find((x) => x.fuente === f.fuente && x.estado !== "ok");
      const antiguo = f.fuente === "senamhi_reportes" && f.hasta && Date.now() - new Date(f.hasta) > 30 * 864e5;
      const s = fallo ? "error de actualización" : antiguo ? "dato antiguo" : f.estado === "ok" ? "disponible" : f.estado;
      return `<li class="senal"><b>${esc(NOMBRE_FUENTE[f.fuente] || f.fuente)}</b>${etq(s, fallo ? "rojo" : antiguo ? "ambar" : f.estado === "ok" ? "verde" : "gris")}
        <small>${esc(f.desde || "sin periodo")}${f.hasta ? ` → ${esc(f.hasta)}` : ""}</small>
        ${dato("fuente", { titulo: NOMBRE_FUENTE[f.fuente] || f.fuente, fuente: `GET /parcelas/${estado.parcela}/fuentes`,
          nota: fallo?.detalle || (f.variables ? `Variables: ${f.variables.join(", ")}. ${num(f.filas)} registros.` : "Sin descargar."), estado: fallo || f.estado !== "ok" ? "por determinar" : "real" })}</li>`;
    }).join("");
  }

  async function clima() {
    const id = estado.parcela, v = estado.version, el = $("#clima-cuerpo");
    if (!id) { el.innerHTML = ""; return; }
    el.innerHTML = cargando("Abriendo el archivo del clima…");
    const [rp, re] = await Promise.allSettled([leer(`/parcelas/${id}/serie/power?variable=tmax&agregado=mensual`),
      leer(`/parcelas/${id}/serie/enso?variable=icen&agregado=mensual`)]);
    if (v !== estado.version) return;
    if (rp.status === "rejected") { el.innerHTML = errorHtml(rp.reason); return; }
    const filas = rp.value.filter((x) => Number.isFinite(x.media)), enso = re.status === "fulfilled" ? re.value : [];
    const anios = [...new Set(filas.map((x) => x.anio))].sort((a, b) => a - b);
    if (!anios.length) { el.innerHTML = '<p class="aviso">POWER no tiene temperaturas para esta chacra.</p>'; return; }
    const anual = (y) => { const rs = filas.filter((x) => x.anio === y); return rs.reduce((a, x) => a + x.media * x.dias, 0) / rs.reduce((a, x) => a + x.dias, 0); };
    const medias = anios.map(anual), min = Math.min(...medias), max = Math.max(...medias);
    const rel = (t) => (t - min) / (max - min || 1);
    // Pico ICEN de cada año: el punto crece con el pico. Los tres mayores del periodo se rotulan (salen de los datos).
    const pico = Object.fromEntries(anios.map((y) => [y, Math.max(-9, ...enso.filter((x) => x.anio === y && Number.isFinite(x.media)).map((x) => x.media))]));
    const mayores = [...anios].filter((y) => pico[y] >= 0.4).sort((a, b) => pico[b] - pico[a]).slice(0, 3);
    el.innerHTML = `<p class="eyebrow">NASA POWER · ${anios[0]}–${anios.at(-1)} · historia, no pronóstico</p>
      <div class="franjas" role="group" aria-label="Temperatura máxima media por año">${anios.map((y, i) => `<button type="button" class="franja" data-anio="${y}"
        style="background:${colorCalor(rel(medias[i]))}" aria-label="Año ${y}: máxima media ${num(medias[i], 1)} grados${pico[y] >= 0.4 ? `; pico ICEN ${num(pico[y], 2)}` : ""}">
        ${pico[y] >= 0.4 ? `<i class="nino" style="--pico:${Math.min(1, pico[y] / 4).toFixed(2)}"></i>` : ""}${mayores.includes(y) ? `<span>${y}</span>` : ""}</button>`).join("")}</div>
      <p class="ayuda">Azul → terracota: máxima media anual, de ${num(min, 1)} a ${num(max, 1)} °C. Punto blanco: algún mes con ICEN ≥ 0,4 (crece con el pico).
        ${mayores.length ? `Picos ICEN más altos del periodo: ${mayores.map((y) => `<b>${y}</b> (+${num(pico[y], 1)})`).join(", ")}.` : ""}
        ${re.status === "rejected" ? "ICEN no disponible." : "Un mes aislado sobre el criterio no declara un evento oficial."}</p>
      <div id="meses-clima"></div>`;
    const abrir = (y) => {
      $$(".franja", el).forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.anio) === y));
      $("#meses-clima").innerHTML = `<p class="eyebrow">${y}</p><div class="meses">${MESES.map((mes, k) => {
        const x = filas.find((f) => f.anio === y && f.mes === k + 1), en = enso.find((f) => f.anio === y && f.mes === k + 1);
        return `<div style="--mes:${x ? colorCalor(calor01(x.media)) : "#5f5650"}"><small>${mes}</small>${dato(x ? `${num(x.media, 1)}°` : "s/d", {
          titulo: `Tmax media · ${mes} ${y}`, fuente: "NASA POWER · /serie/power · agregado mensual", categoria: "modelado",
          nota: x ? `${x.dias} días con dato. Media de las máximas diarias.` : "Sin registros", estado: x ? "real" : "por determinar" })}${
          en?.media >= 0.4 ? `<em title="ICEN ${en.media}">ICEN +${num(en.media, 1)}</em>` : ""}</div>`; }).join("")}</div>`;
    };
    $$(".franja", el).forEach((b) => { b.onclick = () => abrir(Number(b.dataset.anio)); });
    abrir(mayores[0] ?? anios.at(-1));
  }

  async function solidez() {
    const id = estado.parcela, v = estado.version, el = $("#solidez");
    if (!id) { el.innerHTML = ""; return; }
    try {
      const f = await leer(`/parcelas/${id}/faltantes`);
      if (v !== estado.version) return;
      const grupos = ["ok", "aproximado", "ejemplo", "falta"].map((e) => [e, f.items.filter((i) => i.estado === e)]).filter(([, l]) => l.length);
      const pend = Object.entries(f.parametros_por_validar || {});
      el.innerHTML = `${etq(f.viabilidad_definitiva_posible ? "Datos esenciales disponibles" : "Viabilidad provisional", f.viabilidad_definitiva_posible ? "verde" : "ambar")}
        <div class="barra-solidez" role="img" aria-label="${grupos.map(([e, l]) => `${l.length} ${e}`).join(", ")}">${grupos.map(([e, l]) =>
          `<span data-estado="${e}" style="flex:${l.length}"><b>${l.length}</b> ${e === "ok" ? "reales" : e === "falta" ? "faltan" : `de ${e}`}</span>`).join("")}</div>
        <p class="ayuda">Cuenta de insumos por estado; no es un puntaje. Los de ejemplo llevan borde punteado.</p>
        ${f.items.map((i) => `<details class="faltante ${i.estado === "ejemplo" || i.estado === "aproximado" ? "provisional" : ""}"><summary>${etq(i.estado)} ${esc({ pcr: "PCR (plan de cultivo y riego)", enfen: "comunicado ENFEN" }[i.dato] || i.dato.replace(/_/g, " "))}</summary>
          <p>${esc(i.detalle)}</p><p><b>De dónde sale:</b> ${esc(i.origen)}</p><p>${esc(i.impacto)}</p>
          ${i.plantilla ? `<a href="${API}${esc(i.plantilla)}" download>Descargar plantilla CSV</a>` : ""}</details>`).join("")}
        ${pend.length ? `<details class="faltante provisional"><summary>${etq("por validar", "ambar")} parámetros de cultivo con INIA</summary><ul>${pend.map(([c, x]) =>
          `<li><b>${esc(c)}</b>: ${x.total} por validar${x.prioritarios?.length ? ` · prioritarios: ${esc(x.prioritarios.join(", "))}` : ""}</li>`).join("")}</ul></details>` : ""}`;
    } catch (e) { if (v === estado.version) el.innerHTML = errorHtml(e); }
  }

  async function entrar() {
    vista.dataset.fase = "enlace"; texto.textContent = "";
    info(); clima(); solidez();
    await leerFuentes(); senales(); pintarHaces(false);
    try {
      const m = await asegurarMapa(); m.invalidateSize();
      const p = dibujarParcela();
      if (p) m.fitBounds(capa.getBounds().pad(0.6), { maxZoom: 16, animate: false }); else m.setView([-4.92, -80.34], 11);
    } catch (e) { $("#mapa").innerHTML = `<p class="aviso">${esc(e.message)} Puedes registrar una chacra pegando coordenadas.</p>`; }
  }

  /* ---- Acciones del panel ----------------------------------------------------------------------- */
  $("#btn-revolar").onclick = async () => { $("#orbita-panel").inert = true; await volar({}); $("#orbita-panel").inert = false; pintarHaces(false); };

  $("#btn-descargar").onclick = async () => {
    const id = estado.parcela, btn = $("#btn-descargar"), msg = $("#progreso");
    if (!id) { msg.textContent = "Elige una chacra primero."; return; }
    btn.disabled = true; vista.classList.add("descargando"); pintarHaces(true);
    try {
      let t = await post(`/parcelas/${id}/actualizar?segundo_plano=true`, null);
      while (t.estado === "en curso") {
        msg.textContent = "Los satélites están entregando su historia (la primera vez tarda varios minutos; no hay porcentaje estimado)…";
        await pausa(2500); t = await api(`/tareas/${t.id}`);
      }
      if (t.estado === "error") throw new Error(t.error);
      await ctx.datosCambiaron();
      msg.textContent = "Descarga terminada. Revisa el estado de cada fuente.";
      await leerFuentes(); senales(t.fuentes || []); info(); clima(); solidez();
    } catch (e) { msg.textContent = e.message; }
    finally { btn.disabled = false; vista.classList.remove("descargando"); pintarHaces(false); }
  };

  function trazar() { contorno?.setLatLngs(puntos); $("#info-poligono").textContent = `${puntos.length} puntos marcados. El área final la calcula la API.`; }
  $("#btn-deshacer").onclick = () => { puntos.pop(); trazar(); };
  $("#btn-limpiar").onclick = () => { puntos = []; trazar(); };
  $("#btn-coords").onclick = () => {
    try {
      const pts = $("#coords").value.trim().split(/\n+/).map((l) => l.trim().split(/[,;\s]+/).map(Number));
      if (pts.some((p) => p.length !== 2 || p.some((x) => !Number.isFinite(x)) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) throw new Error("Usa latitud, longitud por línea.");
      puntos = pts; trazar(); if (mapa) mapa.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 17 });
      $("#msg-parcela").textContent = "";
    } catch (e) { $("#msg-parcela").textContent = e.message; }
  };
  $("#form-parcela").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      if (puntos.length !== 1 && puntos.length < 3) throw new Error("Marca 1 punto o al menos 3 esquinas.");
      const f = new FormData(ev.target);
      const geometria = puntos.length === 1 ? { type: "Point", coordinates: [puntos[0][1], puntos[0][0]] }
        : { type: "Polygon", coordinates: [[...puntos, puntos[0]].map(([la, lo]) => [lo, la])] };
      const p = await post("/parcelas", { aoi_id: f.get("aoi_id"), nombre: f.get("nombre"), geometria });
      puntos = []; trazar(); ev.target.reset();
      $("#msg-parcela").textContent = "Chacra guardada. Ahora trae sus datos de la NASA.";
      await ctx.cargarParcelas(p.aoi_id);
    } catch (e) { $("#msg-parcela").textContent = e.message; }
  };
  $("#form-csv").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), cuerpo = new FormData(); cuerpo.append("archivo", f.get("archivo"));
    try {
      const r = await api(`/importar/${f.get("modelo")}`, { method: "POST", body: cuerpo });
      $("#msg-csv").textContent = `${r.filas_guardadas} filas guardadas.`;
      await ctx.datosCambiaron(); solidez();
    } catch (e) { $("#msg-csv").textContent = e.message; }
  };
  const parametro = () => { const c = estado.cultivos.find((x) => x.id === $("#val-cultivo").value), p = c?.parametros[$("#val-parametro").value];
    $("#val-actual").textContent = p ? `Valor actual: ${JSON.stringify(p.valor)} · ${p.fuente} · ${p.estado}` : ""; };
  const parametros = () => { const c = estado.cultivos.find((x) => x.id === $("#val-cultivo").value);
    $("#val-parametro").innerHTML = Object.keys(c?.parametros || {}).map((k) => `<option>${esc(k)}</option>`).join(""); parametro(); };
  $("#val-cultivo").onchange = parametros; $("#val-parametro").onchange = parametro;
  $("#form-validacion").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await post("/datos/validacion_parametro", Object.fromEntries(new FormData(ev.target)));
      await ctx.datosCambiaron(); parametro(); solidez();
      $("#msg-validacion").textContent = "Validación guardada. Las próximas evaluaciones ya la usan.";
    } catch (e) { $("#msg-validacion").textContent = e.message; }
  };
  escuchar("catalogo", () => {
    $("#val-cultivo").innerHTML = estado.cultivos.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join(""); parametros();
    $("#sel-modelo").innerHTML = estado.modelos.map((m) => `<option value="${esc(m.modelo)}">${esc(m.modelo.replace(/_/g, " "))} — ${esc(m.descripcion)}</option>`).join("");
  });

  return { entrar, refrescar: entrar, volar,
    salir() { saltar?.("salida"); document.body.classList.remove("en-vuelo"); },
    /** Para la demostración: estado real de los tres satélites. */
    async enlaces() { await leerFuentes(); return SATELITES.map((s) => ({ ...s, ...(fuentes.find((f) => f.fuente === s.fuente) || { estado: "sin consultar" }) })); } };
}
