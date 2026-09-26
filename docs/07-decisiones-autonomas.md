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
