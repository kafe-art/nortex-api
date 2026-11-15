/* Corte del suelo («la sed de la raíz»). Todo sale de los totales del escenario (`resultados`):
 * grietas y color ocre ← días de estrés y Ks mínimo; brillo ← cobertura hídrica ≥ 100 %;
 * agua encharcada ← factor «Exceso de lluvia (potencial)» medio o alto. La cifra acompaña al dibujo. */
import { esc, num, pct, datoRes, dato, etq } from "../util.js";

const mezcla = (a, b, t) => {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [h(a), h(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};
const v = (r) => (r && r.valor != null ? r.valor : null);

/**
 * @param res        resultados del escenario elegido
 * @param zr         profundidad de raíces del catálogo {valor, fuente, estado}
 * @param exceso     factor de riesgo «Exceso de lluvia (potencial)» (o undefined)
 */
let secuencia = 0;
export function corteSuelo({ res, zr, exceso, geometria }) {
  const uid = `suelo-${++secuencia}`;
  const dias = v(res.dias_estres), crit = v(res.dias_estres_etapa_critica), ks = v(res.ks_minimo);
  const cob = v(res.cobertura_hidrica), ciclo = v(res.ciclo) || 1;
  const simulado = dias != null && ks != null;
  const seco = simulado ? Math.min(1, Math.max(0, 1 - ks)) : 0;
  const zrM = zr?.valor ?? null;
  const fondo = 92 + Math.min(1.5, zrM ?? 0.7) * 86;            // y del fondo de la zona de raíces
  const colorRaiz = simulado ? mezcla("#5a3b28", "#c9983f", seco) : "#8b7b6c";
  const colorSup = simulado ? mezcla("#4a3122", "#d8ad5a", seco) : "#9a8b7c";
  const encharca = exceso && /medio|alto/.test(exceso.nivel);
  const brilla = cob != null && cob >= 1;
  const planta = !simulado ? "firme" : ks < 0.5 ? "marchita" : ks < 0.9 ? "decaida" : "firme";

  // Grietas: una por cada ~4 días de estrés en la etapa crítica; su largo crece con la fracción de días de estrés.
  const nGrietas = simulado ? Math.min(9, Math.ceil((crit ?? 0) / 4) + (dias > 0 ? 1 : 0)) : 0;
  const largo = simulado ? 14 + Math.min(1, dias / ciclo) * (fondo - 92) : 0;
  let grietas = "";
  for (let i = 0; i < nGrietas; i++) {
    const x = 26 + ((i * 97) % 268), l = largo * (0.55 + ((i * 37) % 45) / 100);
    grietas += `<path d="M${x} 72 l-3 ${l * 0.3} l5 ${l * 0.3} l-4 ${l * 0.4}" />`;
  }
  let raices = "";
  for (const [dx, k] of [[-46, 0.7], [-22, 0.92], [0, 1], [24, 0.88], [48, 0.66]]) {
    const y = 72 + (fondo - 72) * k;
    raices += `<path d="M160 72 C ${160 + dx * 0.3} ${72 + (y - 72) * 0.4}, ${160 + dx} ${72 + (y - 72) * 0.6}, ${160 + dx * 0.9} ${y}"/>`;
    for (let j=1;j<=5;j++) {
      const cy=72+(y-72)*j/6,cx=160+dx*j/6;
      raices += `<path class="raicilla" d="M${cx} ${cy} q${dx<0?-12:12} 6 ${dx<0?-20:20} 17 m${dx<0?20:-20} -17 q${dx<0?8:-8} 8 ${dx<0?13:-13} 21"/>`;
    }
  }
  let gotas = "";
  if (brilla) for (let i = 0; i < 9; i++) {
    gotas += `<circle class="brillo" style="animation-delay:${(i * 0.37).toFixed(2)}s" cx="${30 + ((i * 71) % 260)}"
      cy="${100 + ((i * 53) % Math.max(20, fondo - 110))}" r="3"/>`;
  }
  const ring = geometria?.type === 'Polygon' ? geometria.coordinates[0] : [];
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  const silueta=ring.length ? ring.map(([x,y])=>`${40+220*(x-Math.min(...xs))/(Math.max(...xs)-Math.min(...xs)||1)},${58-25*(y-Math.min(...ys))/(Math.max(...ys)-Math.min(...ys)||1)}`).join(' ') : '';
  const contorno=ring.length ? `<polygon points="${silueta}" fill="#b3c87b16" stroke="#c2d798" stroke-width="1.5"/>` : '';
  const svg = `<svg class="v-suelo ${planta}" viewBox="-12 0 370 275" role="img" aria-label="${esc(descripcion({ simulado, dias, crit, cob, encharca }))}">
    <defs><linearGradient id="${uid}-sombra"><stop stop-color="#1c1712" stop-opacity="0"/><stop offset="1" stop-color="#1c1712" stop-opacity=".5"/></linearGradient></defs>
    <path d="M0 72L32 28H352L320 72Z" fill="${colorSup}"/>
    ${contorno}
    <path d="M320 72L352 28V225L320 250Z" fill="#34271e"/>
    <rect y="72" width="320" height="20" fill="${colorSup}"/>
    <rect y="92" width="320" height="${fondo - 92}" fill="${colorRaiz}"/>
    <rect y="${fondo}" width="320" height="${250 - fondo}" fill="#3b2a20"/>
    <rect y="72" width="320" height="178" fill="url(#${uid}-sombra)"/>
    <g stroke="#e6b77d" stroke-opacity=".15" fill="none">${Array.from({length:12},(_,i)=>`<path d="M0 ${92+i*12} Q80 ${84+i*12} 160 ${96+i*12} T320 ${92+i*12}"/>`).join('')}</g>
    ${simulado ? "" : `<rect y="72" width="320" height="${fondo - 72}" fill="url(#${uid}-rayado)"/>`}
    <defs><pattern id="${uid}-rayado" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="3" height="8" fill="#fff" opacity=".18"/></pattern></defs>
    <g class="raices">${raices}</g>
    <g class="grietas">${grietas}</g>
    ${gotas}
    ${encharca ? `<ellipse class="charco" cx="96" cy="72" rx="62" ry="6"/><ellipse class="charco onda" cx="96" cy="72" rx="30" ry="3"/>` : ""}
    <g class="planta" transform="translate(160 72)" opacity="${simulado?1:.3}">
      <path class="tallo" d="M0 0 C -2 -18, 2 -30, 0 -46"/>
      <path class="hoja h1" d="M0 -20 C -18 -30, -30 -22, -34 -12 C -22 -12, -8 -12, 0 -20Z"/>
      <path class="hoja h2" d="M0 -28 C 18 -40, 32 -32, 36 -20 C 24 -20, 8 -20, 0 -28Z"/>
      <path class="hoja h3" d="M0 -44 C -8 -58, 6 -64, 10 -54 C 8 -48, 4 -45, 0 -44Z"/>
    </g>
    <line x1="300" y1="72" x2="300" y2="${fondo}" class="regla"/>
    <text x="294" y="${(72 + fondo) / 2}" class="rotulo" text-anchor="end">zona de raíces</text>
    <text x="294" y="${(72 + fondo) / 2 + 13}" class="rotulo fuerte" text-anchor="end">${zrM != null ? `${num(zrM, 1)} m` : "por determinar"}</text>
    <text x="8" y="86" class="rotulo">${simulado?'capa superficial':'sin información de estrés'}</text>
  </svg>`;

  const zrDato = zr ? dato(`${num(zr.valor, 1)} m`, { titulo: "Profundidad de raíces (Zr)", fuente: zr.fuente,
    estado: zr.estado === "VALIDADO" ? "real" : "por validar" }) : "";
  const texto = simulado
    ? `<p>La raíz pasa <b>${datoRes(res.dias_estres, "Días con sed (Ks < 1)", { unidad: "días" })}</b> con sed;
        ${datoRes(res.dias_estres_etapa_critica, "Días con sed en la etapa crítica", { unidad: "" })} en la etapa crítica
        (floración y llenado). En el peor día la planta toma el
        ${dato(pct(ks), { titulo: "Ks mínimo (1 = sin sed)", fuente: res.ks_minimo.fuente, categoria: res.ks_minimo.categoria })} del agua que necesita.</p>`
    : `<p>${etq("por determinar", "gris")} El motor no simula el agua del suelo para este cultivo
        (${esc(res.dias_estres?.nota || "sin resultado de estrés disponible")}).</p>`;
  const riego = cob != null
    ? `<p>El riego cubre el <b>${datoRes(res.cobertura_hidrica, "Cobertura hídrica (dotación / demanda bruta)", { comoPct: true })}</b>
        de la demanda${brilla ? ": el suelo brilla." : "."}</p>`
    : `<p>Cobertura del riego: ${dato("por determinar", { titulo: "Cobertura hídrica", estado: "por determinar",
        fuente: res.cobertura_hidrica?.fuente ?? "falta la dotación del PCR para este cultivo", nota: res.cobertura_hidrica?.nota })}
        (falta la dotación de este cultivo).</p>`;
  const charco = encharca ? `<p>Charco: ${etq(`exceso de lluvia ${exceso.nivel}`)} ${dato("ver evidencia", {
    titulo: exceso.factor, fuente: exceso.fuente, nota: exceso.evidencia })}</p>` : "";
  return `<figure class="visual">${svg}<figcaption><h4>La sed de la raíz</h4>${texto}${riego}${charco}
    <p class="ayuda">Agua útil en la zona de raíces: ${datoRes(res.taw, "Agua útil total (TAW)", { d: 0 })} · raíces a ${zrDato || "—"}</p>
    </figcaption></figure>`;
}

function descripcion({ simulado, dias, crit, cob, encharca }) {
  if (!simulado) return "Corte del suelo: el agua del suelo no se simula para este cultivo.";
  return `Corte del suelo: ${dias} días con sed, ${crit} en la etapa crítica; riego ${cob != null ? `cubre ${pct(cob)}` : "por determinar"}`
    + (encharca ? "; posible charco por exceso de lluvia." : ".");
}
