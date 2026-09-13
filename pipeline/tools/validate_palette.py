"""Validador de separacion perceptual de la paleta categorica.

El encargo dice: valida la paleta, no la razones. Esto la valida.

Que hace
--------
1. Simula como ven los colores las tres dicromacias (protanopia, deuteranopia,
   tritanopia) con el metodo de Brettel-Vienot-Mollon, que es el estandar.
2. Calcula la distancia **CIEDE2000** entre todos los pares, en vision normal y
   en cada dicromacia. CIEDE2000 se acerca a la percepcion; la distancia
   euclidiana en RGB no, y por eso no se usa aqui.
3. Informa del par mas cercano de cada caso y falla si baja del umbral.
4. Mide **Okabe-Ito** con el mismo metodo, para tener una referencia externa y
   no una afirmacion de catalogo.
5. Comprueba el trio que la interfaz usa de verdad (`AVI_TRIO`) contra el
   umbral de comparacion simultanea, en los dos temas y en las cuatro visiones.

Umbrales
--------
Dos, porque el problema es distinto segun cuantas series compiten a la vez:
`NORMAL_THRESHOLD` para las ocho en vision normal, `SIMULTANEOUS_THRESHOLD`
para el trio, exigido tambien en las tres dicromacias. Ambos son mas estrictos
que el limite de "diferencia perceptible" (~2,3) porque aqui los colores
aparecen en cuadros pequenos y separados, no lado a lado en bloques grandes.

Uso::

    python pipeline/tools/validate_palette.py
    python pipeline/tools/validate_palette.py --triples   # ranking de trios
"""

from __future__ import annotations

import argparse
import itertools
import math
import re
import sys
from pathlib import Path

# Paleta categorica, en el orden fijo en que se asigna. Los valores son los que
# el encargo especifica; si alguno cambia, este validador tiene que volver a
# pasar antes de darlo por bueno.
LIGHT: list[tuple[str, str]] = [
    ("1 azul", "#2a78d6"),
    ("2 naranja", "#eb6834"),
    ("3 aqua", "#1baf7a"),
    ("4 amarillo", "#eda100"),
    ("5 magenta", "#e87ba4"),
    ("6 verde", "#008300"),
    ("7 violeta", "#4a3aa7"),
    ("8 rojo", "#e34948"),
]

DARK: list[tuple[str, str]] = [
    ("1 azul", "#3987e5"),
    ("2 naranja", "#d95926"),
    ("3 aqua", "#199e70"),
    ("4 amarillo", "#c98500"),
    ("5 magenta", "#d55181"),
    ("6 verde", "#008300"),
    ("7 violeta", "#9085e9"),
    ("8 rojo", "#e66767"),
]

# Referencia externa: la paleta de Okabe-Ito (2008), la mas usada en ciencia
# para daltonismo. No se copia —su negro es tinta en los dos temas de este
# visor, no una serie— pero sirve para medir contra algo que no es de casa.
OKABE_ITO: list[tuple[str, str]] = [
    ("1 naranja", "#e69f00"),
    ("2 celeste", "#56b4e9"),
    ("3 verde azulado", "#009e73"),
    ("4 amarillo", "#f0e442"),
    ("5 azul", "#0072b2"),
    ("6 bermellon", "#d55e00"),
    ("7 purpura", "#cc79a7"),
    ("8 negro", "#000000"),
]

# Ranuras (1-8) que la interfaz asigna a las familias de AVI —las tres series
# que se comparan simultaneamente en la ficha de variante. Ver `familyColor`
# en web/src/lib/color.ts. Este validador comprueba precisamente este trio: si
# alguien lo cambia alli y no aqui, el numero que se imprime deja de describir
# lo que se pinta.
AVI_TRIO = (5, 6, 7)

# La ranura 8 (rojo) queda fuera del ranking de trios: esta reservada para el
# color de estado critico y usarla como serie la haria ambigua.
RESERVED_SLOTS = (8,)

NORMAL_THRESHOLD = 10.0
"""Umbral en vision normal para la paleta categorica completa.

Es un umbral alcanzable y significativo: por debajo de dE2000 ~10 dos cuadros
pequenos y separados cuestan de distinguir.
"""

SIMULTANEOUS_THRESHOLD = 12.0
"""Umbral para el trio que se compara simultaneamente, en TODAS las visiones.

Este si tiene que aguantar las tres dicromacias, porque son solo tres series y
ahi si es alcanzable.

Por que no se exige lo mismo a las ocho: NINGUNA paleta de ocho categorias
mantiene separacion alta en protanopia, deuteranopia y tritanopia a la vez. Es
un limite del numero de categorias, no de los hex elegidos. Okabe-Ito, la
referencia del campo, esta medida aqui abajo con este mismo codigo y tampoco
lo consigue. Leer esa comparacion entera antes de citarla: esta paleta gana en
el peor par de las ocho y pierde por mucho en el mejor trio.

La consecuencia de diseno, que ya esta en las reglas del encargo: la identidad
nunca puede depender solo del color. Leyenda siempre, etiqueta directa con
cuatro series o menos, y un canal no cromatico (trazo discontinuo) cuando hay
series superpuestas.
"""


# --------------------------------------------------------------------------
# Conversiones de color
# --------------------------------------------------------------------------


def hex_to_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def _to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _from_linear(c: float) -> float:
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb_to_xyz(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    r, g, b = (_to_linear(c) for c in rgb)
    return (
        0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
        0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
        0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
    )


def xyz_to_lab(xyz: tuple[float, float, float]) -> tuple[float, float, float]:
    # Blanco de referencia D65.
    xn, yn, zn = 0.95047, 1.00000, 1.08883
    def f(t: float) -> float:
        return t ** (1 / 3) if t > 216 / 24389 else (841 / 108) * t + 4 / 29

    fx, fy, fz = f(xyz[0] / xn), f(xyz[1] / yn), f(xyz[2] / zn)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def ciede2000(lab1: tuple[float, float, float], lab2: tuple[float, float, float]) -> float:
    """Distancia CIEDE2000. Implementacion directa de la formula de la CIE."""
    l1, a1, b1 = lab1
    l2, a2, b2 = lab2
    kl = kc = kh = 1.0

    c1 = math.hypot(a1, b1)
    c2 = math.hypot(a2, b2)
    c_bar = (c1 + c2) / 2
    g = 0.5 * (1 - math.sqrt(c_bar**7 / (c_bar**7 + 25.0**7))) if c_bar > 0 else 0.0

    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0

    dlp = l2 - l1
    dcp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp) / 2)

    lp_bar = (l1 + l2) / 2
    cp_bar = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hp_bar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hp_bar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hp_bar = (h1p + h2p + 360) / 2
    else:
        hp_bar = (h1p + h2p - 360) / 2

    t = (
        1
        - 0.17 * math.cos(math.radians(hp_bar - 30))
        + 0.24 * math.cos(math.radians(2 * hp_bar))
        + 0.32 * math.cos(math.radians(3 * hp_bar + 6))
        - 0.20 * math.cos(math.radians(4 * hp_bar - 63))
    )
    d_theta = 30 * math.exp(-(((hp_bar - 275) / 25) ** 2))
    rc = 2 * math.sqrt(cp_bar**7 / (cp_bar**7 + 25.0**7)) if cp_bar > 0 else 0.0
    sl = 1 + (0.015 * (lp_bar - 50) ** 2) / math.sqrt(20 + (lp_bar - 50) ** 2)
    sc = 1 + 0.045 * cp_bar
    sh = 1 + 0.015 * cp_bar * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc

    return math.sqrt(
        (dlp / (kl * sl)) ** 2
        + (dcp / (kc * sc)) ** 2
        + (dHp / (kh * sh)) ** 2
        + rt * (dcp / (kc * sc)) * (dHp / (kh * sh))
    )


# --------------------------------------------------------------------------
# Simulacion de dicromacias (Brettel-Vienot-Mollon)
# --------------------------------------------------------------------------

_RGB_TO_LMS = (
    (17.8824, 43.5161, 4.11935),
    (3.45565, 27.1554, 3.86714),
    (0.0299566, 0.184309, 1.46709),
)
_LMS_TO_RGB = (
    (0.0809444479, -0.130504409, 0.116721066),
    (-0.0102485335, 0.0540193266, -0.113614708),
    (-0.000365296938, -0.00412161469, 0.693511405),
)

_SIMULATION = {
    "protanopia": ((0.0, 2.02344, -2.52581), (0, 1, 0), (0, 0, 1)),
    "deuteranopia": ((1, 0, 0), (0.494207, 0.0, 1.24827), (0, 0, 1)),
    "tritanopia": ((1, 0, 0), (0, 1, 0), (-0.395913, 0.801109, 0.0)),
}


def _matmul(m: tuple, v: tuple[float, float, float]) -> tuple[float, float, float]:
    return tuple(sum(m[i][j] * v[j] for j in range(3)) for i in range(3))  # type: ignore[return-value]


def simulate(rgb: tuple[float, float, float], kind: str) -> tuple[float, float, float]:
    """Simula como percibe ese color una persona con la dicromacia dada."""
    if kind == "normal":
        return rgb
    linear = tuple(_to_linear(c) for c in rgb)
    lms = _matmul(_RGB_TO_LMS, linear)  # type: ignore[arg-type]
    lms = _matmul(_SIMULATION[kind], lms)
    back = _matmul(_LMS_TO_RGB, lms)
    return tuple(_from_linear(c) for c in back)  # type: ignore[return-value]


def lab_of(hex_value: str, kind: str) -> tuple[float, float, float]:
    return xyz_to_lab(rgb_to_xyz(simulate(hex_to_rgb(hex_value), kind)))


# --------------------------------------------------------------------------


def check(name: str, palette: list[tuple[str, str]], threshold: float) -> bool:
    ok = True
    print(f"\n=== {name} ({len(palette)} colores, umbral dE2000 >= {threshold}) ===")
    for kind in ("normal", "protanopia", "deuteranopia", "tritanopia"):
        labs = {label: lab_of(value, kind) for label, value in palette}
        worst: tuple[float, str, str] | None = None
        failures: list[tuple[float, str, str]] = []
        for (la, _), (lb, _) in itertools.combinations(palette, 2):
            distance = ciede2000(labs[la], labs[lb])
            if worst is None or distance < worst[0]:
                worst = (distance, la, lb)
            if distance < threshold:
                failures.append((distance, la, lb))
        assert worst is not None
        status = "OK   " if not failures else "FALLA"
        print(f"  {status} {kind:<13} par mas cercano: {worst[1]} / {worst[2]}"
              f"  dE2000 = {worst[0]:.1f}")
        for distance, la, lb in sorted(failures)[:4]:
            print(f"         bajo umbral: {la} / {lb} = {distance:.1f}")
        ok = ok and not failures
    return ok


VISIONS = ("normal", "protanopia", "deuteranopia", "tritanopia")


def worst_pair(
    palette: list[tuple[str, str]], indices: tuple[int, ...], kind: str
) -> tuple[float, str, str]:
    """Par mas cercano del subconjunto `indices`, en una vision."""
    subset = [palette[i] for i in indices]
    labs = {label: lab_of(value, kind) for label, value in subset}
    return min(
        (ciede2000(labs[a], labs[b]), a, b)
        for (a, _), (b, _) in itertools.combinations(subset, 2)
    )


def worst_over_visions(
    palette: list[tuple[str, str]], indices: tuple[int, ...]
) -> tuple[float, str, str, str]:
    """Peor par del subconjunto en la peor de las cuatro visiones."""
    return min(
        (*worst_pair(palette, indices, kind), kind) for kind in VISIONS
    )  # type: ignore[return-value]


def rank_triples(palette: list[tuple[str, str]]) -> list[tuple[float, tuple[int, ...]]]:
    """Ordena los trios de ranuras por su peor par en la peor vision."""
    rows = [
        (worst_over_visions(palette, combo)[0], combo)
        for combo in itertools.combinations(range(len(palette)), 3)
    ]
    rows.sort(reverse=True)
    return rows


def rank_triples_joint() -> list[tuple[float, tuple[int, ...]]]:
    """Ordena los trios por `min(claro, oscuro)`, excluidas las ranuras reservadas.

    Rankear cada tema por separado da dos ganadores distintos y ninguno sirve:
    el color de una familia es el mismo token en los dos temas, asi que el trio
    tiene que aguantar el peor de los dos. Por eso el criterio es el minimo, no
    el promedio.
    """
    usable = [i for i in range(len(LIGHT)) if (i + 1) not in RESERVED_SLOTS]
    rows = [
        (
            min(
                worst_over_visions(LIGHT, combo)[0],
                worst_over_visions(DARK, combo)[0],
            ),
            combo,
        )
        for combo in itertools.combinations(usable, 3)
    ]
    rows.sort(reverse=True)
    return rows


COLOR_TS = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "color.ts"


def slots_in_familycolor() -> tuple[int, ...] | None:
    """Lee del visor las ranuras que `familyColor` asigna de verdad.

    Sin esto, `AVI_TRIO` seria una copia que puede quedarse vieja en silencio y
    el validador acabaria bendiciendo un trio que nadie pinta. Devuelve `None`
    si el archivo no esta —el pipeline puede correr sin el arbol de la web— y
    en ese caso solo se avisa.
    """
    try:
        source = COLOR_TS.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(
        r"export function familyColor\b.*?\n\}", source, re.DOTALL
    )
    if not match:
        return None
    slots = re.findall(r"slotColor\((\d+)\)", match.group(0))
    return tuple(sorted(int(s) for s in slots)) if slots else None


def report_palette(name: str, palette: list[tuple[str, str]]) -> float:
    """Imprime el bloque de una paleta completa y devuelve su peor par normal."""
    print()
    print(f"=== {name}: paleta categorica completa ({len(palette)} colores) ===")
    every = tuple(range(len(palette)))
    normal = worst_pair(palette, every, "normal")
    status = "OK   " if normal[0] >= NORMAL_THRESHOLD else "FALLA"
    print(f"  {status} vision normal, par mas cercano: {normal[1]} / {normal[2]}"
          f"  dE2000 = {normal[0]:.1f}  (umbral {NORMAL_THRESHOLD})")
    for kind in VISIONS[1:]:
        w = worst_pair(palette, every, kind)
        print(f"  info  {kind:<13} par mas cercano: {w[1]} / {w[2]}"
              f"  dE2000 = {w[0]:.1f}")
    print("        (con ocho categorias ninguna paleta separa en las tres")
    print("         dicromacias: por eso la identidad nunca va solo en el color)")
    return normal[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--triples", action="store_true",
        help="ordena los trios de ranuras por separacion en las cuatro visiones",
    )
    args = parser.parse_args()

    ok = True
    for name, palette in (("tema claro", LIGHT), ("tema oscuro", DARK)):
        ok = report_palette(name, palette) >= NORMAL_THRESHOLD and ok
        best = rank_triples(palette)
        top_score, top_combo = best[0]
        print()
        print(f"  Mejor trio de este tema por separado: "
              f"ranuras {tuple(c + 1 for c in top_combo)} -> {top_score:.1f}")
        if args.triples:
            for score, combo in best[:5]:
                labels = " + ".join(palette[i][0] for i in combo)
                print(f"      {score:5.1f}  {tuple(c + 1 for c in combo)}  {labels}")

    # Referencia externa, medida con el mismo codigo.
    report_palette("Okabe-Ito (referencia externa)", OKABE_ITO)
    oi_score, oi_combo = rank_triples(OKABE_ITO)[0]
    print()
    print(f"  Mejor trio de Okabe-Ito: ranuras {tuple(c + 1 for c in oi_combo)} "
          f"-> {oi_score:.1f}  "
          f"({' + '.join(OKABE_ITO[i][0] for i in oi_combo)})")
    print("  Ese trio incluye el negro, que aqui es la tinta de los dos temas y")
    print("  no puede ser una serie. La ventaja de Okabe-Ito en trios es real y")
    print("  viene sobre todo de ahi.")

    # --- Trio de comparacion simultanea: el que la interfaz usa de verdad ---
    joint = rank_triples_joint()
    in_code = slots_in_familycolor()
    if in_code is None:
        print()
        print(f"  aviso  no se pudo leer {COLOR_TS.name}; se valida AVI_TRIO a ciegas")
    elif in_code != AVI_TRIO:
        print()
        print(f"  FALLA  familyColor usa las ranuras {in_code} y aqui esta declarado")
        print(f"         {AVI_TRIO}. Uno de los dos miente; el codigo manda.")
        ok = False
    combo = tuple(s - 1 for s in AVI_TRIO)
    score = next(s for s, c in joint if c == combo)
    rank = next(i for i, (_, c) in enumerate(joint, 1) if c == combo)
    top_score, top_combo = joint[0]

    print()
    print(f"=== Trio de comparacion simultanea (umbral {SIMULTANEOUS_THRESHOLD}) ===")
    print(f"  Criterio: peor par en las cuatro visiones, peor de los dos temas.")
    print(f"  Ranuras reservadas, fuera del ranking: {RESERVED_SLOTS}")
    passes = score >= SIMULTANEOUS_THRESHOLD
    print(f"  {'OK   ' if passes else 'FALLA'} en uso (familyColor): ranuras {AVI_TRIO}"
          f" -> {score:.1f}   puesto {rank} de {len(joint)}")
    for theme, palette in (("claro", LIGHT), ("oscuro", DARK)):
        for kind in VISIONS:
            w = worst_pair(palette, combo, kind)
            print(f"        {theme:<7}{kind:<13} {w[0]:5.1f}  ({w[1]} / {w[2]})")
    if not passes:
        print(f"  Mejor disponible: ranuras {tuple(c + 1 for c in top_combo)}"
              f" -> {top_score:.1f}")
    ok = ok and passes
    if args.triples:
        print("  Ranking conjunto:")
        for s, c in joint[:5]:
            labels = " + ".join(LIGHT[i][0] for i in c)
            print(f"      {s:5.1f}  {tuple(i + 1 for i in c)}  {labels}")

    print()
    if ok:
        print("La paleta pasa en vision normal, el trio simultaneo pasa en las")
        print("cuatro visiones y en los dos temas, y la limitacion de las ocho")
        print("categorias esta medida y declarada. Ver docs/03-visual-system.md.")
        return 0
    print("La paleta NO pasa. Hay que ajustar los hex o el trio de familyColor.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
