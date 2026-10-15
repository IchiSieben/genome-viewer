# 09 — El escenario

Capa narrativa del Visor del genoma / Genome Viewer (2026-10-15). Qué es, de qué
está hecha, cómo se construye y cómo se comprueba. El encargo está en
`09-PROMPT-escenario-educativo.md`; las decisiones tomadas sin consulta, en
`09-decisiones-autonomas.md` (serie E-xx). El catálogo de estructuras, con su
cita primaria, está en [10-estructuras.md](10-estructuras.md).

## Qué es

- Una página estática y narrativa en `/` (inglés, x-default) y `/es/`. Todo el
  texto está en el HTML: se lee sin JavaScript y es indexable.
- Dos registros por bloque de texto: `kid` (8 años, el predeterminado) y `phd`
  (doctorado). El botón de cada bloque cambia el registro; la elección se guarda
  en `localStorage` (clave `agp-register`) dentro de `try/catch`.
- Detrás del texto, una nube de puntos WebGL2: cada punto es un átomo pesado de
  una estructura real del PDB, en su posición medida. Cambia de molécula al hacer
  scroll o, en la portada, cada 7 s por sí sola.
- El visor pasó a `/app/` y `/es/app/`. Los enlaces antiguos `/#/...` se
  reenvían a `app/#/...` con un script mínimo en `web/stage.html`.
- Qué es medido y qué no: las posiciones y la agitación térmica (factor B) son
  mediciones del PDB. Las transiciones entre moléculas son un recurso visual, no
  un proceso biológico. No hay dinámica molecular ni campos de fuerza.
- Las predicciones del visor vienen de AlphaGenome: es la fuente de los datos,
  no el nombre del producto (invariante I7).

## Capítulos y estructura que muestran

Mapa en `CHAPTERS` de `web/scripts/build-stage.mjs`. Cada capítulo termina con un
enlace al visor, en la vista y la variante que ilustra el texto.

| Cap. | Título (es) | Estructura | Vista del visor al final |
|---:|---|---|---|
| 1 | Tres mil millones de letras, dos metros por célula con núcleo | 1BNA | inicio del visor |
| 2 | Lo poco que se traduce y todo lo demás | 4UG0 | `#/why` |
| 3 | Cómo se empaqueta el ADN | 1KX5 | `view=signal&tracks=DNASE` |
| 4 | Los interruptores | 1CDW | `view=tracks` |
| 5 | Cambia una letra | 5FLM | `view=saturation` |
| 6 | Cortar y pegar | 5XJC | `view=splice` (DNM1) |
| 7 | El genoma en 3D y los límites del modelo | 5KKQ | `view=contact` (CELSR2/PSRC1) |
| — | Viaje de escalas (interludio) | 5IRE y las anteriores | — |

Los capítulos 3 a 5 usan la variante `ppp1r1a-pde1b/chr12-54578515-C-T`.

## Viaje de escalas

Interludio de zoom continuo, log-lineal entre paradas (velocidad constante en
órdenes de magnitud). Datos en `web/src/i18n/scale.json`. El tamaño de cada
estructura sale de su propia nube (`maxExtentA` de `data/stage/index.json`); el
de 1BNA es su extensión menor, el ancho de la hélice.

| Parada | Tamaño | Fuente |
|---|---:|---|
| Doble hélice (1BNA) | 2,2 nm | coordenadas de 1BNA |
| Nucleosoma (1KX5) | 15,5 nm | coordenadas de 1KX5 |
| Ribosoma humano (4UG0) | 29,6 nm | coordenadas de 4UG0 |
| Cubierta del Zika (5IRE) | 46,9 nm | coordenadas de 5IRE |
| Bacteria E. coli | 2,47 µm de largo | Yamada 2017, PMID 28854579 |
| Núcleo de mamífero | 5–15 µm (se usa 10 µm) | Davie 2025, PMID 39820859 |
| Célula de mamífero típica | 10–20 µm (se usa 15 µm) | Nakatani 2020, PMID 32547894 |
| ADN de una célula, estirado | 2,04 m | cálculo propio, `tools/dna_rise.py` |

La última parada es aritmética del repo, no una cita: paso medido en 1BNA
(3,347 Å por par de bases, `docs/evidence/dna-rise.json`) x 2 x 3 055 000 000 pb
(T2T-CHM13, Nurk 2022). Las cifras de bacteria, núcleo y célula son enunciados
del resumen de cada artículo; `refs.json` anota que el de Nakatani es una frase
introductoria, no una medición.

## Pipeline de datos

`pipeline/src/alphagenome_platform/stage/clouds.py`. Comando:
`PYTHONPATH=pipeline/src python -m alphagenome_platform.stage.clouds --out data/stage --cache data/raw/pdb`.

1. Descarga el mmCIF de `files.rcsb.org` (caché en `data/raw/pdb/`, fuera de git).
2. gemmi lee la estructura, quita hidrógenos y agua, expande el ensamblaje
   biológico en 5IRE y clasifica cada cadena por tipo de polímero. Se eligió
   gemmi sobre biopython por velocidad con más de 200 000 átomos y por
   `make_assembly` (justificación en el docstring de `clouds.py`).
3. Submuestrea a 20 000 puntos por estructura. Con menos átomos (1BNA tiene 486
   pesados) se repiten átomos como relleno, marcados con el bit 7 de la clase.
4. Centra en el centroide y escala a radio máximo 1.
5. Ordena por código de Morton (10 bits por eje) y aplica una permutación
   aleatoria **compartida**, semilla `20261015`. El punto i de una nube
   corresponde al punto i de cualquier otra: el navegador solo interpola.
6. Escribe un `.agsc` por estructura (nombre con hash) y `index.json` con
   proveniencia: PDB, fecha de revisión, método, resolución, cita primaria,
   `configHash`, lector (`gemmi 0.7.5`) y licencia.

Formato **AGSC** v1 (hermano de AGSB, no una extensión):

| Bytes | Contenido |
|---|---|
| 0–3 | magia `AGSC` |
| 4–7 | versión, uint32 LE |
| 8–11 | longitud de la cabecera JSON, uint32 LE |
| 12–… | cabecera JSON utf-8, rellena con espacios hasta múltiplo de 8 |
| luego | N registros de 8 bytes: x, y, z `int16` · amplitud `uint8` en pasos de 0,01 Å · clase `uint8` (bit 7 = relleno) |

Posición: `round(v x 32767)` sobre la caja de radio 1. Amplitud térmica:
`u = sqrt(B / 8π²)` en Å, recortada a 2,55 Å. Clases: 0 hebra 1 de ADN, 1 hebra 2,
2 proteína, 3 ARN, 4 otro. Los registros suben a la GPU sin tocarlos.

El emparejamiento se mide (`pairing` en `index.json`): distancia media emparejada
sobre la de un emparejamiento aleatorio, 0,63–0,75 en los 8 pares.

## Renderizador

`web/src/stage/renderer.ts`: WebGL2 escrito a mano, sin librerías. El comentario
del archivo estima ~150 kB gz para Three.js; esa cifra no está medida en el repo.

- Un programa, dos buffers (origen y destino) y un uniforme `uT` del morph con
  suavizado cúbico en CPU (1700 ms por transición).
- Jitter en el vertex shader a la escala térmica real: amplitud por átomo con
  ganancia 1, relativa al radio de la molécula.
- Mezcla aditiva (`gl.ONE, gl.ONE`), sin prueba de profundidad; el alfa baja con
  la profundidad y los puntos de relleno se dibujan al 12 %. Fondo negro.
- Cámara con rotación lenta ligada al tiempo y al scroll.

| Clase | Color |
|---|---|
| dna1 | `#8052ff` |
| dna2 | `#15846e` |
| protein | `#ffb829` |
| rna | `#e8e4dc` |
| other | `#9a9a9a` |

### Presupuesto adaptativo de puntos (`web/src/stage/island.ts`)

- Inicio: 20 000 con puntero fino, 12 000 con puntero grueso (`pointer: coarse`).
  `?points=N` fija el número y desactiva la adaptación.
- Cada 45 fotogramas se toma la mediana. Si supera 1,25 x 16,7 ms, los puntos
  bajan x0,65, con mínimo de 4 000. Nunca vuelven a subir en esa visita.
- La isla se carga tras el evento `load` (`requestIdleCallback`) y vive en su
  propio build de Vite (`web/vite.stage.config.ts`), para que el chunk del visor
  no cambie (invariante I4). Nunca se carga en `/app/`. La primera estructura se
  descarga antes; las demás llegan en tiempo ocioso, en orden narrativo.

### Red de seguridad

La isla pasa a modo póster, nunca a una caja negra, en estos casos: reduced
motion, sin canvas, `?nowebgl`, sin WebGL2, error de shader, error de datos y
pérdida de contexto. Los pósters (`stage/posters/<id>.webp`) se descargan solo en
modo póster; con reduced motion los capítulos cambian con fundidos entre pósters.

`?still=<id>` congela una estructura (reloj fijo, sin ciclo ni adaptación). Lo usa
`web/scripts/build-posters.mjs` para generar los pósters y las imágenes OG
(1200x630) desde el render real. Estado al escribir esto: `web/public/stage/posters/`
no existe, no hay pósters generados.

## Presupuestos y cómo se miden

Valores del prompt maestro y de las constantes de `pipeline/tests/test_stage.py`.

| Presupuesto | Valor | Medición | Estado en el repo |
|---|---|---|---|
| Bytes por estructura | <= 150 KiB gz | `test_stage.py` (rompe el build) | 39,8–149,0 KiB |
| Catálogo | <= 1 MiB gz | mismo test | 927,2 KiB (949 435 B) |
| Emparejamiento | cociente < 0,8 | mismo test | 0,63–0,75 |
| Chunk del visor | no crece | tamaño del chunk contra el que está en vivo | 86 057 B frente a 86 113 B (E-12) |
| Fotograma | 60 fps con 20 000 puntos | `web/scripts/measure-stage.mjs` (10k/20k/40k, CPU 1x y 4x) | sin evidencia: no existe `stage-perf.json` |
| Lighthouse móvil | rendimiento >= 95, CLS 0 | carril `lh` (mediana de 5, EN y ES) | sin evidencia: no existe `docs/evidence/stage/` |
| Peticiones externas | cero | `npm run verify:stage` | comprobación activa |

`npm run verify:stage` (Playwright con SwiftShader) comprueba en los dos idiomas:
cero peticiones a otro host, cero respuestas 4xx/5xx, consola limpia, canvas sin
modo póster, ausencia de `[VERIFICAR]`, de `{placeholder}` y de las palabras
vedadas, referencias `[n]` que apuntan a un `#ref-n` existente, cambio del pie de
estructura al bajar y botón de registro.

Carriles de la Mac (`tools/verify.sh` los despacha según `.enjambre-lane`):

| Carril | Script | Existe |
|---|---|---|
| doctor | `tools/mac/doctor.sh` | sí |
| clouds | `tools/mac/clouds.sh`: recalcula las nubes desde cero y las compara con `data/stage/` | sí |
| lh | `tools/mac/lh.sh` (+ `lh-report.mjs`) | sí |
| perf | `tools/mac/perf.sh`: `measure-stage.mjs --gpu` en vivo → `docs/evidence/stage-perf.json` | sí |
| visual | `tools/mac/visual.sh`: build + `verify:stage` con la GPU del nodo | sí |
| posters | `tools/mac/posters.sh`: `build-posters.mjs` en Metal → `docs/evidence/stage/posters-node/` | sí |
| media | `tools/mac/media.sh`: `record-stage.mjs` + ffmpeg, 1280×720 a 60 fps, H.264 y AV1, subtítulos quemados → `docs/media/` | sí |
| blender | `tools/mac/blender.sh`: comprueba Blender + Molecular Nodes y falla rápido si faltan | sí (sin guion de render) |

`tools/mac/detach.sh` es la ayuda común de los carriles largos, no un carril.

## Evidencia

- `docs/evidence/coding-fraction.json`, por `python tools/coding_fraction.py`:
  fracción codificante calculada desde GENCODE 50 (unión de CDS). Estimación
  puntual 1,25 %; rango 1,08–1,26 % según método y denominador. Los exones de
  genes codificantes, con UTR, suman 3,55 % y se reportan aparte.
- `docs/evidence/dna-rise.json`, por `python tools/dna_rise.py`: paso axial de
  3,347 Å por par de bases en 1BNA y 2,04 m de ADN por célula diploide.

## Construir

Desde PowerShell, en `web/`. Git Bash convierte `AGP_BASE=/` en una ruta de
Windows (E-02); si se usa, anteponer `MSYS_NO_PATHCONV=1`.

```powershell
$env:AGP_SITE = 'https://genome.ichisieben.dev'
$env:AGP_BASE = '/'
npm run build            # sync, tsc, visor, escenario, cascarones, iconos
npm run verify; npm run verify:links; npm run verify:stage
node scripts/build-posters.mjs   # tras el build; escribe en public/
# Para publicar sin noindex: $env:AGP_NOINDEX = '0' antes del build
```

El build del escenario falla si aparece `[VERIFICAR]`, un `{placeholder}`, la
palabra vedada, "AlphaGenome" como nombre de producto o una clave de cita sin
entrada en `web/src/i18n/refs.json`.
