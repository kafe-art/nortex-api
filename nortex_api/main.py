"""API de NORTEX para el sistema web.

Ejecutar::

    uvicorn nortex_api.main:app --reload

Documentación interactiva en ``/docs``. Todas las respuestas son JSON; cada cifra del motor
incluye unidad, categoría (observado, modelado, escenario, simulado, declarado) y fuente.
"""

from __future__ import annotations

import io
from contextlib import asynccontextmanager
from datetime import date

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from nortex_api import almacen, servicio
from nortex_api.modelos import CULTIVOS, MODELOS, describir, esquema


@asynccontextmanager
async def _ciclo(_app):
    almacen.inicializar()
    yield


app = FastAPI(
    lifespan=_ciclo,
    title="NORTEX API",
    version="0.1.0",
    description="Datos del valle de San Lorenzo (NASA y fuentes locales) y evaluación F1/F2.",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _modelo(nombre: str) -> None:
    if nombre not in MODELOS:
        raise HTTPException(404, f"Modelo desconocido {nombre!r}. Opciones: {sorted(MODELOS)}")


# --- General --------------------------------------------------------------------------------------

@app.get("/salud", tags=["general"])
def salud() -> dict:
    return {"estado": "ok", "parcelas": len(almacen.parcelas())}


@app.get("/catalogo/cultivos", tags=["general"])
def catalogo_cultivos() -> list[dict]:
    """Cultivos del motor con sus parámetros, fuente y estado de validación."""
    from nortex_motor.catalogo import cargar_cultivos

    return [{"id": c.id, "nombre": c.nombre, "cientifico": c.cientifico, "tipo": c.tipo,
             "ciclo_dias": c.ciclo_dias,
             "parametros": {k: {"valor": p.valor, "fuente": p.fuente, "estado": p.estado}
                            for k, p in c.parametros.items()}}
            for c in cargar_cultivos().values()]


# --- Datos locales (ANA, Junta, SENAMHI, ENFEN, SIEA, laboratorio) -------------------------------

@app.get("/modelos", tags=["datos locales"])
def modelos() -> list[dict]:
    """Modelos de datos locales con columnas, tipos y rangos (para formularios dinámicos)."""
    return describir()


@app.get("/datos/{modelo}", tags=["datos locales"])
def listar(modelo: str, aoi_id: str | None = None) -> list[dict]:
    _modelo(modelo)
    return almacen.listar(modelo, aoi_id)


@app.post("/datos/{modelo}", status_code=201, tags=["datos locales"])
def crear(modelo: str, fila: dict) -> dict:
    """Agrega una fila validada (tipos y rangos del modelo)."""
    _modelo(modelo)
    try:
        valida = esquema(modelo).model_validate(fila)
    except ValidationError as error:
        raise HTTPException(422, error.errors(include_url=False)) from None
    (fila_id,) = almacen.insertar(modelo, [valida.model_dump()])
    return {"id": fila_id, **valida.model_dump(mode="json")}


@app.delete("/datos/{modelo}/{fila_id}", tags=["datos locales"])
def borrar(modelo: str, fila_id: int) -> dict:
    _modelo(modelo)
    if not almacen.borrar(modelo, fila_id):
        raise HTTPException(404, "Fila no encontrada")
    return {"borrado": fila_id}


@app.post("/importar/{modelo}", tags=["datos locales"])
async def importar(modelo: str, archivo: UploadFile = File(...)) -> dict:
    """Carga masiva desde un CSV con las columnas del modelo (las de `plantillas/`).

    Valida todas las filas antes de guardar: si alguna falla, no se guarda ninguna.
    """
    _modelo(modelo)
    contenido = (await archivo.read()).decode("utf-8-sig")
    tabla = pd.read_csv(io.StringIO(contenido), dtype=str).fillna("")
    if "fuente" in tabla:
        tabla = tabla[tabla["fuente"].str.upper() != "EJEMPLO"]
    Esquema = esquema(modelo)
    validas, errores = [], []
    for i, fila in enumerate(tabla.to_dict(orient="records"), start=2):
        limpia = {k: (None if v == "" else v) for k, v in fila.items() if k in Esquema.model_fields}
        try:
            validas.append(Esquema.model_validate(limpia).model_dump())
        except ValidationError as error:
            errores.append({"linea": i, "errores": error.errors(include_url=False)})
    if errores:
        raise HTTPException(422, {"mensaje": "No se guardó nada: hay filas inválidas", "filas": errores[:20]})
    ids = almacen.insertar(modelo, validas)
    return {"modelo": modelo, "filas_guardadas": len(ids)}


# --- Parcelas y fuentes --------------------------------------------------------------------------

class ParcelaEntrada(BaseModel):
    aoi_id: str = Field(..., pattern=r"^[a-z0-9_]{3,40}$")
    nombre: str
    geometria: dict = Field(..., description="GeoJSON Point o Polygon en lon/lat (WGS 84)")


@app.post("/parcelas", status_code=201, tags=["parcelas"])
def crear_parcela(p: ParcelaEntrada) -> dict:
    try:
        return servicio.registrar_parcela(p.aoi_id, p.nombre, p.geometria)
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(422, str(error)) from None


@app.get("/parcelas", tags=["parcelas"])
def listar_parcelas() -> list[dict]:
    return almacen.parcelas()


@app.post("/parcelas/{aoi_id}/actualizar", tags=["parcelas"])
def actualizar(aoi_id: str, fuentes: list[str] | None = None) -> dict:
    """Descarga las fuentes por API para la parcela (la primera vez, ~1 min por POWER 1991–hoy)."""
    try:
        return {"aoi_id": aoi_id, "fuentes": servicio.actualizar_fuentes(aoi_id, fuentes)}
    except KeyError:
        raise HTTPException(404, f"Parcela {aoi_id!r} no existe") from None


@app.get("/parcelas/{aoi_id}/fuentes", tags=["parcelas"])
def fuentes(aoi_id: str) -> list[dict]:
    if almacen.parcela(aoi_id) is None:
        raise HTTPException(404, f"Parcela {aoi_id!r} no existe")
    return servicio.estado_fuentes(aoi_id)


@app.get("/parcelas/{aoi_id}/serie/{fuente}", tags=["parcelas"])
def serie(aoi_id: str, fuente: str, variable: str | None = None, desde: date | None = None,
          hasta: date | None = None) -> list[dict]:
    """Serie de una fuente en formato largo (para gráficos)."""
    df = almacen.leer_serie(aoi_id, fuente)
    if df is None:
        raise HTTPException(404, "Fuente sin descargar")
    if variable:
        df = df[df["variable"] == variable]
    if desde:
        df = df[df["date"] >= pd.Timestamp(desde)]
    if hasta:
        df = df[df["date"] <= pd.Timestamp(hasta)]
    df = df.assign(date=df["date"].astype(str))
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


# --- Evaluación -----------------------------------------------------------------------------------

class Opciones(BaseModel):
    area_ha: float | None = Field(None, gt=0)
    dotacion_m3_ha: float | None = Field(None, ge=0, le=40_000)
    intervalo_dias: int | None = Field(None, ge=1, le=60)
    eficiencia: float | None = Field(None, gt=0, le=1)
    condicion_enso: str | None = Field(None, pattern="^(nino|neutro|nina)$")
    economia: dict | None = Field(
        None, description="{cultivo: {rendimiento_t_ha, precio_soles_kg, costo_soles_ha}}")

    def kwargs(self, aoi_id: str) -> dict:
        area = self.area_ha or (almacen.parcela(aoi_id) or {}).get("area_ha") or 1.0
        kw = {"area_ha": area, "economia": self.economia}
        for k in ("dotacion_m3_ha", "intervalo_dias", "eficiencia", "condicion_enso"):
            if getattr(self, k) is not None:
                kw[k] = getattr(self, k)
        return kw


class F1Entrada(Opciones):
    aoi_id: str
    cultivo: str = Field(..., pattern="^(" + "|".join(CULTIVOS) + ")$")
    desde: date
    hasta: date
    paso_dias: int = Field(15, ge=1, le=120)


class F2Entrada(Opciones):
    aoi_id: str
    cultivos: list[str] = Field(default_factory=lambda: list(CULTIVOS))
    inicio: date
    historial: list[str] = Field(default_factory=list, description="Cultivos anteriores, el último al final")


def _ejecutar(funcion, *args, **kw):
    try:
        return funcion(*args, **kw)
    except KeyError as error:
        raise HTTPException(404, f"No existe: {error}") from None
    except LookupError as error:
        raise HTTPException(409, str(error)) from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@app.post("/evaluar/f1", tags=["evaluación"])
def f1(e: F1Entrada) -> dict:
    """F1 — ¿cuándo conviene sembrar? Ventanas cada `paso_dias` entre `desde` y `hasta`."""
    if (e.hasta - e.desde).days > 366:
        raise HTTPException(422, "El rango de ventanas no puede superar un año")
    return _ejecutar(servicio.evaluar_f1, e.aoi_id, e.cultivo, e.desde, e.hasta, e.paso_dias,
                     **e.kwargs(e.aoi_id))


@app.post("/evaluar/f2", tags=["evaluación"])
def f2(e: F2Entrada) -> dict:
    """F2 — ¿qué conviene sembrar? Compara cultivos y la transición desde el historial."""
    desconocidos = set(e.cultivos + e.historial) - set(CULTIVOS)
    if desconocidos:
        raise HTTPException(422, f"Cultivos desconocidos: {sorted(desconocidos)}")
    return _ejecutar(servicio.evaluar_f2, e.aoi_id, e.cultivos, e.inicio, e.historial, **e.kwargs(e.aoi_id))
