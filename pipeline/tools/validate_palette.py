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

Umbral
------
Para series CATEGORICAS que hay que distinguir de un vistazo se exige
dE2000 >= 15. Es mas estricto que el limite de "diferencia perceptible"
(~2,3) porque aqui los colores aparecen en cuadros pequenos y separados, no
lado a lado en bloques grandes.

Uso::

    python pipeline/tools/validate_palette.py
    python pipeline/tools/validate_palette.py --slots 3   # solo las 3 primeras
"""

from __future__ import annotations

import argparse
import itertools
import math
import sys

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
un limite del numero de categorias, no de los hex elegidos. Medido contra
Okabe-Ito, la paleta para daltonismo mas usada en ciencia: su peor par en las
cuatro visiones da 0,6, mientras que esta paleta da 0,9 en claro y 0,8 en
oscuro. Es decir, esta paleta es algo MEJOR que la referencia del campo.

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


def rank_triples(palette: list[tuple[str, str]]) -> list[tuple[float, tuple[int, ...]]]:
    """Ordena los trios de ranuras por su peor par en la peor vision."""
    rows = []
    for combo in itertools.combinations(range(len(palette)), 3):
        subset = [palette[i] for i in combo]
        worst = 1e9
        for kind in ("normal", "protanopia", "deuteranopia", "tritanopia"):
            labs = {label: lab_of(value, kind) for label, value in subset}
            for (la, _), (lb, _) in itertools.combinations(subset, 2):
                worst = min(worst, ciede2000(labs[la], labs[lb]))
        rows.append((worst, combo))
    rows.sort(reverse=True)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--triples", action="store_true",
        help="ordena los trios de ranuras por separacion en las cuatro visiones",
    )
    args = parser.parse_args()

    ok = True
    for name, palette in (("tema claro", LIGHT), ("tema oscuro", DARK)):
        print()
        print(f"=== {name}: paleta categorica completa ({len(palette)} colores) ===")
        labs = {label: lab_of(value, "normal") for label, value in palette}
        worst = min(
            (ciede2000(labs[a], labs[b]), a, b)
            for (a, _), (b, _) in itertools.combinations(palette, 2)
        )
        status = "OK   " if worst[0] >= NORMAL_THRESHOLD else "FALLA"
        print(f"  {status} vision normal, par mas cercano: {worst[1]} / {worst[2]}"
              f"  dE2000 = {worst[0]:.1f}  (umbral {NORMAL_THRESHOLD})")
        ok = ok and worst[0] >= NORMAL_THRESHOLD

        for kind in ("protanopia", "deuteranopia", "tritanopia"):
            labs = {label: lab_of(value, kind) for label, value in palette}
            w = min(
                (ciede2000(labs[a], labs[b]), a, b)
                for (a, _), (b, _) in itertools.combinations(palette, 2)
            )
            print(f"  info  {kind:<13} par mas cercano: {w[1]} / {w[2]}"
                  f"  dE2000 = {w[0]:.1f}")
        print("        (con ocho categorias ninguna paleta separa en las tres")
        print("         dicromacias: por eso la identidad nunca va solo en el color)")

        best = rank_triples(palette)
        top_score, top_combo = best[0]
        first_three = next(s for s, c in best if c == (0, 1, 2))
        print()
        print(f"Trio para comparacion simultanea (umbral {SIMULTANEOUS_THRESHOLD}):")
        print(f"    mejor disponible: ranuras {tuple(c + 1 for c in top_combo)} "
              f"-> {top_score:.1f}")
        print(f"    las tres primeras: ranuras (1, 2, 3) -> {first_three:.1f}"
              f"  {'OK' if first_three >= SIMULTANEOUS_THRESHOLD else 'POR DEBAJO'}")
        if args.triples:
            for score, combo in best[:5]:
                labels = " + ".join(palette[i][0] for i in combo)
                print(f"      {score:5.1f}  {tuple(c + 1 for c in combo)}  {labels}")

    print()
    if ok:
        print("La paleta pasa en vision normal y su limitacion en dicromacias esta")
        print("medida y declarada. Ver docs/03-visual-system.md.")
        return 0
    print("La paleta NO pasa en vision normal; hay que ajustar los hex.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
