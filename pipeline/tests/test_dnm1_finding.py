"""El hallazgo redactado de DNM1, contrastado contra el artefacto real.

Por que existe este test
------------------------
El texto de `sashimi_finding` es una afirmacion escrita a mano sobre datos que
un dia se van a regenerar. Prosa que afirma algo sobre numeros, junto a numeros
que pueden cambiar, es prosa que acaba mintiendo sin que nadie se entere. La
regla del contrato es que el texto NO lleva cifras -las pinta la vista desde
las uniones- pero si lleva una AFIRMACION, y una afirmacion tambien caduca.

Asi que la afirmacion se vigila aqui, frase por frase. Si alguien regenera
`splice.json` y la biologia sale distinta, esto rompe la build antes de que el
demo ensene un hallazgo que ya no esta en sus propios datos.

Se salta -no falla- si el artefacto no esta congelado: el repo tiene que poder
clonarse y pasar tests sin `data/dist`.
"""

from __future__ import annotations

import json
import pathlib

import pytest

ARTIFACT = (
    pathlib.Path(__file__).resolve().parents[2]
    / "data/dist/loci/dnm1/variants/chr9-128226027-G-A/splice.json"
)

# Misma huella que usa la vista (VARIANT_FOOTPRINT_BP en spliceSashimi.ts).
FOOTPRINT_BP = 20


@pytest.fixture(scope="module")
def doc() -> dict:
    if not ARTIFACT.exists():
        pytest.skip(f"sin artefacto congelado en {ARTIFACT}")
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))


def _touching(doc: dict) -> list[dict]:
    p = doc["variant"]["position"] - 1
    return [
        j
        for j in doc["junctions"]
        if abs(j["start"] - p) <= FOOTPRINT_BP or abs(j["end"] - p) <= FOOTPRINT_BP
    ]


def test_son_cuatro_uniones_y_son_las_que_tocan_la_variante(doc: dict) -> None:
    """"...las cuatro uniones implicadas son exactamente las que tocan la
    posicion de la variante." Son CUATRO, no dos: dos donadores, no uno."""
    touching = _touching(doc)
    assert len(touching) == 4, [(j["start"], j["end"]) for j in touching]
    assert len({j["start"] for j in touching}) == 2, "dos donadores rio arriba"
    assert len({j["end"] for j in touching}) == 2, "dos aceptores vecinos"


def test_los_dos_aceptores_estan_a_seis_bases(doc: dict) -> None:
    """"...se mudan al de al lado, seis bases rio arriba." Hebra +, asi que
    rio arriba es la coordenada menor."""
    ends = sorted({j["end"] for j in _touching(doc)})
    assert ends[1] - ends[0] == 6
    assert {j["strand"] for j in _touching(doc)} == {"+"}


def test_el_intercambio_es_reciproco_y_lo_hacen_los_dos_donadores(doc: dict) -> None:
    """"Los dos donadores abandonan el mismo sitio aceptor y se mudan al de al
    lado (...) no son dos efectos sueltos que coinciden: es un intercambio
    reciproco." Para cada donador por separado: el aceptor preferido en REF es
    el mayor y en ALT es el menor, y ambos donadores coinciden."""
    touching = _touching(doc)
    lo, hi = sorted({j["end"] for j in touching})

    for donor in sorted({j["start"] for j in touching}):
        arms = {j["end"]: j for j in touching if j["start"] == donor}
        assert set(arms) == {lo, hi}, f"al donador {donor} le falta un brazo"
        assert arms[hi]["ref"] > arms[lo]["ref"], f"{donor}: en REF manda el aceptor mayor"
        assert arms[lo]["alt"] > arms[hi]["alt"], f"{donor}: en ALT manda el menor"
        # "queda practicamente en cero" / "pasa de residual a dominante".
        assert arms[hi]["alt"] < doc["minValueShown"]
        assert arms[lo]["alt"] > 10 * arms[lo]["ref"]


def test_ordenar_por_delta_saca_estas_cuatro_y_ordenar_por_magnitud_no(doc: dict) -> None:
    """"Salio de ordenar por |ALT - REF| (...) con el orden por magnitud estas
    cuatro no aparecian por ninguna parte: los arcos mas gruesos de la ventana
    son constitutivos y se mueven 0,01 entre REF y ALT."

    Esta es la afirmacion que justifica el criterio de etiquetado de la vista.
    Si un dia deja de ser cierta, el criterio hay que volver a pensarlo.
    """
    touching = {(j["start"], j["end"]) for j in _touching(doc)}

    por_delta = sorted(doc["junctions"], key=lambda j: -abs(j["alt"] - j["ref"]))
    assert {(j["start"], j["end"]) for j in por_delta[:4]} == touching

    por_magnitud = sorted(doc["junctions"], key=lambda j: -max(j["ref"], j["alt"]))
    top3 = por_magnitud[:3]
    assert not touching & {(j["start"], j["end"]) for j in top3}

    # "casi no se mueven": el mas movido de los tres arcos mas gruesos cambia
    # menos de una decima parte de lo que cambia la MENOR de las cuatro de la
    # senal. Medido 0,015 contra 1,08. Se compara contra la senal y no contra
    # un umbral fijo para que el test siga valiendo si el piso cambia.
    minimo_de_la_senal = min(abs(j["alt"] - j["ref"]) for j in _touching(doc))
    for j in top3:
        assert abs(j["alt"] - j["ref"]) < minimo_de_la_senal / 10, (
            "el arco mas grueso ya no es ruido en delta: revisar el criterio"
        )


def test_el_texto_del_hallazgo_no_lleva_cifras(doc: dict) -> None:
    """La regla del contrato: la afirmacion se redacta, las cifras las pinta la
    vista desde las uniones. Un numero suelto aqui es un numero que caduca.

    Las cantidades escritas con letras ("seis bases", "cuatro uniones") si
    valen: no son mediciones, son la forma de la afirmacion, y el test de
    arriba las vigila una por una.
    """
    import re

    finding = doc.get("finding")
    assert finding, "DNM1 es el caso de demostracion de V4: tiene que llevar hallazgo"
    numeros = re.findall(r"\d+[,.]?\d*", finding)
    assert not numeros, f"cifras congeladas en la prosa: {numeros}"


# --- El hallazgo en los diccionarios del visor (opcion A de la Fase 1b) ------
#
# La web no muestra `doc["finding"]` tal cual: lo sobrescribe desde
# `web/src/i18n/{es,en}.json` por id de variante. La traduccion inglesa es
# prosa nueva sobre los mismos datos, asi que tiene que cumplir el mismo
# contrato: ninguna cifra, y las mismas afirmaciones que el test de arriba
# comprueba contra las uniones.

I18N = pathlib.Path(__file__).resolve().parents[2] / "web/src/i18n"
FINDING_KEY = "data.finding.chr9-128226027-G-A"

# Afirmacion -> como se escribe en cada idioma. Cada una la respalda uno de los
# tests de arriba.
CLAIMS = {
    "es": ["seis bases", "cuatro uniones", "recíproco", "REF", "ALT", "|ALT - REF|"],
    "en": ["six bases", "four junctions", "reciprocal", "REF", "ALT", "|ALT - REF|"],
}


@pytest.mark.parametrize("lang", ["es", "en"])
def test_el_hallazgo_del_diccionario_no_lleva_cifras_y_dice_lo_mismo(lang: str) -> None:
    import re

    text = json.loads((I18N / f"{lang}.json").read_text(encoding="utf-8")).get(FINDING_KEY)
    assert text, f"falta {FINDING_KEY} en {lang}.json"
    numeros = re.findall(r"\d+[,.]?\d*", text)
    assert not numeros, f"{lang}: cifras congeladas en la prosa: {numeros}"
    for claim in CLAIMS[lang]:
        assert claim in text, f"{lang}: el hallazgo ya no dice '{claim}'"
