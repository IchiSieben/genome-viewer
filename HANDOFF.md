# HANDOFF — Visor del genoma / Genome Viewer, publicación (actualizado: 2026-09-26)

> Sesión autónoma del 2026-09-26. Todas las decisiones que se habrían
> consultado están en `docs/07-decisiones-autonomas.md`; las marcadas
> **[REVISAR]** son las primeras que conviene mirar.
>
> Llave de la API: **no** está en el historial (tres barridos, D-41). No hay
> STOP.

## Dónde está

- **Repo público**: https://github.com/IchiSieben/genome-viewer (`main`).
- **URL final**: https://ichisieben.dev/genome-viewer/ (EN) · https://ichisieben.dev/genome-viewer/es/ (ES)
  - **NO ESTÁ EN VIVO TODAVÍA.** El build está copiado en
    `Landing/public/genome-viewer/`, sin commit (la otra sesión trabaja el
    landing). Queda en vivo con el siguiente push del landing (ver abajo).
  - Primera subida con `noindex` (meta + `X-Robots-Tag`) y sin tarjeta
    visible en el landing, hasta que des el OK.

## Commits de cada fase (hashes después del saneado del historial)

| Fase | Commit |
|---|---|
| 1a — UTF-8, guardarraíles de mojibake y tildes, CLS medido | `dd0036c` |
| 1b — i18n ES/EN sin framework, un cascarón por idioma | `f4710f9` |
| 2 + 3 — identidad, movimiento, héroe vivo; por qué, hoja de ruta, cómo está hecho, referencias | `320bdd1` |
| 4 (prep) — vista narrativa en chunk propio, verify-live bilingüe, A/B | `ccc3bf3` |
| 5 — README, QA, HANDOFF | el siguiente a `ccc3bf3` (`git log`) |

## Para ponerlo en vivo (lo hace quien trabaje el landing)

1. En `Landing/`: `git add public/genome-viewer && git commit -m "genome-viewer: primera subida (noindex)" && git push`.
   No toca nada más del landing: es una carpeta nueva en `public/`.
2. Cuando Hostinger termine: `cd AlphaGenome/web && node scripts/verify-live.mjs https://ichisieben.dev/genome-viewer/`
   → `TODO OK` y `X-Robots-Tag noindex en N/N`.
3. **Tarjeta** (solo con tu OK): `Landing/public/genome-viewer/CARD.json` trae
   nombre, eslogan, descripción corta y larga, tags, URLs, repo, imagen OG y
   estado `beta` en los dos idiomas. Pasarlo a
   `Landing/src/content/projects/{en,es}/genome-viewer.md` con el formato de
   `botanica.md`. Los slugs de `skills` existen hoy en `src/content/skills`.
   El `title` tiene que coincidir con el `brand.name` de cada idioma.
4. **Quitar el noindex** (con tu OK): `cd AlphaGenome/web && AGP_NOINDEX=0 npm run build`,
   volver a copiar `dist/` sobre `Landing/public/genome-viewer/` y añadir
   `Sitemap: https://ichisieben.dev/genome-viewer/sitemap.xml` al
   `robots.txt` del landing.

Para actualizar el visor más adelante: `npm run build` en `web/` y copiar
`web/dist/` sobre `Landing/public/genome-viewer/` (el `CARD.json` está en
`web/deploy/`).

## Decisiones autónomas para revisar (detalle en docs/07)

- **D-10** Enrutado: dos páginas reales (EN raíz, ES `/es/`) + hash. No se
  generó un HTML por ruta; la receta para hacerlo está en `docs/08-i18n.md`.
- **D-31 [VERIFICAR]** La frase de la "interfaz permanente" **no está en
  alphagenome-docs** y no se publicó. El párrafo 7 de "Por qué" usa en su
  lugar las restricciones R1/R2/R3. Para cerrarlo: pegar la frase limpia en
  `alphagenome-docs/` y sustituir `why.p7` en `web/src/i18n/narrative.{es,en}.json`.
- **D-30** Referencias: "Radivojac 2026" es Hoffing R, …, Radivojac P;
  Sun/Mews/Bush y Hoffing son preprints; Zoonomia dice 240 especies.
- **D-40** Se publicó antes de hacer los extras (N4, N6, N7), para no tener
  todo el trabajo en una sola copia en disco.
- **D-41** Historial reescrito con `filter-branch` para quitar dos nombres de
  terceros. El respaldo del historial original está en
  `Portfolio/_papelera_claude/genome-viewer-backup/pre-sanitize-2026-09-26.bundle`
  y **contiene esos nombres: no subirlo a ningún sitio**. Borrarlo cuando
  quieras.
- **D-22 / D-24** Héroe con cascada SHAP viva y catálogo con AVI en miniatura:
  +2,2 KB gz de bundle, medido y aceptado.
- GitHub detecta la licencia como "Other" aunque el texto es MIT estándar.

## PENDIENTE y por qué

- **H7** (estudio poblacional): pendiente, como estaba; así se muestra en la
  hoja de ruta. Un resultado nulo se publicará igual.
- **En vivo**: depende del push del landing (arriba).
- **Extras N6, N4, N7**: ver la sección "Extras"; los que no se hicieron
  siguen en la hoja de ruta como planeados.
- De la auditoría visual (`docs/05-visual-audit.md`), sin tocar: colapsar el
  mapa de calor por sistema de órganos, plegar la ayuda del navegador en
  móvil, el hueco de las vistas cortas y las capturas de los estados de carga
  y error.
- Tiempos 3G de la última pasada local (5,4 y 6,2 s en dos vistas) tomados con
  la CPU al 100 %: repetirlos en vivo.

## Antes → después (esta sesión)

| Medida | Antes (`008f890`) | Después |
|---|---|---|
| Tests pytest | 110 aprox. (README anterior) | 134 |
| Escenarios de `verify` | 22 capturas | 39 capturas + 2 pasadas con movimiento |
| Bundle principal (gz) | 28,4 KB | 27,5 KB (el texto salió del bundle; entraron la cascada y el movimiento) |
| Portada, 3G lento (A/B, mediana) | 1 849 ms | 1 789 ms tras la 1b; 2 248 / 2 181 ms (EN/ES) en el A/B de la 2 con otra carga de máquina, sin diferencia fuera del ruido |
| Oleadas en serie (3G) | 2 | 2 |
| CLS portada / ficha / navegador | 0 / 0 / 0,0025 | 0 / 0 / 0,0025 |
| Idiomas | ES (sin tildes en el código) | ES + EN, tildes vigiladas por test |

Evidencia: `docs/evidence/performance-ab*.json`, `docs/06-qa-publicacion.md`.

## Comandos que importan

- Tests: `PYTHONUTF8=1 PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q`
- Build y comprobaciones: `cd web && npm run build && npm run verify && npm run verify:links`
- A/B: `node scripts/measure-ab.mjs <dist-de-referencia> 3` (`AGP_AB_LANG=es` para el cascarón español)
- En vivo: `node scripts/verify-live.mjs https://ichisieben.dev/genome-viewer/`

## Extras

| Extra | Estado | Commits | Decisión |
|---|---|---|---|
| N6 buscador de tracks | **Hecho**, en el mapa tejido × modalidad | `3b66d47`, `85578c2` | D-50 [REVISAR] |
| N4 comparador | en curso | — | — |
| N7 vista de gen | sin empezar | — | — |
