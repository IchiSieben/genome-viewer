# 07 — Decisiones autónomas (sesión del 2026-09-26)

Sesión en modo autónomo: el usuario se ausentó ~8 h y pidió ejecutar de corrido
el plan de publicación (HANDOFF.md + prompt del 2026-09-25). Cada decisión que
antes se habría consultado queda aquí con qué se decidió, por qué, qué se
descartó y si es reversible. Las marcadas **[REVISAR]** son las que conviene
mirar primero.

Las respuestas que el usuario ya dio (nombre, texto de `data/dist/`, cadenas de
los `.ts`, idioma por ruta, enrutado) no se repiten aquí como decisiones: son
suyas.

---

## Línea base medida antes de tocar nada

Tres corridas de `npm run measure` sobre el build de `008f890`, con CLS añadido
al script en esta sesión (antes no se medía; ver D-02). La máquina está
cargada y el ruido es grande: la misma vista varía hasta 1,2 s entre corridas
en 3G lento, y hasta 4 s en red rápida (una corrida del navegador dio 4 632 ms).
Por eso se reporta la **mediana** y, sobre todo, lo que no tiene ruido: bytes
transferidos y oleadas en serie.

| Vista (3G lento) | Corrida 1 | Corrida 2 | Corrida 3 | Mediana | Transferido | Oleadas | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Portada (catálogo) | 1 763 | 2 986 | 2 621 | **2 621 ms** | 30 KiB | 2 | 0,0000 |
| Portada (héroe) | 2 433 | 1 957 | 1 891 | **1 957 ms** | 30 KiB | 2 | 0,0000 |
| Ficha | 2 157 | 2 061 | 2 955 | **2 157 ms** | 31 KiB | 2 | 0,0000 |
| Navegador | 2 813 | 1 970 | 2 473 | **2 473 ms** | 29-32 KiB | 2-3 | 0,0025 |

CLS en móvil (400×720): portada 0,0000, ficha 0,0000. El navegador de pistas ya
tenía un CLS de **0,0102** en escritorio antes de esta sesión: no es cero.

NOTES.md registraba ~1,49-1,56 s para las mismas vistas el 2026-09-13. Sin
cambios de código entremedias, la diferencia es la máquina, no el visor.

---

## D-01 · El historial del repo nombra a terceros **[REVISAR]**

- **Hallazgo**: `alphagenome-docs/01-alphagenome-estado-y-proyectos.md:103`
  contiene los nombres de dos organizaciones que la regla dura del workspace
  prohíbe publicar, y están en los 14 commits del historial.
- **Qué se decidió**: se reescribe esa frase en el árbol actual. El historial se
  trata en la Fase 4 (ver D-40), antes de cualquier push.
- **Descartado**: publicar tal cual (viola la regla dura).
- **Reversible**: sí, hasta el push.

## D-02 · CLS entra en `measure.mjs`

- **Qué**: un `PerformanceObserver('layout-shift', buffered)` desde el primer
  byte, leído 1,5 s después de "interactivo" para que cuenten también las
  animaciones de entrada. Dos corridas nuevas a 400×720 (portada y ficha).
- **Por qué**: el encargo exige CLS 0 medido antes y después, y el script no lo
  medía; los 0,0000 de NOTES.md se midieron a mano.
- **Reversible**: sí.

## D-03 · El servidor de pruebas replica la CSP del landing y monta en `/genome-viewer/`

- **Qué**: `serve-subfolder.mjs` monta en `/genome-viewer/` (configurable con
  `AGP_MOUNT`) y envía la cabecera `Content-Security-Policy` de
  `Landing/public/.htaccess`, además de servir `404.html` en los 404.
- **Por qué**: esa CSP aplica a todo el vhost, demos incluidos. Metal Globe ya se
  rompió en silencio por ella (ver el propio `.htaccess`). Una violación de CSP
  sale como error de consola, y `verify` ya falla con errores de consola.
- **Reversible**: sí.

## D-04 · Alcance del guardarraíl de tildes

- **Qué**: `pipeline/tests/test_text_hygiene.py` falla con (1) mojibake en
  cualquier archivo de texto del repo y (2) palabras que en español SIEMPRE
  llevan tilde, sobre el texto visible: `web/index.html` (sin comentarios ni
  scripts), `web/src/i18n/es*.json` y `README.md`.
- **Descartado**: vigilar `NOTES.md` y los docs históricos. Son registro interno,
  no texto que ve el visitante; reescribir su historia no aporta. Las entradas
  nuevas se escriben con tildes.
- **Descartado**: pares ambiguos (que/qué, como/cómo, esta/está, mas/más). Un
  guardarraíl que da falsos positivos termina desactivado.
- **Reversible**: sí; la lista de patrones es una constante.

---

## Fase 1b — i18n (detalle en `docs/08-i18n.md`)

## D-10 · Enrutado: dos páginas reales + hash; no un HTML por ruta **[REVISAR]**

- **Qué**: `/genome-viewer/` (inglés, x-default) y `/genome-viewer/es/`
  (español) son las únicas páginas reales; las vistas siguen en el hash (D2).
  Sitemap con esas dos URLs y sus alternates.
- **Por qué**: un HTML por ruta cabía en bytes, pero exigía reescribir el
  enrutado y todos los enlaces internos de seis vistas y tres scripts en una
  sesión sin supervisión, y no se podía comprobar en vivo (el landing despliega
  con push, que no es de esta sesión). El texto indexable está en la portada y
  la narrativa, no en las visualizaciones.
- **Descartado**: HTML por ruta + `.htaccess` (lo pedía el usuario "si cabe").
- **Reversible**: sí; la receta está en `docs/08-i18n.md`.

## D-11 · El diccionario viaja con el HTML, en dos niveles

- **Qué**: cada cascarón incrusta solo lo que pintan portada, cabecera, locus,
  ficha y navegador (~5 KB gz); el resto llega como chunk en paralelo con el
  artefacto de la vista, precargado por el script de arranque, o en reposo
  tras el `load` de la portada. El JSON va al final del `<body>`.
- **Por qué**: medido con A/B intercalado (ver abajo). Incrustarlo entero en
  `<head>` costaba ~+240 ms de documento; el navegador sin sus claves, +400 ms.
- **Descartado**: diccionarios en el bundle, fetch al arrancar, dos builds.
- **Reversible**: sí (`INLINE` en `build-shells.mjs`).

## D-12 · Formato numérico propio para el español; coordenadas sin localizar

- `es`: `25,96`, `262 144` (U+202F), `5553`; `en`: `25.96`, `262,144`.
  Coordenadas `chr12:54,578,515` en los dos idiomas. `es-PE` (lo de antes) no
  era español en CLDR.

## D-13 · Opción (A) para `data/dist/`, y lo que NO se traduce

- Nombres de biosamples (ontología), genes y exones de Ensembl y notas del
  sello de proveniencia se quedan como vienen; estas últimas con `lang="es"`.
- El test de "ES idéntico salvo tildes" cazó en su primera corrida un error
  real: un reemplazo automático había escrito "artifacto".

## D-14 · Inglés americano

- Ortografía estadounidense (color, catalog, artifact), la más común en la
  literatura de genómica y la de la documentación de AlphaGenome.

## D-15 · Preferencia de idioma: solo por clic, solo en la portada desnuda

- Sin redirección por `navigator.language`. Ver `docs/08-i18n.md`.

## D-16 · Dos bugs de arranque encontrados de paso (Fase 1a)

- La vista de contactos y la página "sobre los datos" precargaban un
  `card.json` que no usaban; Chrome lo avisaba en consola de forma
  intermitente y `verify` fallaba una de cada dos corridas.

### Medición final de la Fase 1b (A/B intercalado, 3 rondas, mediana)

`web/scripts/measure-ab.mjs`, build `008f890` contra el de esta fase, servidos a
la vez con la CSP del landing. Datos en `docs/evidence/performance-ab.json`.

| Vista (3G lento) | Antes | Después | KiB antes → después | Oleadas | CLS |
|---|---:|---:|---:|---:|---:|
| Portada (catálogo) | 1 849 ms | 1 789 ms | 29,9 → 27,0 | 2 → 2 | 0 → 0 |
| Portada (héroe) | 1 752 ms | 1 768 ms | 29,9 → 27,0 | 2 → 2 | 0 → 0 |
| Ficha | 1 916 ms | 1 849 ms | 31,1 → 28,1 | 2 → 2 | 0 → 0 |
| Navegador | 1 843 ms | 1 714 ms | 29,2 → 26,3 | 2 → 2 | 0,0025 → 0,0025 |

El presupuesto es 3G lento, y ahí no hay regresión: menos bytes y las mismas
oleadas en serie. Los bytes bajan porque el diccionario incrustado solo lleva
lo que se pinta, y la prosa que antes iba en el bundle ahora vive en el chunk
perezoso.

En red rápida las cifras sirven de poco con la CPU al 100 %: la misma vista
varía más de lo que se compara. Dos cosas que sí se comprobaron:

- La "tercera oleada" de la portada y la ficha en red rápida es la precarga
  ociosa del diccionario completo. Evidencia: la diferencia entre "después" en
  red rápida (37,6 KiB) y en 3G lento (27,0 KiB) son 10,6 KiB, y el chunk
  `en-*.js` pesa 10 898 B. En red rápida el `load` ocurre enseguida y el chunk
  llega antes de la foto; no está en la ruta crítica.
- Los 234 KiB del navegador en red rápida son bloques `.bin` de señal que en
  esa ronda llegaron antes de la foto. No es una regresión: por ronda, la línea
  base contó 291 / 32 / 32 KiB y el build nuevo 364 / 234 / 29 KiB. Con tres
  rondas, la mediana cae de un lado o del otro según cuántas veces gane la
  carrera.
- "Antes" es la interfaz solo en español servida en la raíz; "después" es la
  raíz inglesa. El A/B compara idiomas distintos, además de builds distintos.

---

## Fase 2 — Identidad y pulido visual

Auditoría de partida: `docs/05-visual-audit.md` (32 capturas).

## D-20 · La marca sale de la visualización: cuatro barras de señal

- **Qué**: la marca son cuatro barras de altura distinta en los cuatro
  primeros colores categóricos. Es la misma figura que ya había en la cabecera
  (hecha con degradados CSS), ahora como SVG. El favicon (`public/favicon.svg`,
  con variante oscura por `prefers-color-scheme`) y los PNG de 32 y 180 px
  salen de ese mismo SVG. El wordmark es el nombre en la tipografía del sistema.
- **Descartado**: doble hélice (vetada por el encargo), un logotipo dibujado
  aparte y una fuente web solo para el wordmark (más bytes en la ruta crítica).
- **Reversible**: sí; `public/favicon.svg` y el SVG en línea de `index.html`.

## D-21 · Imágenes OG por idioma, generadas en el build con datos reales

- `scripts/build-icons.mjs` (Playwright, ya era dependencia de desarrollo)
  pinta `og-en.png` y `og-es.png` de 1200×630. Llevan el nombre, el eslogan y
  la cascada SHAP de la variante destacada, leída del `card.json` congelado.
  No es una maqueta: si cambian los datos, cambia la imagen.
- **Coste**: el build necesita Chromium. Si falta, el build falla, en vez de
  publicar un `og:image` que da 404.

## D-22 · Héroe vivo: la cascada SHAP de la variante destacada

- **Qué**: al lado del medidor, las seis contribuciones SHAP mayores y una fila
  con la suma del resto, desde el valor base hasta el score. Se dibujan barra
  a barra (WAAPI, `scaleX` con `transform-box: fill-box`).
- **Por qué esta y no el sashimi**: sale del mismo `card.json` que el héroe ya
  descargaba (cero bytes nuevos). El sashimi exigiría un `splice.json` de
  decenas de KB en la ruta crítica de la portada.
- **CLS**: la cascada tiene alto fijo (`MINI_CASCADE_HEIGHT`) y el hueco del
  héroe se reserva con la altura medida a 400, 899, 900 y 1 280 px en los dos
  idiomas (468 px en una columna, 236 px en dos).

## D-23 · Movimiento: solo con JS, solo si no se pidió reducirlo

- Script de arranque → clase `motion` en `<html>` si
  `prefers-reduced-motion` no es `reduce`. Sin esa clase, el CSS no esconde
  nada y `motion.ts` no anima nada.
- Solo `opacity` y `transform`; nada anima el layout.
- El titular no se anima: es el LCP. Entran por fases la entradilla y la
  variante. Las entradas al hacer scroll solo se aplican a bloques que empiezan
  debajo del pliegue. La transición entre vistas se salta la primera vista.
- `verify` hace las capturas con `reducedMotion: 'reduce'`: una captura de
  página entera no hace scroll y dejaría invisibles los bloques de abajo. Aparte,
  una pasada con movimiento baja hasta el pie en los dos idiomas y falla si
  queda algún bloque con opacidad menor que 1.

## D-24 · Catálogo con medidor en miniatura y distintivos de vista

- El índice no trae el AVI; está en cada `locus.json` (~2 KB). En la portada
  se piden después del `load` y solo cuando el catálogo se acerca a la
  ventana, así que no entran en la ruta crítica. El hueco tiene tamaño fijo:
  llenarlo no mueve nada.
- En locus con varias variantes, la fila muestra el AVI **máximo**.
- Distintivos solo para las vistas que no tienen todas las variantes
  (saturación, sashimi, contactos). Poner "ficha" o "pistas" en todas no
  informaría de nada.

## D-25 · Corregidos de paso

- La ayuda del mapa de saturación decía "cuanto más oscura la celda, más alto
  el AVI", lo cual es falso en el tema oscuro, donde la rampa se invierte.
  Ahora dice "cuanto más resalta sobre el fondo", que vale en los dos temas.
- Los chips del navegador de pistas decían `rna seq` (el id en minúsculas);
  ahora usan la etiqueta de la modalidad (`RNA-seq`).
- En la portada inglesa, el nombre del estudio salía en español sin tildes: su
  clave no estaba en el diccionario incrustado.
- `.honesty__limits` medía 84 caracteres por línea; ahora usa
  `--measure` (68ch).

## PENDIENTE de la auditoría (no se tocó en esta pasada)

- Mapa de calor tejido × modalidad: colapsar por sistema de órganos y un
  resumen "top N" antes de la pared de ~240 filas (P2, M).
- Ayuda del navegador de pistas en móvil: plegarla bajo 480 px (P2, S).
- Vistas cortas (locus, "sobre los datos"): el hueco que deja `min-height:
  100dvh`, que existe por CLS (P2, M).
- Capturas de los estados de carga y error (P3, S).

---

## Fase 3 — Por qué, hoja de ruta, referencias y cómo está hecho

## D-30 · Referencias: solo las verificadas en PubMed

- Las 13 citas del encargo se comprobaron una por una contra PubMed el
  2026-09-26 (autores, título, revista, volumen, DOI, PMID). Las 13 existen.
  Cada una se publica con enlace a su DOI y a su registro de PubMed.
- Correcciones que salieron de verificar:
  - "Radivojac 2026" es **Hoffing R, …, Radivojac P** (Radivojac es el autor
    senior). Se cita con el primer autor.
  - Sun, Mews & Bush 2026 y Hoffing 2026 son **preprints de bioRxiv**, no
    artículos revisados por pares. La cita lo dice.
  - Zoonomia (Christmas et al. 2023) habla de **240** especies. El nombre del
    feature `phyloP Cactus 241-way` viene de los datos (el alineamiento
    incluye la referencia humana) y no se toca. Ningún texto propio dice
    "241 mamíferos" (comprobado con grep).
  - Las fechas (API junio 2025, Nature 28 ene 2026) coinciden con PubMed. El
    Atlas del 8 sep 2026 no está en PubMed (es un reporte técnico); la fecha
    sale de `alphagenome-docs/`.

## D-31 · [VERIFICAR] — la frase de la "interfaz permanente" no se publica

- El encargo pedía la frase de la interfaz permanente con sus tres apoyos,
  "tomada de alphagenome-docs". **No está en alphagenome-docs**: se buscaron
  interfaz, permanente, perdura, sobrevive y tres pilares/apoyos, sin
  resultados. La única versión conocida es la del prompt pegado, que trae
  U+FFFD y el encargo la descarta.
- En su lugar, el párrafo 7 de "Por qué" explica por qué la interfaz sigue
  funcionando sin servicios externos, con las tres restricciones R1/R2/R3 de
  `docs/01-architecture.md`. Es una afirmación con fuente, no la frase pedida.
- **Para cerrarlo**: pegar la frase limpia en `alphagenome-docs/` y
  sustituir `why.p7` en los dos diccionarios.

## D-32 · Qué se quitó de la narrativa por no tener fuente firme

- "La muestra peruana de 1000 Genomes está dentro de gnomAD v4": el propio
  `02-atlas-andino-plan-v2.md` lo marca "sin confirmación documental directa".
  Se quitó.
- "Primera pintura en menos de 1,5 s": era la cifra del 13 sep con la máquina
  descargada. Hoy el mismo build mide entre 1,5 y 1,9 s según la carga, y el
  texto dice eso.

## D-33 · Narrativa: cuatro rutas en el hash, un chunk propio

- `#/why`, `#/roadmap`, `#/how` y `#/references`. El texto va en
  `narrative.{es,en}.json`, un chunk que solo piden esas rutas (en paralelo con
  el índice, no después). Se enlazan desde la cabecera ("Por qué"), desde un
  panel "El proyecto" en la portada y desde el pie, que ahora lleva además el
  repositorio y el autor.
- "Datos y herramientas" (en "Cómo está hecho") se llena desde el sello de
  proveniencia del índice; no hay versiones escritas a mano.
- Pasa por el guardarraíl de redacción (sin vocabulario clínico ni promesas),
  por el de tildes y por la paridad de claves e identificadores ES/EN.

## D-34 · Fases 2 y 3 en un solo commit

- Comparten `app.ts`, `index.html` y `verify.mjs`, y la Fase 3 no compila sin
  la 2. Partirlas a mano en dos commits que compilen cada uno costaba más que
  lo que aporta. Se hace un commit que nombra las dos fases.

### Medición de las Fases 2 y 3 (A/B contra la 1b, 3 rondas, mediana)

`docs/evidence/performance-ab-fase2-{en,es}.json`. Línea base: el build de
la Fase 1b.

| 3G lento | EN antes → después | ES antes → después | Oleadas | CLS |
|---|---:|---:|---:|---:|
| Portada | 2 409 → 2 248 ms | 2 089 → 2 181 ms | 2 → 2 | 0 → 0 |
| Héroe | 2 128 → 2 141 ms | 1 959 → 2 136 ms | 2 → 2 | 0 → 0 |
| Ficha | 2 594 → 2 030 ms | 2 100 → 2 350 ms | 2 → 2 | 0 → 0 |
| Navegador | 2 235 → 1 848 ms | 1 925 → 1 822 ms | 2-3 → 2 | 0,0025 → 0,0025 |

Lectura honesta: en inglés todo mejora y en español la portada y la ficha
empeoran. Con la misma magnitud en direcciones opuestas y el mismo código, es
ruido de la máquina, no el visor. Lo que no es ruido:

- Oleadas en serie: iguales. CLS: igual en las diez corridas, en los dos idiomas.
- Bytes: +3,4 KiB transferidos, de ellos +2,2 KiB gz de bundle (cascada del
  héroe, movimiento, catálogo). A 400 kbit/s son ~70 ms. Es el coste real de
  la Fase 2, y se acepta por el héroe vivo.
- La vista de las páginas de texto salió del bundle principal a un chunk
  propio (4 KB), que piden solo sus rutas.
- En red rápida, la cuarta oleada de la portada son los `locus.json` del
  catálogo, pedidos después del `load`: no están en la ruta crítica.

## D-40 · Orden cambiado: la Fase 4 antes que los extras **[REVISAR]**

- El encargo ponía los extras (N6, N4, N7) antes de publicar. Se publicó
  primero: sin remoto, todo el trabajo existía en una sola copia en disco, y
  lo que el usuario pidió encontrar al volver es "publicado y respaldado".
  Los extras van después, cada uno con su commit.

## D-41 · Historial saneado antes del primer push

- `filter-branch` reescribió la frase de `alphagenome-docs/01` en los 16
  commits que la tenían. Se comprobó que cada commit reescrito difiere del
  original en exactamente esa línea, y que el árbol final es idéntico.
- Respaldo del historial original: `Portfolio/_papelera_claude/genome-viewer-backup/pre-sanitize-2026-09-26.bundle`
  (verificado con `git bundle verify`). **Contiene los nombres de terceros:
  no subirlo a ningún sitio.** Se puede borrar cuando el usuario lo decida.
- Los hashes cambiaron. Commits de fase tras el saneado: 1a `dd0036c`,
  1b `f4710f9`, 2+3 `320bdd1`.
- Tres comprobaciones de la llave sobre el historial nuevo: el literal de la
  llave real de `~/.env` aparece 0 veces; `ALPHAGENOME_API_KEY=` solo aparece
  con los placeholders `"..."` y `"pega-aqui-tu-llave"`; 0 tokens con forma
  de llave de Google y ningún `.env` ni `.log` versionado nunca.
- Repo público `IchiSieben/genome-viewer` creado y subido (`main`). GitHub
  detecta la licencia como "Other" aunque el texto es MIT estándar.
  **[REVISAR]**: suele resolverse solo; si no, recrear LICENSE desde la
  plantilla de GitHub.

---

## Extras

## D-50 · N6: el buscador va en el mapa tejido × modalidad, no en el navegador **[REVISAR]**

- La hoja de ruta decía "dentro del navegador de pistas". Se construyó sobre
  el mapa tejido × modalidad (`?view=tracks`), porque ahí está el problema que
  señaló la auditoría (P2): unas 240 filas sin forma de ir a una concreta. El
  navegador de señal muestra pocas pistas elegidas; no lo necesitaba.
- Busca en el nombre del biosample, en el sistema de órganos (traducido y
  original, así "hígado"/"liver" y "musculo"/"musculoskeletal" funcionan) y
  en el término de ontología (UBERON, CL, EFO). Sin tildes ni mayúsculas;
  varias palabras se combinan con Y.
- Los nombres de tejido siguen en inglés en las dos lenguas: son los de la
  ontología y vienen de `data/dist/` (opción A, sin tocar). El estado vacío lo
  dice en español para que nadie crea que el buscador falla.
- La escala de color se calcula con todas las celdas y no cambia al filtrar:
  un color significa lo mismo con y sin búsqueda.
- Commits: `3b66d47` (código) y `85578c2` (capturas). Build recopiado al
  landing; `verify-live` local 17/17.
