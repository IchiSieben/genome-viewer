"""Configuracion de los loci que el pipeline congela.

Las coordenadas son GRCh38 y las variantes se dan como ``chr:pos:ref>alt``, que
es el unico formato que acepta el Atlas: **no admite rsIDs**.

Aviso sobre rs884510: la variante correcta es ``chr12:54578515:C>T``.

Los documentos de contexto la daban como ``T>C``, al reves. El servidor rechaza
esa forma con "reference base does not match the expected reference base: C".
Los alelos alternativos que el Atlas conoce en esa posicion son A, G y T.

Verificado tambien contra la fuente primaria. Zhu et al. 2026, *Genome Biol
Evol* 18(8), PMID 42402195, doi 10.1093/gbe/evag164, tabla 2: para rs884510 en
12:54578515 el alelo **derivado es C** y el **ancestral es T** (DAF en peruanos
0,25 frente a 0,42 en AMR). Es decir, la referencia GRCh38 lleva el alelo
derivado, que es lo que confunde: ``C>T`` describe el paso de vuelta al
ancestral. Y es el ancestral el que el paper asocia con el efecto: "the
ancestral Peruvian allele (T) was associated with a 1.39 standard deviation
decrease in [Hb]".

Dos matices del mismo paper, para no sobre-leer el dato: rs884510 mapea al
3' UTR de PDE1B y **no** resulta ser eQTL de PDE1B ni de PPP1R1A en ningun
tejido; los eQTLs son otros (rs10876566, rs7954532, rs2669406). Y la asociacion
con [Hb] es del test por gen tras correccion FDR, no del test por SNP, que no
sobrevive la correccion multiple.
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
    sashimi_finding: str | None = None
    """Hallazgo redactado a mano que acompana al sashimi de esta variante.

    Lleva la AFIRMACION, nunca las cifras: la vista pinta los numeros desde
    las uniones del propio artefacto. Prosa con numeros congelados dentro es
    prosa que miente en cuanto alguien regenera el artefacto.
    """

    contacts_ontology: str | None = None
    """Termino de ontologia para el diff de mapas de contacto (V5).

    Declarado aparte del de splicing y por la misma razon (D11): el menu de
    CONTACT_MAPS no se parece al de las senales ni al de las uniones. Sus 28
    tracks son TODOS de 4D Nucleome y TODOS lineas celulares -cero tejido
    primario, cero neuronal-, asi que el biosample correcto aqui casi nunca es
    el mismo que el de las otras modalidades de la misma variante.
    """

    contacts_finding: str | None = None
    """Hallazgo redactado que acompana al diff de contactos. Misma regla que
    `sashimi_finding`: lleva la afirmacion, nunca las cifras."""

    sashimi_ontology: str | None = None
    """Termino de ontologia (curie, p.ej. ``CL:0000679``) para V4.

    Declarado por variante, no compartido: pedir SPLICE_JUNCTIONS con los
    biosamples por defecto del locus (``ONTOLOGY_TERMS`` en build_locus.py:
    sangre, pulmon, higado) dibujaria un tejido donde muchas variantes no
    hacen nada. ``None`` significa que esta variante no tiene sashimi
    congelado: no es lo mismo que "sin uniones" (eso es ``status: "no_data"``
    dentro del artefacto), es "no se pidio".
    """

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
                note=(
                    "Referencia GRCh38 = C (alelo derivado); T es el ancestral. "
                    "Los documentos de contexto daban T>C. El ancestral T es el "
                    "asociado a -1,39 SD de [Hb] en Zhu et al. 2026 "
                    "(PMID 42402195), tabla 2."
                ),
            ),
            VariantSpec(54578515, "C", "A", None),
            VariantSpec(54578515, "C", "G", None),
        ),
    ),
    LocusConfig(
        id="apoa1",
        label="APOA1",
        chromosome="chr11",
        center=116837649,
        genes=("APOA1",),
        why=(
            "Candidata de una captura del Atlas de DeepMind: rompe un motivo "
            "de tipo TATA en corazon. Posicion y alelo verificados contra el "
            "servidor (coinciden exactamente); la anotacion de motivo/tejido "
            "es la que trae la captura, no algo que este pipeline compruebe."
        ),
        variants=(
            VariantSpec(
                116837649, "T", "G", None,
                note="Rompe motivo tipo TATA, corazon (anotacion de la captura).",
            ),
        ),
    ),
    LocusConfig(
        id="dnm1",
        label="DNM1",
        chromosome="chr9",
        center=128226027,
        genes=("DNM1",),
        why=(
            "Candidata de una captura del Atlas de DeepMind: efecto de "
            "splicing en neuronas glutamatergicas. Caso de demostracion de V4 "
            "(sashimi). Posicion y alelo verificados contra el servidor."
        ),
        variants=(
            VariantSpec(
                128226027, "G", "A", None,
                note="Splicing, neuronas glutamatergicas (anotacion de la captura).",
                sashimi_ontology="CL:0000679",
                sashimi_finding=(
                    "Los dos donadores de rio arriba abandonan el mismo sitio "
                    "aceptor y se mudan al de al lado, seis bases rio arriba. El "
                    "aceptor que sostenia casi todo el empalme en REF queda "
                    "practicamente en cero en ALT, y el vecino pasa de residual "
                    "a dominante. No son dos efectos sueltos que coinciden: es "
                    "un intercambio reciproco, y las cuatro uniones implicadas "
                    "son exactamente las que tocan la posicion de la variante. "
                    "Salio de ordenar las uniones de este artefacto por "
                    "|ALT - REF|; no de buscar un caso ya conocido. Con el "
                    "orden por magnitud estas cuatro no aparecian por ninguna "
                    "parte: los arcos mas gruesos de la ventana son "
                    "constitutivos y casi no se mueven entre REF y ALT."
                ),
            ),
        ),
    ),
    LocusConfig(
        id="wnt7b",
        label="WNT7B",
        chromosome="chr22",
        center=45969257,
        genes=("WNT7B",),
        why=(
            "Candidata de una captura del Atlas de DeepMind: rompe motivo "
            "JUN/FOS. Posicion y alelo verificados contra el servidor."
        ),
        variants=(
            VariantSpec(
                45969257, "G", "A", None,
                note="Rompe motivo JUN/FOS (anotacion de la captura).",
            ),
        ),
    ),
    LocusConfig(
        id="celsr2-psrc1",
        label="CELSR2 / PSRC1",
        chromosome="chr1",
        center=109274968,
        genes=("CELSR2", "PSRC1"),
        why=(
            "Candidata de una captura del Atlas de DeepMind: crea un motivo "
            "CEBP, efecto inverso al de romper uno. Posicion y alelo "
            "verificados contra el servidor."
        ),
        variants=(
            VariantSpec(
                109274968, "G", "T", "rs12740374",
                note=(
                    "Crea motivo CEBP, efecto inverso (anotacion de la captura). "
                    "Verificado contra UCSC dbSnp155: rs12740374, la variante de "
                    "Musunuru et al. 2010 que crea el sitio C/EBP en SORT1/CELSR2."
                ),
                contacts_ontology="EFO:0001187",
                contacts_finding=(
                    "La estructura tridimensional del locus no se mueve. El "
                    "cambio mayor de toda la ventana es una perdida minima de "
                    "un contacto de largo alcance que si parte del propio bin "
                    "de la variante, pero su tamano es una fraccion minuscula "
                    "del relieve que tiene el mapa de fondo: el color casi no "
                    "se despega del cero, y no porque se le haya puesto una "
                    "escala generosa, sino porque el dominio es fijo y esta "
                    "anclado a lo que costaria reorganizar un dominio "
                    "topologico. A esta resolucion un solo cambio de base rara "
                    "vez reordena el plegado, y el modelo predice que esta "
                    "tampoco lo hace. El mecanismo publicado de esta variante "
                    "es de union de un factor de transcripcion, no de "
                    "arquitectura, asi que una modalidad callada aqui es "
                    "coherente, no un fallo. Es el mismo patron que ya aparece "
                    "en el catalogo cuando a una variante se le pide la "
                    "modalidad que no le toca."
                ),
            ),
        ),
    ),
    LocusConfig(
        id="btk",
        label="BTK",
        chromosome="chrX",
        center=101386224,
        genes=("BTK",),
        why=(
            "Candidata de una captura del Atlas de DeepMind: reduce la union "
            "de SPI1 en el promotor. Posicion y alelo verificados contra el "
            "servidor."
        ),
        variants=(
            VariantSpec(
                101386224, "T", "C", None,
                note="Reduce union de SPI1 en promotor (anotacion de la captura).",
            ),
        ),
    ),
    LocusConfig(
        id="nags",
        label="NAGS",
        chromosome="chr17",
        center=44001600,
        genes=("NAGS",),
        why=(
            "Candidata de una captura del Atlas de DeepMind: rompe motivo "
            "HNF1. Posicion y alelo verificados contra el servidor."
        ),
        variants=(
            VariantSpec(
                44001600, "C", "A", None,
                note="Rompe motivo HNF1 (anotacion de la captura).",
            ),
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
