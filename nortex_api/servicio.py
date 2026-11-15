"""Lógica del backend: parcelas, descarga de fuentes y evaluación F1/F2 con `nortex_motor`."""

from __future__ import annotations

import logging
import math
import os
import threading
import time
from contextlib import contextmanager

import pandas as pd
from shapely.geometry import shape

from nortex_api import almacen

log = logging.getLogger("nortex_api")

#: Fuentes que se descargan para cada parcela: (fuente, variables, opciones de get_dataset).
FUENTES = [
    ("srtm", ["elevation", "slope", "relief"], {}),
    ("soilgrids", ["soil_theta_fc", "soil_theta_wp", "soil_clay", "soil_sand"], {}),
    ("enso", ["icen", "oni"], {}),
    ("senamhi_reportes", ["reservoir_volume_report"], {}),
    # Estación y POWER piden el mismo histórico: más años de traslape para validar y, como corren
    # en paralelo, ambos usan historico=True (la opción es global en nortex_data).
    ("estacion", ["station_tmax", "station_tmin", "station_precip"],
     {"start": "1991-01-01", "historico": True}),
    ("power", ["tmax", "tmin", "rain_power", "et0"], {"start": "1991-01-01", "historico": True}),
]
MIN_DIAS_SENAMHI = 365
#: Límite por fuente (s). Si un servicio no responde (p. ej. SoilGrids caído), se marca
#: «tiempo agotado» y las demás fuentes siguen. Las fuentes corren en paralelo.
LIMITE_SEGUNDOS = {"srtm": 120, "soilgrids": 180, "enso": 120, "senamhi_reportes": 180,
                   "estacion": 300, "power": 1500}
_contextos: dict[tuple, object] = {}


@contextmanager
def _entorno():
    """Apunta nortex_data a las carpetas de la API (CSV locales)."""
    previo = os.environ.get("NORTEX_LOCAL_DIR")
    os.environ["NORTEX_LOCAL_DIR"] = str(almacen.carpeta() / "local")
    try:
        yield
    finally:
        if previo is None:
            os.environ.pop("NORTEX_LOCAL_DIR", None)
        else:
            os.environ["NORTEX_LOCAL_DIR"] = previo


# --- Parcelas ----------------------------------------------------------------------------------

def area_ha(geometria: dict) -> float | None:
    """Área aproximada en ha (proyección local equivalente; error < 0,5 % a esta escala)."""
    g = shape(geometria)
    if g.geom_type not in {"Polygon", "MultiPolygon"}:
        return None
    lat = g.centroid.y
    escala = 111_320 * math.cos(math.radians(lat)) * 110_574
    return g.area * escala / 10_000


def registrar_parcela(aoi_id: str, nombre: str, geometria: dict) -> dict:
    """Valida y guarda una parcela (Point o Polygon GeoJSON en lon/lat)."""
    g = shape(geometria)
    if g.geom_type not in {"Point", "Polygon"}:
        raise ValueError("La geometría debe ser Point o Polygon (GeoJSON, lon/lat)")
    if not g.is_valid:
        raise ValueError("Polígono inválido (autointersección o vértices insuficientes, EX-01)")
    oeste, sur, este, norte = g.bounds
    if (este - oeste) > 0.25 or (norte - sur) > 0.25:
        raise ValueError("La parcela excede 0,25° por lado")
    punto = g.representative_point() if g.geom_type == "Polygon" else g
    p = {"aoi_id": aoi_id, "nombre": nombre, "geometria": geometria, "lat": punto.y, "lon": punto.x,
         "area_ha": area_ha(geometria), "elevation_m": None}
    previa = almacen.parcela(aoi_id)
    if previa:
        p["elevation_m"] = previa["elevation_m"]
    almacen.guardar_parcela(p)
    _contextos.clear()
    return p


# --- Fuentes -------------------------------------------------------------------------------------

def actualizar_fuentes(aoi_id: str, fuentes: list[str] | None = None) -> list[dict]:
    """Descarga (o refresca) las series de cada fuente para la parcela y las guarda en Parquet."""
    from nortex_data import get_dataset

    if almacen.parcela(aoi_id) is None:
        raise KeyError(aoi_id)
    pedidas = [f for f in FUENTES if not fuentes or f[0] in fuentes]
    resultados: dict[str, dict] = {}

    def tarea(fuente, variables, opciones, ruta_aois):
        t0 = time.time()
        try:
            df = get_dataset(fuente, aoi_id, variables=variables, aoi_path=ruta_aois, **opciones)
            df.to_parquet(almacen.ruta_serie(aoi_id, fuente), index=False)
            fechas = df["date"].dropna()
            resultados[fuente] = {
                "fuente": fuente, "filas": len(df), "estado": "ok",
                "desde": None if fechas.empty else str(fechas.min().date()),
                "hasta": None if fechas.empty else str(fechas.max().date()),
                "segundos": round(time.time() - t0, 1), "_df": df}
        except Exception as error:  # una fuente caída no detiene las demás
            log.exception("Fuente %s falló para %s", fuente, aoi_id)
            resultados[fuente] = {"fuente": fuente, "filas": 0, "estado": "error", "detalle": str(error),
                                  "segundos": round(time.time() - t0, 1)}

    def lanzar(grupo, ruta_aois):
        """Ejecuta el grupo en paralelo; cada fuente tiene su propio límite de tiempo."""
        hilos = []
        for fuente, variables, opciones in grupo:
            h = threading.Thread(target=tarea, args=(fuente, variables, opciones, ruta_aois), daemon=True)
            h.start()
            hilos.append((fuente, h, time.time()))
        for fuente, h, t0 in hilos:
            h.join(max(0.0, LIMITE_SEGUNDOS.get(fuente, 300) - (time.time() - t0)))
            if h.is_alive():  # el hilo sigue en segundo plano; su resultado se descarta
                previa = almacen.leer_serie(aoi_id, fuente) is not None
                resultados[fuente] = {
                    "fuente": fuente, "filas": 0, "estado": "tiempo agotado",
                    "detalle": (f"El servicio no respondió en {LIMITE_SEGUNDOS.get(fuente, 300)} s"
                                + ("; se conserva la serie descargada antes" if previa else "")),
                    "segundos": round(time.time() - t0, 1)}

    with _entorno():
        ruta_aois = str(almacen.escribir_aois())
        # SRTM primero: la altitud real alimenta la presión y Rso de ET0 en POWER.
        lanzar([f for f in pedidas if f[0] == "srtm"], ruta_aois)
        srtm = resultados.get("srtm", {})
        if srtm.get("estado") == "ok":
            elev = srtm["_df"].loc[srtm["_df"]["variable"] == "elevation", "value"]
            if len(elev):
                p = almacen.parcela(aoi_id)
                p["elevation_m"] = float(elev.iloc[0])
                almacen.guardar_parcela(p)
                ruta_aois = str(almacen.escribir_aois())
        lanzar([f for f in pedidas if f[0] != "srtm"], ruta_aois)
    _contextos.clear()
    return [{k: v for k, v in resultados[f[0]].items() if k != "_df"} for f in pedidas]


def estado_fuentes(aoi_id: str) -> list[dict]:
    out = []
    for fuente, _, _ in FUENTES:
        df = almacen.leer_serie(aoi_id, fuente)
        if df is None:
            out.append({"fuente": fuente, "estado": "sin descargar"})
            continue
        fechas = df["date"].dropna()
        out.append({"fuente": fuente, "estado": "ok", "filas": len(df),
                    "variables": sorted(df["variable"].unique()),
                    "desde": None if fechas.empty else str(fechas.min().date()),
                    "hasta": None if fechas.empty else str(fechas.max().date())})
    return out


# --- Contexto y evaluación -----------------------------------------------------------------------

def _estacion_senamhi() -> tuple[pd.DataFrame | None, str | None]:
    filas = almacen.listar("estacion_senamhi")
    if len(filas) < MIN_DIAS_SENAMHI:
        return None, None
    df = pd.DataFrame(filas)
    nombre = df["estacion"].mode().iloc[0]
    df = df[df["estacion"] == nombre]
    largo = df.melt(id_vars=["fecha"], value_vars=["tmax", "tmin", "precip"],
                    var_name="variable", value_name="value")
    largo["variable"] = "senamhi_" + largo["variable"]
    largo["date"] = pd.to_datetime(largo["fecha"])
    largo["value"] = pd.to_numeric(largo["value"], errors="coerce")
    return largo, f"SENAMHI {nombre}"


def contexto(aoi_id: str):
    """Contexto del motor para la parcela (se reutiliza mientras no cambien los datos)."""
    from nortex_data import get_dataset
    from nortex_motor.pipeline import preparar

    clave = (aoi_id, almacen.version_local())
    if clave in _contextos:
        return _contextos[clave]
    if almacen.parcela(aoi_id) is None:
        raise KeyError(aoi_id)
    clima = almacen.leer_serie(aoi_id, "power")
    if clima is None:
        raise LookupError("Primero descargue las fuentes de la parcela (POST /parcelas/{aoi_id}/actualizar)")
    estacion, nombre = _estacion_senamhi()
    if estacion is None:
        estacion, nombre = almacen.leer_serie(aoi_id, "estacion"), "NOAA GSOD 84401 (Piura)"
    with _entorno():
        local = get_dataset("local", aoi_id, aoi_path=str(almacen.escribir_aois()))
    reservorios = pd.concat([d for d in (almacen.leer_serie(aoi_id, "senamhi_reportes"),
                                         local[local["variable"] == "reservoir_volume"]) if d is not None])
    ctx = preparar(clima, estacion=estacion, nombre_estacion=nombre,
                   suelo_datos=almacen.leer_serie(aoi_id, "soilgrids"), local=local,
                   enso=almacen.leer_serie(aoi_id, "enso"), reservorios=reservorios)
    _contextos.clear()
    _contextos[clave] = ctx
    return ctx


def _tabla(df: pd.DataFrame) -> list[dict]:
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def evaluar_f1(aoi_id: str, cultivo: str, desde, hasta, paso_dias: int, **kw) -> dict:
    from nortex_motor.decision import f1_ventanas

    out = f1_ventanas(contexto(aoi_id), cultivo, desde, hasta, paso_dias, **kw)
    return {"funcion": "F1", "regla_orden": out["regla_orden"], "tabla": _tabla(out["tabla"]),
            "decisiones": [d.a_dict() for d in out["decisiones"]]}


def evaluar_f2(aoi_id: str, cultivos: list[str], inicio, historial: list[str], **kw) -> dict:
    from nortex_motor.decision import f2_cultivos

    out = f2_cultivos(contexto(aoi_id), cultivos, inicio, historial, **kw)
    return {"funcion": "F2", "regla_orden": out["regla_orden"], "tabla": _tabla(out["tabla"]),
            "decisiones": [d.a_dict() for d in out["decisiones"]]}
