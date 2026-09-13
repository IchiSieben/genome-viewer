"""Los hallazgos redactados no pueden entrar en terreno clinico.

Por que existe este test
------------------------
Un hallazgo redactado es la unica prosa del proyecto que afirma algo sobre
biologia. La linea que no puede cruzar: el texto se queda en lo que el MODELO
PREDICE, nunca en lo que le pasa a una persona. Es a la vez lo que exigen los
Output Terms de AlphaGenome (R3: uso no comercial, de investigacion, no
diagnostico) y el guardarrail que convierte "mostrar datos" en algo que se
puede publicar sin mentir.

Por que recorre el CATALOGO y no los artefactos
-----------------------------------------------
`test_dnm1_finding.py` lee `data/dist` y se salta si no esta congelado, que es
correcto para vigilar que una afirmacion siga siendo cierta contra sus datos.
Pero un guardarrail de redaccion no puede saltarse nunca: si alguien escribe
"causa la enfermedad" y resulta que ese dia no habia artefactos, el test
pasaria y el texto llegaria al repo. Asi que este recorre `loci.LOCI`, que
esta siempre.
"""

from __future__ import annotations

import dataclasses
import re
import unicodedata

import pytest

from alphagenome_platform import loci

# Prefijos, no palabras exactas: "causa" tiene que atrapar tambien "causal",
# "causado" y "causante"; "diagnost" atrapa "diagnostico" y "diagnostica".
TERMINOS_CLINICOS = (
    "caus",
    "enferm",
    "pacient",
    "sindrom",
    "diagnost",
    "patogen",
    "clinic",
    "sintom",
    "tratamien",
    "terapi",
    "pronostic",
    "riesgo de",
    "predispos",
    "hereda",
    "afectad",
)

# Nombres de enfermedad asociados a los loci del catalogo. No hay un archivo de
# catalogo de enfermedades: esta lista ES la interpretacion de "los nombres de
# enfermedad del catalogo", una linea por locus. Si entra un locus nuevo, entra
# aqui su enfermedad.
ENFERMEDADES_DEL_CATALOGO = (
    "epilepsi",           # dnm1
    "encefalopat",        # dnm1
    "colesterol",         # celsr2-psrc1 / SORT1
    "ldl",                # celsr2-psrc1
    "coronari",           # celsr2-psrc1
    "infarto",            # celsr2-psrc1
    "aterosclero",        # celsr2-psrc1
    "agammaglobulin",     # btk
    "inmunodeficien",     # btk
    "hiperamonem",        # nags
    "anemia",             # ppp1r1a-pde1b
    "hemoglobin",         # ppp1r1a-pde1b
)

PROHIBIDOS = TERMINOS_CLINICOS + ENFERMEDADES_DEL_CATALOGO

CAMPOS_DE_HALLAZGO = tuple(
    f.name
    for f in dataclasses.fields(loci.VariantSpec)
    if f.name.endswith("_finding")
)


def _plano(texto: str) -> str:
    """Minusculas y sin tildes: "patogénico" no puede colarse por la tilde."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return sin_tildes.lower()


def _hallazgos() -> list[tuple[str, str, str]]:
    salida = []
    for config in loci.LOCI:
        for spec in config.variants:
            for campo in CAMPOS_DE_HALLAZGO:
                texto = getattr(spec, campo)
                if texto:
                    salida.append((config.id, campo, texto))
    return salida


def test_hay_campos_de_hallazgo_que_vigilar() -> None:
    """Si alguien renombra los campos, este test no puede quedarse mudo."""
    assert CAMPOS_DE_HALLAZGO, "VariantSpec ya no tiene campos *_finding"
    assert _hallazgos(), "ningun hallazgo redactado en el catalogo"


@pytest.mark.parametrize("locus_id,campo,texto", _hallazgos())
def test_el_hallazgo_no_entra_en_terreno_clinico(
    locus_id: str, campo: str, texto: str
) -> None:
    plano = _plano(texto)
    encontrados = [p for p in PROHIBIDOS if p in plano]
    assert not encontrados, (
        f"{locus_id}.{campo} usa terminos clinicos o de fenotipo: "
        f"{encontrados}. El texto se queda en lo que el modelo predice."
    )


@pytest.mark.parametrize("locus_id,campo,texto", _hallazgos())
def test_el_hallazgo_no_lleva_cifras(locus_id: str, campo: str, texto: str) -> None:
    """La otra mitad de la regla del contrato: la afirmacion se redacta, las
    cifras las pinta la vista desde el propio artefacto."""
    numeros = re.findall(r"\d+[,.]?\d*", texto)
    assert not numeros, f"{locus_id}.{campo} lleva cifras congeladas: {numeros}"


def test_la_lista_de_prohibidos_de_verdad_atrapa() -> None:
    """Un guardarrail que no puede disparar no prueba nada."""
    for frase in (
        "esta variante causa la enfermedad en pacientes",
        "asociada a epilepsia",
        "eleva el colesterol LDL",
        "hallazgo patogénico",          # con tilde, tiene que caer igual
        "aumenta el RIESGO DE infarto",  # mayusculas
    ):
        plano = _plano(frase)
        assert any(p in plano for p in PROHIBIDOS), frase
