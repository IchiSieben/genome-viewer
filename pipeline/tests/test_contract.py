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


def test_las_fixtures_se_declaran_sinteticas() -> None:
    """Una figura hecha con datos inventados no puede pasar por prediccion."""
    card = json.loads(
        next(iter(_dist_files("card"))).read_text(encoding="utf-8")
    )
    assert card["provenance"]["source"] == "synthetic"
    assert "NO son predicciones" in card["provenance"]["notes"]


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


def test_la_cascada_shap_suma_hasta_el_score() -> None:
    """Si la cascada no cierra, la vista V1 estaria mintiendo sobre el total."""
    for path in _dist_files("card"):
        card = json.loads(path.read_text(encoding="utf-8"))
        total = card["avi"]["baseValue"] + sum(
            f["contribution"] for f in card["features"]
        )
        # El PHRED publicado esta recortado a [0, 60]; la suma debe coincidir
        # salvo por ese recorte.
        esperado = min(max(total, 0.0), 60.0)
        assert abs(esperado - card["avi"]["phred"]) < 1e-3, path


def test_phred_y_cuantil_son_consistentes() -> None:
    """PHRED = -10*log10(1-cuantil). Un eje mal escalado es un grafico falso."""
    for path in _dist_files("card"):
        card = json.loads(path.read_text(encoding="utf-8"))
        phred, quantile = card["avi"]["phred"], card["avi"]["quantile"]
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
