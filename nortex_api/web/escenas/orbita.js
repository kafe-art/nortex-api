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

/* Los tres haces del vuelo: las fuentes que esta API descarga de verdad. Solo dos son satelitales
 * (IMERG y SRTM); POWER es un modelo de reanálisis, no un satélite, y la interfaz no debe llamarlo así. */
const SATELITES = [
  { fuente: "power", nombre: "NASA POWER", tipo: "modelo", que: "reanálisis: temperatura y evaporación desde 1991", x: 16 },
  { fuente: "imerg", nombre: "GPM IMERG", tipo: "satélite", que: "lluvia y aguaceros desde 2001", x: 50 },
  { fuente: "srtm", nombre: "SRTM", tipo: "radar 2000", que: "altitud y pendiente del terreno", x: 84 },
];
const NOMBRE_FUENTE = { power: "NASA POWER", imerg: "GPM IMERG", srtm: "SRTM (relieve)", soilgrids: "SoilGrids (suelo)", enso: "ICEN / ONI (El Niño)",
  estacion: "Estación NOAA Piura", senamhi_reportes: "Reportes SENAMHI (reservorio)" };

/* Perímetro de delimitación del Valle de San Lorenzo (Tambogrande / Las Lomas, Piura). */
const POLIGONO_VALLE = [
  [-4.63, -80.22],
  [-4.68, -80.14],
  [-4.88, -80.13],
  [-5.08, -80.16],
  [-5.21, -80.28],
  [-5.19, -80.44],
  [-4.98, -80.51],
  [-4.76, -80.47],
  [-4.65, -80.34],
];

function dentroDelValle(lat, lon) {
  if (lat < -5.22 || lat > -4.62 || lon < -80.52 || lon > -80.12) return false;
  let dentro = false;
  for (let i = 0, j = POLIGONO_VALLE.length - 1; i < POLIGONO_VALLE.length; j = i++) {
    const [yi, xi] = POLIGONO_VALLE[i], [yj, xj] = POLIGONO_VALLE[j];
    const intersecta = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

function areaHaAprox(pts) {
  if (pts.length < 3) return null;
  const latMedia = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const escala = 111_320 * Math.cos((latMedia * Math.PI) / 180) * 110_574;
  let suma = 0;
  for (let i = 0; i < pts.length; i++) {
    const [y1, x1] = pts[i], [y2, x2] = pts[(i + 1) % pts.length];
    suma += x1 * y2 - x2 * y1;
  }
  return (Math.abs(suma) * 0.5 * escala) / 10_000;
}

export function crearOrbita(ctx) {
  const { estado } = ctx;
  const vista = $(".orbita-vista"), texto = $("#vuelo-texto");
  let mapa = null, capa = null, capaValle = null, capaVertices = null, contorno = null, puntos = [], fuentes = [], saltar = null, aoiManual = false;

  async function asegurarMapa() {
    if (mapa) return mapa;
    const L = await cargarLeaflet();
    mapa = L.map("mapa", { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([-5.09, -80.34], 3);
    L.control.zoom({ position: "bottomright" }).addTo(mapa);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" }).addTo(mapa);
    capaValle = L.polygon(POLIGONO_VALLE, {
      color: "#D9F23A", weight: 2.5, dashArray: "8 6", fillColor: "#D9F23A", fillOpacity: 0.04, interactive: false,
    }).addTo(mapa);
    capa = L.featureGroup().addTo(mapa);
    contorno = L.polygon([], { color: "#FF9800", weight: 3, dashArray: "6 6", fillColor: "#D9F23A", fillOpacity: 0.22 }).addTo(mapa);
    capaVertices = L.layerGroup().addTo(mapa);
    mapa.on("click", (e) => {
      const { lat, lng } = e.latlng;
      $("#det-registro").open = true;
      if (!dentroDelValle(lat, lng)) {
        $("#msg-parcela").textContent = "Fuera de límite: solo puedes seleccionar tu finca dentro de la delimitación del Valle de San Lorenzo (Tambogrande).";
        capaValle?.setStyle({ color: "#FF5722", weight: 3.5 });
        setTimeout(() => capaValle?.setStyle({ color: "#D9F23A", weight: 2.5 }), 1200);
        return;
      }
      $("#msg-parcela").textContent = "";
      puntos.push([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
      trazar();
    });
    mapa.on("move zoom resize", () => posicionarHaces());
    addEventListener("resize", () => posicionarHaces());
    return mapa;
  }
  function centroParcela() {
    const p = ctx.parcelaActiva();
    if (capa && capa.getLayers().length) return capa.getBounds().getCenter();
    if (p?.lat != null && p?.lon != null) return [p.lat, p.lon];
    return null;
  }
  function posicionarHaces() {
    const svg = $("#haces");
    if (!svg || !svg.children.length) return;
    const rVista = vista.getBoundingClientRect();
    if (!rVista.width || !rVista.height) return;
    let dx = 50, dy = 50;
    const c = mapa && centroParcela();
    if (c && mapa) {
      const pt = mapa.latLngToContainerPoint(c);
      dx = (pt.x / rVista.width) * 100;
      dy = (pt.y / rVista.height) * 100;
    }
    const items = $$("#satelites li");
    $$(".haz", svg).forEach((g, i) => {
      const li = items[i];
      let x1 = SATELITES[i]?.x ?? 50, y1 = 18;
      if (li) {
        const rLi = li.getBoundingClientRect();
        if (rLi.width) {
          x1 = ((rLi.left + rLi.width / 2 - rVista.left) / rVista.width) * 100;
          y1 = ((rLi.bottom - rVista.top) / rVista.height) * 100;
        }
      }
      $$("line", g).forEach((ln) => {
        ln.setAttribute("x1", x1.toFixed(2)); ln.setAttribute("y1", y1.toFixed(2));
        ln.setAttribute("x2", dx.toFixed(2)); ln.setAttribute("y2", dy.toFixed(2));
      });
    });
    const dest = $(".haz-destino", svg);
    if (dest) { dest.setAttribute("cx", dx.toFixed(2)); dest.setAttribute("cy", dy.toFixed(2)); }
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
          titulo: `${s.nombre} (${s.tipo})`, fuente: `GET /parcelas/${estado.parcela}/fuentes`,
          categoria: s.fuente === "power" ? "modelado" : "observado",
          nota: ok ? `${num(f.filas)} registros${f.desde ? ` del ${f.desde} al ${f.hasta}` : ""}. Serie archivada; no es una señal en vivo.`
            : "Serie sin descargar: usa «Traer datos de la NASA» en Mi parcela.", estado: ok ? "real" : "por determinar" })}</li>`;
    }).join("");
    requestAnimationFrame(posicionarHaces);
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
      texto.textContent = n ? `${n} de ${SATELITES.length} fuentes enlazadas con la chacra · leyendo su historia` : "Esta chacra aún no tiene series descargadas";
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
      <label class="clima-slider"><span>Año histórico: <b id="anio-elegido"></b></span>
        <input id="clima-rango" type="range" min="0" max="${anios.length - 1}" value="${anios.length - 1}" step="1"></label>
      <p class="ayuda">Azul → terracota: máxima media anual, de ${num(min, 1)} a ${num(max, 1)} °C. Punto blanco: algún mes con ICEN ≥ 0,4 (crece con el pico).
        ${mayores.length ? `Picos ICEN más altos del periodo: ${mayores.map((y) => `<b>${y}</b> (+${num(pico[y], 1)})`).join(", ")}.` : ""}
        ${re.status === "rejected" ? "ICEN no disponible." : "Un mes aislado sobre el criterio no declara un evento oficial."}</p>
      <div id="meses-clima"></div>`;
    const abrir = (y) => {
      const idx = anios.indexOf(y);
      if ($("#anio-elegido", el)) $("#anio-elegido", el).textContent = String(y);
      if ($("#clima-rango", el) && idx >= 0) { $("#clima-rango", el).value = String(idx); $("#clima-rango", el).setAttribute("aria-valuetext", String(y)); }
      $$(".franja", el).forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.anio) === y));
      const delAnio = filas.filter((f) => f.anio === y);
      const calido = delAnio.length ? delAnio.reduce((a, b) => (a.media > b.media ? a : b)) : null;
      $("#meses-clima").innerHTML = `<p class="eyebrow">${y}</p><div class="meses">${MESES.map((mes, k) => {
        const x = filas.find((f) => f.anio === y && f.mes === k + 1), en = enso.find((f) => f.anio === y && f.mes === k + 1);
        return `<div style="--mes:${x ? colorCalor(calor01(x.media)) : "#5f5650"}"><small>${mes}</small>${dato(x ? `${num(x.media, 1)}°` : "s/d", {
          titulo: `Tmax media · ${mes} ${y}`, fuente: "NASA POWER · /serie/power · agregado mensual", categoria: "modelado",
          nota: x ? `${x.dias} días con dato. Media de las máximas diarias.` : "Sin registros", estado: x ? "real" : "por determinar" })}${
          en?.media >= 0.4 ? `<em title="ICEN ${en.media}">ICEN +${num(en.media, 1)}</em>` : ""}</div>`; }).join("")}</div>${
        calido ? `<p class="ayuda">En ${y}, <b>${MESES[calido.mes - 1]}</b> tuvo la mayor Tmax media mensual: ${dato(`${num(calido.media, 1)} °C`, {
          titulo: `Mes más cálido de ${y}`, fuente: "NASA POWER · medias mensuales", nota: `${calido.dias} días observados en el mes.`, categoria: "modelado" })}.</p>` : ""}`;
    };
    $$(".franja", el).forEach((b) => { b.onclick = () => abrir(Number(b.dataset.anio)); });
    $("#clima-rango", el)?.addEventListener("input", (ev) => abrir(anios[Number(ev.target.value)]));
    abrir(mayores[0] ?? anios.at(-1));
  }

  async function chequeo() {
    const id = estado.parcela, v = estado.version, el = $("#chequeo-cuerpo");
    if (!el) return;
    if (!id) { el.innerHTML = ""; return; }
    el.innerHTML = cargando("Consultando datos de suelo, relieve y riego…");
    const consultas = await Promise.allSettled([
      leer(`/parcelas/${id}/serie/soilgrids`),
      leer(`/parcelas/${id}/serie/srtm`),
      leer(`/datos/suelo_laboratorio?aoi_id=${id}`),
      leer("/datos/pcr"),
      leer("/datos/turnos"),
      leer(`/datos/riego_parcela?aoi_id=${id}`),
    ]);
    if (v !== estado.version) return;
    const [soil, rel, lab, pcr, turn, riego] = consultas.map((x) => (x.status === "fulfilled" ? x.value : []));
    const ultimo = (arr, key) => [...arr].filter((x) => x[key] != null).sort((a, b) =>
      String(a.fecha_muestreo || a.fecha || a.fecha_inicio || a.date || "").localeCompare(String(b.fecha_muestreo || b.fecha || b.fecha_inicio || b.date || ""))).at(-1);
    const serie = (arr, key, label, unit, naturaleza = "derivado") => {
      const x = ultimo(arr.filter((r) => r.variable === key), "value");
      const origen = x?.source || x?.product || key;
      const cuando = x?.date ? `Fecha: ${x.date}. ` : "Sin fecha de campaña: capa estática del mapa. ";
      return dato(x ? `${num(x.value, 3)} ${unit}` : "por determinar", {
        titulo: label, fuente: origen,
        nota: x ? `${cuando}${naturaleza === "radar"
          ? "Radar SRTM del año 2000: relieve de referencia, no una medición de hoy."
          : "Modelo global de suelo (250 m) por pedotransferencia: no es una medición de la parcela."}`
          : "Fuente no disponible.",
        categoria: naturaleza, estado: x ? "modelado" : "por determinar" });
    };
    const campo = (key, varname, label, unit) => {
      const x = ultimo(lab, key);
      return x ? dato(`${num(x[key], 3)} ${unit}`, { titulo: label, fuente: x.fuente, nota: `Muestreo: ${x.fecha_muestreo}. Análisis de laboratorio declarado.` })
        : serie(soil, varname, label, unit);
    };
    const registros = (arr, keys, titulo) => arr.length
      ? arr.slice(-4).map((x) => `<span class="reg-item">${dato(keys.map((k) => `${k}: ${x[k] ?? "—"}`).join(" · "), {
          titulo, fuente: x.fuente || x.comision || "declarado", nota: JSON.stringify(x) })}</span>`).join(" ")
      : `<span class="ayuda">sin registros declarados</span>`;
    el.innerHTML = `<div class="chequeo-grid">
      <div class="chequeo-card">
        <p class="eyebrow">Agua del suelo</p>
        <p>Capacidad de campo (θFC): ${campo("theta_fc", "soil_theta_fc", "Capacidad de campo", "m³/m³")}</p>
        <p>Punto de marchitez (θWP): ${campo("theta_wp", "soil_theta_wp", "Punto de marchitez", "m³/m³")}</p>
        <p class="ayuda">${lab.length ? "Usando análisis de laboratorio declarado." : `Sin análisis de laboratorio (usa SoilGrids) · <a href="${API}/plantillas/suelo_laboratorio.csv" download>descargar plantilla CSV</a>`}</p>
      </div>
      <div class="chequeo-card">
        <p class="eyebrow">Relieve y drenaje</p>
        <p>Pendiente (SRTM): ${serie(rel, "slope", "Pendiente del terreno (SRTM)", "%", "radar")}</p>
        <p>Arcilla (SoilGrids): ${serie(soil, "soil_clay", "Contenido de arcilla (SoilGrids)", "%", "suelo")}</p>
        <p>Napa / salinidad: ${registros(lab, ["napa_m", "ece_dsm"], "Análisis de suelo (napa y CEe)")}</p>
      </div>
      <div class="chequeo-card">
        <p class="eyebrow">Agua de riego declarada</p>
        <p>PCR (dotación): ${registros(pcr, ["cultivo", "dotacion_m3_ha", "comision"], "Plan de Cultivo y Riego (PCR)")}</p>
        <p>Turnos de junta: ${registros(turn, ["intervalo_dias", "comision"], "Turnos de riego declarados")}</p>
        <p>Sistema en parcela: ${registros(riego, ["sistema", "eficiencia"], "Riego declarado en la parcela")}</p>
      </div>
    </div>`;
  }

  async function historialFinca() {
    const id = estado.parcela, v = estado.version, el = $("#lista-historial");
    if (!el) return;
    if (!id) { el.innerHTML = ""; return; }
    try {
      const filas = await api(`/datos/historial?aoi_id=${encodeURIComponent(id)}`);
      if (v !== estado.version) return;
      if (!filas.length) {
        el.innerHTML = '<p class="ayuda">Aún no hay campañas anteriores registradas para esta finca.</p>';
        return;
      }
      el.innerHTML = `<ul class="senales">${filas.map((f) => `<li class="senal">
        <b>${esc(f.cultivo)}</b> ${etq(f.campania || f.fecha_siembra, "verde")}
        <small>Siembra: ${esc(f.fecha_siembra)}${f.rendimiento_t_ha != null ? ` · ${num(f.rendimiento_t_ha, 1)} t/ha` : ""}</small>
        <button type="button" class="enlace" data-borrar-hist="${f.id}">Quitar</button>
      </li>`).join("")}</ul>`;
      $$("[data-borrar-hist]", el).forEach((b) => {
        b.onclick = async () => {
          await api(`/datos/historial/${b.dataset.borrarHist}`, { method: "DELETE" });
          await ctx.datosCambiaron(); historialFinca(); solidez();
        };
      });
    } catch (e) { if (v === estado.version) el.innerHTML = errorHtml(e); }
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
    info(); chequeo(); historialFinca(); clima(); solidez();
    await leerFuentes(); senales(); pintarHaces(false);
    try {
      const m = await asegurarMapa(); m.invalidateSize();
      const p = dibujarParcela();
      if (p) m.fitBounds(capa.getBounds().pad(0.6), { maxZoom: 16, animate: false }); else m.setView([-4.92, -80.34], 11);
      posicionarHaces();
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
      await leerFuentes(); senales(t.fuentes || []); info(); chequeo(); clima(); solidez();
    } catch (e) { msg.textContent = e.message; }
    finally { btn.disabled = false; vista.classList.remove("descargando"); pintarHaces(false); }
  };

  function trazar() {
    contorno?.setLatLngs(puntos);
    if (capaVertices && globalThis.L) {
      capaVertices.clearLayers();
      puntos.forEach((pt, i) => {
        globalThis.L.circleMarker(pt, { radius: 6, color: "#12301F", weight: 2, fillColor: "#D9F23A", fillOpacity: 1 })
          .bindTooltip(`Esquina ${i + 1}`, { direction: "top" })
          .addTo(capaVertices);
      });
    }
    const ha = areaHaAprox(puntos);
    $("#info-poligono").textContent = puntos.length === 0
      ? "0 puntos marcados · toca el mapa dentro del valle."
      : `${puntos.length} ${puntos.length === 1 ? "punto marcado" : "esquinas marcadas"}${ha != null ? ` · ~${num(ha, 2)} ha en San Lorenzo` : " · marca al menos 3 esquinas para un polígono"}.`;
  }
  $("#btn-ver-valle")?.addEventListener("click", async () => {
    const m = await asegurarMapa();
    if (capaValle) m.fitBounds(capaValle.getBounds().pad(0.06), { maxZoom: 12 });
  });
  $("#btn-dibujar-finca")?.addEventListener("click", async () => {
    $("#det-registro").open = true;
    const m = await asegurarMapa();
    if (capaValle && m.getZoom() < 11) m.fitBounds(capaValle.getBounds().pad(0.08), { maxZoom: 13 });
    $("#det-registro").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#inp-nombre-finca")?.focus();
  });
  $("#inp-aoi-finca")?.addEventListener("input", () => { aoiManual = $("#inp-aoi-finca").value.trim().length > 0; });
  $("#inp-nombre-finca")?.addEventListener("input", (ev) => {
    if (aoiManual) return;
    const slug = ev.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    if ($("#inp-aoi-finca")) $("#inp-aoi-finca").value = slug.length >= 3 ? slug : slug ? `finca_${slug}` : "";
  });
  $("#btn-deshacer").onclick = () => { puntos.pop(); trazar(); };
  $("#btn-limpiar").onclick = () => { puntos = []; trazar(); $("#msg-parcela").textContent = ""; };
  $("#btn-coords").onclick = () => {
    try {
      const pts = $("#coords").value.trim().split(/\n+/).map((l) => l.trim().split(/[,;\s]+/).map(Number));
      if (pts.some((p) => p.length !== 2 || p.some((x) => !Number.isFinite(x)) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) throw new Error("Usa latitud, longitud por línea.");
      if (pts.some(([la, lo]) => !dentroDelValle(la, lo))) {
        throw new Error("Todas las coordenadas deben estar dentro de la delimitación del Valle de San Lorenzo (Tambogrande).");
      }
      puntos = pts; trazar(); if (mapa) mapa.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 17 });
      $("#msg-parcela").textContent = "";
    } catch (e) { $("#msg-parcela").textContent = e.message; }
  };
  $("#form-parcela").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      if (puntos.length !== 1 && puntos.length < 3) throw new Error("Marca 1 punto o al menos 3 esquinas en el mapa del valle.");
      if (puntos.some(([la, lo]) => !dentroDelValle(la, lo))) {
        throw new Error("La finca debe estar dentro de la delimitación del Valle de San Lorenzo (Tambogrande).");
      }
      const f = new FormData(ev.target);
      const geometria = puntos.length === 1 ? { type: "Point", coordinates: [puntos[0][1], puntos[0][0]] }
        : { type: "Polygon", coordinates: [[...puntos, puntos[0]].map(([la, lo]) => [lo, la])] };
      const p = await post("/parcelas", { aoi_id: f.get("aoi_id"), nombre: f.get("nombre"), geometria });
      puntos = []; aoiManual = false; trazar(); ev.target.reset();
      $("#msg-parcela").textContent = "Finca guardada en el Valle de San Lorenzo. Ahora pulsa «Traer datos de la NASA».";
      await ctx.cargarParcelas(p.aoi_id);
    } catch (e) { $("#msg-parcela").textContent = e.message; }
  };
  $("#form-csv").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), cuerpo = new FormData(); cuerpo.append("archivo", f.get("archivo"));
    try {
      const r = await api(`/importar/${f.get("modelo")}`, { method: "POST", body: cuerpo });
      $("#msg-csv").textContent = `${r.filas_guardadas} filas guardadas.`;
      await ctx.datosCambiaron(); chequeo(); historialFinca(); solidez();
    } catch (e) { $("#msg-csv").textContent = e.message; }
  };
  $("#form-historial")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!estado.parcela) { $("#msg-historial").textContent = "Elige una chacra primero."; return; }
    const f = new FormData(ev.target);
    const cuerpo = {
      aoi_id: estado.parcela,
      cultivo: f.get("cultivo"),
      campania: f.get("campania"),
      fecha_siembra: f.get("fecha_siembra"),
      fuente: "declarado por el agricultor en web",
    };
    if (f.get("rendimiento_t_ha")) cuerpo.rendimiento_t_ha = Number(f.get("rendimiento_t_ha"));
    try {
      await post("/datos/historial", cuerpo);
      await ctx.datosCambiaron(); historialFinca(); solidez();
      $("#msg-historial").textContent = "Campaña guardada en el historial de la finca.";
    } catch (e) { $("#msg-historial").textContent = e.message; }
  });
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
    const optsCultivos = estado.cultivos.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("");
    $("#val-cultivo").innerHTML = optsCultivos; parametros();
    if ($("#hist-cultivo")) $("#hist-cultivo").innerHTML = optsCultivos;
    if ($("#hist-fecha") && !$("#hist-fecha").value) $("#hist-fecha").value = "2026-01-15";
    $("#sel-modelo").innerHTML = estado.modelos.map((m) => `<option value="${esc(m.modelo)}">${esc(m.modelo.replace(/_/g, " "))} — ${esc(m.descripcion)}</option>`).join("");
  });

  return { entrar, refrescar: entrar, volar,
    salir() { saltar?.("salida"); document.body.classList.remove("en-vuelo"); },
    /** Para la demostración: estado real de los tres satélites. */
    async enlaces() { await leerFuentes(); return SATELITES.map((s) => ({ ...s, ...(fuentes.find((f) => f.fuente === s.fuente) || { estado: "sin consultar" }) })); } };
}
