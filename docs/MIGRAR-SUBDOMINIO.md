# Migrar genome-viewer a genome.ichisieben.dev

> Escrito el 2026-10-07 desde la sesión del Landing (decisión del dueño: un subdominio por producto,
> ver `Portfolio/Landing/MIGRACION-SUBDOMINIOS.md`). **No se migró desde allí**: lo ejecuta esta sesión.
> Estado: hay una copia del build en `Landing/public/genome-viewer/` **sin versionar y sin publicar**
> (no está en `main` del Landing ni en el servidor). Esa copia no debe entrar al Landing: se publica
> directo en el subdominio.

## Lo que hay que cambiar en este repo

| Qué | Dónde | Hoy | Para el subdominio |
|---|---|---|---|
| `base` de Vite | `web/vite.config.*:7` | `'./'` (relativa) | se queda: ya funciona en cualquier raíz |
| Base de las páginas | `web/scripts/build-shells.mjs:33` | `AGP_BASE` = `/genome-viewer/` | `AGP_BASE=/` |
| Origen | `build-shells.mjs:32` | `AGP_SITE` = `https://ichisieben.dev` | `AGP_SITE=https://genome.ichisieben.dev` |
| canonical / `og:url` / `og:image` | `<head>`, desde `urlOf()` | `https://ichisieben.dev/genome-viewer/…` | sale de `SITE`+`BASE` |
| hreflang | `<head>` | `/genome-viewer/` y `/genome-viewer/es/` | `/` y `/es/` |
| `sitemap.xml` | `dist/` | rutas con `/genome-viewer/` | regenerar con las variables nuevas |
| noindex | `AGP_NOINDEX` (por defecto `1`) | `noindex, nofollow` | decisión del dueño al publicar |
| `fetch` de datos | `web/src/lib/data.ts:82,216` | relativo (base `./`) | verificar en navegador desde la raíz y desde `/es/` |
| CSP | — | ninguna propia | `.htaccess` propio. Sin orígenes externos (0 googleapis/gstatic en el build) |
| build-id | `<head>` | no hay | `<meta name="build-id" content="<sha corto>">` |
| `web/deploy/CARD.json` | ficha | apunta al layout viejo | actualizar `demoUrl` |

## Pasos (patrón de metal / radar)

1. `AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/ npm run build` → `grep -r genome-viewer dist` = 0
   (salvo el nombre del repo).
2. Subdominio por API: `hosting_domains_create-website-subdomain` (`subdomain=genome`,
   `directory=genome-app`); subida TUS **solo** dentro de `genome-app/`. Nunca deploy-static.
3. Smoke: 200, 0 errores de consola, 0 respuestas ≥ 400, EN y ES.
4. En el Landing (su sesión): ficha con `demoUrl` al subdominio; borrar la copia sin versionar
   `Landing/public/genome-viewer/` (no está en git: avisar al dueño, no `rm -r` sin listarla).
