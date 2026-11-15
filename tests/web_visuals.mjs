// Pruebas de las funciones puras de los visuales (sin navegador): node tests/web_visuals.mjs
// Comprueban las reglas de honestidad: nulos → «por determinar», lo provisional se marca, nada se inventa
// y las cuatro dimensiones nunca se funden en una.
import assert from 'node:assert/strict';
globalThis.document = { addEventListener() {}, hidden: false };
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: true });
const { datoRes, estadoDato, calor01 } = await import('../nortex_api/web/util.js');
const { sol } = await import('../nortex_api/web/visuales/sol.js');
const { modeloSuelo, leyendaSuelo, altSuelo } = await import('../nortex_api/web/visuales/suelo.js');
const { balanza, costoDe } = await import('../nortex_api/web/visuales/balanza.js');
const { cuatroMini } = await import('../nortex_api/web/visuales/autopsia.js');
const { cultivoVivo, CULTIVOS_VIVOS } = await import('../nortex_api/web/visuales/cultivos.js');

const metric = (valor, unidad = '-') => ({ valor, unidad, fuente: 'API de prueba', categoria: 'simulado' });

// Utilidades
assert.match(datoRes(metric(null), 'Cobertura'), /por determinar/);
assert.match(datoRes(metric(1.42), 'Cobertura', { comoPct: true }), /142 %/);
assert.match(datoRes(metric('deficit medio: año análogo 2015'), 'Clima'), /año análogo 2015/);
assert.equal(estadoDato('parámetro'), 'por validar');
assert.equal(estadoDato('PCR EJEMPLO'), 'ejemplo');
assert.equal(calor01(null), null); assert.equal(calor01(24), 0); assert.equal(calor01(40), 1);

// Solo los cinco cultivos del catálogo
assert.deepEqual([...CULTIVOS_VIVOS].sort(), ['arroz', 'caupi', 'limon_sutil', 'maiz', 'mango']);
assert.equal(cultivoVivo('quinua'), '');
assert.match(cultivoVivo('mango'), /<svg/);

// Sol de la floración
const sinCalor = sol({ extremos: { anios: 24, anios_calor: null, nivel_calor: 'por determinar', ventana_floracion: 'sin dato de floración' } });
assert.match(sinCalor, /Sin información de calor/); assert.doesNotMatch(sinCalor, /sol-disco/);
const extremos = { anios: 26, anios_calor: 24, nivel_calor: 'alto', umbral_calor_c: 35, umbral_calor_validado: false, umbral_calor_origen: 'lit; POR_VALIDAR',
  ventana_floracion: 'días 35–55 después de la siembra', peor_anio_calor: { anio: 2010, dias: 17 },
  sensibilidad_calor: [{ umbral_c: 35, anios: 24, nivel: 'alto' }, { umbral_c: 37, anios: 2, nivel: 'bajo' }] };
const caliente = sol({ extremos, riesgo: [{ factor: 'Calor en floración', nivel: 'alto', evidencia: 'en 24 de 26 años…', fuente: 'clima corregido' }] });
assert.match(caliente, /En 24 de 26 años hizo calor peligroso aquí/);
assert.match(caliente, /data-nivel="alto"/); assert.match(caliente, /por validar con INIA/);
assert.equal((caliente.match(/anio-calor/g) || []).length, 24); assert.equal((caliente.match(/anio-fresco/g) || []).length, 2);
assert.match(sol({ extremos: { ...extremos, umbral_calor_validado: true } }), /· validado/);
assert.notEqual(caliente.match(/id="(sol-\d+)"/)[1], sol({ extremos }).match(/id="(sol-\d+)"/)[1]);

// Corte del suelo
const vacio = modeloSuelo({ res: {} });
assert.equal(vacio.sinDatos, true); assert.equal(vacio.conCiclo, false); assert.equal(vacio.grietas, null);
assert.match(leyendaSuelo(vacio), /Sin información de estrés hídrico/); assert.match(altSuelo(vacio), /sin información/);
const res = { dias_estres: metric(36, 'días'), dias_estres_etapa_critica: metric(24, 'días'), ks_minimo: metric(0.2), ciclo: metric(80, 'días'),
  cobertura_hidrica: metric(1.42), autonomia_entre_turnos: metric(7.7, 'días'), estres_por_turno: metric(6.3, 'días') };
const intervalo = { valor: 14, unidad: 'días', fuente: 'turnos declarados: valor de ejemplo / comision=EJEMPLO' };
const zr = { valor: 0.7, fuente: 'FAO56-T22', estado: 'POR_VALIDAR' };
const seco = modeloSuelo({ res, zr, intervalo, cultivo: 'caupi', tipo: 'anual' });
assert.equal(seco.grietas, 7); assert.equal(seco.marchita, true); assert.equal(seco.conCiclo, true); assert.equal(seco.charco, false);
assert.ok(Math.abs(seco.zrEscala - 0.7 / 1.5) < 1e-9);
const leyenda = leyendaSuelo(seco, { res, intervalo, zr });
assert.match(leyenda, /la raíz pasa sed/); assert.match(leyenda, /142 %/); assert.match(leyenda, /36 días/); assert.match(leyenda, /cada 14 días/);
assert.match(leyenda, /dato-debil/);                       // turno de ejemplo y Zr por validar: borde punteado
assert.equal(modeloSuelo({ res, zr, intervalo, exceso: { nivel: 'alto' } }).charco, true);
assert.equal(modeloSuelo({ res, zr, intervalo, exceso: { nivel: 'bajo' } }).charco, false);
assert.equal(modeloSuelo({ res, zr: { valor: 3 } }).zrEscala, 1);                // escala visual limitada a 1,5 m
assert.equal(modeloSuelo({ res: { ...res, estres_por_turno: metric(0, 'días') }, intervalo }).marchita, false);
assert.equal(modeloSuelo({ res, zr }).conCiclo, false);                            // sin turno no se anima el riego
assert.match(leyendaSuelo(modeloSuelo({ res, zr }), { res, zr }), /Turnos de riego por determinar/);

// Balanza
const cerrada = balanza({ conveniencia: { estado: 'por determinar', fuente: null, agua_m3_ha: 4000, nota: ' Sin rendimiento, precio y costo de referencia (SIEA/MIDAGRI).' } });
assert.match(cerrada, /class="candado"/); assert.match(cerrada, /Conveniencia: por determinar/); assert.match(cerrada, /--angulo:0\.0deg/);
const conv = { estado: 'calculado', fuente: 'declarado: SIEA', margen_soles_ha: { deficit_bajo: 3000, deficit_medio: 1500, deficit_alto: -800 }, margen_soles_m3: 0.38, metodo: 'rend × precio − costo' };
const abierta = balanza({ conveniencia: conv, escenario: 'deficit_medio', costo: { costo_soles_ha: 4500, fuente: 'SIEA 2025' } });
assert.doesNotMatch(abierta, /class="candado"/); assert.match(abierta, /S\/ 1,500 por ha/); assert.match(abierta, /S\/ 4,500 por ha/);
assert.match(abierta, /--angulo:-7\.0deg/);                // pesa más el costo: (1500 − 4500) / 6000 × 14
assert.match(balanza({ conveniencia: conv, escenario: 'deficit_alto' }), /data-signo="contra"/);
assert.equal(costoDe([{ id: 1, cultivo: 'caupi', anio: 2024, costo_soles_ha: 1 }, { id: 2, cultivo: 'caupi', anio: 2025, costo_soles_ha: 2 },
  { id: 3, cultivo: 'maiz', anio: 2026, costo_soles_ha: 9 }], 'caupi').costo_soles_ha, 2);
assert.equal(costoDe([], 'caupi'), undefined);

// Cuatro dimensiones: cuatro celdas, sin total
const mini = cuatroMini({ viabilidad: { estado: 'no viable' }, riesgo: [{ nivel: 'alto' }, { nivel: 'alto' }, { nivel: 'medio' }, { nivel: 'bajo' }],
  conveniencia: { estado: 'por determinar' }, fundamentacion: { nivel: 'limitada' } });
assert.equal((mini.match(/<dt>/g) || []).length, 4);
for (const d of ['Viabilidad', 'Riesgo', 'Conveniencia', 'Fundamentación']) assert.match(mini, new RegExp(`<dt>${d}</dt>`));
assert.match(mini, /<b>2<\/b> altos · <b>1<\/b> medios/); assert.match(mini, /por determinar/);
assert.doesNotMatch(mini, /puntaje|score|total/i);

console.log('Visuales: nulos, provisionalidad, sol, corte del suelo, balanza, cinco cultivos y cuatro dimensiones separadas: OK');
