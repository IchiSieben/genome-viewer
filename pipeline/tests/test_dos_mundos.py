"""Los dos mundos: `data/dist/` es producto, `data/fixtures/` es desarrollo.

Este archivo existe por una leccion concreta y cara. El `.gitignore` llevaba
este comentario:

    # ...NO los bloques de senal, que son 7,2 MB de binario
    # regenerable de forma determinista con:
    #   python -m alphagenome_platform.cli fixtures

Las dos afirmaciones eran falsas -eran 8,4 MB, y ese comando no los regenera:
genera OTROS loci- y sobrevivieron meses porque un comentario no se ejecuta.
Cuando alguien por fin lo siguio, `cli fixtures` sobreescribio `index.json` y
los cuatro artefactos reales de un locus que habia costado cuota.

De ahi la regla que aplica este modulo: **una afirmacion sobre el sistema se
escribe como test, no como prosa.** Lo que el README dice hoy -que el clon trae
los artefactos reales, que no hace falta un paso de arranque, y que las
fixtures viven en otro arbol- esta comprobado aqui abajo, linea por linea.

Deliberadamente NO se comprueba ningun tamano en MB: una cifra exacta se pudre
en cuanto entra un locus mas, y una asercion que se pudre es como empezo todo
esto. Se comprueban propiedades estructurales, que no caducan.
"""

from __future__ import annotations

import json
import pathlib
import subprocess

import pytest

from alphagenome_platform import contract, fixtures, loci

ROOT = contract.ROOT


# --------------------------------------------------------------------------
# Los dos arboles estan separados
# --------------------------------------------------------------------------


def test_las_fixtures_no_escriben_en_la_salida_del_producto() -> None:
    """El destino por defecto de `generate()` no es, ni contiene, `data/dist`."""
    assert contract.FIXTURES != contract.DIST
    assert contract.DIST not in contract.FIXTURES.parents
    assert contract.FIXTURES not in contract.DIST.parents


def test_ningun_id_sintetico_puede_chocar_con_uno_real() -> None:
    """Renombrar la instancia arregla el caso; renombrar la clase impide el
    patron. Por eso los TRES llevan prefijo y no solo el que colisionaba."""
    sinteticos = {spec.id for spec in fixtures.LOCI}
    reales = {locus.id for locus in loci.LOCI}

    assert sinteticos & reales == set(), (
        f"ids compartidos entre el catalogo real y las fixtures: "
        f"{sorted(sinteticos & reales)}"
    )
    sin_prefijo = sorted(i for i in sinteticos if not i.startswith("demo-"))
    assert not sin_prefijo, (
        f"{sin_prefijo} no lleva prefijo 'demo-': un locus sintetico sin marca "
        f"puede volver a colisionar con uno real el dia que se anada."
    )


def test_escribir_fixtures_sobre_datos_de_la_API_aborta(
    tmp_path: pathlib.Path,
) -> None:
    """La asercion que cubre el unico hueco que queda: `--out` a mano.

    Y se comprueba que PUEDE disparar, no solo que existe: un guardarrail que
    nunca se ha visto fallar no prueba nada.
    """
    destino = tmp_path / "dist"
    (destino / "loci" / "real").mkdir(parents=True)
    (destino / "loci" / "real" / "locus.json").write_text(
        json.dumps({"provenance": {"source": "atlas-api"}}), encoding="utf-8"
    )

    with pytest.raises(fixtures.DestinoConDatosReales, match="atlas-api"):
        fixtures.generate(destino)


def test_un_destino_vacio_si_deja_escribir(tmp_path: pathlib.Path) -> None:
    """La otra mitad: la asercion no puede bloquear el uso legitimo."""
    report = fixtures.generate(tmp_path / "fixtures")
    assert report["artifacts"]
    escritos = {p.parent.name for p in (tmp_path / "fixtures").glob("loci/*/locus.json")}
    assert all(i.startswith("demo-") for i in escritos), escritos


# --------------------------------------------------------------------------
# Lo que el README afirma sobre el clon
# --------------------------------------------------------------------------


def test_el_clon_trae_los_bloques_de_senal() -> None:
    """El README dice que no hace falta paso de arranque. Esto lo comprueba.

    Si los .bin volvieran a ignorarse, este test cae antes de que nadie
    escriba en un README que el clon esta completo.
    """
    bloques = list(contract.DIST.rglob("*.bin"))
    assert bloques, "no hay bloques de senal en data/dist/"

    resultado = subprocess.run(
        ["git", "check-ignore", "--no-index", *[str(b) for b in bloques]],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    ignorados = [l for l in resultado.stdout.splitlines() if l.strip()]
    assert not ignorados, (
        f"{len(ignorados)} bloques de senal estan en .gitignore, asi que un "
        f"clon no los recibe: {ignorados[:3]}"
    )


def test_los_bloques_del_clon_no_los_regenera_fixtures() -> None:
    """La afirmacion exacta que era falsa en el .gitignore.

    Los bloques pertenecen a loci del catalogo REAL; `fixtures` solo escribe
    los suyos. Sin llave no se regeneran, y por eso se versionan.
    """
    con_bloques = {
        ruta.relative_to(contract.DIST).parts[1]
        for ruta in contract.DIST.rglob("*.bin")
    }
    assert con_bloques, "no hay bloques de senal en data/dist/"

    sinteticos = {spec.id for spec in fixtures.LOCI}
    assert con_bloques & sinteticos == set(), (
        f"{sorted(con_bloques & sinteticos)} tiene bloques en data/dist y "
        f"ademas lo genera fixtures: eso es la colision que B elimina."
    )

    reales = {locus.id for locus in loci.LOCI}
    huerfanos = con_bloques - reales
    assert not huerfanos, (
        f"{sorted(huerfanos)} tiene bloques en data/dist pero no esta en el "
        f"catalogo real: o es basura de una corrida vieja, o el catalogo mintio."
    )
