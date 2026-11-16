"""Modelos de los datos locales sin API (ANA, Junta de Usuarios, SENAMHI, ENFEN, SIEA, laboratorio).

Cada modelo define sus columnas, tipos y rangos válidos. Las columnas coinciden con las
plantillas de `nortex_data` (`plantillas/*.csv`) para que el motor los lea sin conversión.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, create_model

CULTIVOS = ("arroz", "caupi", "maiz", "mango", "limon_sutil")

#: tipo → (anotación de Python, tipo SQLite)
_TIPOS = {"fecha": (date, "TEXT"), "num": (float, "REAL"), "entero": (int, "INTEGER"), "texto": (str, "TEXT")}

#: modelo → (descripción, categoría, [(columna, tipo, obligatorio, mínimo, máximo)])
MODELOS: dict[str, tuple[str, str, list[tuple]]] = {
    "reservorio": ("Volumen almacenado del reservorio San Lorenzo (ANA / PE Chira Piura)", "observado", [
        ("fecha", "fecha", True, None, None), ("volumen_hm3", "num", True, 0, 300),
        ("fuente", "texto", True, None, None)]),
    "caudal_quiroz": ("Caudal del río Quiroz, estación Zamba (ANA)", "observado", [
        ("fecha", "fecha", True, None, None), ("caudal_m3s", "num", True, 0, 5000),
        ("fuente", "texto", True, None, None)]),
    "pcr": ("Plan de Cultivo y Riego: área autorizada y dotación por cultivo (Junta de Usuarios)",
            "declarado", [
        ("fecha_inicio", "fecha", True, None, None), ("campania", "texto", True, None, None),
        ("comision", "texto", True, None, None), ("cultivo", "cultivo", True, None, None),
        ("area_autorizada_ha", "num", False, 0, 100_000), ("dotacion_m3_ha", "num", False, 0, 40_000),
        ("fuente", "texto", True, None, None)]),
    "turnos": ("Intervalo de turnos de riego por comisión (Junta de Usuarios)", "declarado", [
        ("fecha_inicio", "fecha", True, None, None), ("comision", "texto", True, None, None),
        ("intervalo_dias", "entero", True, 1, 60), ("fuente", "texto", True, None, None)]),
    "enfen": ("Comunicado oficial ENFEN", "declarado", [
        ("fecha_emision", "fecha", True, None, None), ("estado_alerta", "texto", True, None, None),
        ("horizonte", "texto", False, None, None), ("codigo_alerta", "entero", True, 0, 2),
        ("prob_nino_costero_pct", "num", False, 0, 100), ("fuente", "texto", True, None, None)]),
    "economia": ("Rendimiento, precio en chacra y costo de producción (SIEA / MIDAGRI)", "declarado", [
        ("anio", "entero", True, 1990, 2100), ("campania", "texto", False, None, None),
        ("cultivo", "cultivo", True, None, None), ("ambito", "texto", True, None, None),
        ("rendimiento_t_ha", "num", False, 0, 150), ("precio_chacra_soles_kg", "num", False, 0, 100),
        ("costo_soles_ha", "num", False, 0, 200_000), ("fuente", "texto", True, None, None)]),
    "suelo_laboratorio": ("Análisis de suelo y agua de la parcela", "declarado", [
        ("fecha_muestreo", "fecha", True, None, None), ("aoi_id", "texto", True, None, None),
        ("textura", "texto", False, None, None), ("profundidad_cm", "texto", False, None, None),
        ("theta_fc", "num", False, 0.02, 0.7), ("theta_wp", "num", False, 0.0, 0.5),
        ("ph", "num", False, 3, 11), ("ece_dsm", "num", False, 0, 60), ("mo_pct", "num", False, 0, 30),
        ("ecw_dsm", "num", False, 0, 20), ("napa_m", "num", False, 0, 50),
        ("profundidad_efectiva_m", "num", False, 0, 5), ("fuente", "texto", True, None, None)]),
    "riego_parcela": ("Sistema y eficiencia de riego de la parcela", "declarado", [
        ("fecha", "fecha", True, None, None), ("aoi_id", "texto", True, None, None),
        ("sistema", "texto", True, None, None), ("comision", "texto", False, None, None),
        ("eficiencia", "num", True, 0.1, 1.0), ("fuente", "texto", True, None, None)]),
    "historial": ("Campañas anteriores de la parcela", "declarado", [
        ("fecha_siembra", "fecha", True, None, None), ("aoi_id", "texto", True, None, None),
        ("campania", "texto", True, None, None), ("cultivo", "cultivo", True, None, None),
        ("fecha_cosecha", "fecha", False, None, None), ("rendimiento_t_ha", "num", False, 0, 150),
        ("fuente", "texto", True, None, None)]),
    "estacion_senamhi": ("Serie diaria de una estación SENAMHI (solicitud formal)", "observado", [
        ("estacion", "texto", True, None, None), ("fecha", "fecha", True, None, None),
        ("tmax", "num", False, -10, 50), ("tmin", "num", False, -15, 40),
        ("precip", "num", False, 0, 500), ("fuente", "texto", True, None, None)]),
    "validacion_parametro": ("Parámetro del cultivo confirmado con una ficha local (INIA, MIDAGRI…); "
                             "reemplaza al de literatura y pasa a VALIDADO", "declarado", [
        ("fecha", "fecha", True, None, None), ("cultivo", "cultivo", True, None, None),
        ("parametro", "texto", True, None, None),
        ("valor", "texto", True, None, None),  # JSON: 36 · [35, 55] · "media"
        ("fuente", "texto", True, None, None)]),
}

#: Modelos que solo usa la API (no tienen plantilla en nortex_data ni CSV en ``local/``).
SOLO_API = {"estacion_senamhi", "validacion_parametro"}

#: Para qué sirve cada dato local y qué pasa si falta (lo muestra ``/parcelas/{id}/faltantes``).
IMPACTO = {
    "pcr": ("Junta de Usuarios", "Dotación por cultivo (RT-06) y área autorizada (RT-08). Sin ella la "
            "viabilidad es «por determinar» o provisional."),
    "turnos": ("Junta de Usuarios", "Intervalo entre riegos: autonomía del suelo y estrés por turno."),
    "suelo_laboratorio": ("Laboratorio (INIA, universidad)", "Agua útil del suelo, salinidad (ECe, ECw) y "
                          "napa. Sin él se usa SoilGrids o textura por defecto: fundamentación «limitada»."),
    "enfen": ("ENFEN (comunicado oficial)", "Confirma si El Niño Costero persiste en la campaña."),
    "economia": ("SIEA / MIDAGRI, Agencia Agraria", "Margen bruto y margen por m³ (conveniencia)."),
    "reservorio": ("ANA / PE Chira-Piura", "Situación del reservorio San Lorenzo y dotación análoga."),
    "riego_parcela": ("Agricultor", "Eficiencia de riego real (si no, 0,5 por defecto)."),
    "historial": ("Agricultor", "Reglas de transición en F2 (RT-01, RT-04, RT-05) y contraste del "
                  "rendimiento estimado con lo cosechado en la parcela (avisa si se dispara)."),
    "caudal_quiroz": ("ANA (estación Zamba)", "Recarga del sistema (informativo)."),
    "estacion_senamhi": ("SENAMHI (solicitud formal)", "Corrige el clima con una estación del valle "
                         "(≥ 365 días) en lugar del aeropuerto de Piura."),
    "validacion_parametro": ("INIA / MIDAGRI", "Umbral de calor en floración, Kc del mango, ventanas de "
                             "floración… Mientras falten, los parámetros quedan POR VALIDAR."),
}


def columnas(modelo: str) -> list[str]:
    """Columnas del modelo en orden."""
    return [c[0] for c in MODELOS[modelo][2]]


def tipo_sql(tipo: str) -> str:
    return "TEXT" if tipo == "cultivo" else _TIPOS[tipo][1]


def _anotacion(tipo: str):
    if tipo == "cultivo":
        from typing import Literal

        return Literal[CULTIVOS]  # type: ignore[valid-type]
    return _TIPOS[tipo][0]


def esquema(modelo: str) -> type[BaseModel]:
    """Modelo Pydantic con tipos y rangos para validar una fila."""
    campos: dict[str, Any] = {}
    for nombre, tipo, obligatorio, minimo, maximo in MODELOS[modelo][2]:
        restricciones = {k: v for k, v in (("ge", minimo), ("le", maximo)) if v is not None}
        anot = _anotacion(tipo)
        if obligatorio:
            campos[nombre] = (anot, Field(..., **restricciones))
        else:
            campos[nombre] = (anot | None, Field(None, **restricciones))
    return create_model(f"Fila_{modelo}", **campos)


def describir() -> list[dict]:
    """Descripción de los modelos para el frontend (formularios dinámicos)."""
    return [
        {"modelo": m, "descripcion": d, "categoria": cat,
         "columnas": [{"nombre": n, "tipo": t, "obligatorio": o, "min": mi, "max": ma}
                      for n, t, o, mi, ma in cols]}
        for m, (d, cat, cols) in MODELOS.items()
    ]
