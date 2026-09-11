"""Tests de cuantizacion, error y formato binario.

La pregunta que estos tests contestan no es "el error es pequeno", sino
"el error es invisible en pantalla". Un error de 0,3 % da igual si la linea
tiene 1,5 px de grosor y el grafico 400 px de alto; lo que importa es el error
convertido a pixeles.
"""

from __future__ import annotations

import numpy as np
import pytest

from alphagenome_platform import quantize

ALTURA_GRAFICO_PX = 400
"""Alto tipico del panel de senal. El error se juzga contra esto."""

TOLERANCIA_PX = 0.05
"""Medio pixel seria visible; una vigesima de pixel no lo es en ningun monitor."""


def _senal_realista(seed: int, n: int = 8192) -> np.ndarray:
    """Cola pesada, fondo bajo y picos estrechos: lo que estresa la cuantizacion."""
    rng = np.random.default_rng(seed)
    x = np.abs(rng.normal(0, 0.08, n))
    grid = np.arange(n)
    for _ in range(12):
        centro = rng.integers(0, n)
        x += rng.gamma(2.0, 1.5) * np.exp(
            -0.5 * ((grid - centro) / max(2.0, rng.gamma(2.0, 5.0))) ** 2
        )
    return x


@pytest.mark.parametrize("seed", range(6))
def test_el_error_de_cuantizacion_es_invisible_en_pantalla(seed: int) -> None:
    """El criterio real: error traducido a pixeles, no a porcentaje."""
    x = _senal_realista(seed)
    q = quantize.quantize(x)
    rango = float(x.max() - x.min())
    error_px = q.max_abs_error / rango * ALTURA_GRAFICO_PX
    assert error_px < TOLERANCIA_PX, (
        f"error de {error_px:.4f} px con rango {rango:.3f}; "
        f"el tope es {TOLERANCIA_PX} px"
    )


@pytest.mark.parametrize("seed", range(6))
def test_el_error_esta_acotado_por_media_escala(seed: int) -> None:
    """Cota teorica de un redondeo al entero mas cercano, verificada."""
    x = _senal_realista(seed)
    q = quantize.quantize(x)
    assert q.max_abs_error <= q.scale / 2 + 1e-9


def test_un_arreglo_de_ceros_no_divide_por_cero() -> None:
    """Un delta sin efecto es legitimo y frecuente: no puede reventar."""
    q = quantize.quantize(np.zeros(1024))
    assert q.scale == 1.0
    assert q.max_abs_error == 0.0
    assert np.all(quantize.dequantize(q.values, q.scale, q.transform) == 0.0)


def test_nan_e_infinito_se_rechazan_en_vez_de_enmascararse() -> None:
    """Cuantizar un NaN lo convertiria en un numero plausible. Peor que fallar."""
    for malo in (np.nan, np.inf, -np.inf):
        x = np.ones(16)
        x[3] = malo
        with pytest.raises(ValueError, match="NaN o infinitos"):
            quantize.quantize(x)


def test_el_ciclo_de_serializacion_es_exacto() -> None:
    """Los enteros tienen que sobrevivir el viaje completo sin perder un bit."""
    arrays = [quantize.quantize(_senal_realista(s)).values for s in range(3)]
    blob = quantize.pack_block({"tracks": ["a", "b", "c"]}, arrays)
    header, payload = quantize.unpack_block(blob)
    assert header["magic"] == "AGSB"
    assert header["formatVersion"] == quantize.FORMAT_VERSION
    assert np.array_equal(payload, np.concatenate(arrays))


@pytest.mark.parametrize("n_tracks", range(1, 13))
def test_la_carga_util_queda_alineada_a_8_bytes(n_tracks: int) -> None:
    """Sin alineacion, ``new Int16Array(buffer, offset)`` lanza RangeError.

    Se prueba con cabeceras de muchos tamanos distintos porque el relleno
    depende de la longitud del JSON, que cambia con el numero de tracks.
    """
    arrays = [quantize.quantize(_senal_realista(0, 128)).values] * n_tracks
    blob = quantize.pack_block(
        {"tracks": [f"track-{i}" for i in range(n_tracks)]}, arrays
    )
    offset = quantize.payload_offset(blob)
    assert offset % 8 == 0, f"offset {offset} no alineado con {n_tracks} tracks"


def test_un_bloque_corrupto_se_detecta() -> None:
    """El magic existe para que un archivo truncado no se lea como senal."""
    with pytest.raises(ValueError, match="No es un bloque AGSB"):
        quantize.unpack_block(b"XXXX" + b"\x00" * 32)


def test_binning_por_media_conserva_la_media() -> None:
    x = _senal_realista(1)
    binned = quantize.bin_signal(x, 128, "mean")
    assert binned.size == x.size // 128
    assert abs(binned.mean() - x.mean()) < 1e-9


def test_binning_por_maximo_conserva_el_pico() -> None:
    """Un sitio de splicing de 2 pb no puede desaparecer al alejar el zoom."""
    x = np.zeros(1024)
    x[500] = 9.0
    assert quantize.bin_signal(x, 128, "mean").max() == pytest.approx(9.0 / 128)
    assert quantize.bin_signal(x, 128, "max").max() == pytest.approx(9.0)


def test_binning_por_maximo_conserva_el_signo() -> None:
    """Un delta negativo fuerte no puede perder frente a un positivo debil."""
    x = np.zeros(256)
    x[10] = -5.0
    x[20] = 1.0
    assert quantize.bin_signal(x, 256, "max")[0] == pytest.approx(-5.0)


def test_binning_rechaza_longitudes_que_no_dividen() -> None:
    """Un bin parcial al final desplazaria todas las coordenadas del eje."""
    with pytest.raises(ValueError, match="no es multiplo"):
        quantize.bin_signal(np.zeros(1000), 128)


def test_la_eleccion_de_transformacion_se_mide() -> None:
    """``choose_transform`` no puede elegir algo peor que lo lineal."""
    for seed in range(4):
        x = _senal_realista(seed)
        elegida = quantize.choose_transform(x)
        assert (
            quantize.quantize(x, elegida).max_abs_error
            <= quantize.quantize(x, "linear").max_abs_error
        )
