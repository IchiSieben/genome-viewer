# 09 — Decisiones autónomas (sesión del escenario, 2026-10-15, 13:14–23:30 Lima)

Sesión en modo autónomo con el prompt maestro `docs/09-PROMPT-escenario-educativo.md`. El
dueño no está; cada decisión que se habría consultado queda aquí con qué se eligió, por qué,
qué se descartó y cómo revertirla. Las de la publicación anterior siguen en
`docs/07-decisiones-autonomas.md` (D-01…D-53); esta serie empieza en **E-01** para no
confundirlas. Las marcadas **[REVISAR]** son las primeras que conviene mirar.

---

## E-01 · El visor en vivo en `genome.ichisieben.dev` tal como está (E0) — 13:20 Lima (18:20 UTC)

- **Qué:** subdominio `genome` → docroot `public_html/genome-app` creado por API
  (`hosting_domains_create-website-subdomain`), 155 archivos (10,1 MB) subidos uno a uno por
  TUS con `tools/deploy_tus.py`, todos con prefijo `genome-app/`. Build con
  `AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/`, `noindex` puesto.
- **Verificado:** `verify-live.mjs https://genome.ichisieben.dev/` → `TODO OK`, 14 vistas EN/ES
  + 4 en 3G lento (≤ 2,2 s), `X-Robots-Tag noindex` en 18/18 documentos.
  `grep -r genome-viewer dist` → solo la URL del repo (4 apariciones).
- **Descartado:** `deploy-static-site-archive` (prohibido: reemplaza el sitio padre, el Landing).
- **Revertir:** borrar el subdominio y la carpeta `genome-app/` en hPanel (acción del dueño;
  esta sesión no borra nada en Hostinger).

## E-02 · Trampa de Git Bash: `AGP_BASE=/` se convierte en `C:/Program Files/Git/`

- El primer build desde Git Bash salió con `site https://genome.ichisieben.dev/C:/Program Files/Git/`
  (conversión de rutas de MSYS). Se detectó en la línea de log de `build-shells` y **no se subió**.
- **Regla:** los builds para el subdominio se hacen desde PowerShell, o en Git Bash con
  `MSYS_NO_PATHCONV=1`. Está en HANDOFF, "Comandos que importan".

## E-03 · La Mac ejecuta, mide y renderiza; Windows escribe el código **[REVISAR]**

- **Hecho comprobado:** enjambre da a un trabajo `kind: claude` solo
  `Read,Edit,Write,Glob,Grep` + `git status|diff` + `ls` (`enjambre/largos.py:38`), y a uno
  `kind: tests` exactamente un Bash, el `tests-cmd` de `AGENTS.md` (`largos.py:62`). Un agente
  de la Mac **no puede** compilar, abrir Chromium ni medir fps: el "el shader se desarrolla y se
  itera en la Mac" del prompt no es ejecutable tal cual.
- **Qué se eligió:** el patrón que ya funcionó hoy en el Landing (cert-lh, cert-media):
  `tests-cmd: bash tools/verify.sh`, que despacha por la palabra de `.enjambre-lane` a
  `tools/mac/<carril>.sh`. Windows escribe todo el código y los scripts de carril; la Mac
  ejecuta lo gráfico, la medición y el render (doctor, Lighthouse, nubes recalculadas desde
  cero, coste por frame en GPU real, capturas, pósters, video, Blender).
- **Descartado:** dar al agente de la Mac un `kind: claude` para escribir el shader a ciegas
  (no puede ver ni medir lo que escribe; cada vuelta cuesta ~25 min y el contrato del hito no
  se puede comprobar en el nodo).
- **Revertir:** si el dueño quiere que la Mac escriba código, `kind: claude` + un `tests-cmd`
  más amplio en `AGENTS.md`; los carriles siguen sirviendo para verificar.
- El nodo parte de `origin/main` recién traído (`enjambre/worker.sh:64-78`): **se empuja antes
  de cada lanzamiento.**

## E-04 · Nubes de puntos con gemmi y un formato propio (AGSC) — E1

- **Qué:** `pipeline/src/alphagenome_platform/stage/clouds.py` lee el mmCIF de RCSB con gemmi y
  escribe `data/stage/<id>.<hash>.agsc`: prefijo de 12 bytes + cabecera JSON rellenada a 8 +
  registros de 8 bytes (xyz int16 | amplitud uint8 en 0,01 Å | clase uint8, bit 7 = relleno).
  La amplitud es la del factor B: u = √(B/8π²). 20 000 puntos por estructura, 927 KiB gz en total.
- **Por qué gemmi y no Biopython:** lee mmCIF y ensamblajes biológicos (5IRE, la cápside entera)
  en milisegundos y es lo que usa la propia RCSB; Biopython no expande ensamblajes.
- **Por qué un formato hermano y no glTF/PLY:** el navegador lo lee con un `DataView` sin
  dependencias; la cabecera lleva versión, procedencia (DOI/PMID del mmCIF) y hash de
  configuración. Un cambio de formato sube la versión y cambia el nombre del archivo.
- **Emparejado para el morph:** orden de Morton + una permutación compartida (semilla 20261015):
  el punto *i* de una estructura viaja al punto *i* de la siguiente sin cruzar la pantalla
  (pares cercanos 0,63–0,75; los tests exigen < 0,8).
- **Revertir:** borrar `data/stage/` y el extra `stage` de `pyproject.toml`; el visor no lo usa.

## E-05 · Shader escrito a mano en WebGL2, sin Three.js

- Puntos con mezcla aditiva y vibración a escala térmica real. El chunk `island` pesa 4,3 KB gz;
  Three.js mínimo son > 150 KB. No hay escena, ni luces, ni materiales: solo puntos.
- **Revertir:** `src/stage/renderer.ts` es la única pieza que habla con WebGL.

## E-06 · Presupuesto de puntos adaptativo, que solo baja

- 20 000 con puntero fino, 12 000 en táctil; si la mediana de 45 frames pasa de 1,25 × el
  presupuesto, ×0,65 hasta un mínimo de 4 000. Nunca vuelve a subir en la visita (un tirón que va
  y viene se nota más que un número de puntos estable). `?points=N` fija el número y apaga la
  adaptación (para medir).

## E-07 · Registro global con «8 años» por defecto **[REVISAR]**

- Un único interruptor por bloque que cambia **todos** los bloques a la vez y se recuerda en
  `localStorage` (`agp-register`). Por defecto `kid`: la portada tiene que entenderse sin saber
  biología; el registro experto está a un clic y conserva la posición de lectura.
- **Revertir:** `data-register-default="phd"` en `stage.html`.

## E-08 · Inter variable autoalojada con `font-display: optional`

- 31,2 KiB (latín, pesos 200–500, OFL en `public/fonts/OFL-Inter.txt`), precargada. `optional`
  evita el salto de fuente (CLS 0) a cambio de que una primera visita lenta la vea en la fuente del
  sistema. Cero peticiones fuera del host (I2).

## E-09 · Pósters: fotos del mismo render, no ilustraciones

- `scripts/build-posters.mjs` congela la isla (`?still=<id>`: reloj fijo, sin ciclo, sin
  adaptación), oculta el texto y guarda el frame en WebP (codificado por el propio Chromium, sin
  librerías). En Windows dibuja SwiftShader; el carril `posters` de la Mac repite el render en
  Metal en `docs/evidence/stage/posters-node/` para compararlos. Los pósters solo se descargan en
  modo póster (movimiento reducido, sin WebGL2, error o contexto perdido).

## E-10 · El paso de la hélice se midió, no se citó

- `tools/dna_rise.py` sobre 1BNA: 3,347 Å por par de bases (centros de los pares, eje por PCA,
  pares terminales fuera) → 6,11 × 10⁹ pb × 0,3347 nm = **2,04 m** por núcleo diploide.

## E-11 · Fracción codificante: calculada y con el rango redefinido **[REVISAR]**

- `tools/coding_fraction.py` sobre GENCODE 50: unión de CDS / ensamblaje primario GRCh38 =
  **1,25 %**; rango **1,08–1,26 %** (MANE Select, basic y todas las CDS, sobre GRCh38 primario y
  T2T-CHM13).
- **Cambio respecto al primer cálculo:** el extremo alto incluía los exones con UTR (3,55 %).
  Una UTR se transcribe pero no se traduce: no es codificante. Se sacó del rango y se nombra
  aparte en el texto experto del capítulo 2. También se quitó el denominador «GRCh38 sin N»
  (2 948 627 755), porque era una constante que no se pudo verificar en esta sesión.
- El prompt esperaba ~1,2–2,2 %; el cálculo da 1,08–1,26 %. Se publica el cálculo.
- **Revertir:** `rangePct` en `tools/coding_fraction.py`.

## E-12 · El escenario es un segundo build de Vite

- Un build con dos entradas hizo que Rollup sacara el *preload helper* de Vite a un chunk
  compartido: el visor ganaba una petición en su ruta crítica. Con `vite.stage.config.ts` aparte,
  el chunk principal del visor queda en **86 057 B (28,25 KB gz)**, frente a 86 113 B en vivo antes
  del escenario (I4).
- El enlace de idioma del visor ya no calcula la ruta en JS: usa el `href` estático que escribe
  `build-shells` y solo le cambia el hash (`toggle.hash = location.hash`). Así el chunk no creció
  con la mudanza a `app/`.

## E-13 · Viaje de escala: tamaños de las propias coordenadas y tres cifras de PubMed

- Estructuras: extensión máxima de cada nube (1BNA: la mínima, el ancho de la hélice, 2,2 nm).
- Células, citadas de los resúmenes: *E. coli* 2,47 µm de largo de media (Yamada 2017,
  PMID 28854579); núcleo de mamífero 5–15 µm (Davie 2025, PMID 39820859); célula de mamífero
  10–20 µm (Nakatani 2020, PMID 32547894, afirmación introductoria, no medida). Se descartaron
  Liddane 2021 (núcleo 10–20 µm, choca con Davie) y Nath 2018 (HeLa 17–30 µm en microcanal).
- Última parada: 2,04 m (E-10).

## E-14 · Inglés americano en el texto EN

- 12 cambios en `chapters.en.json` (metres → meters, centres → centers, haematopoietic →
  hematopoietic…) y el título de la escala. Los títulos de artículos en `refs.json` no se tocan.

## E-15 · Lighthouse base en la Mac (antes del escenario)

- Visor en vivo, móvil, mediana de 5: `/` perf 100 · a11y 96 · bp 100 · SEO 63 · LCP 1 463 ms ·
  CLS 0 · TBT 0; `/es/` igual con LCP 1 443 ms. El SEO 63 es el `noindex` (se quita en E7).
- Los JSON se quedaron en el worktree de la Mac (el contrato tenía `push: false`); los contratos
  siguientes llevan `push: true`.

## E-16 · Las nubes son reproducibles en otra máquina

- Carril `clouds` en la Mac (macOS arm64, Python propio, mmCIF descargados de nuevo de RCSB):
  **8 idénticas, 0 distintas** byte a byte con `data/stage/` de Windows, y `test_stage.py` verde
  en el nodo. Rama `mac/stage-clouds`.

## E-17 · Revisión del verificador antes del despliegue del escenario

- **Bloqueo encontrado y corregido:** al pulsar el registro, el bloque se movía 21–48 px porque
  `scroll-behavior: smooth` animaba la corrección de `scrollBy`. Ahora la corrección es
  `behavior: 'instant'`, y la prueba también hace su `scrollIntoView` instantáneo.
- Notas corregidas: decimales con coma en español (`Intl` con `es` y no `es-PE`, que usa
  punto); 0,3347 nm por par de bases en la cuenta de los 2,04 m (con 0,335 sale 2,05); los
  enlaces del 404 llevan al visor (`app/`); el pie de estructura y la etiqueta de escala ya no
  son `aria-live` (un lector de pantalla los anunciaba en cada scroll).
- **Se deja como está [REVISAR]:** la frase permanente afirma que los datos de entrenamiento
  están sesgados hacia ascendencia europea. El texto es del dueño (prompt maestro) y se publica
  literal, pero ninguna referencia de `refs.json` lo respalda tal cual (la nota de `sun2026`
  pide no citarlo para eso). Ver MORNING-REPORT.
- También queda: el capítulo 6 da dos resoluciones de 5XJC, 3,76 Å del resumen del artículo y
  3,6 Å del título de la entrada PDB; las dos tienen fuente.

## E-18 · La ficha del landing, en rama y sin tocar el índice ajeno

- El subagente commiteó la ficha en `genome/ficha` (`39be2bc`, solo los dos `.md`) usando un
  índice temporal, porque `Landing/.git/index.lock` existe desde las 08:55 (otra sesión, no se
  borró). El Landing quedó en esa rama; se devolvió a `main` con `git symbolic-ref HEAD
  refs/heads/main` (no toca el índice) y los dos `.md` se apartaron a la carpeta temporal de la
  sesión: el índice real de `main` ya coincidía con `main`.

## E-19 · A/B del visor: chunk igual, tiempos peores en EN **[REVISAR]**

- `measure-ab.mjs` (3 rondas, ref = build de `95d8709` en `/`, nuevo = HEAD en `/app/`; se le
  añadieron `AGP_AB_PATH_REF`/`AGP_AB_PATH_NEW`): `docs/evidence/performance-ab-stage-{en,es}.json`.
- **Bytes:** chunk principal 86 113 → 86 057 B (gzip −9: 28 192 → 28 166 B). Transferencia
  idéntica salvo `homeFast` EN (41,3 → 50,1 KiB, una oleada más), que en ES no se repite.
- **Tiempos:** en EN todas las vistas suben 40–180 ms (rápidas) y 150–260 ms (3G lento); en ES
  dos vistas mejoran y el resto empata. Revisado el visor en vivo en `/app/`: 4 peticiones
  (HTML, chunk, `card.json`, el diccionario completo en reposo, que ya se pedía en E0); ningún
  recurso nuevo en la ruta crítica.
- **Por qué no se da por resuelto ni por regresión:** la máquina estaba cargada (otra sesión;
  `verify:stage` tardó 10 min en vez de 3) y ES no reproduce el patrón. Primer paso del dueño:
  repetir el A/B en una máquina tranquila (la Mac) con
  `AGP_AB_PATH_NEW=app/ node scripts/measure-ab.mjs <dist-de-95d8709> 5`.

## E-20 · 1BNA se dibuja con puntos más grandes

- 1BNA tiene 486 átomos: los otros 19 514 puntos de la nube son repeticiones casi
  transparentes, y la portada se veía como polvo (captura en `docs/evidence/stage/captures/`).
  Ahora el tamaño de sprite de los átomos **reales** se multiplica por √(puntos/átomos reales),
  con tope 3,5 (1 en las estructuras densas). Ningún dato cambia: son los mismos átomos.
- **Revertir:** `uSparse` a 1 en `src/stage/renderer.ts`.

## E-21 · E2 decidido con números: shader escrito a mano, sin plan B

- **Primer intento fallido, documentado:** el carril `perf` de la Mac (M2 Pro, Metal) dio
  frames de 66–133 ms y 10 000 puntos *más lentos* que 40 000. Chromium sin pantalla limita
  `requestAnimationFrame`; se medía el limitador, no la GPU (`mac/stage-perf`, se conserva).
- **Medidor corregido:** `measure-stage.mjs` lanza Chromium sin limitadores de frame y añade
  `window.__stage.bench(n)` (isla): n frames seguidos, cada uno esperado con un `readPixels`
  de 1 px, así que el tiempo incluye a la GPU terminando el frame.
- **Resultados (1280×800, dpr 1):** GTX 1050 Ti por D3D11: mediana 0,3–0,5 ms, p95 ≤ 2,2 ms
  (`docs/evidence/stage-perf-windows.json`); SwiftShader, render por CPU, el peor caso:
  mediana 2,9–4,9 ms, p95 ≤ 9,2 ms (`stage-perf-swiftshader.json`). Presupuesto: 16,7 ms.
  Apple M2 Pro por Metal (carril `perf2` de la Mac, `mac/stage-perf2`, commit `00b6371`):
  mediana 0,7–0,8 ms, p95 ≤ 1,1 ms; con la CPU estrangulada 4×, mediana 2,4 ms, p95 ≤ 3,9 ms
  (`stage-perf-mac.json`). Las tres máquinas quedan a ≥ 3× del presupuesto.
- **Carril `media`:** `media2` falló (salida 23) por las comillas de `force_style` dentro del
  filtro `subtitles` de ffmpeg, y el ES solo tenía 2 subtítulos: el scroll suave del sitio
  reiniciaba la animación en cada paso. Corregido: comas escapadas (y pista de subtítulos
  blanda si ffmpeg no trae libass), `scrollTo` con `behavior: 'instant'`; en Windows, 8 de 8
  capítulos. Probado y descartado: los flags sin limitador de `measure-stage` cuelgan la
  grabación de vídeo de Playwright.
- **Límites de la medida:** las nubes tienen 20 000 puntos, así que `?points=40000` dibuja
  20 000; el estrangulamiento de CPU de CDP no frena el proceso de GPU. El número en un
  teléfono real sigue sin medir: lo cubre la adaptación de puntos (E-06).

## E-22 · Pósters del escenario: se adoptan los renderizados en la Mac

- **Qué:** los 8 pósters (`web/public/stage/posters/*.webp`) y las dos imágenes OG salen ahora
  del carril `posters2` de la Mac (Metal, commit `00b6371`, rama `mac/stage-posters2`; registro en
  `docs/evidence/stage/posters-run-mac.txt`).
- **Por qué:** en vivo, solo 1BNA se había vuelto a capturar tras E-20. Los pósters de 1CDW, 1KX5
  y 5KKQ eran de antes del cambio de tamaño de los puntos de las nubes dispersas, y se veían casi
  negros frente a la isla viva. Los de la Mac son el render actual; 5IRE es igual en ambas
  máquinas (comparado a ojo, mismo encuadre).
- **Descartado:** volver a capturarlos en Windows con SwiftShader. Daba el mismo resultado y costaba
  tiempo de CPU de la máquina que coordina.
- **Revertir:** `git checkout 5d4b781 -- web/public/stage/posters web/public/og-stage-*.png`.

## E-23 · E3 cerrado con Lighthouse del sitio en vivo (Mac, carril `lh2`)

- **Medida:** Lighthouse 12.8.2, móvil, mediana de 5 corridas por página, contra
  https://genome.ichisieben.dev en el commit `00b6371` (rama `mac/stage-lh2`; resúmenes en
  `docs/evidence/stage/lighthouse-live/`; los 40 informes completos se quedan en la rama).
- **Escenario:** EN rendimiento 99 · accesibilidad 100 · buenas prácticas 100 · LCP 1 323 ms ·
  CLS 0. ES 100 · 100 · 100 · LCP 1 110 ms. **Visor en `/app/`:** 100 · 96 · 100 en los dos
  idiomas, como antes del escenario (E-15). SEO 66 en todas: es el `noindex`.
- **Honestidad:** una de las 5 corridas de `/es/` falló con `NO_FCP` (Chrome sin pantalla); esa
  mediana sale de 4 corridas. El criterio de E3 era «Lighthouse local ≥ 95»; se midió en vivo,
  que es más exigente (red y servidor reales).

## E-24 · Bug: los capítulos no cambiaban de estructura (arreglado) + velos de cabecera y pie

- **Hallazgo:** un fotograma del vídeo de `media3` mostró el pie fijo «PDB 1BNA» encima del
  título del capítulo 6. Causa: `main.ts` buscaba las secciones con `[data-structure]`, y eso
  también encontraba los 8 `<img>` de póster dentro del `.stage` fijo; el primero (1BNA) cubre
  siempre el centro de la pantalla, así que `pick()` elegía 1BNA en todos los capítulos. La
  molécula y el pie solo cambiaban en el viaje de escalas, y por eso pasaba la prueba «el pie
  cambia ≥ 3 veces al bajar».
- **Arreglo:** el selector es `main [data-structure]`. Prueba nueva en `verify-stage`: cada
  capítulo, centrado, debe nombrar su estructura en el pie. **Falló con el build anterior**
  (c2–c7 decían 1BNA, en EN y ES) y pasa con el arreglo.
- **Velos:** la cabecera fija pasa a un degradado opaco al 94 % hasta el 60 % de su alto, y el pie
  fijo lleva un velo inferior de 5,5 rem. El texto que sube se desvanece en vez de chocar con la
  marca o con el pie. Solo cambia CSS del escenario; el visor no se toca.
- **Consecuencia:** el vídeo de `media3` se grabó con el bug; se vuelve a grabar (`media4`)
  contra el sitio arreglado.

## E-25 · E7: cierre público hecho (sin noindex, ficha en el landing) y vídeos en Drive

- **Condición:** E3 (E-23, Lighthouse en vivo), E4, E5 y E6 en verde. E6 se dio por cerrado con
  el vídeo de `media4`, que ya se grabó con el arreglo E-24: el capítulo 2 muestra el ribosoma
  4UG0 con su pie (comprobado en un fotograma).
- **Hecho:** build con `AGP_NOINDEX=0`, `verify`, `verify:links` y `verify:stage` en verde, subida
  por TUS a `genome-app/` y `AGP_EXPECT_NOINDEX=0 verify-live`: TODO OK, `noindex` en 0/23
  documentos. Solo `404.html` conserva su `meta robots noindex`, a propósito. `robots.txt` permite
  todo y anuncia `sitemap.xml` (200).
- **Landing (A7):** se hizo el merge `--no-ff` de `genome/ficha` y se añadió el sitemap en
  `public/robots.txt`. La ficha se actualizó con los números de E-21/E-23 y con el noindex ya
  quitado. Se hizo push a `main` (`5fd2dd7`) desde un worktree aparte, para no tocar la copia de
  trabajo de otra sesión ni su `index.lock`. El diff contra `origin/main` (`4c718cb`, sin
  cambios desde la preparación) eran solo las 2 fichas y `robots.txt`. Está en vivo en
  https://ichisieben.dev/projects/genome-viewer/.
- **Copia vieja:** `Landing/public/genome-viewer/` (156 archivos, 11 MB, sin versionar) se movió a
  `Portfolio/_papelera_claude/genome-viewer-landing-legacy-2026-10-15/`. No se borró nada.
- **Vídeos:** los 4 mp4 (EN/ES, H.264 y AV1, ~109 MB) no entran en git (`.gitignore`). Van a
  `Gdrive:01-Trabajo/Portfolio/AlphaGenome/media/2026-10-15/` con `rclone copy`, listados en
  `drive.manifest`; los `.srt` sí están en git. Se descartó meterlos en el repo: es público y cada
  clon cargaría 109 MB para siempre.
- **Subtítulos blandos:** el ffmpeg de la Mac no trae libass (`libass=0` en
  `docs/evidence/stage/media-run.txt`), así que los títulos de capítulo van como pista `mov_text`,
  no quemados en la imagen. En Windows sí hay libass; para quemarlos:
  `ffmpeg -i stage-es.mp4 -vf "subtitles=stage-es.srt" -c:v libx264 -crf 20 -an stage-es-burnt.mp4`.
- **Revertir el cierre público:** reconstruir sin `AGP_NOINDEX` (vale `1` por defecto) y volver a
  desplegar; en el landing, `git revert -m 1 c3469ab` y `git revert 29eece8 5fd2dd7`.

## E-26 · Revisión visual en la Mac (Metal): verde con un navegador por idioma

- **visual4** (`4f696bb`): EN entero en verde sobre Metal. En ES, con el mismo navegador, la
  isla no arrancó y cayó a póster sin errores de consola; la degradación prevista funcionó.
- **visual5** (`c7ffbfb`): con cada idioma en su propio proceso de Chromium (`AGP_STAGE_LANGS`,
  `tools/mac/visual.sh`), **EN y ES TODO OK** en WebGL sobre Metal, incluida la prueba por
  capítulo de E-24. Conclusión: era un límite del Chromium sin pantalla, que se quedaba sin
  contextos WebGL en el segundo idioma de una misma sesión, no un fallo del sitio. Rama
  `mac/stage-visual5`.
- **Pendiente sin cerrar:** la captura de página completa sigue sin funcionar en Metal; ahora es
  solo un aviso (`info`), no una prueba.
