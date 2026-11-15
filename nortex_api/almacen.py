"""Almacenamiento: SQLite para datos locales y parcelas; Parquet para series de las APIs.

Carpeta de trabajo: ``NORTEX_API_DATA`` (por defecto ``./datos_api``)::

    datos_api/
    ├── nortex.db          # datos locales y parcelas
    ├── aois.yaml          # parcelas en el formato de nortex_data
    ├── local/             # CSV exportados con el formato de plantillas/ (para nortex_data)
    └── series/<aoi_id>/   # series de cada fuente (Parquet), ya recortadas
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

from nortex_api.modelos import MODELOS, SOLO_API, columnas, tipo_sql


def carpeta() -> Path:
    raiz = Path(os.getenv("NORTEX_API_DATA", "datos_api"))
    for sub in ("local", "series"):
        (raiz / sub).mkdir(parents=True, exist_ok=True)
    return raiz


def conexion() -> sqlite3.Connection:
    con = sqlite3.connect(carpeta() / "nortex.db")
    con.row_factory = sqlite3.Row
    return con


def inicializar() -> None:
    """Crea las tablas si no existen."""
    with conexion() as con:
        for modelo, (_, _, cols) in MODELOS.items():
            definicion = ", ".join(f'"{n}" {tipo_sql(t)}' for n, t, *_ in cols)
            con.execute(f'CREATE TABLE IF NOT EXISTS "{modelo}" '
                        f"(id INTEGER PRIMARY KEY AUTOINCREMENT, creado TEXT, {definicion})")
        con.execute("CREATE TABLE IF NOT EXISTS parcelas (aoi_id TEXT PRIMARY KEY, nombre TEXT, "
                    "geometria TEXT, lat REAL, lon REAL, area_ha REAL, elevation_m REAL, creado TEXT)")


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --- Datos locales ---------------------------------------------------------------------------

def insertar(modelo: str, filas: list[dict]) -> list[int]:
    cols = columnas(modelo)
    ids = []
    with conexion() as con:
        for fila in filas:
            valores = [fila.get(c).isoformat() if hasattr(fila.get(c), "isoformat") else fila.get(c)
                       for c in cols]
            cur = con.execute(
                f'INSERT INTO "{modelo}" (creado, {", ".join(chr(34) + c + chr(34) for c in cols)}) '
                f'VALUES (?, {", ".join("?" * len(cols))})', [_ahora(), *valores])
            ids.append(cur.lastrowid)
    exportar_csv(modelo)
    return ids


def listar(modelo: str, aoi_id: str | None = None) -> list[dict]:
    with conexion() as con:
        filas = [dict(r) for r in con.execute(f'SELECT * FROM "{modelo}" ORDER BY id')]
    if aoi_id and "aoi_id" in columnas(modelo):
        filas = [f for f in filas if f["aoi_id"] in (aoi_id, "", None)]
    return filas


def borrar(modelo: str, fila_id: int) -> bool:
    with conexion() as con:
        cur = con.execute(f'DELETE FROM "{modelo}" WHERE id = ?', (fila_id,))
    exportar_csv(modelo)
    return cur.rowcount > 0


def exportar_csv(modelo: str) -> None:
    """Escribe el CSV del modelo en ``local/`` con el formato de las plantillas de nortex_data."""
    if modelo in SOLO_API:
        return
    filas = listar(modelo)
    destino = carpeta() / "local" / f"{modelo}.csv"
    if not filas:
        destino.unlink(missing_ok=True)
        return
    from nortex_data.sources.local import template_columns

    pd.DataFrame(filas).reindex(columns=template_columns(modelo)).to_csv(destino, index=False)


def version_local() -> str:
    """Huella de los datos locales: cambia cuando se agrega o borra una fila."""
    partes = []
    with conexion() as con:
        for m in MODELOS:
            n, maximo = con.execute(f'SELECT COUNT(*), MAX(id) FROM "{m}"').fetchone()
            partes.append(f"{m}:{n}:{maximo}")
    return "|".join(partes)


# --- Parcelas ------------------------------------------------------------------------------------

def guardar_parcela(p: dict) -> None:
    with conexion() as con:
        con.execute("INSERT OR REPLACE INTO parcelas VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (p["aoi_id"], p["nombre"], json.dumps(p.get("geometria")), p["lat"], p["lon"],
                     p.get("area_ha"), p.get("elevation_m"), _ahora()))
    escribir_aois()


def parcelas() -> list[dict]:
    with conexion() as con:
        out = [dict(r) for r in con.execute("SELECT * FROM parcelas ORDER BY creado")]
    for p in out:
        p["geometria"] = json.loads(p["geometria"]) if p["geometria"] else None
    return out


def parcela(aoi_id: str) -> dict | None:
    return next((p for p in parcelas() if p["aoi_id"] == aoi_id), None)


def escribir_aois() -> Path:
    """Escribe ``aois.yaml`` en el formato de nortex_data."""
    aois = {}
    for p in parcelas():
        entrada = {"elevation_m": p["elevation_m"]} if p["elevation_m"] is not None else {}
        if p["geometria"] and p["geometria"].get("type") == "Polygon":
            entrada["geometry"] = p["geometria"]
        else:
            entrada.update(lat=p["lat"], lon=p["lon"])
        aois[p["aoi_id"]] = entrada
    ruta = carpeta() / "aois.yaml"
    ruta.write_text(yaml.safe_dump({"aois": aois}, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return ruta


# --- Series de las APIs --------------------------------------------------------------------------

def ruta_serie(aoi_id: str, fuente: str) -> Path:
    d = carpeta() / "series" / aoi_id
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{fuente}.parquet"


def leer_serie(aoi_id: str, fuente: str) -> pd.DataFrame | None:
    ruta = ruta_serie(aoi_id, fuente)
    return pd.read_parquet(ruta) if ruta.exists() else None
