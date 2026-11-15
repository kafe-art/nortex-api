# La chacra viva — frontend NORTEX

Aplicación estática en `nortex_api/web/`, sin compilación ni dependencias npm: HTML, CSS y módulos ES.
Leaflet 1.9.4 es la única biblioteca y se descarga a demanda (solo al abrir el mapa). El motor
agronómico no se tocó; la API solo ganó compresión gzip de las respuestas.

El frontend anterior («El pulso de la chacra», por pestañas) quedó respaldado en `web_respaldo_pulso/`.

## Ejecutar

```powershell
$env:NORTEX_API_DATA = 'ruta/a/los/datos_api'     # p. ej. datos_verificacion (copia local de ejemplo_sl)
python -m uvicorn nortex_api.main:app --reload
```

Abrir http://127.0.0.1:8000/app/. `?api=https://servidor` apunta a otra API y lo recuerda.

## Flujo: decisión primero, satélite después

| Escena | Archivo | Llamadas reales |
|---|---|---|
| Portal de la chacra (`#`) | `escenas/portal.js` | `/serie/power?variable=tmax&agregado=mensual` (tiñe el cielo con la Tmax histórica del mes) |
| Vuelo orbital (interludio) y Mi parcela (`#parcela`) | `escenas/orbita.js` | `/parcelas`, `/parcelas/{id}/fuentes`, `/actualizar` + `/tareas/{id}`, `/serie/power`, `/serie/enso`, `/faltantes`, `POST /parcelas`, `/importar/{modelo}`, `/datos/validacion_parametro` |
| Laboratorio de cultivos F2 (`#que`) | `escenas/laboratorio.js` | `POST /evaluar/f2` con los 5 cultivos; `/datos/economia` |
| Calendario de siembra F1 (`#cuando`) | `escenas/tiempo.js` | `POST /evaluar/f1`, 12 ventanas (paso de 30 días) |
| Secuencia de 3 campañas (`#secuencia`) | `escenas/secuencia.js` | 3 × `POST /evaluar/f2` con `historial` acumulado y `renovacion_confirmada` |
| Demostración jurado | `demo.js` | Las mismas escenas sobre `ejemplo_sl`; el texto se redacta con la respuesta |

`app.js` es el director: estado compartido, rutas por hash, Ajustes (se envían tal cual como `Opciones`
de la API) y el paso por la puerta: la primera vez se muestra el vuelo orbital **mientras la consulta
real ya está en curso**; los haces de los satélites son el indicador de carga.

Módulos visuales (`visuales/`): `ambiente.js` (cielo y polvo en Canvas), `cultivos.js` (los cinco SVG
vivos), `sol.js`, `suelo.js`, `balanza.js` y `autopsia.js`, que los ensambla junto a las cuatro
dimensiones. `util.js` aporta el resorte (spring), la inclinación 3D y el panel de procedencia.

## Matriz visual → dato

| Visual | Campo de la API | Transformación | Límite declarado |
|---|---|---|---|
| Cielo de fondo | `extremos.tmax_floracion.media_c` (o Tmax mensual de POWER en el portal) | Escala fija 24–36 °C, fresco → caluroso | Historia; no es el tiempo de hoy. Sin dato: cielo neutro. El polvo es decorativo |
| Gotas de la carta | `tabla[].demanda_neta_mm` | 1–5, relativo al cultivo más sediento de la consulta | Comparación dentro de la consulta |
| Soles de la carta | `extremos.frecuencia_calor` | 1 sol ≈ 1 de cada 5 años | Punteado mientras el umbral esté por validar; huecos si no hay dato |
| Monedas / candado | `costo_soles_ha` de `/datos/economia` | 1–5 relativo al mayor costo | Sin plantilla económica: candado, «por determinar» |
| Orden de las cartas | `tabla` | Ninguna: no se reordena en el navegador | — |
| Sol de la floración | `extremos.nivel_calor`, `anios_calor`, `anios`, `sensibilidad_calor`, `peor_anio_calor` | Color y vibración por nivel; un punto por año del registro | Frecuencia histórica, no pronóstico. «por validar con INIA» si `umbral_calor_validado` es falso |
| Raíces del corte | Catálogo `zr_m` | Profundidad a escala, tope 1,5 m | Raíces ilustrativas |
| Grietas | `dias_estres_etapa_critica`, `dias_estres`, `ciclo` | mín(9, ⌈críticos/4⌉ + 1 si hay estrés) | Metáfora de la campaña, no grietas observadas |
| Ciclo de riego (goteo, secado, marchitez) | `insumos_efectivos.intervalo_dias`, `autonomia_entre_turnos`, `estres_por_turno` | Un turno en ~9 s; marchita solo si el estrés por turno es > 0 | Compara dos duraciones del motor; no es un balance diario ni el estado actual |
| Brillos azules | `cobertura_hidrica` ≥ 1 | — | No es humedad medida |
| Charco / lluvia | Riesgo «Exceso de lluvia (potencial)» medio o alto / `clima_escenarios[].exceso_lluvia` | — | Potencial, no encharcamiento observado |
| Balanza | `conveniencia.margen_soles_ha[escenario]` y costo declarado | Inclinación acotada a ±14° | Sin economía: nivelada, con candado |
| Cuatro dimensiones (acordeón) | `viabilidad`, `riesgo`, `conveniencia`, `fundamentacion` | Ninguna | Cuatro filas desplegables independientes; nunca se suman ni se promedian |
| Calendario F1: arco solar y 12 parcelas mensuales | `viabilidad.estado` / n.º de riesgos «alto» / `tmax_floracion.media_c` | Tres filas rotuladas separadas por mes + sol en el arco anual | Borde punteado si la viabilidad es provisional; trama gris sin dato |
| Uniones del rompecabezas | `viabilidad.reglas_transicion` | Ámbar punteado = condicionante; azul = informativa | Evaluaciones encadenadas: no simulan nutrientes, plagas ni suelo entre campañas |
| Haces de satélite | `/parcelas/{id}/fuentes` (power, imerg, srtm) | Brilla si `estado = ok`; gris punteado si falta | Series archivadas, no señal en vivo. La API no descarga SMAP, por eso no hay haz SMAP |
| Franjas de calor y puntos ICEN | `/serie/power` y `/serie/enso` (agregado mensual) | Media anual ponderada por días; punto si algún mes ICEN ≥ 0,4 | Se rotulan los tres picos ICEN mayores del periodo según los datos; un mes aislado no declara un evento |
| Barra de solidez | `/faltantes` | Cuenta de insumos por estado | No es un puntaje |

## Reglas que el frontend respeta

1. Cuatro dimensiones independientes; no hay puntaje ni semáforo compuesto.
2. Lo nulo se muestra «por determinar» y se explica qué falta (toque en cualquier cifra → procedencia).
3. Lo provisional lleva borde punteado ámbar (datos de ejemplo, supuestos ingresados, umbrales por validar con INIA).
4. Todo es frecuencia histórica; ningún texto habla de pronóstico.
5. Solo los cinco cultivos del catálogo (`visuales/cultivos.js` no dibuja otros).

## Accesibilidad y rendimiento

Teclado en la baraja (flechas, Inicio/Fin) y en el calendario de siembra (flechas, Inicio/Fin; `role="radiogroup"`);
texto alternativo en el canvas; `prefers-reduced-motion` detiene las animaciones y
omite el vuelo. El canvas del suelo se pausa fuera de pantalla y con la pestaña oculta. JS + CSS propios
≈ 200 kB sin comprimir; F1 con 12 ventanas baja de ≈ 290 kB a ≈ 17 kB con gzip.

## Verificación realizada

- `python -m pytest -q`: 14 pruebas pasan. `ruff check`: sin errores.
- `node tests/web_visuals.mjs`: funciones puras de sol, suelo, balanza, cultivos y cuatro dimensiones.
- Navegador contra la copia local de `ejemplo_sl` (1280 × 800 y 375 × 812): portal, vuelo orbital con
  haces, baraja, autopsia, anillo (giro por botón y por arrastre), secuencia arroz → arroz → arroz → mango
  (RT-04, RT-02, RT-05) y los siete pasos de la demostración, sin errores de consola ni desborde horizontal.

No verificado: tiempo de carga en una red 4G real, la voz de la demostración (depende de las voces del
dispositivo), una descarga completa de fuentes, el registro de una chacra nueva, la importación CSV y
la validación de parámetros desde esta interfaz, ni validación agronómica de campo.
