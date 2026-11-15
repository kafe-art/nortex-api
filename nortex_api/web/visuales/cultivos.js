/* NORTEX — los cinco cultivos del valle como ilustraciones SVG vivas.
 *
 * Solo existen estos cinco identificadores, los del catálogo de la API (GET /catalogo/cultivos).
 * Cada dibujo «respira» con animaciones CSS (clases cv-*, ver estilos.css): el follaje se mece, los
 * frutos cuelgan y oscilan. El movimiento es decorativo; los datos van en las fichas que lo rodean. */

const hoja = (x, y, rx, ry, rot, c) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="${c}"/>`;

const DIBUJOS = {
  mango: () => `
    <path d="M60 136c-2-26-1-44 2-62" stroke="#6d4c33" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M61 96c8-6 14-8 20-8M59 104c-8-6-13-7-18-7" stroke="#6d4c33" stroke-width="3" fill="none"/>
    <g class="cv-mece">
      <path d="M60 80C18 86 6 52 26 38 24 12 58 2 74 18c26-8 44 18 30 38 8 20-18 32-44 24z" fill="#2E7D32"/>
      <path d="M58 70C34 72 26 54 38 44c0-16 22-22 32-10 18-4 28 12 20 24 4 12-14 18-32 12z" fill="#4CAF50" opacity=".55"/>
      <g class="cv-fruto" style="transform-origin:38px 60px"><path d="M38 60v8" stroke="#5d4037" stroke-width="1.5"/>
        <path d="M38 67c8 0 11 8 8 15-3 6-12 6-14-1-2-7 0-14 6-14z" fill="#FF9800"/><path d="M40 69c4 1 6 6 4 11" stroke="#D84315" stroke-width="3" fill="none" opacity=".6"/></g>
      <g class="cv-fruto" style="transform-origin:78px 56px;animation-delay:-1.3s"><path d="M78 56v9" stroke="#5d4037" stroke-width="1.5"/>
        <path d="M78 64c8 0 11 8 8 15-3 6-12 6-14-1-2-7 0-14 6-14z" fill="#F57C00"/><path d="M80 66c4 1 6 6 4 11" stroke="#D84315" stroke-width="3" fill="none" opacity=".6"/></g>
      <g class="cv-fruto" style="transform-origin:58px 46px;animation-delay:-.6s"><path d="M58 46v7" stroke="#5d4037" stroke-width="1.5"/>
        <path d="M58 52c7 0 9 7 7 13-3 5-10 5-12-1-2-6 0-12 5-12z" fill="#FFB74D"/></g>
    </g>`,
  limon_sutil: () => `
    <path d="M60 136c-1-20 0-34 1-48" stroke="#6d4c33" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M60 108c7-5 12-6 16-6M60 114c-7-5-11-5-15-5" stroke="#6d4c33" stroke-width="2.5" fill="none"/>
    <g class="cv-mece">
      <path d="M60 94C28 98 14 72 30 58 28 36 54 24 68 38c22-6 36 14 26 30 6 16-12 30-34 26z" fill="#388E3C"/>
      <path d="M58 84C40 86 32 70 42 62c0-12 18-18 26-8 14-2 22 10 16 20 2 10-12 14-26 10z" fill="#66BB6A" opacity=".55"/>
      ${[[40, 70], [56, 54], [74, 62], [66, 80], [48, 84], [82, 76]].map(([x, y], i) => `
      <g class="cv-fruto" style="transform-origin:${x}px ${y - 5}px;animation-delay:${-i * 0.5}s">
        <circle cx="${x}" cy="${y}" r="5.200" fill="${i % 2 ? "#D4E157" : "#C0CA33"}"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.4" fill="#F0F4C3" opacity=".8"/></g>`).join("")}
    </g>`,
  maiz: () => `
    <g class="cv-mece">
      <path d="M60 136C58 96 60 56 60 22" stroke="#558B2F" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M60 112C40 104 26 110 14 124 30 112 46 112 60 118z" fill="#4CAF50"/>
      <path d="M60 98c22-10 36-4 46 10-14-10-30-10-46-4z" fill="#43A047"/>
      <path d="M60 76C40 64 26 70 16 84 32 74 46 76 60 82z" fill="#66BB6A"/>
      <path d="M60 58c20-12 34-6 42 6-12-8-28-8-42-1z" fill="#4CAF50"/>
      <g class="cv-fruto" style="transform-origin:60px 22px"><path d="M60 24c-6-8-4-16 0-20 4 4 6 12 0 20zM60 22c-10-4-14-10-14-14M60 22c10-4 14-10 14-14" stroke="#E6C36A" stroke-width="2" fill="none"/></g>
      <g transform="rotate(24 70 88)"><path d="M62 74c10 0 14 10 13 24-1 10-12 10-14 0-2-12-4-24 1-24z" fill="#7CB342"/>
        <path d="M64 78c7 0 9 8 8 18-1 7-8 7-9 0-1-9-2-18 1-18z" fill="#FFC107"/>
        ${[82, 86, 90, 94].map((y) => `<path d="M65 ${y}h6" stroke="#FF9800" stroke-width="1.2"/>`).join("")}</g>
    </g>`,
  caupi: () => `
    <g class="cv-mece">
      <path d="M60 136C58 116 62 100 60 84" stroke="#558B2F" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M60 110c-12-6-22-4-30 4M60 100c12-8 22-6 32 0M60 88c-10-8-18-8-26-4" stroke="#558B2F" stroke-width="2.200" fill="none"/>
      ${hoja(26, 112, 12, 7, -20, "#4CAF50")}${hoja(20, 122, 10, 6, 30, "#43A047")}${hoja(34, 122, 10, 6, -40, "#66BB6A")}
      ${hoja(94, 98, 12, 7, 20, "#4CAF50")}${hoja(100, 108, 10, 6, -30, "#43A047")}${hoja(88, 110, 10, 6, 50, "#66BB6A")}
      ${hoja(32, 82, 11, 6.500, -10, "#66BB6A")}${hoja(26, 90, 9, 5, 40, "#4CAF50")}
      ${hoja(60, 74, 9, 13, 0, "#4CAF50")}${hoja(48, 80, 12, 7, -30, "#43A047")}${hoja(72, 80, 12, 7, 30, "#66BB6A")}
      <circle cx="60" cy="62" r="4" fill="#E1BEE7"/><circle cx="60" cy="62" r="1.600" fill="#8E24AA"/>
      <g class="cv-fruto" style="transform-origin:70px 92px"><path d="M70 92c4 14 6 26 4 40" stroke="#9CCC65" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M71 100l1 6M73 112l1 6M74 123v5" stroke="#558B2F" stroke-width="1"/></g>
      <g class="cv-fruto" style="transform-origin:50px 96px;animation-delay:-1.1s"><path d="M50 96c-4 12-6 22-5 34" stroke="#AED581" stroke-width="4" stroke-linecap="round" fill="none"/></g>
    </g>`,
  arroz: () => `
    <path d="M10 130q12-5 24 0t24 0 24 0 28 0" stroke="#0288D1" stroke-width="2.500" fill="none" opacity=".8" class="cv-agua"/>
    <path d="M14 136q12-4 24 0t24 0 24 0 24 0" stroke="#4FC3F7" stroke-width="1.500" fill="none" opacity=".5" class="cv-agua" style="animation-delay:-1s"/>
    <g class="cv-mece">
      ${[[-22, 78], [-12, 96], [-4, 108], [6, 104], [14, 92], [24, 76]].map(([a, l], i) => `
        <path d="M60 132q${a * 0.3} ${-l * 0.6} ${a} ${-l}" stroke="${i % 2 ? "#66BB6A" : "#4CAF50"}" stroke-width="3" stroke-linecap="round" fill="none"/>`).join("")}
      ${[[40, 52, -1], [56, 26, -1], [74, 38, 1], [86, 54, 1]].map(([x, y, s], i) => `
        <g class="cv-fruto" style="transform-origin:${x}px ${y}px;animation-delay:${-i * 0.7}s">
          <path d="M${x} ${y}q${s * 10} 4 ${s * 14} 22" stroke="#C0A24A" stroke-width="1.500" fill="none"/>
          ${[0, 1, 2, 3, 4].map((k) => hoja(x + s * (3 + k * 2.6), y + 3 + k * 4.4, 2.2, 4, s * 30, "#E6C36A")).join("")}
        </g>`).join("")}
    </g>`,
};

/** SVG vivo del cultivo. `id` debe ser uno de los cinco del catálogo; cualquier otro devuelve "". */
export function cultivoVivo(id, clase = "") {
  const dibujo = DIBUJOS[id];
  if (!dibujo) return "";
  return `<svg class="cultivo-vivo ${clase}" viewBox="0 0 120 140" aria-hidden="true">${dibujo()}</svg>`;
}
export const CULTIVOS_VIVOS = Object.keys(DIBUJOS);
