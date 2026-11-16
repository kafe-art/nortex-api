"""Lógica del backend: parcelas, descarga de fuentes y evaluación F1/F2 con `nortex_motor`."""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
import uuid
from contextlib import contextmanager

import pandas as pd
from shapely.geometry import shape

from nortex_api import almacen
from nortex_api.modelos import IMPACTO, MODELOS, columnas

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
    # IMERG (0,1°) solo para el riesgo por exceso de lluvia: capta mejor los aguaceros que POWER.
    # El motor lo usa si cubre ≥ 15 años; si no, cae a la lluvia de POWER.
    ("imerg", ["precipitation"], {"start": "2001-01-01", "historico": True}),
]
MIN_DIAS_SENAMHI = 365
#: Límite por fuente (s). Si un servicio no responde (p. ej. SoilGrids caído), se marca
#: «tiempo agotado» y las demás fuentes siguen. Las fuentes corren en paralelo.
LIMITE_SEGUNDOS = {"srtm": 120, "soilgrids": 180, "enso": 120, "senamhi_reportes": 180,
                   "estacion": 300, "power": 1500, "imerg": 1500}
_contextos: dict[tuple, object] = {}


def compatibilidad() -> dict:
    """Comprueba que el nortex_data instalado es el que espera la API (v0.6.1 o posterior).

    El paquete antiguo (solo POWER, ``aoi_file``) se instala sin error pero hace fallar las
    descargas: este chequeo lo detecta al arrancar y en ``/salud``.
    """
    import inspect

    problemas = []
    try:
        import nortex_data
        from nortex_data import get_dataset
    except ImportError as error:
        return {"ok": False, "problemas": [f"nortex_data no está instalado: {error}"]}
    parametros = inspect.signature(get_dataset).parameters
    for nombre in ("aoi_path", "historico"):
        if nombre not in parametros:
            problemas.append(f"get_dataset no acepta «{nombre}»: versión antigua de nortex_data")
    try:
        from nortex_data.utils.core import SOURCES
        faltan = sorted({f for f, _, _ in FUENTES} - set(SOURCES))
    except ImportError:
        faltan = sorted({f for f, _, _ in FUENTES})
    if faltan:
        problemas.append(f"nortex_data no tiene las fuentes {faltan}")
    if problemas:
        problemas.append('Instale la versión fija: pip install "nortex-data @ '
                         'git+https://github.com/BRYTNEI/nortex-data.git@v0.6.1"')
    return {"ok": not problemas, "nortex_data": getattr(nortex_data, "__file__", None),
            "problemas": problemas}


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
    """Valida y guarda una parcela (Point o Polygon GeoJSON en lon/lat) dentro de San Lorenzo."""
    g = shape(geometria)
    if g.geom_type not in {"Point", "Polygon"}:
        raise ValueError("La geometría debe ser Point o Polygon (GeoJSON, lon/lat)")
    if not g.is_valid:
        raise ValueError("Polígono inválido (autointersección o vértices insuficientes, EX-01)")
    oeste, sur, este, norte = g.bounds
    if (este - oeste) > 0.25 or (norte - sur) > 0.25:
        raise ValueError("La parcela excede 0,25° por lado")
    # Delimitación del valle de San Lorenzo (Tambogrande / Las Lomas, Piura)
    if oeste < -80.52 or este > -80.12 or sur < -5.22 or norte > -4.62:
        raise ValueError(
            "La finca debe estar dentro de la delimitación del valle de San Lorenzo (Tambogrande, Piura)"
        )
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
    estaticas = {"soilgrids", "srtm"}      # capas de mapa: no tienen fecha de campaña
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
                    "hasta": None if fechas.empty else str(fechas.max().date()),
                    "estatico": fuente in estaticas and fechas.empty})
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
                   enso=almacen.leer_serie(aoi_id, "enso"), reservorios=reservorios,
                   lluvia_datos=almacen.leer_serie(aoi_id, "imerg"),
                   relieve=almacen.leer_serie(aoi_id, "srtm"))
    _contextos.clear()
    _contextos[clave] = ctx
    return ctx


def _tabla(df: pd.DataFrame) -> list[dict]:
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def _decision_web(decision) -> dict:
    """Expone los insumos efectivamente usados, sin recalcular ni alterar el motor."""
    salida = decision.a_dict()
    ev = decision.evaluacion
    campos = (
        ("intervalo_dias", ev.riego.intervalo_dias, "días", "turnos"),
        ("dotacion_m3_ha", ev.riego.dotacion_m3_ha, "m³/ha", "dotacion"),
        ("eficiencia", ev.riego.eficiencia, "-", "eficiencia"),
        ("theta_fc", ev.suelo.theta_fc, "m³/m³", "suelo"),
        ("theta_wp", ev.suelo.theta_wp, "m³/m³", "suelo"),
    )
    salida["insumos_efectivos"] = {
        nombre: {"valor": valor, "unidad": unidad, "fuente": ev.procedencia.get(origen, "sin fuente"),
                 "categoria": "insumo", "nota": "Valor usado en esta evaluación; no medición actual."}
        for nombre, valor, unidad, origen in campos
    }
    salida["insumos_efectivos"]["area_ha"] = {
        "valor": getattr(ev, "area_ha", 1.0), "unidad": "ha", "fuente": "área de la parcela (catastro de la API)",
        "categoria": "declarado",
        "nota": "Convierte la lámina de agua (mm) en volumen (m³). Si el catastro no la trae, se asume 1 ha.",
    }
    return salida


def _area_ha(aoi_id: str) -> float:
    """Área de la parcela para pasar de mm a m³ (el motor asume 1 ha si no se le dice)."""
    parcela = almacen.parcela(aoi_id) or {}
    return float(parcela.get("area_ha") or 1.0)


def evaluar_f1(aoi_id: str, cultivo: str, desde, hasta, paso_dias: int,
               historial: list[str] | None = None, **kw) -> dict:
    from nortex_motor.decision import f1_ventanas

    aplicar_validaciones()
    declarados = _historial_rendimientos(aoi_id)
    hist_efectivo = historial if historial else [f["cultivo"] for f in declarados if f.get("cultivo")]
    kw.setdefault("area_ha", _area_ha(aoi_id))
    kw.setdefault("rendimientos", declarados)
    out = f1_ventanas(contexto(aoi_id), cultivo, desde, hasta, paso_dias,
                      historial=hist_efectivo or None, **kw)
    return {"funcion": "F1", "regla_orden": out["regla_orden"], "tabla": _tabla(out["tabla"]),
            "decisiones": [_decision_web(d) for d in out["decisiones"]]}


def _historial_rendimientos(aoi_id: str) -> list[dict]:
    """Campañas declaradas de la parcela (tabla ``historial``), con su rendimiento si lo traen."""
    return sorted(almacen.listar("historial", aoi_id), key=lambda f: (f.get("fecha_siembra") or "", f["id"]))


def evaluar_f2(aoi_id: str, cultivos: list[str], inicio, historial: list[str],
               renovacion_confirmada: bool = False, **kw) -> dict:
    from nortex_motor.decision import f2_cultivos

    aplicar_validaciones()
    declarados = _historial_rendimientos(aoi_id)
    hist_efectivo = historial if historial else [f["cultivo"] for f in declarados if f.get("cultivo")]
    kw.setdefault("area_ha", _area_ha(aoi_id))
    out = f2_cultivos(contexto(aoi_id), cultivos, inicio, hist_efectivo,
                      renovacion_confirmada=renovacion_confirmada,
                      rendimientos=declarados, **kw)
    return {"funcion": "F2", "regla_orden": out["regla_orden"], "tabla": _tabla(out["tabla"]),
            "decisiones": [_decision_web(d) for d in out["decisiones"]]}


# --- Validaciones agronómicas (INIA / MIDAGRI) ---------------------------------------------------

def _validaciones_guardadas() -> dict[str, dict[str, dict]]:
    """Última validación por cultivo y parámetro (por fecha y luego por orden de carga)."""
    out: dict[str, dict[str, dict]] = {}
    filas = sorted(almacen.listar("validacion_parametro"), key=lambda f: (f["fecha"], f["id"]))
    for f in filas:
        out.setdefault(f["cultivo"], {})[f["parametro"]] = {
            "valor": json.loads(f["valor"]), "fuente": f"{f['fuente']} ({f['fecha']})"}
    return out


def aplicar_validaciones() -> None:
    """Carga en el motor los parámetros validados que están guardados."""
    from nortex_motor.catalogo import establecer_validaciones

    establecer_validaciones(_validaciones_guardadas())


def comprobar_validacion(fila: dict) -> None:
    """Rechaza un parámetro inexistente o un valor que el motor no acepta (lo prueba y revierte)."""
    from nortex_motor.catalogo import cultivo, establecer_validaciones

    try:
        valor = json.loads(fila["valor"])
    except (TypeError, ValueError):
        raise ValueError('«valor» debe ser JSON: 36 · [35, 55] · "media"') from None
    c = cultivo(fila["cultivo"])
    if fila["parametro"] not in c.parametros:
        raise ValueError(f"{fila['cultivo']} no tiene el parámetro {fila['parametro']!r}. "
                         f"Opciones: {sorted(c.parametros)}")
    previo = c.get(fila["parametro"])
    if previo is not None and isinstance(previo, list) != isinstance(valor, list):
        raise ValueError(f"{fila['parametro']} espera un valor del mismo tipo que {json.dumps(previo)}")
    prueba = _validaciones_guardadas()
    prueba.setdefault(fila["cultivo"], {})[fila["parametro"]] = {"valor": valor, "fuente": fila["fuente"]}
    try:
        establecer_validaciones(prueba)
    finally:
        aplicar_validaciones()


# --- Plantillas y faltantes ----------------------------------------------------------------------

_EJEMPLO_TIPO = {"fecha": "2026-12-01", "num": "0", "entero": "1", "texto": "", "cultivo": "caupi"}


def plantilla_csv(modelo: str) -> str:
    """CSV con las columnas del modelo y una fila de ejemplo (fuente=EJEMPLO: se ignora al importar)."""
    cols = MODELOS[modelo][2]
    fila = []
    for nombre, tipo, _, minimo, _ in cols:
        valor = str(minimo) if minimo is not None and tipo in {"num", "entero"} else _EJEMPLO_TIPO[tipo]
        fila.append("EJEMPLO" if nombre == "fuente" else valor)
    return ",".join(c[0] for c in cols) + "\n" + ",".join(fila) + "\n"


def _es_ejemplo(fila: dict) -> bool:
    return any("ejemplo" in str(fila.get(k) or "").lower() for k in ("fuente", "comision", "ambito"))


def faltantes(aoi_id: str) -> dict:
    """Qué datos tiene la parcela, cuáles son de ejemplo y qué falta para una decisión definitiva."""
    from nortex_motor.catalogo import cargar_cultivos

    p = almacen.parcela(aoi_id)
    if p is None:
        raise KeyError(aoi_id)
    items = []
    tipo = (p["geometria"] or {}).get("type")
    ejemplo = "ejemplo" in (aoi_id + " " + p["nombre"]).lower()
    if ejemplo:
        detalle = "Parcela de ejemplo: dibuje el contorno de una chacra real sobre la imagen satelital."
    elif tipo == "Point":
        detalle = "Solo un punto: dibuje el contorno de la chacra."
    else:
        detalle = (f"Polígono de {p['area_ha']:.2f} ha, altitud "
                   + (f"{p['elevation_m']:.0f} m (SRTM)." if p["elevation_m"] else "sin descargar."))
    items.append({"dato": "coordenadas", "grupo": "parcela", "origen": "Agricultor (mapa)",
                  "estado": "ejemplo" if ejemplo else "aproximado" if tipo == "Point" else "ok",
                  "detalle": detalle,
                  "impacto": "Todo el análisis (clima, suelo, relieve) se calcula en este lugar."})
    for f in estado_fuentes(aoi_id):
        if f["estado"] != "ok":
            items.append({"dato": f"fuente {f['fuente']}", "grupo": "fuentes por API", "estado": "falta",
                          "origen": "descarga automática", "detalle": "Use «Descargar datos».",
                          "impacto": "Sin POWER no se puede evaluar; las demás mejoran la fundamentación."})
    for modelo, (origen, impacto) in IMPACTO.items():
        filas = almacen.listar(modelo, aoi_id if "aoi_id" in columnas(modelo) else None)
        reales = [f for f in filas if not _es_ejemplo(f)]
        if modelo == "estacion_senamhi":
            estado = "ok" if len(reales) >= MIN_DIAS_SENAMHI else "falta"
        else:
            estado = "ok" if reales else "ejemplo" if filas else "falta"
        items.append({"dato": modelo, "grupo": "datos locales", "origen": origen, "estado": estado,
                      "filas": len(filas), "filas_ejemplo": len(filas) - len(reales),
                      "detalle": MODELOS[modelo][0], "impacto": impacto,
                      "plantilla": f"/plantillas/{modelo}.csv"})
    aplicar_validaciones()
    claves = {"calor_floracion_c", "floracion_dias", "floracion_meses", "kc_constante", "kc_med"}
    por_validar = {}
    for cid, c in cargar_cultivos().items():
        pend = sorted(n for n, prm in c.parametros.items() if prm.estado != "VALIDADO")
        por_validar[cid] = {"total": len(pend), "prioritarios": [n for n in pend if n in claves]}
    estado = {i["dato"]: i["estado"] for i in items}
    definitiva = all(estado.get(k) == "ok" for k in ("coordenadas", "pcr", "turnos"))
    return {"aoi_id": aoi_id, "viabilidad_definitiva_posible": definitiva,
            "items": items, "parametros_por_validar": por_validar}


# --- Descarga en segundo plano -------------------------------------------------------------------

_tareas: dict[str, dict] = {}


def actualizar_en_segundo_plano(aoi_id: str, fuentes: list[str] | None = None) -> dict:
    """Lanza la descarga en un hilo y devuelve la tarea; el frontend consulta ``/tareas/{id}``."""
    if almacen.parcela(aoi_id) is None:
        raise KeyError(aoi_id)
    activa = next((t for t in _tareas.values() if t["aoi_id"] == aoi_id and t["estado"] == "en curso"), None)
    if activa:
        return activa
    t = {"id": uuid.uuid4().hex[:12], "aoi_id": aoi_id, "estado": "en curso",
         "inicio": time.strftime("%Y-%m-%dT%H:%M:%S"), "fin": None, "fuentes": None, "error": None}
    _tareas[t["id"]] = t

    def correr():
        try:
            t["fuentes"] = actualizar_fuentes(aoi_id, fuentes)
            t["estado"] = "terminada"
        except Exception as error:  # se informa en la tarea
            log.exception("Descarga en segundo plano falló para %s", aoi_id)
            t.update(estado="error", error=str(error))
        t["fin"] = time.strftime("%Y-%m-%dT%H:%M:%S")

    threading.Thread(target=correr, daemon=True).start()
    return t


def tarea(tarea_id: str) -> dict:
    return _tareas[tarea_id]
