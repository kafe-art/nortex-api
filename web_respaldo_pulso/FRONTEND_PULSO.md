# El pulso de la chacra — frontend NORTEX

Aplicación estática en `nortex_api/web/`, sin compilación ni dependencias npm. Leaflet 1.9.4 es la única biblioteca de navegador; SVG, Canvas y CSS producen los visuales. El motor agronómico no fue modificado.

## Ejecutar

Desde la carpeta nortex-api, con sus dependencias instaladas:

```powershell
$env:NORTEX_API_DATA = 'ruta/a/los/datos_api'
python -m uvicorn nortex_api.main:app --reload
```

Abrir http://127.0.0.1:8000/app/. La carpeta `datos_verificacion/` contiene una copia local de ejemplo_sl usada en las pruebas de esta implementación y está excluida de Git. Puede usarse como NORTEX_API_DATA para reproducir el recorrido.

La página en `/app/` usa el mismo origen; `?api=https://servidor` permite una elección explícita y la recuerda para uso fuera de `/app/`. Una API guardada previamente no desvía silenciosamente una página servida por FastAPI.

## Flujo

- Sintoniza: seleccionar o registrar parcela por mapa o coordenadas; descargar fuentes con tarea en segundo plano; consultar estados y años disponibles. El año es contexto climático: no cambia la antigüedad del mosaico Esri.
- Chequeo: datos del suelo, relieve y riego con origen, fecha disponible y limitaciones; faltantes, plantillas CSV e ingreso de validaciones.
- F2: seleccionar un cultivo por toque, teclado o arrastre evalúa el catálogo completo; cambiar fecha, agua o condición ENSO vuelve a consultar. Las fichas conservan el orden de `tabla`.
- F1: fechas a intervalos de 15 días, en el orden de la API. Cada fecha abre las cuatro dimensiones y su escena.
- Secuencia: tres evaluaciones F2 con historial acumulado y reglas de transición. No es simulación multianual acoplada de nutrientes, rendimientos, plagas ni salud del suelo. Las fechas iniciales son propuestas editables, no un calendario agronómico recomendado.
- Demostración: usa ejemplo_sl en la API, nunca cifras escritas a mano. Cuatro pasos de unos 30 segundos más el tiempo de consulta, con pausa, siguiente y salida. Compara gravedad/goteo para la misma fecha. Restaura parcela, controles, resultados, escenario y pestaña anteriores. La ausencia de ejemplo_sl se explica sin generar datos ficticios.

## Matriz de trazabilidad

| Visual | Campo real | Transformación gráfica | Limitación |
|---|---|---|---|
| Mapa y superficie del suelo | `/parcelas[].geometria` | GeoJSON en Leaflet; contorno normalizado sobre la superficie SVG | Esquema de la forma, no sección geológica levantada. Para Point no se inventa un contorno. |
| Franja anual | `/serie/power?variable=tmax&agregado=mensual`: media, dias, anio | Media anual ponderada por días; azul a terracota con límites de las medias mensuales disponibles | POWER sin corrección de estación en este visor. Años parciales explícitos. No pronóstico. |
| Meses y marcas ICEN | Medias mensuales de POWER y `/serie/enso` | Temperatura con unidad; marca cuando ICEN mensual ≥ 0,4 | No declaración oficial de un evento por un dato aislado. |
| Raíces | Catálogo `zr_m` | Profundidad SVG = 92 + min(1,5, Zr) × 86; cifra íntegra al lado | Profundidad de literatura mientras no esté validada; raíces ilustrativas. |
| Grietas | `resultados[escenario].dias_estres`, `dias_estres_etapa_critica`, `ciclo` | Cantidad = min(9, ceil(críticos/4) + indicador de estrés); longitud según días/ciclo | Metáfora del total de campaña. No grietas observadas ni compactación. |
| Ocre/postura | `ks_minimo.valor` | Intensidad limitada a [0,1] de 1−Ks; postura en umbrales gráficos 0,5/0,9 | Umbrales gráficos, no nueva regla de decisión. Sin datos: gris/trama y etiqueta. |
| Luz hídrica | `cobertura_hidrica.valor` | Brillos cuando razón ≥ 1 | No humedad medida ni índice de salud. Cifra no truncada a 100 %. |
| Charco | `riesgo[]`, factor Exceso de lluvia (potencial) | Solo medio/alto dibuja elipse azul | Es potencial. Evidencia del motor sigue visible, incluso «encharcamiento poco probable». |
| Corona solar | `clima_escenarios[].dias_calor_floracion` | Radio 16 + min(1,días/20) × 20 | No radiación medida. Falta de datos produce cielo neutro. |
| Nubes y lluvia | `rx5day_mm / extremos.umbral_rx5day_mm` | Densidad SVG/Canvas proporcional, saturada a 1,6 | No simulación diaria ni tiempo actual. Canvas se pausa fuera de pantalla, pestaña oculta y movimiento reducido. |
| Historia de calor | `extremos` y `riesgo[].fuente` | Frecuencia, peor año, sensibilidad 34–38 °C según respuesta | Ventana y umbrales provienen del motor; etiqueta INIA cuando no validado. |
| Turnos | `insumos_efectivos.intervalo_dias`, `autonomia_entre_turnos`, `estres_por_turno` | Dos intervalos a escala horizontal; tramos de autonomía y estrés | No se infiere el intervalo sumando autonomía + estrés. No balance diario en navegador. |
| Joyas | Series SoilGrids/SRTM; registros suelo_laboratorio, PCR, turnos, riego_parcela | Esferas decorativas; cifras disponibles al expandir | La joya no es un indicador de salud. Registros de riego listados como declarados; la selección efectiva la hace el motor. |
| Bolsillo | `conveniencia.margen_soles_ha[escenario]` | S/ por ha o por determinar | Sin supuestos de precio/rendimiento. Faltantes explicados al tocar. |
| Agua | `cobertura_hidrica`, `demanda_bruta`, `taw` | Razón × 100 únicamente para cobertura; unidades originales para demanda | Demanda bruta puede estar en m³ de parcela, no m³/ha: se conserva la unidad. |
| Fichas | `tabla`, `viabilidad`, `riesgo`, `conveniencia`, `fundamentacion` | Cuatro dimensiones separadas; selección abre evidencia | No promedio, puntaje ni reordenamiento local. |
| Arcos/reglas | `viabilidad.reglas_transicion` | Ámbar condicionante; azul informativa | No prueba de recuperación física de la finca. |
| Orbit | `/salud`, `/fuentes`, `/tareas` | Disponible, sin descargar, error; reportes del reservorio >30 días = antiguos | No señal satelital en vivo. Sin porcentajes inventados. Periodos consultados, no fijos. |

## Contrato ampliado

`servicio._decision_web` añade `insumos_efectivos` a cada decisión: intervalo, dotación, eficiencia, θFC y θWP. Los copia de los objetos usados por el motor y adjunta unidad/procedencia; no los recalcula. El agregado mensual que ya estaba en la API reduce la transferencia de series.

## Comportamientos de integridad

Cada consulta usa una versión y un identificador. Cambiar parcela o datos invalida resultados pendientes. Cambiar controles mientras se consulta invalida la respuesta anterior. La escena previa se conserva durante una nueva evaluación con una etiqueta de actualización y el cuerpo original accesible. CSV y validaciones vacían las cachés. Las respuestas de error no se guardan en memoria.

Los textos externos se escapan. Los números nulos siguen como por determinar; los valores textuales de resultados se conservan como texto. Fuentes, advertencias, datos antiguos y provisionalidad no se ocultan mediante efectos.

## Verificación realizada

- `python -m pytest -q`: 14 pruebas pasan, incluida propagación de insumos efectivos y equivalencia del agregado mensual con la serie diaria.
- `node --check` sobre los módulos estáticos.
- Recorrido manual en navegador conectado a copia local de ejemplo_sl: las cinco pantallas y consultas F1/F2/secuencia.
- Contraste de caupí, siembra 2027-01-15, sin opciones añadidas: cobertura 0,642 (64 % redondeado), 36 días de estrés, 24 críticos, Ks mínimo 0,209734, calor en 24/26 años, lluvia en 3/26 años, margen por determinar. Son evidencia de esta prueba, no valores incorporados al frontend.

Los mosaicos Esri y Leaflet requieren red. No se ha medido una primera vista <3 s bajo una conexión 4G real ni se ha hecho validación agronómica de campo.

Verificaciones adicionales: navegador a 390 × 844, sin desbordamiento horizontal; navegación por flechas entre pestañas; selección de déficit alto; recorrido guiado con pausa/avance/salida. Pruebas de visuales con `node tests/web_visuals.mjs`: nulos, cobertura >100 %, valores textuales, dato de ejemplo, charco condicionado, cielo sin datos e identificadores SVG únicos. JavaScript propio: aproximadamente 64 KB; Leaflet añade aproximadamente 148 KB sin comprimir. No se incorpora Node al despliegue.

El paquete declara `web/visuales/*.js` en package-data para incluir los submódulos. No se pudo construir un wheel en este entorno porque el venv de prueba no tiene setuptools instalado; Docker conserva la carpeta al copiar el proyecto.
