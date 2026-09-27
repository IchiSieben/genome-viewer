# 06 — QA de publicación (2026-09-26)

Qué se comprobó antes de dejar el visor listo para publicar en
`https://ichisieben.dev/genome-viewer/`, cómo, y qué no se pudo comprobar.

## Estado en una línea

El build está copiado en `Landing/public/genome-viewer/` (154 archivos,
11 MB) y verificado en local con la CSP del landing. **No está en vivo
todavía**: el landing solo despliega con un push a `portfolio-landing@main`, y
ese push no lo hace esta sesión, porque otra sesión trabaja el landing.

## Lista de comprobación

| Comprobación | Cómo | Resultado |
|---|---|---|
| Tests del pipeline y del contrato | `pytest pipeline/tests` | 136 pasan |
| Build | `npm run build` (tsc, vite, cascarones, iconos, OG) | OK |
| Vistas, dos idiomas, dos temas, móvil | `npm run verify` (39 escenarios + 2 pasadas con movimiento) | TODO OK |
| Enlaces compartidos y estado en URL | `npm run verify:links` | TODO OK |
| Copia del landing, con su CSP | `verify-live.mjs` contra `Landing/public/genome-viewer` servido en `/genome-viewer/` | 18/18 OK (con el comparador, tras N6 y N4) |
| Errores de consola (incluida CSP) | los tres scripts | 0 |
| Peticiones fuera del propio host | los tres scripts | 0 |
| 3G lento | `measure-ab.mjs`, 3 rondas, EN y ES | sin oleadas nuevas; CLS 0 salvo el navegador (0,0025, igual que antes) |
| Idioma de la página | `<html lang>` comprobado en cada visita | OK |
| `noindex` | meta en los dos cascarones + `X-Robots-Tag` en `.htaccess` | meta OK; la cabecera solo se puede comprobar en vivo |
| Llave de la API | 3 barridos del historial y del árbol | 0 apariciones de la llave real |
| Nombres de terceros | `git log -p` completo | 0 tras el saneado (D-41) |
| Tildes y mojibake | `test_text_hygiene.py` | OK |
| Redacción (sin lenguaje clínico ni promesas) | `test_i18n.py` | OK |
| Referencias | PubMed, una por una | 13/13 verificadas (D-30) |

## Lo que queda por comprobar en vivo

Tras el push del landing:

```
cd AlphaGenome/web
node scripts/verify-live.mjs https://ichisieben.dev/genome-viewer/
```

Tiene que dar `TODO OK` y `X-Robots-Tag noindex en N/N documentos`. Si la
cabecera no aparece, el hosting no está leyendo el `.htaccess` de la
subcarpeta. El meta `noindex` sigue protegiendo, pero hay que saberlo.

## Tiempos de la última pasada local (máquina cargada)

| Vista, 3G lento | ms |
|---|---:|
| Portada EN | 2 615 |
| Ficha EN | 2 090 |
| Navegador EN | 5 389 |
| Portada ES | 6 176 |

Las dos últimas cifras están muy por encima de lo que dio `measure-ab` en la
misma tarde (1 822 y 2 181 ms en mediana). La CPU estaba al 100 % por otros
procesos. Hay que repetirlas en vivo antes de dar por buena ninguna.
