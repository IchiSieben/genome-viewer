"""El trio de comparacion simultanea, como compuerta automatica.

`validate_palette.py` mide bien, pero se corre a mano: una regla que nadie
ejecuta no es una regla. Esto lo trae a `pytest`, que si corre siempre, con la
misma idea que la compuerta de proveniencia — la comprobacion lee el valor que
el codigo usa de verdad, no una copia.

El trio no se afirma aqui: se recalcula. Si alguien cambia un hex de
`tokens.css` o reasigna las ranuras de `familyColor`, el que falla es este test,
no el ojo de quien mire la cascada.
"""

from __future__ import annotations

import sys
import pathlib

import pytest

TOOLS = pathlib.Path(__file__).resolve().parents[1] / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import validate_palette as vp  # noqa: E402


def test_familycolor_no_se_desfasa_de_avi_trio() -> None:
    """Las ranuras declaradas aqui son las que el visor pinta de verdad."""
    en_codigo = vp.slots_in_familycolor()
    if en_codigo is None:
        pytest.skip("no hay arbol de la web en esta copia; nada que cotejar")
    assert en_codigo == vp.AVI_TRIO, (
        f"familyColor usa {en_codigo} y validate_palette declara {vp.AVI_TRIO}. "
        "Uno de los dos miente; el codigo manda."
    )


def test_el_trio_en_uso_pasa_el_umbral_simultaneo() -> None:
    """En los dos temas y en las cuatro visiones, no en el caso favorable."""
    combo = tuple(s - 1 for s in vp.AVI_TRIO)
    for tema, paleta in (("claro", vp.LIGHT), ("oscuro", vp.DARK)):
        peor, a, b, vision = vp.worst_over_visions(paleta, combo)
        assert peor >= vp.SIMULTANEOUS_THRESHOLD, (
            f"tema {tema}, {vision}: {a} y {b} quedan a dE2000 {peor:.1f}, "
            f"por debajo de {vp.SIMULTANEOUS_THRESHOLD}"
        )


def test_ninguna_ranura_reservada_entra_en_el_trio() -> None:
    """La 8 es roja y compite con el estado critico; no puede ser una serie."""
    assert not set(vp.AVI_TRIO) & set(vp.RESERVED_SLOTS)


def test_las_ocho_pasan_en_vision_normal() -> None:
    """El techo de la paleta categorica, que es lo que mide el otro umbral."""
    for tema, paleta in (("claro", vp.LIGHT), ("oscuro", vp.DARK)):
        peor, a, b = vp.worst_pair(paleta, range(len(paleta)), "normal")
        assert peor >= vp.NORMAL_THRESHOLD, (
            f"tema {tema}: {a} y {b} quedan a dE2000 {peor:.1f}"
        )
