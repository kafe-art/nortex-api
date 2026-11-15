# nortex-api

Backend web de **NORTEX** (FastAPI). Une el módulo de datos (`nortex_data`, 14 fuentes) con el
motor (`nortex_motor`) y expone todo por JSON para el frontend.

```
Frontend ──HTTP/JSON──► nortex-api ──► nortex_data (NASA, SoilGrids, SRTM, ICEN, SENAMHI PDF…)
                            │        └► nortex_motor (balance FAO-56, escenarios, validación, F1/F2)
                            └► SQLite (datos locales) + Parquet (series por parcela)
```

## Instalación y arranque

```bash
pip install -e ".[dev]"            # instala también nortex-data y nortex-motor desde GitHub
uvicorn nortex_api.main:app --reload
```

Documentación interactiva: http://127.0.0.1:8000/docs

Carpeta de trabajo: `NORTEX_API_DATA` (por defecto `./datos_api`, no se versiona).

## Endpoints

| Método | Ruta | Para qué |
| :-- | :-- | :-- |
| GET | `/salud` | Estado del servicio |
| GET | `/catalogo/cultivos` | 5 cultivos con parámetros, fuente y estado de validación |
| GET | `/modelos` | Modelos de datos locales (columnas, tipos, rangos) para armar formularios |
| GET / POST | `/datos/{modelo}` | Listar o agregar una fila validada |
| DELETE | `/datos/{modelo}/{id}` | Borrar una fila |
| POST | `/importar/{modelo}` | Carga masiva desde CSV (todo o nada; ignora filas `EJEMPLO`) |
| POST / GET | `/parcelas` | Registrar (GeoJSON Point o Polygon) y listar parcelas |
| POST | `/parcelas/{aoi_id}/actualizar` | Descargar las fuentes por API para la parcela |
| GET | `/parcelas/{aoi_id}/fuentes` | Estado y rango de cada fuente descargada |
| GET | `/parcelas/{aoi_id}/serie/{fuente}` | Serie de una fuente (para gráficos) |
| POST | `/evaluar/f1` | ¿Cuándo sembrar? Ventanas de un cultivo |
| POST | `/evaluar/f2` | ¿Qué sembrar? Cultivos y transición desde el historial |

## Modelos de datos locales

| Modelo | Origen | Uso en el motor |
| :-- | :-- | :-- |
| `reservorio` | ANA / PE Chira Piura | Situación del reservorio, dotación análoga |
| `caudal_quiroz` | ANA (Zamba) | Recarga del sistema |
| `pcr` | Junta de Usuarios | Dotación y área autorizada (RT-06, RT-08) |
| `turnos` | Junta de Usuarios | Autonomía entre turnos |
| `estacion_senamhi` | SENAMHI (solicitud formal) | **Reemplaza a la estación NOAA** en la validación cuando hay ≥ 365 días |
| `enfen` | ENFEN | Estado de alerta y probabilidades |
| `economia` | SIEA / MIDAGRI | Conveniencia (margen) |
| `suelo_laboratorio` | Laboratorio | Agua del suelo y salinidad (prioridad sobre SoilGrids) |
| `riego_parcela` | Agricultor | Eficiencia de riego |
| `historial` | Agricultor | Transición (F2) |

## Riesgo climático y reglas de transición

- Las descargas incluyen **IMERG** (0,1°, desde 2001) solo para el riesgo por **exceso de
  lluvia**; si cubre menos de 15 años, el motor usa la lluvia de POWER. **SRTM** (pendiente) y
  SoilGrids (arcilla) se usan como factores de drenaje.
- Cada decisión trae `clima_escenarios` (déficit, lluvia máxima en 5 días y días de calor del
  año análogo de cada escenario, por separado) y `extremos` (frecuencia en todos los años y peor
  año). Los escenarios se llaman `deficit_bajo/medio/alto`: describen el clima, no si es bueno.
- `reglas` de F2 llevan tipo: **condicionante** (RT-01, RT-05) cambia la viabilidad;
  **informativa** (RT-02, RT-04) solo avisa. Enviar `"renovacion_confirmada": true` cuando el
  agricultor decidió renovar el huerto. F1 también acepta `historial`.

## Ejemplo de flujo

```bash
# 1. Registrar la parcela dibujada en el mapa
curl -X POST localhost:8000/parcelas -H "Content-Type: application/json" -d '{
  "aoi_id": "chacra_1", "nombre": "Chacra 1",
  "geometria": {"type": "Polygon", "coordinates": [[[-80.3412,-5.0928],[-80.3392,-5.0928],
                [-80.3392,-5.0946],[-80.3412,-5.0946],[-80.3412,-5.0928]]]}}'

# 2. Descargar las fuentes (la primera vez tarda varios minutos: POWER 1991–hoy)
curl -X POST localhost:8000/parcelas/chacra_1/actualizar

# 3. Cargar datos de la Junta
curl -X POST localhost:8000/importar/pcr -F "archivo=@pcr.csv"

# 4. Preguntar qué sembrar
curl -X POST localhost:8000/evaluar/f2 -H "Content-Type: application/json" -d '{
  "aoi_id": "chacra_1", "cultivos": ["caupi","maiz","arroz"], "inicio": "2027-06-01",
  "historial": ["arroz","arroz"]}'
```

La respuesta trae, por cultivo, las **cuatro dimensiones** (viabilidad, riesgo, conveniencia y
fundamentación), los escenarios, el hindcast, la procedencia de cada insumo y las advertencias.

## Prueba con datos reales (15/11/2026, parcela de ejemplo de 4,4 ha)

| Paso | Resultado |
| :-- | :-- |
| `POST /parcelas/{id}/actualizar` | 185 s; SRTM, ENSO, reportes SENAMHI, estación y POWER 1991–2026 (52 398 filas) OK; **SoilGrids «tiempo agotado»** (servidor caído) sin bloquear las demás |
| Altitud | 198,8 m guardada automáticamente desde SRTM para ET0 |
| `POST /evaluar/f2` (caupí, maíz; goteo) | 1,2 s; ambos «viable»; fundamentación «limitada» porque el suelo quedó por defecto |
| `POST /evaluar/f1` (4 ventanas de caupí) | 0,4 s; mayo–junio viables, fin de julio ya no cubre la demanda (C = 0,99) |

Cada fuente tiene un límite de tiempo (`LIMITE_SEGUNDOS`) y todas corren en paralelo; si una no
responde se conserva la serie anterior y se informa en la respuesta.

## Pendiente

- La descarga inicial de POWER histórico es lenta: ejecutarla en segundo plano y avisar al frontend.
- Autenticación de usuarios (cada agricultor ve sus parcelas).
- Migrar SQLite a PostgreSQL/PostGIS al pasar a producción.
