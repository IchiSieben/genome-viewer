"""Configuracion de los loci que el pipeline congela.

Las coordenadas son GRCh38 y las variantes se dan como ``chr:pos:ref>alt``, que
es el unico formato que acepta el Atlas: **no admite rsIDs**.

Aviso sobre rs884510. Los documentos de contexto lo dan como
``chr12:54578515:T>C``. El servidor rechaza esa variante con
"reference base does not match the expected reference base: C". La base de
referencia real en esa posicion es **C**, y los alelos alternativos que el Atlas
conoce son A, G y T. La correccion esta aplicada aqui.
"""

from __future__ import annotations

import dataclasses


@dataclasses.dataclass(frozen=True)
class VariantSpec:
    """Una variante a congelar."""

    position: int
    ref: str
    alt: str
    rsid: str | None = None
    note: str | None = None

    @property
    def key(self) -> str:
        """Formato del Atlas: ``chr:pos:ref>alt``."""
        return f"{self.position}:{self.ref}>{self.alt}"


@dataclasses.dataclass(frozen=True)
class LocusConfig:
    """Un locus, su ventana y sus variantes destacadas.

    Attributes:
      id: Identificador para rutas, en minusculas y con guiones.
      label: Nombre visible.
      chromosome: Con prefijo ``chr``.
      center: Posicion 1-based sobre la que se centra la ventana de 2^20 pb.
      genes: Genes destacados, solo para la ficha del locus.
      variants: Variantes a congelar. La primera es la que ancla la ventana de
        detalle a 1 pb.
      why: Por que este locus esta en el catalogo.
    """

    id: str
    label: str
    chromosome: str
    center: int
    genes: tuple[str, ...]
    variants: tuple[VariantSpec, ...]
    why: str = ""


LOCI: tuple[LocusConfig, ...] = (
    LocusConfig(
        id="ppp1r1a-pde1b",
        label="PPP1R1A / PDE1B",
        chromosome="chr12",
        center=54578515,
        genes=("PPP1R1A", "PDE1B"),
        why=(
            "Locus compacto con variantes de expresion publicadas y el locus "
            "del estudio poblacional planificado."
        ),
        variants=(
            VariantSpec(
                54578515, "C", "T", "rs884510",
                note="La referencia real es C; los documentos daban T>C.",
            ),
            VariantSpec(54578515, "C", "A", None),
            VariantSpec(54578515, "C", "G", None),
        ),
    ),
    LocusConfig(
        id="rasgef1b",
        label="RASGEF1B",
        chromosome="chr4",
        center=81735000,
        genes=("RASGEF1B",),
        why="Gen largo (~600 kb). Estresa el presupuesto de bytes.",
        variants=(VariantSpec(81735000, "", "", None),),
    ),
    LocusConfig(
        id="rpl13a",
        label="RPL13A",
        chromosome="chr19",
        center=49487608,
        genes=("RPL13A",),
        why="Housekeeping compacto. Control negativo y contraste.",
        variants=(VariantSpec(49487608, "", "", None),),
    ),
)
"""Catalogo de loci.

Las variantes con ``ref``/``alt`` vacios se resuelven consultando al Atlas cual
existe realmente en esa posicion: es la forma segura de no volver a inventar una
base de referencia.
"""
