"""Cuantizacion de senal genomica a int16 y su formato binario.

Por que int16 y no float32
--------------------------
Una prediccion de AlphaGenome sobre 1 Mb a resolucion de 1 pb son 1 048 576
valores por track (2^20, verificado contra
``dna_client.SUPPORTED_SEQUENCE_LENGTHS``). En float32 eso son 4 MiB por track.
El presupuesto de bytes se resuelve por tres vias combinadas, y la cuantizacion
es solo una de ellas:

1. **Binning** en la vista general (128 pb por bin) y ventana estrecha en la de
   detalle. Reduce 1 048 576 -> 8 192 valores por track y resolucion.
2. **Cuantizacion** a int16 con factor de escala por arreglo: 2 bytes por valor
   contra los 4 de float32, y contra los 5-8 de un numero en JSON de texto.
3. **Almacenar REF y DELTA**, no REF y ALT. El delta es casi todo ceros fuera de
   la vecindad de la variante, asi que se comprime mucho mejor con el gzip del
   servidor. La web reconstruye ALT = REF + DELTA.

El error de cuantizacion tiene que ser irrelevante frente al grosor de la linea
en pantalla, y eso se verifica en ``tests/test_quantize.py``, no se afirma aqui.
"""

from __future__ import annotations

import dataclasses
import json
import struct
from typing import Literal

import numpy as np

MAGIC = b"AGSB"
"""AlphaGenome Signal Block. Permite identificar el archivo sin el indice."""

FORMAT_VERSION = 1
INT16_MAX = 32767
INT16_MIN = -32768
_HEADER_ALIGN = 8
_PREFIX_BYTES = 12
"""magic(4) + version/relleno(4) + longitud de cabecera(4)."""

Transform = Literal["linear", "log1p"]


@dataclasses.dataclass(frozen=True)
class QuantizedArray:
    """Un arreglo cuantizado junto con lo necesario para deshacerlo.

    Attributes:
      values: Enteros int16 ya escalados y recortados.
      scale: Factor tal que ``valor_aprox = values * scale`` en el espacio
        transformado.
      transform: Transformacion aplicada antes de escalar.
      max_abs_error: Error absoluto maximo medido contra el arreglo original, en
        el espacio ORIGINAL, no en el transformado. Se mide, no se estima.
    """

    values: np.ndarray
    scale: float
    transform: Transform
    max_abs_error: float

    def to_header(self) -> dict[str, object]:
        """Devuelve la porcion de cabecera que describe este arreglo."""
        return {
            "scale": self.scale,
            "transform": self.transform,
            "maxAbsError": self.max_abs_error,
        }


def _apply(x: np.ndarray, transform: Transform) -> np.ndarray:
    """Aplica la transformacion directa, conservando el signo en log1p."""
    if transform == "linear":
        return x
    return np.sign(x) * np.log1p(np.abs(x))


def _unapply(y: np.ndarray, transform: Transform) -> np.ndarray:
    """Aplica la transformacion inversa."""
    if transform == "linear":
        return y
    return np.sign(y) * np.expm1(np.abs(y))


def quantize(x: np.ndarray, transform: Transform = "linear") -> QuantizedArray:
    """Cuantiza un arreglo de float a int16 con escala por arreglo.

    La escala se fija con el maximo absoluto del arreglo, de modo que el error
    relativo al rango completo queda acotado por 1/65534. Se usa escala por
    arreglo y no global porque cada track tiene su propia dinamica.

    Args:
      x: Arreglo de entrada, cualquier forma. Se aplana a 1D en orden de C.
      transform: Transformacion previa a la escala.

    Returns:
      El QuantizedArray correspondiente, con el error ya medido.

    Raises:
      ValueError: Si la senal trae NaN o infinitos.
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    if not np.all(np.isfinite(x)):
        raise ValueError(
            "La senal contiene NaN o infinitos; el pipeline debe limpiarlos "
            "antes de cuantizar, no la cuantizacion enmascararlos."
        )

    y = _apply(x, transform)
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    # Un arreglo todo-ceros es legitimo: un delta sin efecto. Escala 1 evita la
    # division por cero y decodifica exactamente a ceros.
    scale = peak / INT16_MAX if peak > 0 else 1.0

    q = np.clip(np.rint(y / scale), INT16_MIN, INT16_MAX).astype(np.int16)
    reconstructed = _unapply(q.astype(np.float64) * scale, transform)
    max_abs_error = float(np.max(np.abs(reconstructed - x))) if x.size else 0.0

    return QuantizedArray(
        values=q, scale=scale, transform=transform, max_abs_error=max_abs_error
    )


def dequantize(values: np.ndarray, scale: float, transform: Transform) -> np.ndarray:
    """Deshace quantize. Es la referencia contra la que se prueba el decodificador JS."""
    return _unapply(np.asarray(values, dtype=np.float64) * scale, transform)


def choose_transform(x: np.ndarray) -> Transform:
    """Elige transformacion midiendo, no adivinando.

    Devuelve log1p solo si reduce el error maximo a menos de la mitad. La senal
    genomica es de cola pesada, pero un delta REF/ALT centrado en cero no
    siempre lo es, asi que la decision se toma por arreglo.
    """
    lin = quantize(x, "linear")
    log = quantize(x, "log1p")
    return "log1p" if log.max_abs_error < lin.max_abs_error * 0.5 else "linear"


def pack_block(header: dict[str, object], arrays: list[np.ndarray]) -> bytes:
    """Serializa un bloque de senal autodescriptivo.

    Disposicion del archivo::

        [0:4]    magic b"AGSB"
        [4:6]    version uint16 little-endian
        [6:8]    relleno
        [8:12]   longitud de la cabecera JSON, uint32 little-endian
        [12:..]  cabecera JSON en utf-8, rellenada a multiplo de 8
        [..:]    carga util int16 little-endian, arreglos concatenados en orden

    El relleno a 8 bytes garantiza que la carga util quede alineada, que es lo
    que necesita ``new Int16Array(buffer, offset)`` en el navegador: sin eso
    lanza RangeError.

    Args:
      header: Cabecera serializable a JSON. Se le agregan magic y formatVersion
        para que el archivo se pueda identificar sin el indice.
      arrays: Arreglos int16 ya cuantizados, en el orden que declara la cabecera.

    Returns:
      Los bytes del bloque completo.
    """
    full_header = {
        "magic": MAGIC.decode(),
        "formatVersion": FORMAT_VERSION,
        **header,
    }
    raw = json.dumps(full_header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    # El relleno se calcula sobre el offset ABSOLUTO de la carga util, no sobre
    # la longitud de la cabecera: el prefijo mide 12 bytes, asi que rellenar la
    # cabecera a multiplo de 8 dejaria la carga en 12+8k, que es 4 modulo 8.
    pad = (-(_PREFIX_BYTES + len(raw))) % _HEADER_ALIGN
    raw_padded = raw + b" " * pad

    payload = b"".join(np.ascontiguousarray(a, dtype="<i2").tobytes() for a in arrays)
    return (
        MAGIC
        + struct.pack("<HH", FORMAT_VERSION, 0)
        + struct.pack("<I", len(raw_padded))
        + raw_padded
        + payload
    )


def unpack_block(blob: bytes) -> tuple[dict[str, object], np.ndarray]:
    """Inverso de pack_block. Existe para que los tests cierren el ciclo."""
    if blob[:4] != MAGIC:
        raise ValueError(f"No es un bloque AGSB: magic={blob[:4]!r}")
    version, _ = struct.unpack("<HH", blob[4:8])
    if version != FORMAT_VERSION:
        raise ValueError(f"Version de formato no soportada: {version}")
    (header_len,) = struct.unpack("<I", blob[8:12])
    start = _PREFIX_BYTES + header_len
    header = json.loads(blob[_PREFIX_BYTES:start].decode("utf-8"))
    payload = np.frombuffer(blob[start:], dtype="<i2")
    return header, payload


def payload_offset(blob: bytes) -> int:
    """Byte donde empieza la carga util. Sirve para verificar la alineacion."""
    (header_len,) = struct.unpack("<I", blob[8:12])
    return _PREFIX_BYTES + header_len


def bin_signal(x: np.ndarray, bin_size: int, how: str = "mean") -> np.ndarray:
    """Agrega una senal a bins de bin_size pares de bases.

    Usa ``mean`` para senal de cobertura y ``max`` cuando lo que importa es no
    perder un pico estrecho al alejar el zoom: un sitio de splicing de 2 pb
    desaparece con la media en bins de 128 pb, y esa desaparicion seria un error
    de lectura del grafico, no una simplificacion legitima.

    Args:
      x: Senal a resolucion de 1 pb.
      bin_size: Ancho del bin en pares de bases.
      how: ``mean`` o ``max``.

    Returns:
      La senal agregada.

    Raises:
      ValueError: Si la longitud no es multiplo del bin o la agregacion no existe.
    """
    x = np.asarray(x, dtype=np.float64)
    if bin_size <= 1:
        return x
    if x.size % bin_size:
        raise ValueError(
            f"La longitud {x.size} no es multiplo del bin {bin_size}; el "
            "pipeline debe pedir intervalos de longitud potencia de dos."
        )
    reshaped = x.reshape(-1, bin_size)
    if how == "mean":
        return reshaped.mean(axis=1)
    if how == "max":
        # Maximo por magnitud conservando el signo, para que un delta negativo
        # fuerte no se pierda frente a uno positivo debil del mismo bin.
        idx = np.argmax(np.abs(reshaped), axis=1)
        return reshaped[np.arange(reshaped.shape[0]), idx]
    raise ValueError(f"Agregacion desconocida: {how}")
