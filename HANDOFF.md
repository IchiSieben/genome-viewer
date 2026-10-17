# HANDOFF — Visor del genoma / Genome Viewer (actualizado: 2026-10-17, fases A y B)

## Sesión del 2026-10-17: fase A (bugs) desplegada, fase B (identidad) propuesta y PARADA

- **Encargo:** el dueño revisó el sitio en escritorio: bugs y falta de personalidad. Decisiones
  de la sesión: `docs/DECISIONES.md` F-01…F-13.
- **Fase A, rama `fase-a-bugs`, integrada en `main`**. Un commit por ítem, cada uno
  con una prueba que falló primero:
  - A1, la molécula (`ed0baf5`, `9aee197`, `a97d32b`, `b66908a`, `10fc97d`, `0ea3006`):
    `web/scripts/verify-motion.mjs`.
  - A2, el tour (`2d44140`): `web/scripts/verify-tour.mjs`.
  - A3, el layout (`8f36ede`, `4c945be`): `web/scripts/verify-layout.mjs`.
  - A4, el interruptor de nivel (`0055a5a`): `web/scripts/verify-register.mjs`.
  - Herramientas (`0d41d87`): `tools/privacy-audit.sh` antes de cada push; carril `visual` de la Mac
    en Metal.
- **Desplegado:** build de `10fc97d` (`0ea3006` solo cambia pruebas y documentos) con
  `AGP_NOINDEX=0`, por TUS a `genome-app/` (182 archivos, 12,5 MB). verify-live: TODO OK.
- **Mac (Metal), `stage-visual10` sobre `0ea3006`:** exit 0. stage, motion, layout, register y tour dan TODO OK en EN y ES, sin ninguna FALLA.
- **Fase B, rama `fase-b-identidad`** (`7c106a8`, no integrada, no desplegada): propuesta en
  `evidence/identidad/propuesta-genome.md`, mockup en `evidence/identidad/mockup/`, capturas en
  `evidence/identidad/capturas/`. Banco de átomos en GPU real en `evidence/identidad/atoms-bench.json`
  (peor p90 6,8 ms). **Espera el sí del dueño (F-10). No implementar.**
- **Pendiente del dueño:** NEEDS-OWNER #12 (el «título cortado» de A3: ¿qué navegador?), #13
  (átomos completos en un teléfono real), #14 (el hook del borrador de handoff escribe rutas
  locales; aquí se redactan a mano antes de cada commit).
- **Ojo al construir desde Git Bash:** `AGP_BASE='/'` se convierte en `C:/Program Files/Git/`.
  Construir desde PowerShell, como dice E-02.

## Estado anterior (actualizado: 2026-10-16, ramas `mac/*` borradas)

> Sesión autónoma del 2026-10-15 (13:14–23:30 Lima) con el prompt maestro
> `docs/09-PROMPT-escenario-educativo.md`. Decisiones: `docs/09-decisiones-autonomas.md`
> (E-01…; las **[REVISAR]** primero). Resumen para el dueño: `MORNING-REPORT.md`.
> Pendiente del dueño: `NEEDS-OWNER.md`. Llave de la API: no está en git.

## Dónde está

- **Repo público**: https://github.com/IchiSieben/genome-viewer (`main`; aquí `master` sigue a
  `origin/main` y se empuja con `git push origin master:main`).
- **En vivo y público (sin noindex desde el 2026-10-15, E-25)** en el subdominio propio
  (docroot `public_html/genome-app`, subido por TUS con `tools/deploy_tus.py`). Lo desplegado es
  el build de `10fc97d` (2026-10-17) con `AGP_NOINDEX=0`; verify-live TODO OK:
  - https://genome.ichisieben.dev/ y `/es/`: **el escenario**, el relato en siete capítulos.
  - https://genome.ichisieben.dev/app/ y `/es/app/`: **el visor**. Los enlaces viejos `/#/…`
    redirigen a `app/#/…`.
- Build para el subdominio desde PowerShell (E-02):
  `$env:AGP_SITE='https://genome.ichisieben.dev'; $env:AGP_BASE='/'; $env:AGP_NOINDEX='0'; npm run build`.
  Sin `AGP_NOINDEX='0'` vuelve el noindex (es el valor por defecto).
- Despliegue: `NOTES.md` → «Despliegue». Nunca `deploy-static-site-archive`.
- **Ficha del landing** en vivo: https://ichisieben.dev/projects/genome-viewer/ (Landing `main`
  `5fd2dd7`: merge `c3469ab` de `genome/ficha`, sitemap en `robots.txt` `29eece8`, números `5fd2dd7`).
- **Movido a la papelera (E7):** la copia sin versionar `Landing/public/genome-viewer/` (156
  archivos, 11 MB, el layout viejo) está en
  `Portfolio/_papelera_claude/genome-viewer-landing-legacy-2026-10-15/`. Se puede borrar.
- **Drive:** `Gdrive:01-Trabajo/Portfolio/AlphaGenome/` (vídeos de demostración en
  `media/2026-10-15/`, `README-DRIVE.md`), listado en `drive.manifest`.

## Ramas `mac/*` borradas (2026-10-16, E-27)

- El remoto tiene solo `main` (commit del registro: `bf65704`). Las 13 ramas `mac/stage-*` remotas y las 15 locales (2 nunca
  subidas) se borraron por orden del dueño, después de comprobar los vídeos en Drive por hash.
- **Copia íntegra:** `Portfolio/_papelera_claude/alphagenome-mac-branches-2026-10-16.bundle`
  (309 142 106 bytes, sha256 `2ef53896ac34c33179e4daae54ca4af6229c166e10a00e8f0875e306f4c88dd1`).
  La sesión de disco la moverá a F: (§18); compara el sha256 después de moverla.
- **Solo en el bundle:** los vídeos de `media3` (con el bug E-24), los 40 informes de Lighthouse
  de `lh2`, las capturas de página completa de `visual4`, `stage-doctor2` y `stage-lh-base`.
- **Recuperar una rama** (probado en un repositorio limpio):
  `git bundle verify <bundle>` y luego
  `git fetch <bundle> refs/heads/mac/stage-lh2:refs/heads/mac/stage-lh2`. Para traerlas todas:
  `git fetch <bundle> 'refs/heads/mac/*:refs/heads/mac/*'`.
- **Pendiente:** cancelar los 4 trabajos viejos de la cola de enjambre (NEEDS-OWNER #11). Si no se
  cancelan, `stage-media` volvería a subir vídeo cuando la Mac reaparezca.

## Commits del escenario

| Hito | Commit |
|---|---|
| E0 — visor en vivo en el subdominio, carriles de la Mac | `95d8709` |
| E1 — nubes de puntos desde mmCIF reales (AGSC) | `cf2acf5` |
| E3+E4+E5 — escenario en `/`, visor en `/app/`, narrativa, escala, pósters | `79699ab`, `d5631ce` |
| carril `lh` con las cuatro páginas | `616fa78` |
| sprites de 1BNA, banco de frames síncrono con la GPU, A/B | `00b6371` |
| carril `media` arreglado, coste por frame del M2 Pro (E-21) | `5d4b781` |
| pósters y OG renderizados en la Mac (E-22) | `da3d58e` |
| Lighthouse en vivo de las cuatro páginas (E-23) | `ebb0204` |
| cada capítulo con su estructura, velos de cabecera y pie (E-24) | `6db6ea1` |
| E7 — sin noindex, ficha del landing, vídeos en Drive (E-25) | `8c0a66f` |
| revisión visual en Metal, un navegador por idioma (E-26); cierre de la sesión | `664e669` |

## Commits de la publicación anterior (hashes después del saneado del historial)

| Fase | Commit |
|---|---|
| 1a — UTF-8, guardarraíles de mojibake y tildes, CLS medido | `dd0036c` |
| 1b — i18n ES/EN sin framework, un cascarón por idioma | `f4710f9` |
| 2 + 3 — identidad, movimiento, héroe vivo; por qué, hoja de ruta, cómo está hecho, referencias | `320bdd1` |
| 4 (prep) — vista narrativa en chunk propio, verify-live bilingüe, A/B | `ccc3bf3` |
| 5 — README, QA, HANDOFF | `6b3a9b9` |

## Decisiones de la publicación anterior (detalle en docs/07)

- **D-10** Enrutado: dos páginas reales (EN raíz, ES `/es/`) + hash. No se
  generó un HTML por ruta; la receta para hacerlo está en `docs/08-i18n.md`.
- **D-31 — cerrada el 2026-10-15**: la frase permanente está en
  `alphagenome-docs/04-frase-permanente.md` y en `why.p7`. Lo que sigue es la nota original:
  la frase **no estaba en alphagenome-docs** y no se publicó. El párrafo 7 de "Por qué" usa en su
  lugar las restricciones R1/R2/R3. Para cerrarlo: pegar la frase limpia en
  `alphagenome-docs/` y sustituir `why.p7` en `web/src/i18n/narrative.{es,en}.json`.
- **D-30** Referencias: "Radivojac 2026" es Hoffing R, …, Radivojac P;
  Sun/Mews/Bush y Hoffing son preprints; Zoonomia dice 240 especies.
- **D-40** Se publicó antes de hacer los extras (N4, N6, N7), para no tener
  todo el trabajo en una sola copia en disco.
- **D-50 [REVISAR]** N6 se puso en el mapa tejido × modalidad, no en el
  navegador de señal como decía la hoja de ruta.
- **D-51** N4 comparador en `#/compare`; las cascadas no comparten escala
  porque el valor base cambia de ficha a ficha (medido).
- **D-52** N7 no se construyó: necesita consultas nuevas a la API.
- **D-53** CLS 0,0012 en 3G por CSS incrustado de más; corregido moviendo el
  CSS del comparador a su chunk. Lo que use solo una vista diferida, con su chunk.
- **D-41** Historial reescrito con `filter-branch` para quitar dos nombres de
  terceros. El respaldo del historial original está en
  `Portfolio/_papelera_claude/genome-viewer-backup/pre-sanitize-2026-09-26.bundle`
  y **contiene esos nombres: no subirlo a ningún sitio**. Borrarlo cuando
  quieras.
- En `Portfolio/_papelera_claude/genome-viewer-landing-*` hay tres copias
  anteriores del build (unos 11 MB cada una), creadas en esta sesión al
  recopiar al landing. Se pueden borrar; la de las `18:27` es el build de antes
  de los extras y sirve de referencia para el A/B.
- **D-22 / D-24** Héroe con cascada SHAP viva y catálogo con AVI en miniatura:
  +2,2 KB gz de bundle, medido y aceptado.
- GitHub detecta la licencia como "Other" aunque el texto es MIT estándar.

## PENDIENTE y por qué

- **H7** (estudio poblacional): pendiente, como estaba; así se muestra en la
  hoja de ruta. Un resultado nulo se publicará igual.
- **N7** (vista de gen): planeada; necesita puntuar genes enteros (D-52).
- De la auditoría visual (`docs/05-visual-audit.md`), sin tocar: colapsar el
  mapa de calor por sistema de órganos, plegar la ayuda del navegador en
  móvil, el hueco de las vistas cortas y las capturas de los estados de carga
  y error.
- Tiempos 3G de la última pasada local (5,4 y 6,2 s en dos vistas) tomados con
  la CPU al 100 %: repetirlos en vivo.

## Antes → después (esta sesión)

| Medida | Antes (`008f890`) | Después |
|---|---|---|
| Tests pytest | 110 aprox. (README anterior) | 136 |
| Escenarios de `verify` | 22 capturas | 43 capturas + 2 pasadas con movimiento + 2 del buscador |
| Bundle principal (gz) | 28,4 KB | 28,2 KB (el texto salió del bundle; entraron la cascada, el movimiento, N6 y la ruta de N4; el comparador es un chunk de 2,2 KB) |
| Portada, 3G lento (A/B, mediana) | 1 849 ms | 1 789 ms tras la 1b; 2 248 / 2 181 ms (EN/ES) en el A/B de la 2 con otra carga de máquina, sin diferencia fuera del ruido |
| Oleadas en serie (3G) | 2 | 2 |
| CLS portada / ficha / navegador | 0 / 0 / 0,0025 | 0 / 0 / 0,0025 |
| Idiomas | ES (sin tildes en el código) | ES + EN, tildes vigiladas por test |

Evidencia: `docs/evidence/performance-ab*.json`, `docs/06-qa-publicacion.md`.

## Comandos que importan

- Tests: `PYTHONUTF8=1 PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q`
- Build y comprobaciones: `cd web && npm run build && npm run verify && npm run verify:links`
- A/B: `node scripts/measure-ab.mjs <dist-de-referencia> 3` (`AGP_AB_LANG=es` para el cascarón español)
- En vivo: `node scripts/verify-live.mjs https://genome.ichisieben.dev/`

## Extras

| Extra | Estado | Commits | Decisión |
|---|---|---|---|
| N6 buscador de tracks | **Hecho**, en el mapa tejido × modalidad | `3b66d47`, `85578c2` | D-50 [REVISAR] |
| N4 comparador | **Hecho**, `#/compare` y enlace en cada ficha | `5abcbc8` | D-51 |
| N7 vista de gen | **Planeada** (no se construye: necesita consultas nuevas a la API) | — | D-52 |
