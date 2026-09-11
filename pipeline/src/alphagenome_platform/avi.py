"""Anatomia del AVI: los 18 features, sus nombres reales y sus familias.

Los nombres NO son supuestos. Salen de una consulta real al Atlas el
2026-09-11, leidos de ``AVI_SCORE_FEATURE_IMPORTANCE.var['name']``, y estan en
el orden exacto en que el servidor los devuelve. La evidencia cruda esta en
``docs/evidence/h0-online-probe.json``.

Por que un mapa explicito y no matcheo por subcadena
----------------------------------------------------
La version anterior agrupaba por familia buscando trozos de texto dentro del
nombre. Eso funciona hasta que el servidor renombra un feature o agrega uno, y
entonces cae callado en la familia equivocada y la cascada de V1 miente sin
avisar. Aqui el mapa es explicito y un nombre desconocido **lanza**: es
preferible un fallo ruidoso en el pipeline a un grafico plausible y falso.
"""

from __future__ import annotations

from typing import Literal

Family = Literal["regulatory", "protein", "conservation", "indel"]

FEATURE_FAMILY: dict[str, Family] = {
    # Regulatorio (AlphaGenome), 10. Son el maximo del valor absoluto entre
    # tejidos, salvo el de splicing que viene ya fusionado.
    "MERGED_SPLICING": "regulatory",
    "MAX_ABS_ATAC": "regulatory",
    "MAX_ABS_CONTACT_MAPS": "regulatory",
    "MAX_ABS_DNASE": "regulatory",
    "MAX_ABS_CHIP_TF": "regulatory",
    "MAX_ABS_CHIP_HISTONE": "regulatory",
    "MAX_ABS_CAGE": "regulatory",
    "MAX_ABS_PROCAP": "regulatory",
    "MAX_ABS_RNA_SEQ": "regulatory",
    "MAX_ABS_POLYADENYLATION": "regulatory",
    # Proteina, 4: AlphaMissense mas tres banderas de VEP.
    "ALPHAMISSENSE": "protein",
    "PROTEIN_TERMINATION": "protein",
    "START_LOST": "protein",
    "STOP_LOST": "protein",
    # Conservacion, 2.
    "CACTUS_241_WAY": "conservation",
    "PHASTCONS_470_WAY": "conservation",
    # Indel, 2.
    "IS_INSERTION": "indel",
    "IS_DELETION": "indel",
}

FEATURE_ORDER: tuple[str, ...] = (
    "MERGED_SPLICING",
    "MAX_ABS_ATAC",
    "MAX_ABS_CONTACT_MAPS",
    "MAX_ABS_DNASE",
    "MAX_ABS_CHIP_TF",
    "MAX_ABS_CHIP_HISTONE",
    "MAX_ABS_CAGE",
    "MAX_ABS_PROCAP",
    "MAX_ABS_RNA_SEQ",
    "MAX_ABS_POLYADENYLATION",
    "ALPHAMISSENSE",
    "CACTUS_241_WAY",
    "PROTEIN_TERMINATION",
    "START_LOST",
    "STOP_LOST",
    "PHASTCONS_470_WAY",
    "IS_INSERTION",
    "IS_DELETION",
)
"""Orden exacto en que el servidor devuelve los features.

Notese que NO esta agrupado por familia: ``CACTUS_241_WAY`` (conservacion) cae
entre features de proteina. Agrupar para la vista es trabajo del visor.
"""

FEATURE_LABEL: dict[str, str] = {
    "MERGED_SPLICING": "Splicing (fusionado)",
    "MAX_ABS_ATAC": "ATAC",
    "MAX_ABS_CONTACT_MAPS": "Mapas de contacto",
    "MAX_ABS_DNASE": "DNase",
    "MAX_ABS_CHIP_TF": "ChIP-TF",
    "MAX_ABS_CHIP_HISTONE": "ChIP-histonas",
    "MAX_ABS_CAGE": "CAGE",
    "MAX_ABS_PROCAP": "PRO-cap",
    "MAX_ABS_RNA_SEQ": "RNA-seq",
    "MAX_ABS_POLYADENYLATION": "Poliadenilacion",
    "ALPHAMISSENSE": "AlphaMissense",
    "CACTUS_241_WAY": "phyloP Cactus 241-way",
    "PROTEIN_TERMINATION": "Terminacion de proteina",
    "START_LOST": "Inicio perdido",
    "STOP_LOST": "Stop perdido",
    "PHASTCONS_470_WAY": "PhastCons 470-way",
    "IS_INSERTION": "Es insercion",
    "IS_DELETION": "Es delecion",
}

FAMILY_EXPECTED_COUNT: dict[Family, int] = {
    "regulatory": 10,
    "protein": 4,
    "conservation": 2,
    "indel": 2,
}

SHAP_BASE_VALUE = -0.049016
"""Valor base de la explicacion SHAP, medido.

Se obtuvo como ``avi_crudo - suma(contribuciones)`` sobre las tres variantes de
chr12:54578515. La dispersion entre ellas fue 3,5e-05, o sea constante. El
pipeline lo recalcula por variante de todos modos; esta constante existe para
poder detectar si el servidor lo cambia.
"""


class UnknownAviFeature(KeyError):
    """El servidor devolvio un feature que este codigo no conoce.

    Es un fallo a proposito. Si el Atlas agrega o renombra un feature, la
    cascada de V1 dejaria de sumar al score, y un grafico que no cierra es peor
    que un pipeline que se detiene.
    """


def family_of(name: str) -> Family:
    """Devuelve la familia de un feature, o lanza si no lo conoce.

    Args:
      name: Nombre tal cual lo devuelve ``var['name']``.

    Returns:
      La familia a la que pertenece.

    Raises:
      UnknownAviFeature: Si el nombre no esta en el mapa.
    """
    try:
        return FEATURE_FAMILY[name]
    except KeyError as error:
        raise UnknownAviFeature(
            f"Feature del AVI desconocido: {name!r}. El Atlas debe haber "
            f"cambiado su conjunto de features. Actualiza FEATURE_FAMILY en "
            f"alphagenome_platform/avi.py y vuelve a correr la sonda H0; no "
            f"adivines la familia."
        ) from error


def label_of(name: str) -> str:
    """Etiqueta legible. Cae al propio nombre si no hay traduccion."""
    return FEATURE_LABEL.get(name, name)


def phred_from_quantile(quantile: float) -> float:
    """PHRED = -10*log10(1 - cuantil).

    10 = 10 % superior, 20 = 1 %, 30 = 0,1 %. Verificado contra los cuantiles
    reales que devuelve ``layers['quantiles']``.
    """
    import math

    if quantile >= 1.0:
        return float("inf")
    return -10.0 * math.log10(max(1e-12, 1.0 - quantile))


def validate_feature_set(names: list[str]) -> None:
    """Comprueba que el servidor devolvio exactamente los 18 esperados.

    Raises:
      UnknownAviFeature: Si falta alguno, sobra alguno, o hay un nombre nuevo.
    """
    unknown = [n for n in names if n not in FEATURE_FAMILY]
    if unknown:
        raise UnknownAviFeature(
            f"Features desconocidos: {unknown}. Actualiza avi.py tras correr H0."
        )
    missing = [n for n in FEATURE_ORDER if n not in names]
    if missing:
        raise UnknownAviFeature(
            f"El servidor no devolvio estos features esperados: {missing}."
        )
    counts: dict[str, int] = {}
    for name in names:
        counts[FEATURE_FAMILY[name]] = counts.get(FEATURE_FAMILY[name], 0) + 1
    if counts != FAMILY_EXPECTED_COUNT:
        raise UnknownAviFeature(
            f"Reparto por familia inesperado: {counts}, se esperaba "
            f"{FAMILY_EXPECTED_COUNT}."
        )
