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
