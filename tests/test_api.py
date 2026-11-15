"""Pruebas del backend sin red: parcelas, datos locales, importación CSV y evaluación F1/F2."""

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

POLIGONO = {"type": "Polygon", "coordinates": [[[-80.3412, -5.0928], [-80.3392, -5.0928],
                                                [-80.3392, -5.0946], [-80.3412, -5.0946],
                                                [-80.3412, -5.0928]]]}


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setenv("NORTEX_API_DATA", str(tmp_path))
    monkeypatch.setenv("NORTEX_CACHE", "0")
    from nortex_api import servicio
    from nortex_api.main import app

    servicio._contextos.clear()
    with TestClient(app) as c:
        yield c


def _clima_power(aoi_id):
    """Serie sintética 2001–2020 en el formato largo de nortex_data (ids del repo del equipo)."""
    idx = pd.date_range("2001-01-01", "2020-12-31")
    est = np.sin(2 * np.pi * (idx.day_of_year - 30) / 365.25)
    ancho = pd.DataFrame({"tmax": 32 + 2 * est, "tmin": 20 + 2 * est, "et0": 4.5 + est,
                          "rain_power": 0.0}, index=idx)
    largo = ancho.reset_index(names="date").melt(id_vars="date", var_name="variable")
    return largo.assign(aoi_id=aoi_id, lat=-5.09, lon=-80.34, source="power", product="POWER",
                        unit="", qc_flag="ok")


def test_salud_y_modelos(cliente):
    assert cliente.get("/salud").json()["estado"] == "ok"
    modelos = {m["modelo"] for m in cliente.get("/modelos").json()}
    assert {"reservorio", "pcr", "turnos", "estacion_senamhi", "suelo_laboratorio"} <= modelos
    cultivos = cliente.get("/catalogo/cultivos").json()
    assert {c["id"] for c in cultivos} == {"arroz", "caupi", "maiz", "mango", "limon_sutil"}


def test_parcela_valida_e_invalida(cliente):
    r = cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "Chacra 1", "geometria": POLIGONO})
    assert r.status_code == 201
    assert r.json()["area_ha"] == pytest.approx(4.4, rel=0.05)
    moño = {"type": "Polygon", "coordinates": [[[-80.34, -5.09], [-80.33, -5.08], [-80.34, -5.08],
                                                 [-80.33, -5.09], [-80.34, -5.09]]]}
    r = cliente.post("/parcelas", json={"aoi_id": "mala", "nombre": "x", "geometria": moño})
    assert r.status_code == 422
    assert len(cliente.get("/parcelas").json()) == 1


def test_datos_validacion_y_borrado(cliente):
    ok = cliente.post("/datos/pcr", json={"fecha_inicio": "2026-12-01", "campania": "2026-2027",
                                          "comision": "C1", "cultivo": "caupi", "dotacion_m3_ha": 4000,
                                          "fuente": "Junta"})
    assert ok.status_code == 201
    malo = cliente.post("/datos/pcr", json={"fecha_inicio": "2026-12-01", "campania": "x", "comision": "C1",
                                            "cultivo": "papa", "dotacion_m3_ha": 99_999, "fuente": "x"})
    assert malo.status_code == 422
    filas = cliente.get("/datos/pcr").json()
    assert len(filas) == 1 and filas[0]["dotacion_m3_ha"] == 4000
    assert cliente.delete(f"/datos/pcr/{filas[0]['id']}").status_code == 200
    assert cliente.get("/datos/pcr").json() == []


def test_importar_csv_todo_o_nada(cliente):
    csv_ok = ("fecha,volumen_hm3,fuente\n2026-11-01,120.5,ANA\n2026-11-02,121,ANA\n"
              "2026-11-01,180,EJEMPLO\n")
    r = cliente.post("/importar/reservorio", files={"archivo": ("r.csv", csv_ok, "text/csv")})
    assert r.json()["filas_guardadas"] == 2  # la fila EJEMPLO se ignora
    csv_malo = "fecha,volumen_hm3,fuente\n2026-11-03,999,ANA\n"
    r = cliente.post("/importar/reservorio", files={"archivo": ("r.csv", csv_malo, "text/csv")})
    assert r.status_code == 422 and len(cliente.get("/datos/reservorio").json()) == 2


def test_evaluar_sin_fuentes_pide_actualizar(cliente):
    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "C", "geometria": POLIGONO})
    r = cliente.post("/evaluar/f1", json={"aoi_id": "chacra_1", "cultivo": "caupi",
                                          "desde": "2021-05-01", "hasta": "2021-06-01"})
    assert r.status_code == 409


def test_evaluar_f1_y_f2_con_datos_locales(cliente):
    from nortex_api import almacen

    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "C", "geometria": POLIGONO})
    _clima_power("chacra_1").to_parquet(almacen.ruta_serie("chacra_1", "power"), index=False)
    for modelo, fila in [
        ("pcr", {"fecha_inicio": "2020-12-01", "campania": "2020-2021", "comision": "C1", "cultivo": "caupi",
                 "dotacion_m3_ha": 4000, "fuente": "Junta"}),
        ("turnos", {"fecha_inicio": "2020-12-01", "comision": "C1", "intervalo_dias": 10, "fuente": "Junta"}),
        ("suelo_laboratorio", {"fecha_muestreo": "2020-10-01", "aoi_id": "chacra_1", "theta_fc": 0.26,
                               "theta_wp": 0.12, "fuente": "INIA"}),
    ]:
        assert cliente.post(f"/datos/{modelo}", json=fila).status_code == 201

    f1 = cliente.post("/evaluar/f1", json={"aoi_id": "chacra_1", "cultivo": "caupi",
                                           "desde": "2021-05-01", "hasta": "2021-07-01", "paso_dias": 30})
    assert f1.status_code == 200, f1.text
    cuerpo = f1.json()
    assert len(cuerpo["tabla"]) == 3 and cuerpo["funcion"] == "F1"
    d = cuerpo["decisiones"][0]
    assert d["fundamentacion"]["insumos"]["suelo"] == "buena"
    assert "PCR declarado" in d["procedencia"]["dotacion"]
    assert d["procedencia"]["turnos"].startswith("turnos declarados")

    f2 = cliente.post("/evaluar/f2", json={"aoi_id": "chacra_1", "cultivos": ["caupi", "maiz"],
                                           "inicio": "2021-06-01", "historial": ["arroz"],
                                           "dotacion_m3_ha": 6000})
    assert f2.status_code == 200, f2.text
    tabla = {f["cultivo"]: f for f in f2.json()["tabla"]}
    assert tabla["caupi"]["transicion"] == "cambio"
    assert cliente.post("/evaluar/f2", json={"aoi_id": "chacra_1", "cultivos": ["papa"],
                                             "inicio": "2021-06-01"}).status_code == 422


def test_estacion_senamhi_reemplaza_a_noaa(cliente):
    from nortex_api import almacen, servicio

    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "C", "geometria": POLIGONO})
    _clima_power("chacra_1").to_parquet(almacen.ruta_serie("chacra_1", "power"), index=False)
    dias = pd.date_range("2018-01-01", "2019-12-31")
    filas = "\n".join(f"Chulucanas,{d.date()},30.5,19.0,0,SENAMHI" for d in dias)
    csv = "estacion,fecha,tmax,tmin,precip,fuente\n" + filas + "\n"
    r = cliente.post("/importar/estacion_senamhi", files={"archivo": ("s.csv", csv, "text/csv")})
    assert r.json()["filas_guardadas"] == len(dias)
    ctx = servicio.contexto("chacra_1")
    assert ctx.validacion is not None and ctx.validacion["estacion"] == "SENAMHI Chulucanas"


def test_fuente_caida_no_bloquea_las_demas(cliente, monkeypatch):
    import time as _time

    import nortex_data

    from nortex_api import servicio

    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "C", "geometria": POLIGONO})

    def falso(fuente, aoi_id, *a, **k):
        if fuente == "soilgrids":
            _time.sleep(5)  # servicio colgado
        if fuente == "enso":
            raise RuntimeError("HTTP 503")
        return pd.DataFrame({"date": [pd.Timestamp("2024-01-01")], "aoi_id": [aoi_id], "lat": [0.0],
                             "lon": [0.0], "source": [fuente], "product": ["p"],
                             "variable": ["elevation" if fuente == "srtm" else "x"], "value": [196.0],
                             "unit": ["m"], "qc_flag": ["ok"]})

    monkeypatch.setattr(nortex_data, "get_dataset", falso)
    monkeypatch.setitem(servicio.LIMITE_SEGUNDOS, "soilgrids", 0.5)
    t0 = _time.time()
    r = cliente.post("/parcelas/chacra_1/actualizar").json()["fuentes"]
    estados = {f["fuente"]: f["estado"] for f in r}
    assert estados["soilgrids"] == "tiempo agotado"
    assert estados["enso"] == "error"
    assert estados["power"] == "ok" and estados["srtm"] == "ok"
    assert _time.time() - t0 < 4  # no espera al servicio colgado
    assert cliente.get("/parcelas").json()[0]["elevation_m"] == 196.0
