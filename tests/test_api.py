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
    salud = cliente.get("/salud").json()
    assert salud["estado"] == "ok", salud["dependencias"]["problemas"]
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
    d2 = f2.json()["decisiones"][0]
    escenarios = [c["escenario"] for c in d2["clima_escenarios"]]
    assert escenarios == ["deficit_bajo", "deficit_medio", "deficit_alto"]
    assert any(r["factor"] == "Exceso de lluvia (potencial)" for r in d2["riesgo"])

    # La UI recibe el intervalo efectivo, no lo infiere de estrés + autonomía.
    consulta = {"aoi_id": "chacra_1", "cultivos": ["caupi"], "inicio": "2021-06-01",
                "intervalo_dias": 7, "dotacion_m3_ha": 12000, "eficiencia": 0.9}
    insumos = cliente.post("/evaluar/f2", json=consulta).json()["decisiones"][0]["insumos_efectivos"]
    assert insumos["intervalo_dias"]["valor"] == 7
    assert insumos["dotacion_m3_ha"]["valor"] == 12000
    assert insumos["eficiencia"]["valor"] == 0.9
    assert insumos["theta_fc"]["valor"] > insumos["theta_wp"]["valor"]
    assert insumos["theta_fc"]["fuente"]
    assert insumos["intervalo_dias"]["unidad"] == "días"

    # RT-01 condicionante: desde un huerto, el cambio queda «por determinar» hasta confirmar la renovación
    base = {"aoi_id": "chacra_1", "cultivos": ["caupi"], "inicio": "2021-06-01",
            "historial": ["limon_sutil"], "dotacion_m3_ha": 20000}
    sin = cliente.post("/evaluar/f2", json=base).json()["tabla"][0]
    con = cliente.post("/evaluar/f2", json=dict(base, renovacion_confirmada=True)).json()["tabla"][0]
    assert sin["viabilidad"] == "por determinar" and "RT-01 (condicionante)" in sin["reglas"]
    assert con["viabilidad"] != "por determinar"
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


def test_detecta_nortex_data_antiguo(monkeypatch):
    """El paquete viejo (solo POWER, aoi_file) debe reportarse, no fallar en silencio."""
    import nortex_data

    from nortex_api import servicio

    def get_dataset_viejo(source=None, aoi_id=None, start=None, end=None, *, variables=None,
                          aoi_file=None):
        return None

    monkeypatch.setattr(nortex_data, "get_dataset", get_dataset_viejo)
    comp = servicio.compatibilidad()
    assert not comp["ok"]
    texto = " ".join(comp["problemas"])
    assert "aoi_path" in texto and "historico" in texto


def test_faltantes_plantillas_y_datos_de_ejemplo(cliente):
    from nortex_api import almacen

    cliente.post("/parcelas", json={"aoi_id": "ejemplo_sl", "nombre": "Ejemplo", "geometria": POLIGONO})
    _clima_power("ejemplo_sl").to_parquet(almacen.ruta_serie("ejemplo_sl", "power"), index=False)
    plantilla = cliente.get("/plantillas/pcr.csv")
    assert plantilla.status_code == 200 and plantilla.text.startswith("fecha_inicio,campania")
    # La fila de la plantilla (fuente=EJEMPLO) se ignora al importar
    assert cliente.post("/importar/pcr", files={"archivo": ("p.csv", plantilla.text, "text/csv")}
                        ).json()["filas_guardadas"] == 0
    cliente.post("/datos/pcr", json={"fecha_inicio": "2020-12-01", "campania": "2020-2021",
                                     "comision": "EJEMPLO", "cultivo": "caupi", "dotacion_m3_ha": 20000,
                                     "fuente": "valor de ejemplo"})
    f = cliente.get("/parcelas/ejemplo_sl/faltantes").json()
    estado = {i["dato"]: i["estado"] for i in f["items"]}
    assert estado["coordenadas"] == "ejemplo" and estado["pcr"] == "ejemplo" and estado["turnos"] == "falta"
    assert estado["fuente srtm"] == "falta" and not f["viabilidad_definitiva_posible"]
    assert "calor_floracion_c" in f["parametros_por_validar"]["caupi"]["prioritarios"]

    d = cliente.post("/evaluar/f2", json={"aoi_id": "ejemplo_sl", "cultivos": ["caupi"],
                                          "inicio": "2021-01-15"}).json()["decisiones"][0]
    assert d["viabilidad"]["definitiva"] is False
    assert any("ejemplo" in x for x in d["viabilidad"]["pendiente"])
    assert d["fundamentacion"]["insumos"]["dotacion"] == "débil"


def test_validacion_inia_y_umbral_de_calor(cliente):
    from nortex_api import almacen

    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "C", "geometria": POLIGONO})
    _clima_power("chacra_1").to_parquet(almacen.ruta_serie("chacra_1", "power"), index=False)
    base = {"aoi_id": "chacra_1", "cultivos": ["caupi"], "inicio": "2021-01-15", "dotacion_m3_ha": 20000}
    d = cliente.post("/evaluar/f2", json=base).json()["decisiones"][0]
    assert d["extremos"]["umbral_calor_c"] == 35.0 and len(d["extremos"]["sensibilidad_calor"]) == 5
    d = cliente.post("/evaluar/f2", json=dict(base, umbral_calor_c=37)).json()["decisiones"][0]
    assert d["extremos"]["umbral_calor_c"] == 37.0

    mala = {"fecha": "2026-11-01", "cultivo": "caupi", "parametro": "no_existe", "valor": "1",
            "fuente": "INIA"}
    assert cliente.post("/datos/validacion_parametro", json=mala).status_code == 422
    lista = dict(mala, parametro="floracion_dias", valor="36")
    assert cliente.post("/datos/validacion_parametro", json=lista).status_code == 422
    fuera = dict(mala, parametro="floracion_dias", valor="[50, 500]")  # fuera del ciclo
    assert cliente.post("/datos/validacion_parametro", json=fuera).status_code == 422
    ok = dict(mala, parametro="calor_floracion_c", valor="36.5", fuente="INIA Vista Florida")
    assert cliente.post("/datos/validacion_parametro", json=ok).status_code == 201
    caupi = next(c for c in cliente.get("/catalogo/cultivos").json() if c["id"] == "caupi")
    assert caupi["parametros"]["calor_floracion_c"]["estado"] == "VALIDADO"
    assert caupi["parametros"]["calor_floracion_c"]["valor"] == 36.5
    d = cliente.post("/evaluar/f2", json=base).json()["decisiones"][0]
    assert d["extremos"]["umbral_calor_c"] == 36.5 and d["extremos"]["umbral_calor_validado"]


def test_descarga_en_segundo_plano(cliente, monkeypatch):
    import time as _time

    from nortex_api import servicio

    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "C", "geometria": POLIGONO})
    monkeypatch.setattr(servicio, "actualizar_fuentes", lambda aoi, fuentes=None: [{"fuente": "power"}])
    t = cliente.post("/parcelas/chacra_1/actualizar?segundo_plano=true").json()
    for _ in range(50):
        estado = cliente.get(f"/tareas/{t['id']}").json()
        if estado["estado"] != "en curso":
            break
        _time.sleep(0.05)
    assert estado["estado"] == "terminada" and estado["fuentes"] == [{"fuente": "power"}]
    assert cliente.get("/tareas/nada").status_code == 404


def test_serie_mensual(cliente):
    """El resumen mensual (para el visor del clima) coincide con la serie diaria."""
    from nortex_api import almacen

    cliente.post("/parcelas", json={"aoi_id": "chacra_1", "nombre": "Chacra", "geometria": POLIGONO})
    clima = _clima_power("chacra_1")
    clima.to_parquet(almacen.ruta_serie("chacra_1", "power"), index=False)
    r = cliente.get("/parcelas/chacra_1/serie/power", params={"agregado": "mensual", "variable": "tmax"})
    assert r.status_code == 200
    filas = r.json()
    assert len(filas) == 20 * 12 and set(filas[0]) == {"variable", "anio", "mes", "media", "suma",
                                                      "maximo", "dias"}
    enero = next(f for f in filas if f["anio"] == 2001 and f["mes"] == 1)
    diario = clima[(clima["variable"] == "tmax") & (clima["date"] < "2001-02-01")]["value"]
    assert enero["dias"] == 31 and enero["media"] == pytest.approx(diario.mean(), abs=1e-3)
    assert enero["maximo"] == pytest.approx(diario.max(), abs=1e-3)
    assert cliente.get("/parcelas/chacra_1/serie/power", params={"agregado": "anual"}).status_code == 422


def test_frontend_servido(cliente):
    r = cliente.get("/", follow_redirects=False)
    assert r.status_code in (302, 307)
    if r.headers["location"] == "/app/":
        assert "NORTEX" in cliente.get("/app/").text
        archivos = ("app.js", "api.js", "util.js", "demo.js", "estilos.css", "visuales/suelo.js",
                    "visuales/sol.js", "visuales/balanza.js", "escenas/portal.js", "escenas/laboratorio.js",
                    "escenas/tiempo.js", "escenas/secuencia.js", "escenas/orbita.js")
        for archivo in archivos:
            assert cliente.get(f"/app/{archivo}").status_code == 200
