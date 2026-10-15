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
