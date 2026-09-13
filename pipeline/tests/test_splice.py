"""Tests de `build_splice` (V4, sashimi): ventana, piso de magnitud, y el
estado explicito de "modalidad silenciosa". Con dobles de prueba, no con la
API real: lo que se prueba es la logica de reconciliacion y filtrado, no que
el Atlas responda algo en particular.
"""

from __future__ import annotations

import dataclasses

import numpy as np
import pytest

from alphagenome_platform.freeze import build_locus as bl
from alphagenome_platform.loci import VariantSpec


@dataclasses.dataclass
class _FakeJunction:
    start: int
    end: int
    strand: str = "+"


class _FakeJunctionData:
    def __init__(self, junctions: list[_FakeJunction], values: list[float]):
        self.junctions = junctions
        self.values = np.array(values, dtype=np.float64).reshape(-1, 1)

    def __len__(self) -> int:
        return len(self.junctions)


class _FakeSide:
    def __init__(self, splice_junctions):
        self.splice_junctions = splice_junctions


class _FakeOutput:
    def __init__(self, ref_jd, alt_jd):
        self.reference = _FakeSide(ref_jd)
        self.alternate = _FakeSide(alt_jd)


class _FakeModel:
    """Devuelve una respuesta fija sin importar el interval/variant pedidos."""

    def __init__(self, output: _FakeOutput):
        self._output = output
        self.calls: list[dict] = []

    def predict_variant(self, **kwargs):
        self.calls.append(kwargs)
        return self._output


SPEC = VariantSpec(128226027, "G", "A", None, sashimi_ontology="CL:0000679")
PROV = {"source": "model-api", "clientVersion": "0.9.0", "queriedAt": "x",
        "configHash": "0" * 16, "calibrationEpoch": "e"}


def test_reconcilia_por_coordenada_no_por_indice() -> None:
    """REF y ALT no tienen por que traer las uniones en el mismo orden."""
    ref_jd = _FakeJunctionData(
        [_FakeJunction(128222860, 128226028), _FakeJunction(128224389, 128226034)],
        [0.03, 1.43],
    )
    # Orden invertido a proposito.
    alt_jd = _FakeJunctionData(
        [_FakeJunction(128224389, 128226034), _FakeJunction(128222860, 128226028)],
        [0.006, 1.6],
    )
    model = _FakeModel(_FakeOutput(ref_jd, alt_jd))

    doc = bl.build_splice(
        "chr9", SPEC, model, interval=None, prov=PROV,
        ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
    )

    assert doc["status"] == "ok"
    by_key = {(j["start"], j["end"]): j for j in doc["junctions"]}
    assert by_key[(128222860, 128226028)]["ref"] == pytest.approx(0.03)
    assert by_key[(128222860, 128226028)]["alt"] == pytest.approx(1.6)
    assert by_key[(128224389, 128226034)]["ref"] == pytest.approx(1.43)
    assert by_key[(128224389, 128226034)]["alt"] == pytest.approx(0.006)


def test_el_piso_de_magnitud_deja_fuera_el_ruido() -> None:
    ref_jd = _FakeJunctionData(
        [_FakeJunction(128222860, 128226028), _FakeJunction(128223000, 128223500)],
        [1.5, 0.0001],
    )
    alt_jd = _FakeJunctionData(
        [_FakeJunction(128222860, 128226028), _FakeJunction(128223000, 128223500)],
        [1.5, 0.0002],
    )
    model = _FakeModel(_FakeOutput(ref_jd, alt_jd))

    doc = bl.build_splice(
        "chr9", SPEC, model, interval=None, prov=PROV,
        ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
        min_value=0.01,
    )

    assert doc["totalJunctionsInWindow"] == 2
    assert len(doc["junctions"]) == 1
    assert doc["junctions"][0]["start"] == 128222860


def test_una_union_fuera_de_la_ventana_no_cuenta() -> None:
    lejos = SPEC.position + bl.SASHIMI_HALF_WIDTH + 10_000
    ref_jd = _FakeJunctionData([_FakeJunction(lejos, lejos + 200)], [5.0])
    alt_jd = _FakeJunctionData([_FakeJunction(lejos, lejos + 200)], [5.0])
    model = _FakeModel(_FakeOutput(ref_jd, alt_jd))

    doc = bl.build_splice(
        "chr9", SPEC, model, interval=None, prov=PROV,
        ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
    )

    assert doc["totalJunctionsInWindow"] == 0
    assert doc["junctions"] == []
    assert doc["status"] == "ok"  # hubo datos; solo no en esta ventana


def test_n_obs_cero_es_no_data_no_una_ventana_vacia() -> None:
    """El caso real: APOA1 con POLYADENYLATION/SPLICE_JUNCTIONS/SPLICE_SITE_USAGE
    devolvio n_obs=0 para TODO el locus. Eso es 'no_data', no 'junctions: []'
    silencioso -son estados distintos y el artefacto lo dice."""
    ref_jd = _FakeJunctionData([], [])
    alt_jd = _FakeJunctionData([], [])
    model = _FakeModel(_FakeOutput(ref_jd, alt_jd))

    doc = bl.build_splice(
        "chr9", SPEC, model, interval=None, prov=PROV,
        ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
    )

    assert doc["status"] == "no_data"
    assert doc["junctions"] == []
    assert doc["biosample"] == {"name": "glutamatergic neuron", "ontologyCurie": "CL:0000679"}


def test_pide_solo_el_biosample_declarado_no_la_lista_por_defecto() -> None:
    """Pedir SPLICE_JUNCTIONS con ONTOLOGY_TERMS (sangre/pulmon/higado) es
    exactamente el bug que esta vista existe para evitar."""
    ref_jd = _FakeJunctionData([], [])
    alt_jd = _FakeJunctionData([], [])
    model = _FakeModel(_FakeOutput(ref_jd, alt_jd))

    bl.build_splice(
        "chr9", SPEC, model, interval=None, prov=PROV,
        ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
    )

    assert len(model.calls) == 1
    assert model.calls[0]["ontology_terms"] == ["CL:0000679"]


def test_un_curie_con_varios_tracks_se_para_en_vez_de_elegir_el_primero() -> None:
    """Un termino de ontologia no garantiza un solo track.

    Medido en los metadatos de CONTACT_MAPS: EFO:0003042 (H1-hESC) trae siete
    tracks bajo el mismo curie. `values[i, 0]` los reduciria al primero en
    silencio y el sashimi saldria de un ensayo sin decir cual. Agregar es una
    decision de modelado; se para y se nombran los tracks.
    """
    junctions = [_FakeJunction(128222860, 128226028)]
    two = _FakeJunctionData(junctions, [0.03])
    two.values = np.array([[0.03, 0.07]], dtype=np.float64)
    two.metadata = {"name": ["micro-c rep1", "micro-c rep2"]}
    model = _FakeModel(_FakeOutput(two, two))

    with pytest.raises(ValueError, match="2 tracks"):
        bl.build_splice(
            "chr9", SPEC, model, interval=None, prov=PROV,
            ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
        )


def test_el_hallazgo_redactado_viaja_al_artefacto_y_solo_si_existe() -> None:
    """`finding` es opcional: la mayoria de variantes no tiene nada que contar."""
    ref_jd = _FakeJunctionData([_FakeJunction(128222860, 128226028)], [0.03])
    alt_jd = _FakeJunctionData([_FakeJunction(128222860, 128226028)], [1.6])
    model = _FakeModel(_FakeOutput(ref_jd, alt_jd))
    kwargs = dict(
        chromosome="chr9", spec=SPEC, model=model, interval=None, prov=PROV,
        ontology_term="CL:0000679", biosample_name="glutamatergic neuron",
    )

    assert "finding" not in bl.build_splice(**kwargs)
    assert bl.build_splice(**kwargs, finding="algo medido")["finding"] == "algo medido"
