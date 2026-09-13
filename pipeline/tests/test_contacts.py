"""Tests de `build_contacts` (V5, diff de mapas de contacto).

Con dobles de prueba, no con la API real. Lo que se prueba es lo que puede
salir mal sin que nadie se entere: que el dominio del color se autoescale, que
un curie con varios tracks se resuelva en silencio cogiendo el primero, que el
triangulo superior deje de ser reversible, y que el maximo se mida sobre el
recorte en vez de sobre la ventana predicha.
"""

from __future__ import annotations

import numpy as np
import pytest

from alphagenome_platform.freeze import build_locus as bl
from alphagenome_platform.loci import VariantSpec

SPEC = VariantSpec(109274968, "G", "T", "rs12740374", contacts_ontology="EFO:0001187")
PROV = {"source": "model-api", "clientVersion": "0.9.0", "queriedAt": "x",
        "configHash": "0" * 16, "calibrationEpoch": "e"}


class _FakeInterval:
    def __init__(self, chromosome: str, start: int, end: int):
        self.chromosome, self.start, self.end = chromosome, start, end


class _FakeTrackData:
    def __init__(self, matrix: np.ndarray, names: list[str]):
        # (bins, bins, tracks): el eje de tracks es el ULTIMO, no el segundo.
        self.values = np.repeat(matrix[:, :, None], len(names), axis=2)
        self.metadata = {"name": names}


class _FakeSide:
    def __init__(self, contact_maps):
        self.contact_maps = contact_maps


class _FakeOutput:
    def __init__(self, ref, alt):
        self.reference, self.alternate = _FakeSide(ref), _FakeSide(alt)


class _FakeModel:
    def __init__(self, output):
        self._output = output
        self.calls: list[dict] = []

    def predict_variant(self, **kwargs):
        self.calls.append(kwargs)
        return self._output


def _simetrica(seed: int, n: int = 512, escala: float = 1.0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    m = rng.normal(0, escala, (n, n)).astype(np.float32)
    return ((m + m.T) / 2).astype(np.float64)


def _construir(ref: np.ndarray, alt: np.ndarray, names=("t0",), **kwargs) -> dict:
    salida = _FakeOutput(
        _FakeTrackData(ref, list(names)), _FakeTrackData(alt, list(names))
    )
    return bl.build_contacts(
        "chr1", SPEC, _FakeModel(salida),
        _FakeInterval("chr1", 108750680, 109799256),
        PROV, "EFO:0001187", "HepG2", **kwargs,
    )


# --------------------------------------------------------------------------
# El guardarrail que se pidio: varios tracks bajo un curie
# --------------------------------------------------------------------------


def test_un_curie_con_varios_tracks_se_para_y_NOMBRA_los_tracks() -> None:
    """HepG2 trae un solo track, asi que en vivo esto no dispara nunca. Pero
    H1-hESC y H9 traen seis cada uno: sin este guardarrail, `[:, :, 0]`
    dibujaria un ensayo de los seis sin decir cual. El mensaje tiene que traer
    los NOMBRES, porque el arreglo es que quien eligio el curie elija track."""
    ref = _simetrica(1)
    with pytest.raises(ValueError) as error:
        _construir(ref, ref, names=("4dn:AAA", "4dn:BBB"))
    mensaje = str(error.value)
    assert "2 tracks" in mensaje
    assert "EFO:0001187" in mensaje
    assert "4dn:AAA" in mensaje and "4dn:BBB" in mensaje


def test_con_un_solo_track_no_se_para() -> None:
    doc = _construir(_simetrica(1), _simetrica(1), names=("4dn:AAA",))
    assert doc["status"] == "ok"


# --------------------------------------------------------------------------
# La trampa de esta vista: el dominio del color
# --------------------------------------------------------------------------


def test_el_dominio_es_LA_CONSTANTE_y_no_se_deriva_de_los_datos() -> None:
    """La prueba que separa un dominio fijo de un autoescalado disfrazado: si
    cambia cuando cambian los datos, es autoescalado. Aqui los datos cambian
    de escala por un factor de cien y el dominio no se mueve."""
    ref = _simetrica(1)
    flojo = _construir(ref, ref + _simetrica(2, escala=0.001))
    fuerte = _construir(ref, ref + _simetrica(2, escala=0.1))

    assert flojo["domain"] == bl.CONTACT_DOMAIN == 1.0
    assert fuerte["domain"] == bl.CONTACT_DOMAIN
    # ...y no es que los datos fueran parecidos: el maximo si cambio mucho.
    assert fuerte["maxAbsDelta"] > 20 * flojo["maxAbsDelta"]


def test_el_umbral_visible_es_fraccion_del_dominio_no_de_los_datos() -> None:
    doc = _construir(_simetrica(1), _simetrica(1) + 0.5)
    assert doc["visibleThreshold"] == pytest.approx(
        bl.CONTACT_DOMAIN * bl.CONTACT_VISIBLE_FRACTION
    )


def test_el_maximo_se_mide_sobre_la_ventana_predicha_no_sobre_el_recorte() -> None:
    """Poner el mayor cambio del locus FUERA del recorte y comprobar que aun
    asi se reporta. Si se midiera sobre lo dibujado, la vista afirmaria "el
    cambio maximo es X" sobre una muestra elegida por conveniencia."""
    ref = np.zeros((512, 512))
    alt = ref.copy()
    alt[10, 20] = alt[20, 10] = 7.5  # lejisimos del bin 255 de la variante
    doc = _construir(ref, alt)

    assert doc["maxAbsDelta"] == pytest.approx(7.5)
    assert doc["maxAbsDeltaAt"]["involvesVariantBin"] is False
    # ...y no aparece en el recorte, que sale todo a cero.
    assert max(abs(v) for v in doc["delta"]) == 0


def test_un_maximo_fuera_del_recorte_se_declara_fuera_del_recorte() -> None:
    """La bandera que impide la peor frase posible de esta vista: una
    afirmacion cierta -"el mayor cambio esta aqui"- sobre una celda que el
    lector no puede encontrar en la imagen porque no se dibuja."""
    ref = np.zeros((512, 512))

    fuera = ref.copy()
    fuera[10, 20] = fuera[20, 10] = 7.5  # el recorte es 191..319
    assert _construir(ref, fuera)["maxAbsDeltaAt"]["insideDrawnWindow"] is False

    dentro = ref.copy()
    dentro[255, 260] = dentro[260, 255] = 7.5
    assert _construir(ref, dentro)["maxAbsDeltaAt"]["insideDrawnWindow"] is True


# --------------------------------------------------------------------------
# Simetria, recorte y reversibilidad
# --------------------------------------------------------------------------


def test_un_mapa_asimetrico_se_para_en_vez_de_guardar_medio() -> None:
    ref = _simetrica(1)
    roto = ref.copy()
    roto[0, 1] += 1.0  # rompe la simetria en una sola celda
    with pytest.raises(ValueError, match="no es simetrico"):
        _construir(roto, ref)


def test_el_triangulo_superior_reconstruye_la_matriz_entera() -> None:
    """De la simetria depende guardar la mitad de los bytes. Si el orden de
    volcado no fuera reversible, la vista dibujaria una matriz transpuesta y
    nadie lo notaria: un mapa de contacto simetrico se ve igual del reves."""
    ref = _simetrica(1)
    alt = ref + _simetrica(2, escala=0.01)
    doc = _construir(ref, alt)

    n = doc["bins"]
    plano = np.array(doc["delta"], dtype=np.float64) * doc["scales"]["delta"]
    m = np.zeros((n, n))
    iu = np.triu_indices(n)
    m[iu] = plano
    m = m + m.T - np.diag(np.diag(m))

    lo = doc["interval"]["start"] - 108750680
    lo //= doc["resolution"]
    esperado = (alt - ref)[lo:lo + n, lo:lo + n]
    assert np.abs(m - esperado).max() < bl.CONTACT_DELTA_SCALE


def test_la_ventana_alcanza_el_TSS_de_SORT1() -> None:
    """La semiventana no es un redondo: es la distancia al gen diana publicado
    de esta variante. Si alguien la baja, esto rompe."""
    doc = _construir(_simetrica(1), _simetrica(1))
    tss_sort1 = 109397967
    assert doc["interval"]["start"] <= tss_sort1 <= doc["interval"]["end"]
    assert doc["bins"] == 2 * bl.CONTACT_HALF_BINS + 1


def test_el_bin_de_la_variante_cae_dentro_del_recorte() -> None:
    doc = _construir(_simetrica(1), _simetrica(1))
    assert 0 <= doc["variantBin"] < doc["bins"]
    inicio = doc["interval"]["start"] + doc["variantBin"] * doc["resolution"]
    assert inicio <= SPEC.position - 1 < inicio + doc["resolution"]


def test_la_fila_de_la_variante_reproduce_la_magnitud_del_AVI() -> None:
    """`variantRowMeanAbsDelta` existe para poder ensenar lado a lado el numero
    del AVI y el que dibuja la vista, que NO son la misma magnitud. Aqui se
    comprueba que es lo que dice ser: media de |delta| sobre esa fila."""
    ref = np.zeros((512, 512))
    alt = ref.copy()
    alt[255, :] = alt[:, 255] = 0.5
    doc = _construir(ref, alt)
    assert doc["variantRowMeanAbsDelta"] == pytest.approx(0.5, rel=1e-6)


# --------------------------------------------------------------------------
# Modalidad silenciosa
# --------------------------------------------------------------------------


def test_sin_mapa_el_estado_es_no_data_y_no_hay_matrices() -> None:
    salida = _FakeOutput(None, None)
    doc = bl.build_contacts(
        "chr1", SPEC, _FakeModel(salida),
        _FakeInterval("chr1", 108750680, 109799256),
        PROV, "EFO:0001187", "HepG2",
    )
    assert doc["status"] == "no_data"
    assert "delta" not in doc and "domain" not in doc


def test_un_diff_casi_cero_es_ok_no_es_no_data() -> None:
    """La distincion que carga toda la leccion de V5: un mapa que no cambia no
    es un dato que falta, es una medicion."""
    ref = _simetrica(1)
    doc = _construir(ref, ref)
    assert doc["status"] == "ok"
    assert doc["maxAbsDelta"] == 0.0
    assert doc["maxAbsDelta"] < doc["visibleThreshold"]


def test_el_hallazgo_viaja_al_artefacto_y_solo_si_existe() -> None:
    ref = _simetrica(1)
    assert "finding" not in _construir(ref, ref)
    assert _construir(ref, ref, finding="algo")["finding"] == "algo"
