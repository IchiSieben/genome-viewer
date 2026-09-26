# Auditoría visual — Visor del genoma (AlphaGenome)

Revisión de las 22 capturas numeradas en `web/shots/` (más las 8 en español) contra el
listón "estética con mucho contenido" tipo DeepMind/Gemini: aire generoso, jerarquía
tipográfica clara, color contenido, tema oscuro de primer nivel, layout móvil real. Sin
librerías de animación, sin sombras decorativas, sin gradientes gratuitos, sin 3D;
presupuesto de rendimiento en 3G lento; CLS debe quedar en 0.

> **Nota del 2026-09-26, tras regenerar las capturas.** El punto 1 del resumen
> (español dentro de la versión inglesa) se escribió sobre capturas anteriores
> al cierre de la Fase 1b: `verify` se había cortado a medias y dejó capturas
> viejas. Con las capturas regeneradas (`03-ficha-variante.png`,
> `17-sashimi.png`), familias, sistemas de órganos y hallazgos salen en inglés.
> Queda cerrado, y lo vigila `pipeline/tests/test_i18n.py`. El resto de la
> auditoría sigue vigente.

## 1. Resumen

Ordenado por impacto:

1. **Fuga de idioma: hay español hardcodeado dentro de la versión en inglés.** No es un
   matiz de estilo, es un defecto funcional. En `03/04-ficha-variante` los nombres de
   familia del SHAP ("REGULATORIO (ALPHAGENOME)", "Splicing (fusionado)",
   "Poliadenilación", "Terminación de proteína", "Es inserción", "Es deleción"), en
   `05/06-mapa-calor` los encabezados de categoría ("SANGRE E INMUNE", "CARDIOVASCULAR",
   "PIEL Y ANEXOS", "MÚSCULOESQUELÉTICO", "SISTEMA NERVIOSO", "RENAL Y URINARIO",
   "REPRODUCCIÓN", "RESPIRATORIO"), y en `17-sashimi` / `20-contactos` el párrafo entero
   de "THE FINDING"/"El hallazgo" aparecen en español dentro de la captura en inglés.
   Esto compite directamente con el trabajo de `docs/08-i18n.md` que se ve en curso.
2. **La leyenda de la rampa secuencial se invierte entre temas pero el texto que la
   explica no.** En `14-saturacion` (claro) el degradado va de claro (0.0) a oscuro
   (21.9) y el texto dice "cuanto más oscura la celda, mayor el AVI". En
   `15-saturacion-oscuro` el degradado del swatch va de oscuro (0.0) a claro (21.9) —
   consistente con el token `--seq-*` invertido en tema oscuro (`tokens.css:166-180`),
   pero el texto de ayuda sigue diciendo literalmente "the darker cell, the higher the
   AVI" sin matizar. Un usuario en oscuro lee mal el mapa si confía en el texto.
3. **Dos vistas terminan en un vacío enorme sin motivo de contenido.** `02-locus` y
   `10-sobre-los-datos` tienen 3-4 bloques de contenido arriba y luego un tramo de fondo
   liso hasta el pie, heredado de `.main { min-height: 100dvh }` (documentado en
   `base.css:141-168` como fix de CLS). El fix de CLS es correcto pero el resultado
   visual en vistas cortas es un salto de densidad muy fuerte: mucho contenido arriba,
   nada abajo, sin transición.
4. **El mapa de calor tejido×modalidad (`05/06`) es una pared de ~240 filas en una sola
   columna de scroll**, con etiquetas de fila y columna en `--text-2xs`/`--text-3xs` que
   ya son ilegibles en la miniatura y quedan al límite incluso a resolución real. No hay
   forma de colapsar por categoría, buscar un tejido, o ver solo "las 20 filas con mayor
   efecto" sin desplazar una captura de 10 000 px.
5. **Sin identidad ni favicon.** No existe ningún archivo de favicon en `web/` ni un
   `<link rel="icon">` en `index.html`: la pestaña del navegador muestra el ícono
   genérico. La única marca es `.topbar__mark`, cuatro trazos de color en 18×14 px
   (`base.css:99-107`) — un gesto correcto para no fingir un logo, pero no resuelve la
   pestaña ni un ícono para compartir.
6. **El límite de 75ch se pasa en un bloque concreto.** `.honesty__limits` usa
   `max-width: 84ch` (`base.css:966`); es el único bloque de prosa por encima del rango
   60-75ch objetivo. El resto (`.hero__lead` 62ch, `.card__lead` 72ch, `.finding__text`
   68ch, `.footer p` 70ch) está bien.
7. **Jerarquía plana en listas largas.** El catálogo de loci (`01-portada`) y la lista de
   variantes (`02-locus`) usan el mismo peso visual para cada fila: nombre en azul,
   coordenada en gris, conteo en gris más claro. Funciona a 9 filas; con más loci se
   vuelve una lista sin puntos de apoyo (sin agrupar, sin indicar cuáles tienen hallazgo
   publicado vs. cuáles no).
8. **El mapa de calor en tema oscuro (`06`) pierde contraste en las celdas de valor
   bajo/medio**: el gris de fondo de celda vacía y el azul/rojo pálido de valores
   pequeños quedan muy cerca en luminancia sobre `--surface-sunken` oscuro. No se puede
   confirmar sin inspeccionar en el navegador real, pero en la captura la banda media del
   mapa se lee como ruido uniforme.

## 2. Por vista

### Portada / catálogo (`01-portada`, `es-01-portada`)

**Funciona:** jerarquía clara título → lead → variante destacada → catálogo → estudios;
la variante destacada con gauge real es un buen "above the fold" con contenido de
verdad, no un placeholder. El bloque `ATLAS API` con metadatos técnicos (cliente, fecha,
calibración, hash de config) da densidad honesta sin saturar. Las cifras del score usan
tabular-nums y alinean bien.

**Falla:** la lista de 9 loci (`.catalog`) es monótona: mismo tamaño de fuente, mismo
color por columna en las 9 filas, sin separación visual entre "1 variante" y "3
variantes" (PPP1R1A/PDE1B tiene 3 y no resalta). El `topbar__mark` a 18×14 px es casi
invisible al lado de "Genome Viewer unofficial" en `text-sm`; en el es-01 el badge "no
oficial" es más ancho que "unofficial" y desalinea ligeramente el conjunto de la marca.

**Propuesta:** en `.catalog__detail`, dar peso (`ink` en vez de `ink-faint`) cuando el
conteo de variantes es >1, o agregar un badge discreto. Revisar si el topbar necesita un
segundo trazo (ej. contorno) para no depender solo del color en la marca.

### Locus (`02-locus`)

**Funciona:** cabecera con chips de metadata (rango, tamaño, genes, fuente) igual patrón
que el resto del sitio — consistencia correcta. Tabla de variantes con AVI y percentil
en la misma fila, fácil de escanear.

**Falla:** con solo 3 variantes la página deja ~1400px de fondo vacío entre el bloque
`ATLAS API` y el pie (visible en la captura completa, la mitad inferior es blanco liso).
Es el `min-height: 100dvh` de `.main` empujando el `.footer` fuera de vista — correcto
para CLS, pero visualmente esta vista se siente rota/incompleta comparada con
`03-ficha-variante`, que sí llena la altura.

**Propuesta:** cuando el contenido es corto, usar el espacio sobrante para algo de valor
real en vez de vacío puro: por ejemplo adelantar ahí el enlace "Open the signal track
browser for this locus" como tarjeta con vista previa en miniatura del track, en lugar
de un link de texto suelto al fondo de la lista de variantes.

### Ficha de variante (`03-ficha-variante`, `04-ficha-oscuro`, `09-movil-ficha`)

**Funciona:** es la vista más lograda del sitio. Dos columnas (AVI score / Contribución
por familia) con el mismo alto de tarjeta, cascada SHAP con línea base marcada y barras
con signo, "Most affected tracks" con swatch de modalidad + dirección + magnitud en una
sola fila compacta. El tema oscuro (`04`) mantiene el mismo contraste de texto e íconos
sin verse "invertido"; los colores divergentes (`--div-pos-2`/`--div-neg-2`) se leen
igual de bien en ambos temas. El stack a móvil (`09`) no rompe ninguna tabla ni corta
texto.

**Falla:** ver el hallazgo #1 del resumen — "Splicing (fusionado)", "Poliadenilación",
"Terminación de proteína", "Es inserción", "Es deleción" salen en español dentro de la
captura en inglés (`03` y `04`). Es la vista donde el defecto es más visible porque
concentra 18 nombres de feature en una sola pantalla.

**Propuesta:** los nombres de familia/feature deben salir del mismo diccionario i18n que
el resto de la UI (`web/src/i18n/`), no de una tabla de datos con strings fijos en
español.

### Mapa de calor tejido × modalidad (`05-mapa-calor`, `06-mapa-calor-oscuro`)

**Funciona:** la idea de "gris neutro cuando no hay dato, nunca un color pálido" está
bien resuelta y es honesta con los datos faltantes. Agrupar filas por sistema (sangre,
cardiovascular, digestivo…) con separadores es la estructura correcta para 240 filas.

**Falla:** es la vista con peor relación señal/ruido del sitio. Columnas con
`text-2xs`/`text-3xs` giradas, 240 filas sin colapsar, sin buscador ni resumen "top N".
Los encabezados de grupo están en español en la versión inglesa (hallazgo #1). En
oscuro (`06`) el contraste de la banda de valores bajos se pierde contra
`--surface-sunken`.

**Propuesta:** (a) agregar colapsar/expandir por grupo con el conteo visible cuando está
cerrado; (b) agregar una fila de resumen fija arriba con las 5-10 celdas de mayor
magnitud absoluta, a modo de resumen antes de la pared completa; (c) traducir los
encabezados de grupo vía i18n.

### Estudio (`07-estudio`, `es-07-estudio`)

**Funciona:** es el mejor ejemplo de estado "sin resultados" del sitio: badge
PLANIFICADO arriba de todo, antes de cualquier gráfico; tamaño de muestra, poder
estadístico y limitaciones conocidas en `dl`/`dt`/`dd` con tabular-nums; sección de
ética y gobernanza de datos con el mismo peso visual que las limitaciones técnicas, no
escondida al final en gris. Esta vista debería ser la plantilla para cualquier otro
estudio "planeado" futuro.

**Falla:** ninguna funcional. Cosmético: el badge naranja "Synthetic data" arriba del
título compite un poco con el título mismo por ser lo primero que se lee; podría ir
debajo del H1 en vez de encima.

**Propuesta:** mover el badge de estado bajo el título (patrón que ya usan las otras
vistas con `.source-chip` junto al título, no encima).

### Sobre los datos (`10-sobre-los-datos`, `es-10-sobre-los-datos`)

**Funciona:** tres tarjetas cortas y directas (cómo se produjo, términos, contrato de
datos) — nada de relleno, cada frase aporta un hecho verificable (fecha de recalibración,
versión de esquema, epoch de calibración).

**Falla:** mismo problema que `02-locus` — con solo 3 tarjetas cortas el resto de la
pantalla (más de la mitad) queda vacío antes del pie. Es la vista con la relación
contenido/altura más pobre del sitio.

**Propuesta:** esta es candidata más clara para acortar `min-height` en vistas "de
prosa" (sin gráfico, sin canvas que reserve alto) o para añadir un cuarto bloque con
enlaces relacionados (ej. link directo a locus destacado, a la política de calibración).

### Navegador de pistas (`11-navegador`, `12-navegador-oscuro`, `13-navegador-movil`)

**Funciona:** la mejor pieza de data-viz densa del sitio. REF en gris, ALT coloreado,
área sombreada en naranja/azul para la diferencia — se entiende sin leer el texto de
ayuda. Los chips de modalidad con swatch + estado on/off son claros. El tema oscuro
(`12`) es prácticamente idéntico en legibilidad al claro, sin que el naranja/azul pierda
saturación. El resumen `chr12 · 1.05 Mb · resolución 128 bp/bin · N ms/frame` es
honestidad de rendimiento a la vista del usuario, poco común y bien puesto.

**Falla:** en móvil (`13`) el bloque de instrucciones ("Scroll to zoom, drag to pan...")
ocupa casi tanto alto vertical como el propio track browser antes de llegar al gráfico;
en pantalla de 400px eso son ~5 líneas de texto secundario antes del contenido principal.
Las etiquetas de gen (`browser__gene-label`) a `text-3xs` son ilegibles en la miniatura
móvil y probablemente muy ajustadas a tamaño real también.

**Propuesta:** en `<= 480px`, colapsar el `.panel__hint` a un ícono "?" con tooltip/
disclosure, dejando el texto completo para desktop donde sobra espacio a los lados.

### Mapa de saturación (`14-saturacion`, `15-saturacion-oscuro`, `16-saturacion-movil`)

**Funciona:** metáfora correcta (columna = posición, fila = base alternativa, oscuro =
mayor impacto), ventana de contexto REF marcada con recuadro punteado. Layout muy
compacto y sin adornos.

**Falla:** hallazgo #2 del resumen — la dirección del degradado de la leyenda se invierte
entre temas pero el texto de ayuda no. Es un caso donde el token de color está bien
diseñado a propósito (`tokens.css` documenta por qué la rampa secuencial se invierte en
oscuro) pero la capa de copy no se ajustó junto con el token.

**Propuesta:** condicionar el texto de ayuda ("cuanto más oscura..." vs. "cuanto más
clara...") al tema activo, o mejor, describir la leyenda por posición ("el extremo
derecho de la barra es el de mayor AVI") en vez de por oscuridad, así el texto no
depende del tema.

### Sashimi de splicing (`17-sashimi`, `18-sashimi-oscuro`, `19-sashimi-movil`)

**Funciona:** el bloque "THE FINDING" con borde izquierdo en color y tabla de donor→
acceptor con delta con signo es el mejor patrón de "insight sobre el propio gráfico" del
sitio; debería replicarse en más vistas. Los arcos atenuados (`opacity: 0.22`) vs. los
que tocan la variante (`opacity: 1`) hacen evidente cuál es el hallazgo sin necesidad de
leer el texto primero.

**Falla:** hallazgo #1 — el párrafo completo de "THE FINDING" está en español fijo
dentro de la captura en inglés, es el bloque de texto más largo del sitio (unas 90
palabras) y el que más rompe el idioma declarado de la página.

**Propuesta:** mover ese texto al diccionario i18n con marcador de posición para los
números (que sí son datos, no deberían traducirse) — o, si el hallazgo se escribe una
vez por variante y no se planea traducir cada uno, aclarar en la propia vista con un
chip "ES" que ese análisis narrativo solo existe en español todavía, en vez de dejarlo
pasar como si fuera parte del inglés.

### Contactos 3D (`20-contactos`, `21-contactos-oscuro`, `22-contactos-movil`)

**Funciona:** "el veredicto va arriba del mapa" (comentario en `base.css:1533`) es una
decisión de diseño correcta y se nota: el número y la conclusión de honestidad estadística
("cambio máximo 0.0391, por debajo del umbral visible") llegan antes que el mapa de
calor, así nadie sobre-interpreta un color casi plano. Dos leyendas (Structure / Change)
con escalas y dominios distintos explicados en una sola línea cada una.

**Falla:** mismo hallazgo #1 en el párrafo "THE FINDING". Además, el mapa en sí
(triángulo rojo/azul sobre fondo `--surface-sunken`) es visualmente el elemento menos
protagonista de la vista pese a ser el más grande — todo el texto alrededor le compite en
peso porque usa el mismo tamaño de fuente que el resto de la prosa.

**Propuesta:** nada urgente; si se quiere dar más protagonismo al mapa, bajar el peso
tipográfico del bloque "Biosample: HepG2..." (hoy en el mismo `text-base` que el resto)
a `text-sm`/`ink-muted`, ya es metadata secundaria.

## 3. Transversal

**Tipografía.** Escala de 8 pasos (`0.625rem` a `2rem`) es suficiente y se usa con
disciplina — no hay tamaños sueltos fuera de la escala en lo revisado. Longitud de línea:
la mayoría de bloques de prosa está en 62-72ch, dentro del objetivo 60-75ch; el único
que se pasa es `.honesty__limits` a 84ch (`base.css:966`). Cifras siempre en `font-mono`
con `tabular-nums` — correcto y consistente en todas las vistas con tablas.

**Color y tema oscuro.** El sistema de tokens es el punto más fuerte del proyecto:
paleta categórica fija por entidad, rampa secuencial que invierte dirección en oscuro a
propósito, divergente con cero neutro real. Los dos puntos débiles concretos ya
señalados: (1) el mapa de calor tejido×modalidad pierde contraste en valores bajos sobre
`--surface-sunken` oscuro; (2) el texto de ayuda de la leyenda de saturación no sigue al
token cuando este se invierte. Fuera de eso, el tema oscuro no es una inversión
automática y se nota — mantiene la misma jerarquía de ink/ink-muted/ink-faint que el
claro.

**Espaciado.** Escala de 9 pasos, `--sp-1` a `--sp-24`, usada de forma consistente en
paneles, chips y tablas. El único patrón que produce un resultado pobre es el
`min-height: 100dvh` de `.main` en vistas cortas (`02-locus`, `10-sobre-los-datos`): el
espaciado interno de cada tarjeta está bien, el problema es el espacio en blanco
estructural que deja el layout completo.

**Estados vacíos y de carga.** El único estado vacío capturado (`07-estudio`,
`PLANIFICADO`) está muy bien resuelto: badge de estado antes que cualquier gráfico,
limitaciones conocidas con el mismo peso que los datos disponibles. No hay captura de
estado de carga (`.state__spinner`) ni de error (`.state--error`) en el set de shots —
valdría la pena capturarlos también antes de dar por cerrada la pasada visual, porque el
`.state--error` con fondo `--danger-soft` es el único lugar del sistema con un color de
fondo saturado y no se ha visto en pantalla real.

**Móvil a 400px.** Los stacks funcionan (una columna, sin overflow horizontal de página,
el `heatmap-scroll`/track-browser contienen su propio scroll lateral). El punto débil es
de densidad de texto de ayuda antes del contenido: en `13-navegador-movil` el bloque de
instrucciones compite en alto con el propio gráfico. Ningún texto se corta ni desborda
en las capturas móviles revisadas.

**Identidad.** No hay logo ni favicon. `index.html` no declara `<link rel="icon">` y no
existe ningún archivo de favicon en `web/`; la pestaña del navegador cae al ícono
genérico. La única marca es `.topbar__mark`, cuatro trazos de 3px en los cuatro primeros
colores categóricos — una alusión discreta a una pista de señal, correcta como gesto
minimalista pero no resuelve favicon ni imagen de compartir (OG image). Esto es
consistente con "sin logo todavía": no es un defecto de la pasada visual, es trabajo de
identidad pendiente y debería quedar explícito como tal antes de publicar.

## 4. Prioridades

| # | Ítem | Prioridad | Esfuerzo |
|---|---|---|---|
| 1 | Sacar del código fuente los strings en español fijo (familias SHAP, encabezados de categoría del heatmap, párrafos "THE FINDING") y moverlos al diccionario i18n | P1 | M |
| 2 | Legend de saturación: texto de ayuda debe seguir la dirección del token en tema oscuro, o describirse por posición en vez de por oscuridad | P1 | S |
| 3 | Favicon + `<link rel="icon">` (y, ya que se hace, una imagen OG mínima) | P1 | S |
| 4 | Mapa de calor tejido×modalidad: agregar colapsar por grupo y una fila de resumen "top N" antes de la pared completa | P2 | M |
| 5 | Revisar contraste del mapa de calor en valores bajos sobre tema oscuro (`--surface-sunken`) | P2 | S |
| 6 | Vistas cortas (`02-locus`, `10-sobre-los-datos`): usar el espacio que deja `min-height: 100dvh` con contenido real en vez de dejarlo vacío | P2 | M |
| 7 | Track browser en móvil: colapsar el bloque de instrucciones a un disclosure/tooltip bajo 480px | P2 | S |
| 8 | `.honesty__limits`: bajar `max-width` de 84ch a ≤75ch | P3 | S |
| 9 | Catálogo de loci: dar peso visual quando el conteo de variantes es >1 | P3 | S |
| 10 | Capturar y revisar los estados de carga y error (`.state__spinner`, `.state--error`) que no están en el set actual de shots | P3 | S |
