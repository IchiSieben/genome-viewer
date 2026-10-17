# Propuesta de identidad: Visor del genoma (fase B)

> **Estado: propuesta.** Nada de esto está en producción ni en `main`. Vive en la rama
> `fase-b-identidad` y espera tu aprobación o tus cambios.

**Lo memorable, en una frase:** la doble hélice real, átomo por átomo, ocupa media pantalla y gira
sola. Cada letra A, C, G y T tiene su color, y ese mismo color vuelve en la leyenda, en la secuencia
y en la variante del visor.

## Cómo verlo

- **Mockup funcional:** `evidence/identidad/mockup/`, servido con cualquier servidor estático.
  - Por ejemplo: `python -m http.server 8123 --directory evidence/identidad/mockup`.
  - Capítulo 1: `es/capitulo-1.html` y `en/chapter-1.html`.
  - Portada del visor: `es/visor.html` y `en/viewer.html`.
- **Capturas** a 390 y 1440 px, en ES y EN, de pantalla y de página completa:
  `evidence/identidad/capturas/`.
- **Regenerar el mockup:** `node evidence/identidad/mockup/build.mjs <raíz del repo>`.
  - Todos los textos y cifras se leen del repo: `chapters.*.json`, `stage.*.json`, la ficha de
    APOA1, el índice de estructuras, `coding-fraction.json` y `dna-rise.json`.
  - No se reescribió ninguna frase.
  - Hace falta `web/public/data`, que viene de Drive.

## B1 · Referencias

Las capturas están en `evidence/identidad/referencias/`. Esa carpeta no está en git: son páginas
de terceros.

| Referencia | Evidencia de que es celebrada | Qué tomamos | Qué no |
|---|---|---|---|
| **The Pudding** (base) · [pudding.cool](https://pudding.cool/) | [Oro, Outstanding Studio, Information is Beautiful Awards 2024](https://informationisbeautifulawards.com/news/680-announcing-the-2024-winners) | Un sistema de tokens con colores planos que significan algo. La cifra enorme dentro de la frase. Una acción antes de la explicación. | Sus fuentes de pago, su fondo blanco y la variedad de estilos de un estudio |
| **Mechanical Watch** (Bartosz Ciechanowski) · [ciechanow.ski](https://ciechanow.ski/mechanical-watch/) | [r/InternetIsBeautiful, 2022: 3594 puntos según un archivo de Reddit](https://www.reddit.com/comments/un9rhz) | La palabra del texto tiene el color de la pieza que nombra. Una idea por figura. Un objeto que el lector mueve. | Su estética silenciosa y su longitud |
| **Learn.Genetics, Cell Size and Scale** (Univ. de Utah) · [learn.genetics.utah.edu](https://learn.genetics.utah.edu/content/cells/scale/) | [Los sitios del centro ganaron el premio SPORE de *Science*](https://healthcare.utah.edu/press-releases/2010/01/genetically-superior-web-sites-learning-center-wins-science-award) | La escala como contenido: comparaciones que llenan el espacio vacío. | Su estética de libro de texto de 2010 |

**Sobre Refero (styles.refero.design).** El barrido encontró una sola entrada de biología:
Integrated Biosciences («bioluminescent laboratory at midnight»). Su paleta encaja (tinta oscura,
un solo acento, mono para etiquetas), pero no tiene premios ni popularidad que se puedan
verificar. Se tomó como idea de paleta, no como referencia.

**Por qué The Pudding es la base:**

1. Es la única de las tres con identidad propia reconocible: color plano saturado con significado
   y tipografía con carácter.
2. Resuelve justo tu problema: salir del Inter fino y del serif crema sin perder legibilidad ni
   rigor.
3. Su patrón de cifra grande dentro de la frase encaja con «3.000 millones de letras» y
   «2 m de ADN» como protagonistas.
4. Pone una acción antes de la explicación. Eso sirve a una molécula que se gira y se toca antes
   de leer.
5. Su premio está verificado (Oro, IIB 2024) y deja espacio para injertar el color con significado
   de Ciechanowski y la regla de escala de Utah.

## B3 · Tipografía

Las tres son OFL y autoalojadas. En el subconjunto latino pesan 41 KB (Bricolage), 34 KB (Next) y 18 KB (Mono).

- **Titulares y cifras: Bricolage Grotesque, peso 800.**
  - Es una grotesca con tensión, compacta en el peso alto.
  - No es Inter 300 y no es el serif crema con terracota.
- **Texto: Atkinson Hyperlegible Next.**
  - Está diseñada para baja visión: cada letra se distingue de sus parecidas (l/I/1, O/0).
  - Eso importa en un sitio que también leen niños.
- **Secuencias, referencias y procedencia: Atkinson Hyperlegible Mono.**
  - Es la misma familia que el texto, así que el cambio de registro no rompe el sistema.

Datos a tener en cuenta:

- Ninguna de las tres trae superíndices Unicode (⁹, ¹³), ni en el subconjunto latino ni en el extendido. El mockup los convierte en `<sup>`.
  Producción tendría que hacer lo mismo.
- La medida del texto es de 34 rem, unos 66 caracteres.
- Las cifras ocupan lo que les dé su panel (consultas de contenedor): «3.055.000.000» llena el
  ancho sin desbordar en 390 px.

## B3 · Color

Medido con la fórmula de contraste WCAG. «Panel» es la superficie elevada, `#161b23`.

| Token | Valor | Sobre el fondo `#0f1218` | Sobre el panel | Uso |
|---|---|---|---|---|
| tinta | `#eef1f5` | 16,5:1 | 15,3:1 | texto |
| tinta 2 | `#b9c1cc` | 10,3:1 | 9,5:1 | texto secundario |
| tinta 3 | `#8a93a1` | 6,0:1 | 5,6:1 | lo más tenue: fuentes y procedencia |
| A, adenina | `#009e73` | 5,5:1 | 5,1:1 | solo glifos y muestras |
| C, citosina | `#56b4e9` | 8,1:1 | 7,5:1 | ídem |
| G, guanina | `#f0e442` | 14,2:1 | 13,1:1 | ídem; también el único acento (foco, marcas) |
| T, timina | `#d55e00` | 4,8:1 | 4,5:1 | ídem |
| esqueleto del ADN | `#737c8c` | 4,5:1 | 4,1:1 | más oscuro que las bases, para que se vean las letras |

- **Paleta de las bases: Okabe-Ito, sin modificar.** Se distingue con las deficiencias de visión
  del color más comunes.
- **Fondo:** tinta azul-negra, no negro puro. El negro puro aplastaba el sombreado de profundidad
  de los átomos.
- **Proteínas:** se colorean por cadena con ocho tonos desaturados, para que ninguna cadena se lea
  como una base.

## B2 · La molécula

- **Todos los átomos.** Se dibujan todos los átomos pesados de la entrada PDB como esferas.
  - Técnica: impostores, un cuadrado por átomo; el sombreador calcula la esfera y su profundidad
    real.
  - Ya no es una nube de puntos.
  - El extractor es `tools/atoms.py` (gemmi).
  - Átomos por estructura: 1BNA 486, 1KX5 13 625, 5FLM 32 712, 4UG0 218 776.
- **Color con significado:**
  - Átomos de base: A, C, G, T o U.
  - Esqueleto de azúcar y fosfato del ADN o del ARN.
  - Proteína: por cadena.
  - El resto: gris.
- **Leyenda.** Dice qué es cada color y muestra la secuencia real de 1BNA (CGCGAATTCGCG, leída del
  mmCIF), coloreada. Debajo va la procedencia: PDB, método, resolución, número de átomos y autor.
- **Tamaño y posición.**
  - En escritorio llena la mitad derecha, de pie, y gira sobre su propio eje.
  - En el móvil ocupa el 58 % superior de la pantalla.
  - Entra con intención: los átomos llegan desde fuera, ordenados del centro hacia afuera, en
    1,6 s. Con `prefers-reduced-motion` aparece quieta y completa.
- **Movimiento.** Usa la física de la fase A: giro lento, arrastre con inercia y dt acotado.

### ¿Aguanta un teléfono? Medido, no supuesto

- **Medición en GPU real:** carril `atoms` de la Mac (`tools/mac/atoms.sh` →
  `web/scripts/bench-atoms.mjs`). Resultado en `evidence/identidad/atoms-bench.json`.
- **SwiftShader** (rasterizador por CPU de esta máquina; no representa ningún dispositivo), 390 px
  a DPR 2, mediana por fotograma:

  | Estructura | Mediana por fotograma |
  |---|---|
  | 1BNA | 36 ms |
  | 1KX5 | 152 ms |
  | 5FLM | 354 ms |
  | 4UG0 | 1760 ms |

- **GPU real** (Apple M2 Pro con Metal, carril `atoms`, 2026-10-17, commit `661310f`). Son
  milisegundos por fotograma, esperando a la GPU, en 90 fotogramas:

  | Estructura | Átomos | Teléfono 390 px, DPR 3: mediana / p90 | Escritorio 1440 px, DPR 2: mediana / p90 |
  |---|---|---|---|
  | 1BNA | 486 | 1,4 / 1,7 ms | 2,3 / 3,9 ms |
  | 1KX5 | 13 625 | 2,4 / 2,9 ms | 2,1 / 2,2 ms |
  | 5FLM | 32 712 | 3,5 / 4,1 ms | 6,2 / 6,8 ms |
  | 4UG0 | 218 776 | 3,4 / 5,2 ms | 5,7 / 6,1 ms |

- **Qué dice la medición:**
  - En esta GPU todo cabe con holgura: el peor p90 es 6,8 ms, contra 16,7 ms de un fotograma a
    60 Hz.
  - 4UG0, con 218 776 átomos, cuesta casi lo mismo que 5FLM, con 32 712. Manda la cantidad de
    píxeles pintados, no el número de átomos. Por eso el escritorio, con más píxeles, va más lento.
- **Regla propuesta:**
  - Átomos completos en todas las estructuras.
  - El sitio ya mide su propio fotograma y baja el detalle si no llega (fase A). Con átomos, ese
    escalón sería pasar a tubos del esqueleto (un punto por residuo) en 4UG0 y 5FLM.
  - Una M2 Pro no es un teléfono: la GPU de un teléfono de gama media es varias veces más lenta.
    Probarlo en un teléfono real queda en NEEDS-OWNER #13.

### Más estructuras reales (si suman a la historia)

Ya están en el sitio:

- 1CDW: TBP unida a la caja TATA. Es un factor de transcripción sobre ADN.
- 5KKQ: CTCF sobre ADN.
- 5FLM: ARN polimerasa II transcribiendo.

Propuesta nueva, verificada en RCSB:

- **4OO8 · Cas9 de *S. pyogenes* con su ARN guía y el ADN diana**
  - Difracción de rayos X, 2,5 Å.
  - Nishimasu et al., *Cell* 2014, [10.1016/j.cell.2014.02.001](https://doi.org/10.1016/j.cell.2014.02.001).
  - Encaja al final del capítulo 7 («hay que comprobarlo en un laboratorio»): es la herramienta
    con que se edita una variante para comprobarla.
  - No se añadió al mockup. Espera tu sí.

## B4 · Un sistema para la historia y el visor

La portada del visor (`/app/`) usa el mismo fondo, la misma tipografía y los mismos colores:

- **La variante:** `chr11:116.837.649` en mono. La T y la G llevan el color de su base, de modo que
  el cambio se lee de un vistazo.
- **El PHRED:** 25,96 en cifra enorme, con la frase «en el 0,3 % más alto de todo el genoma».
  - Una regla 0–40 marca 10 %, 1 %, 0,1 % y 0,01 %, con la marca en amarillo.
  - Debajo va la fórmula.
- **La cascada SHAP:** sale del valor base y cada barra empieza donde terminó la anterior.
  - Las contribuciones positivas son barras sólidas y las negativas, contorno.
  - La línea final «score 1,27» va en amarillo.
- **Fuera:** el botón azul y los bordes estilo Bootstrap. Las etiquetas son texto mono separado
  por «·».

## Lo que falta decidir (tuyo)

1. **¿Apruebas la base?** Tipografía, color y molécula de átomos completos. ¿O pides cambios?
2. **¿Átomos completos también en el móvil?** En la GPU de la Mac caben con holgura (peor p90:
   6,8 ms). Falta verlo en un teléfono real, con tus propios ojos.
3. **¿Entra 4OO8 (Cas9)?** Es una entrada nueva en el capítulo 7.
4. Una vez aprobada la propuesta, se implementa en producción en una rama nueva, ítem por ítem,
   con sus pruebas.
