"""Tests del contrato de datos: esquema, presupuesto y proveniencia.

Estos tests corren sobre ``data/dist/`` completo, no solo sobre lo que el
generador acaba de escribir. La razon es que ``data/dist/`` es exactamente lo
que se despliega: un artefacto invalido ahi es un fallo en produccion, y da
igual quien lo escribio.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from alphagenome_platform import contract

DIST = contract.DIST


def _dist_files(kind: str) -> list[pathlib.Path]:
    return [path for k, path in contract.iter_dist() if k == kind]


def test_dist_no_esta_vacio() -> None:
    """Si esto falla, el resto de los tests pasarian por vacuidad."""
    assert list(contract.iter_dist()), "data/dist/ esta vacio"
    assert (DIST / "index.json").exists()


@pytest.mark.parametrize(
    "kind", ["index", "locus", "card", "tracks", "study", "annotations"]
)
def test_todo_artefacto_json_valida_su_esquema(kind: str) -> None:
    """Validador real de JSON Schema, no confianza."""
    paths = _dist_files(kind)
    assert paths, f"no hay ningun artefacto de tipo {kind}"
    for path in paths:
        document = json.loads(path.read_text(encoding="utf-8"))
        contract.validate(kind, document, label=str(path.relative_to(DIST)))


def test_todo_artefacto_cabe_en_su_presupuesto() -> None:
    """Un visor que tarda en cargar no es un visor: el tope rompe el build."""
    for kind, path in contract.iter_dist():
        contract.check_budget(
            kind, path.read_bytes(), label=str(path.relative_to(DIST))
        )


def test_el_presupuesto_realmente_falla_cuando_se_pasa() -> None:
    """Un test de presupuesto que no puede fallar no prueba nada."""
    gordo = b"x" * (contract.BUDGETS["card"].max_bytes + 1)
    with pytest.raises(contract.BudgetExceeded):
        contract.check_budget("card", gordo, label="sintetico")


def test_el_validador_realmente_rechaza_un_documento_malo() -> None:
    """Idem: hay que ver al validador decir que no."""
    with pytest.raises(contract.ContractViolation):
        contract.validate("card", {"schemaVersion": "1.0.0"}, label="incompleto")


def _splice_doc(**overrides) -> dict:
    """Documento minimo valido de splice.json (V4), para probar el esquema
    sin depender de que data/dist/ tenga ya un locus con sashimi congelado."""
    from alphagenome_platform import SCHEMA_VERSION

    doc = {
        "schemaVersion": SCHEMA_VERSION,
        "variant": {
            "id": "chr9-128226027-G-A",
            "chromosome": "chr9",
            "position": 128226027,
            "ref": "G",
            "alt": "A",
        },
        "provenance": {
            "source": "model-api",
            "clientVersion": "0.9.0",
            "queriedAt": "2026-09-13T00:00:00Z",
            "configHash": "0123456789abcdef",
            "calibrationEpoch": "quantiles>=2026-06-18,indels>=2026-07-14",
        },
        "biosample": {"name": "glutamatergic neuron", "ontologyCurie": "CL:0000679"},
        "interval": {"chromosome": "chr9", "start": 128221931, "end": 128230123},
        "status": "ok",
        "minValueShown": 0.01,
        "totalJunctionsInWindow": 21,
        "junctions": [
            {"start": 128222860, "end": 128226028, "strand": "+", "ref": 0.032, "alt": 1.5985},
        ],
    }
    doc.update(overrides)
    return doc


def test_splice_json_valido_pasa_el_esquema() -> None:
    contract.validate("splice", _splice_doc())


def test_splice_no_data_no_exige_uniones() -> None:
    """El estado 'modalidad silenciosa' es junctions=[] con status explicito,
    no un documento distinto ni un campo que falte."""
    contract.validate(
        "splice",
        _splice_doc(status="no_data", totalJunctionsInWindow=0, junctions=[]),
    )


def test_splice_rechaza_un_status_inventado() -> None:
    with pytest.raises(contract.ContractViolation):
        contract.validate("splice", _splice_doc(status="empty"))


def test_splice_rechaza_hebra_no_estandar() -> None:
    """Una union de splicing SIEMPRE esta orientada; sin hebra no es una union."""
    doc = _splice_doc()
    doc["junctions"][0]["strand"] = "."
    with pytest.raises(contract.ContractViolation):
        contract.validate("splice", doc)


def test_toda_proveniencia_declara_epoca_de_calibracion() -> None:
    """Sin esto, comparar cosechas distintas del AVI seria indetectable."""
    for kind, path in contract.iter_dist():
        if path.suffix != ".json":
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        prov = document.get("provenance")
        if prov is None:
            continue
        assert prov["calibrationEpoch"], f"{path} sin epoca de calibracion"
        assert prov["configHash"], f"{path} sin hash de configuracion"
        assert prov["source"] in {"atlas-api", "model-api", "synthetic"}


def test_lo_sintetico_se_declara_sintetico() -> None:
    """Una figura hecha con datos inventados no puede pasar por prediccion.

    Ya no se exige que TODO sea sintetico: con la llave presente, `data/dist/`
    lleva artefactos reales del Atlas. Lo que se exige es que cada uno diga la
    verdad sobre su origen, y que lo sintetico lo grite.
    """
    vistos = set()
    for kind, path in contract.iter_dist():
        if path.suffix != ".json":
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        prov = document.get("provenance")
        if prov is None:
            continue
        vistos.add(prov["source"])
        if prov["source"] == "synthetic":
            assert "NO son predicciones" in (prov.get("notes") or ""), path
    assert vistos, "ningun artefacto declara origen"


# --------------------------------------------------------------------------
# Compuerta de proveniencia
# --------------------------------------------------------------------------
#
# El test anterior solo exige que un artefacto sintetico lo confiese. Eso no
# basta: el fallo de la sesion 2 fue un artefacto que decia la verdad en su JSON
# y aun asi se dibujaba como si fuera real, porque nadie leia el JSON. Lo que
# sigue prohibe que llegue al despliegue.


def _escribir_dist(tmp: pathlib.Path, source: str) -> pathlib.Path:
    """Copia data/dist a un temporal y le cambia el origen a una ficha."""
    import shutil

    destino = tmp / "dist"
    shutil.copytree(DIST, destino)
    ficha = next(destino.glob("loci/*/variants/*/card.json"))
    document = json.loads(ficha.read_text(encoding="utf-8"))
    document["provenance"]["source"] = source
    ficha.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    return destino


def test_dist_actual_pasa_la_compuerta_de_proveniencia() -> None:
    """Lo que hoy se despliega viene de la API. Si no, no se despliega."""
    exenciones = contract.assert_production_provenance()
    # La unica exencion permitida hoy es la ficha del estudio planificado.
    assert len(exenciones) <= 1, exenciones
    for linea in exenciones:
        assert "manifest.json" in linea, linea


def test_una_ficha_sintetica_rompe_el_build(tmp_path: pathlib.Path) -> None:
    """La compuerta tiene que poder fallar, o no prueba nada.

    Es el analogo de `test_el_presupuesto_realmente_falla_cuando_se_pasa`: una
    compuerta que nunca se ha visto decir no es fe, no una compuerta.
    """
    destino = _escribir_dist(tmp_path, "synthetic")
    with pytest.raises(contract.SyntheticInProduction) as capturado:
        contract.assert_production_provenance(destino)
    mensaje = str(capturado.value)
    assert "card.json" in mensaje, mensaje
    assert "synthetic" in mensaje


def test_la_compuerta_no_acepta_un_origen_inventado(tmp_path: pathlib.Path) -> None:
    """`API_SOURCES` es un conjunto, no una prueba de subcadena.

    Si la comprobacion fuera `"api" in source`, bastaria llamar al origen
    "fake-api" para colarse. Este test es el que fija esa decision.
    """
    destino = _escribir_dist(tmp_path, "fake-api")
    with pytest.raises(contract.SyntheticInProduction) as capturado:
        contract.assert_production_provenance(destino)
    assert "fake-api" in str(capturado.value)


def test_un_artefacto_sin_sello_rompe_el_build(tmp_path: pathlib.Path) -> None:
    """Sin sello no hay forma de saber de donde salieron los numeros."""
    import shutil

    destino = tmp_path / "dist"
    shutil.copytree(DIST, destino)
    ficha = next(destino.glob("loci/*/variants/*/card.json"))
    document = json.loads(ficha.read_text(encoding="utf-8"))
    del document["provenance"]
    ficha.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(contract.SyntheticInProduction) as capturado:
        contract.assert_production_provenance(destino)
    assert "sin sello" in str(capturado.value)


def test_la_exencion_del_estudio_planificado_es_estrecha(tmp_path: pathlib.Path) -> None:
    """El plan de un estudio puede no venir de la API. Un RESULTADO, no.

    La exencion se concede por propiedades del documento, no por su ruta: en
    cuanto el estudio deja de ser un plan sin numeros, deja de estar exento.
    """
    import shutil

    destino = tmp_path / "dist"
    shutil.copytree(DIST, destino)
    manifiesto = next(destino.glob("studies/*/manifest.json"))
    document = json.loads(manifiesto.read_text(encoding="utf-8"))
    assert document["provenance"]["source"] == "synthetic"
    assert document["status"] == "planned"

    # Tal cual, exento.
    assert contract.assert_production_provenance(destino)

    # Declararse concluyente lo saca de la exencion de inmediato.
    document["status"] = "null"
    manifiesto.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(contract.SyntheticInProduction) as capturado:
        contract.assert_production_provenance(destino)
    assert "manifest.json" in str(capturado.value)

    # Y un panel con datos tambien, aunque siga diciendose planificado.
    document["status"] = "planned"
    document["panels"] = [
        {"id": "x", "type": "bar", "title": "t", "data": {"values": [1, 2, 3]}}
    ]
    manifiesto.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(contract.SyntheticInProduction):
        contract.assert_production_provenance(destino)


def test_los_18_features_del_avi_estan_completos() -> None:
    """V1 depende de que las cuatro familias sumen 18: 10 + 4 + 2 + 2."""
    for path in _dist_files("card"):
        card = json.loads(path.read_text(encoding="utf-8"))
        assert len(card["features"]) == 18, path
        por_familia: dict[str, int] = {}
        for feature in card["features"]:
            por_familia[feature["family"]] = por_familia.get(feature["family"], 0) + 1
        assert por_familia == {
            "regulatory": 10,
            "protein": 4,
            "conservation": 2,
            "indel": 2,
        }, path


def test_la_cascada_shap_suma_al_score_crudo() -> None:
    """Si la cascada no cierra, la vista V1 estaria mintiendo sobre el total.

    Cierra contra el score CRUDO, no contra el PHRED. Son cosas distintas: el
    crudo es la salida con signo del scorer y el PHRED se deriva del cuantil.
    La version anterior de este test los confundia porque las fixtures
    sinteticas los habian hecho coincidir por construccion; con datos reales el
    crudo de esta variante es negativo y el PHRED no puede serlo.
    """
    comprobados = 0
    for path in _dist_files("card"):
        card = json.loads(path.read_text(encoding="utf-8"))
        raw = card["avi"].get("rawScore")
        if raw is None:
            continue
        total = card["avi"]["baseValue"] + sum(
            f["contribution"] for f in card["features"]
        )
        assert abs(total - raw) < 1e-3, f"{path}: {total} != {raw}"
        comprobados += 1
    assert comprobados, "ninguna ficha trae rawScore"


def test_phred_y_cuantil_son_consistentes() -> None:
    """PHRED = -10*log10(1-cuantil). Un eje mal escalado es un grafico falso."""
    for path in _dist_files("card"):
        card = json.loads(path.read_text(encoding="utf-8"))
        phred, quantile = card["avi"]["phred"], card["avi"]["quantile"]
        if quantile is None:
            continue
        assert abs((1.0 - 10.0 ** (-phred / 10.0)) - quantile) < 1e-4, path


def test_los_indices_dispersos_del_heatmap_apuntan_a_algo() -> None:
    """Un indice fuera de rango dejaria celdas huerfanas en la vista V2."""
    for path in _dist_files("tracks"):
        doc = json.loads(path.read_text(encoding="utf-8"))
        n_bio, n_mod = len(doc["biosamples"]), len(doc["modalities"])
        sistemas = {s["id"] for s in doc["organSystems"]}
        for bi, mi, *_ in doc["cells"]:
            assert 0 <= bi < n_bio, path
            assert 0 <= mi < n_mod, path
        for biosample in doc["biosamples"]:
            assert biosample["organSystem"] in sistemas, path


def test_las_rutas_del_indice_existen_en_disco() -> None:
    """Un puntero roto en el indice es un 404 en la cara del visitante."""
    index = json.loads((DIST / "index.json").read_text(encoding="utf-8"))
    for locus in index["loci"]:
        locus_path = DIST / locus["path"]
        assert locus_path.exists(), locus["path"]
        doc = json.loads(locus_path.read_text(encoding="utf-8"))
        base = locus_path.parent
        for entrada in doc["variants"]:
            for nombre, rel in entrada["artifacts"].items():
                if rel:
                    assert (base / rel).exists(), f"{locus['id']}/{nombre}: {rel}"
        for nivel in doc.get("signals", {}).values():
            for modality, ref in nivel["modalities"].items():
                blob = base / ref["path"]
                assert blob.exists(), ref["path"]
                assert blob.stat().st_size == ref["bytes"], modality
    for study in index["studies"]:
        assert (DIST / study["path"]).exists(), study["path"]


def test_la_portada_apunta_a_artefactos_que_existen() -> None:
    """La variante de portada se carga sola; si no esta, el 404 es lo primero.

    El puntero lo deriva `contract.featured_pointer` de los propios locus.json,
    asi que en teoria no puede desfasarse. Este test no confia en la teoria:
    resuelve las rutas contra el disco, y ademas recalcula la derivacion para
    cazar un `index.json` escrito por una version anterior del criterio.
    """
    index = json.loads((DIST / "index.json").read_text(encoding="utf-8"))
    featured = index.get("featured")
    assert featured == contract.featured_pointer(DIST), (
        "index.featured no coincide con lo que la derivacion da hoy; "
        "corre `python -m alphagenome_platform.cli reindex`"
    )
    if featured is None:
        return
    ids = {locus["id"] for locus in index["loci"]}
    assert featured["locus"] in ids, featured["locus"]
    base = DIST / "loci" / featured["locus"] / "variants" / featured["variant"]
    assert (base / "card.json").exists(), f"{base}/card.json"
    if featured.get("saturation"):
        assert (base / "saturation.json").exists(), f"{base}/saturation.json"


def _locus_doc(
    variant_id: str,
    *,
    source: str = "atlas-api",
    avi_phred: float = 20.0,
    rsid: str | None = None,
    saturation: bool = True,
    card: bool = True,
) -> dict:
    """Documento minimo de locus.json, solo con lo que lee featured_pointer."""
    return {
        "id": f"locus-de-{variant_id}",
        "provenance": {"source": source},
        "variants": [
            {
                "variant": {"id": variant_id, "rsid": rsid},
                "aviPhred": avi_phred,
                "artifacts": {
                    "saturation": "x/saturation.json" if saturation else None,
                    "card": "x/card.json" if card else None,
                },
            }
        ],
    }


def _escribir_locus(tmp: pathlib.Path, name: str, doc: dict) -> None:
    carpeta = tmp / "dist" / "loci" / name
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "locus.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def test_el_heroe_no_exige_rsid_pero_si_un_piso_de_score(tmp_path: pathlib.Path) -> None:
    """rsid es de presentacion, no de seleccion; el piso de score si excluye.

    Antes la regla exigia rsid y perdia con eso justo las variantes sin
    catalogar que el Atlas puede puntuar y dbSNP no conoce. Con la regla nueva
    gana la de mejor score aunque no tenga rsid, y una con rsid pero por debajo
    del piso (percentil 90, PHRED >= 10) queda fuera igual.
    """
    _escribir_locus(
        tmp_path, "sin-rsid",
        _locus_doc("sin-rsid-v1", avi_phred=25.96, rsid=None),
    )
    _escribir_locus(
        tmp_path, "con-rsid-bajo",
        _locus_doc("con-rsid-v1", avi_phred=5.0, rsid="rs123"),
    )
    resultado = contract.featured_pointer(tmp_path / "dist")
    assert resultado == {
        "locus": "locus-de-sin-rsid-v1",
        "variant": "sin-rsid-v1",
        "saturation": True,
    }


def test_el_heroe_no_featurea_nada_por_debajo_del_piso(tmp_path: pathlib.Path) -> None:
    """Sin candidatos sobre el piso, la portada cae a su version sin heroe.

    Es preferible a lo que hacia la regla vieja con un solo candidato: elegir
    "el mas alto disponible" aunque el medidor lo rotule por debajo de la
    mediana del genoma.
    """
    _escribir_locus(
        tmp_path, "mediocre",
        _locus_doc("mediocre-v1", avi_phred=0.25, rsid="rs884510"),
    )
    assert contract.featured_pointer(tmp_path / "dist") is None


def test_el_heroe_ignora_loci_sinteticos(tmp_path: pathlib.Path) -> None:
    """Un locus que no viene de la API no entra al sorteo, sin importar su score."""
    _escribir_locus(
        tmp_path, "sintetico",
        _locus_doc("sintetico-v1", source="synthetic", avi_phred=99.0),
    )
    assert contract.featured_pointer(tmp_path / "dist") is None


def test_el_estudio_declara_su_honestidad() -> None:
    """Tamano de muestra, limitaciones y signo del resultado, o no se publica."""
    for path in _dist_files("study"):
        study = json.loads(path.read_text(encoding="utf-8"))
        honesty = study["honesty"]
        assert honesty["sampleSize"], path
        assert len(honesty["limitations"]) >= 3, path
        assert study["status"] in {
            "planned",
            "running",
            "positive",
            "null",
            "inconclusive",
            "underpowered",
        }
        # Un estudio que se declara concluyente sin poder medido seria la
        # trampa que este proyecto dice no querer cometer.
        if study["status"] in {"positive", "null"}:
            assert honesty["power"] is not None, path
            assert honesty["power"].get("achieved") is not None, path


def test_ningun_artefacto_contiene_nan_ni_infinity() -> None:
    """NaN e Infinity no son JSON valido, aunque Python los lea de vuelta.

    Este test existe por un fallo real: el Atlas devuelve NaN en el feature
    ALPHAMISSENSE cuando la variante no es missense, y `json.dumps` lo escribio
    sin comillas. Python releia el archivo sin quejarse, pero `JSON.parse` del
    navegador lo rechazaba y la vista moria con "no es JSON valido" sin decir
    cual. Se comprueba sobre el TEXTO, no sobre el objeto, porque el objeto ya
    perdio la evidencia.
    """
    import re

    for kind, path in contract.iter_dist():
        if path.suffix != ".json":
            continue
        text = path.read_text(encoding="utf-8")
        offenders = re.findall(r"(?<![\"\w])(?:-?Infinity|NaN)(?![\"\w])", text)
        assert not offenders, (
            f"{path.relative_to(DIST)} contiene {set(offenders)}, que no es JSON "
            f"valido. Un valor que no aplica se escribe null."
        )


def test_write_json_rechaza_nan() -> None:
    """El propio escritor tiene que negarse, no solo los constructores."""
    import math
    import tempfile

    document = {
        "schemaVersion": "1.1.0",
        "locus": "x",
        "interval": {"chromosome": "chr1", "start": 0, "end": 10},
        "provenance": {
            "source": "synthetic",
            "clientVersion": "0",
            "queriedAt": "2026-01-01T00:00:00Z",
            "configHash": "0123456789abcdef",
            "calibrationEpoch": "x",
        },
        "genes": [
            {"name": "G", "strand": "+", "start": 0, "end": math.nan},
        ],
    }
    with tempfile.TemporaryDirectory() as tmp:
        target = pathlib.Path(tmp) / "annotations.json"
        with pytest.raises((contract.ContractViolation, Exception)):
            contract.write_json(target, "annotations", document, label="prueba")


def test_no_hay_bloques_de_senal_huerfanos() -> None:
    """Ningun .bin en data/dist puede quedar sin que un locus lo referencie.

    Este test existe por un fallo real y caro. Las rutas de los bloques por
    variante se escribian relativas al directorio de la VARIANTE, pero el
    contrato dice que las rutas de `locus.json` son relativas a ese archivo. El
    visor resolvia hacia el directorio del locus, donde seguian los bloques
    SINTETICOS de una corrida anterior, y los dibujaba tan tranquilo con el
    sello de proveniencia del Atlas encima. No hubo ningun 404 ni ningun error
    de consola: un artefacto viejo en el sitio equivocado se ve exactamente
    igual que uno correcto.
    """
    referenced: set[pathlib.Path] = set()
    for locus_path in DIST.glob("loci/*/locus.json"):
        doc = json.loads(locus_path.read_text(encoding="utf-8"))
        base = locus_path.parent
        levels = list((doc.get("signals") or {}).values())
        for entry in doc["variants"]:
            levels.extend((entry.get("signals") or {}).values())
        for level in levels:
            for ref in level["modalities"].values():
                target = (base / ref["path"]).resolve()
                assert target.exists(), (
                    f"{locus_path.name} apunta a {ref['path']}, que no existe"
                )
                assert target.stat().st_size == ref["bytes"], ref["path"]
                referenced.add(target)

    on_disk = {p.resolve() for p in DIST.rglob("*.bin")}
    orphans = sorted(p.relative_to(DIST.resolve()) for p in on_disk - referenced)
    assert not orphans, (
        f"{len(orphans)} bloques de senal sin referencia en data/dist: "
        f"{orphans[:5]}. Son peso muerto en el despliegue y, peor, candidatos "
        f"a que una ruta mal resuelta los muestre como si fueran los buenos."
    )


INSPECCION = (
    pathlib.Path(__file__).resolve().parents[1]
    / "src/alphagenome_platform/contract.py"
).read_text(encoding="utf-8")
"""Fuente de `iter_dist`, leida como texto para comparar los nombres de
artefacto que conoce con los que conoce la compuerta de JS."""


def test_la_porteria_de_JS_conoce_los_mismos_artefactos_que_la_de_python() -> None:
    """Las dos compuertas de proveniencia tienen que reconocer lo mismo.

    `check-provenance.mjs` clasifica por nombre de archivo y lo que no
    reconoce lo SALTA. Un artefacto nuevo que se registre solo del lado de
    Python pasa por delante de la compuerta del build sin que nadie lo mire, y
    el build sigue diciendo "todos de la API" -solo que contando uno menos-.
    Paso exactamente eso al anadir `contacts.json` en V5.
    """
    import re

    fuente = (
        pathlib.Path(__file__).resolve().parents[2] / "web/scripts/check-provenance.mjs"
    ).read_text(encoding="utf-8")
    js = set(re.findall(r"case '([a-z]+\.json)':", fuente))

    py = set(re.findall(r'name == "([a-z]+\.json)"', INSPECCION))
    py |= set(re.findall(r'name == "(index\.json)"', INSPECCION))

    assert py, "no se pudo leer los nombres de artefacto de contract.py"
    faltan = py - js
    assert not faltan, (
        f"check-provenance.mjs no conoce {sorted(faltan)}: esos artefactos se "
        f"despliegan sin pasar por la compuerta de proveniencia."
    )
