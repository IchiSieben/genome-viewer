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

from alphagenome_platform import contract, fixtures

DIST = contract.DIST


@pytest.fixture(scope="session", autouse=True)
def _ensure_fixtures() -> None:
    """Genera las fixtures si no existen, para que la suite corra en limpio."""
    if not (DIST / "index.json").exists():
        fixtures.generate()


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
