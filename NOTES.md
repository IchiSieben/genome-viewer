# NOTES — Plataforma AlphaGenome

## Estado (2026-09-26): publicado en GitHub; en vivo con el próximo push del landing

- Nombre: **Visor del genoma** / **Genome Viewer** (no oficial).
- Repo público: <https://github.com/IchiSieben/genome-viewer>
- URL final: <https://ichisieben.dev/genome-viewer/> (EN) y `/es/` (ES), con
  `noindex` en esta primera subida. Build copiado en
  `Landing/public/genome-viewer/`, sin commit en el landing.
- Despliegue anterior (H6): <https://darkgray-alpaca-401605.hostingersite.com/>

H0 a H6 hechos, más N1, N2, N3, V4 y V5. Falta H7, el estudio poblacional.

---

## 2026-09-26 — sesión autónoma de publicación

Qué se hizo, por fase (detalle y decisiones en `docs/07-decisiones-autonomas.md`,
estado para retomar en `HANDOFF.md`):

- **1a**: UTF-8 de punta a punta; tests contra mojibake y tildes faltantes; CLS
  en `measure.mjs`; servidor de pruebas con la CSP del landing en
  `/genome-viewer/`.
- **1b**: i18n ES/EN sin framework (`web/src/i18n/`, `docs/08-i18n.md`), un
  cascarón HTML por idioma generado en el build, `data/dist/` intacto (opción
  A), formato numérico propio para el español.
- **2**: marca de cuatro barras, favicon, OG por idioma con datos reales,
  tokens de display y medida, cascada SHAP viva en el héroe, movimiento con
  IntersectionObserver/WAAPI respetando `prefers-reduced-motion`, catálogo con
  AVI en miniatura. Auditoría en `docs/05-visual-audit.md`.
- **3**: `#/why`, `#/roadmap`, `#/how`, `#/references`; 13 referencias
  verificadas en PubMed.
- **4**: historial saneado (dos nombres de terceros), llave comprobada tres
  veces, repo público creado y subido, build copiado al landing,
  `verify-live.mjs` en verde contra esa copia en local.
- **5**: README.md (ES) y README.en.md (EN), `docs/06-qa-publicacion.md`,
  HANDOFF.

Aprendido:

- Con la CPU saturada, una medición suelta en 3G varía más de 1 s. Solo sirve
  el A/B intercalado (`measure-ab.mjs`), mirando oleadas y bytes, que no
  tienen ruido.
- Una captura de página entera no hace scroll: con entradas al hacer scroll,
  las capturas se toman con `reducedMotion: 'reduce'` y el movimiento se
  prueba aparte.
- `Intl.NumberFormat('es-PE')` no da números en español de norma (decimal con
  punto); se usa `es` con el separador de miles cambiado a U+202F.

---

## 2026-09-11 — sesion 2 (con llave)

### Dos bugs de entorno que bloqueaban todo

1. **`~/.env` estaba en UTF-16 LE**, escrito por la redireccion de PowerShell.
   El lector de la llave asumia UTF-8 y reportaba "no hay llave" teniendo la
   llave delante. Peor: `python-dotenv` sube por el arbol de directorios desde
   cualquier sitio bajo el home, asi que ese archivo rompia `import anndata` en
   TODO proceso Python de la maquina, no solo en este proyecto.
   Arreglado: el archivo esta ahora en UTF-8, con respaldo en
   `~/.env.utf16.bak` y el hash del valor verificado identico. El lector
   detecta el BOM.

2. Detalle que costo media hora: usar el codec `utf-16-le` en vez de `utf-16`
   deja el BOM vivo como un `U+FEFF` invisible al principio de la linea, y
   `str.strip()` no lo quita.

### H0 — la sonda, 39 llamadas

- **Los 18 features del AVI**, con su nombre exacto y en orden, estan en
  `pipeline/src/alphagenome_platform/avi.py`. Un nombre desconocido LANZA.
- **La cascada cierra**: `base + suma(contribuciones) = score crudo`, base
  medida en -0,049016 con dispersion de 3,5e-05 entre variantes.
- **Cuantizacion verificada con senal real**: 0,0061 px de error sobre un panel
  de 400 px. El esquema aguanta.
- **Concurrencia**: 3,09 s / 0,84 s / 0,73 s con 1 / 4 / 8 workers, sin
  RESOURCE_EXHAUSTED. Por defecto se fija 4.
- **Confirmada la correccion del prompt**: `predict_variant` manda
  `iter([request])`, UNA peticion. El troceo de 32 pb es solo de
  `atlas.query_interval`.

### La variante semilla de los documentos esta mal

`rs884510` se da como `chr12:54578515:T>C`. El servidor la rechaza: la
referencia real es **C**. Los alelos que el Atlas conoce son A, G y T. El
pipeline ahora resuelve cada variante contra el servidor antes de usarla.

### Cuatro bugs que solo aparecieron con datos reales

1. **`tracks.json` se paso del presupuesto** (135 kB contra 120). Lo cazo el
   test de presupuesto en la primera corrida real. Se recortan las filas a los
   240 biosamples de mayor efecto y el documento declara cuantos habia.
2. **NaN en el JSON.** El Atlas devuelve NaN en ALPHAMISSENSE para variantes no
   codificantes, y `json.dumps` lo escribe SIN comillas. Python lo relee tan
   tranquilo; `JSON.parse` lo rechaza. La ficha moria con "no es JSON valido" y
   sin decir de que archivo. Ahora `write_json` usa `allow_nan=False`, lo no
   finito se escribe `null`, el error nombra el artefacto, y hay un test que
   busca la cadena en el TEXTO emitido.
3. **El navegador de tracks mostraba datos SINTETICOS con el sello del Atlas.**
   Las rutas de los bloques por variante se escribian relativas al directorio
   de la variante, pero el contrato dice que son relativas a `locus.json`. El
   visor resolvia hacia el directorio del locus, donde seguian los bloques de
   la era de las fixtures, y los dibujaba sin un solo 404 ni error de consola.
   Es el peor fallo de toda la sesion: un artefacto viejo en el sitio
   equivocado se ve igual que uno correcto. Arreglado con prefijo de ruta,
   reconstruccion limpia del locus, y un test que prohibe `.bin` huerfanos.
4. **Un `<g>` de SVG no tiene area propia.** Los clics y los tooltips en el
   hueco entre la etiqueta y la barra de la cascada caian al `<svg>` de fondo.
   Ahora cada fila lleva una banda transparente.

### Rendimiento, medido

Detalle que importa: **el servidor de pruebas no comprimia**, por un `\b` de
una expresion regular escrito como caracter de retroceso (invisible en
cualquier editor). Eso inflaba el numero de 3G un 40 % antes de medir nada.

| | Rapida | 3G lento | En linea, 3G |
|---|---:|---:|---:|
| Portada | 120 ms | 1 336 ms | 1 537 ms |
| Ficha | 154 ms | 2 140 ms | 2 464 ms |
| Navegador | 161 ms | 2 148 ms | 2 350 ms |

4,8 ms por frame contra un presupuesto de 16,7. Heap 9,5 MiB.

Lo que se descarto **por medicion**: worker de descompresion (no hay base64 que
decodificar, el binario se mapea sin copiar) y envolventes precalculadas por
nivel de zoom (el render no es el cuello de botella y multiplicaria artefactos).

### Paleta: validada, no razonada

`python pipeline/tools/validate_palette.py` simula las tres dicromacias y
calcula CIEDE2000. Pasa en vision normal. Bajo dicromacia no separa, **como
ninguna paleta de ocho categorias**: Okabe-Ito saca 0,6 en la misma metrica
donde esta saca 0,9. Ojo al citarlo: Okabe-Ito gana en vision normal (21,7
contra 13,3) y por mucho en el mejor trio (57,1 contra 15,1), porque su trio
incluye el negro y aqui el negro es tinta. Las tres columnas estan en
`docs/evidence/palette-validation.txt`.

**Resuelto (2026-09-12):** el trio de comparacion simultanea son las ranuras
**5-6-7**, no las tres primeras. `familyColor` usaba 1-7-3, que en tema oscuro
media **1,7** —azul y violeta colapsan en protanopia—; 5-6-7 mide 13,0 y es el
unico de los 35 trios que pasa el umbral de 12,0 en las cuatro visiones y en
los dos temas. Sin cambiar ningun hex. El validador lee ahora las ranuras de
`familyColor` en `color.ts` y falla si se desfasan, y eso ya no depende de que
alguien lo corra a mano: `pipeline/tests/test_palette.py` lo recalcula en cada
`pytest` (4 tests, comprobados en negativo).

### Despliegue

Se creo un sitio NUEVO, `darkgray-alpaca-401605`, en vez de sobreescribir uno
existente. `palevioletred-wolf-386898` tiene un `index.html` de 612 kB puesto el
2026-09-07 que **no esta en el inventario del brief**; no se toco.

Verificado en el sitio desplegado con navegador real: seis vistas, cero errores
de consola, cero peticiones fuera del host. Esa ultima comprobacion es como se
verifica que la web no llama a la API.

### Portada: una variante ya cargada arriba del todo

La portada arrancaba con el catalogo. Quien llegaba de fuera veia una lista de
loci y tenia que elegir antes de ver nada. Ahora el primer bloque es un heroe con
titulo, **una frase que nombra AlphaGenome y el Atlas**, una variante real ya
dibujada (chips + medidor de aviPhred) y dos botones, uno de ellos **Mapa de
saturacion**. Medido a 400x720: todo eso cabe sobre el pliegue; el catalogo
empieza a 813 px, que es la consecuencia buscada de degradarlo.

La variante del heroe **no esta escrita en ningun config**: la deriva el pipeline
de los `locus.json` emitidos (tiene saturacion -> tiene rsid -> aviPhred mas
alto). Un puntero a mano sobrevive al artefacto al que apunta; uno derivado no
puede quedar desfasado. `cli.py reindex` lo recalcula sin gastar cuota.

Coste medido en 3G lento: **+60 ms** (1 437 -> 1 497 ms con el selector viejo) y
+3 KiB, que es lo que pesa el `card.json` que la portada antes no pedia. **No
costo un salto**: siguen siendo 2 oleadas, porque el `<link rel="preload">` del
HTML manda el `card.json` junto al bundle.

**La regresion que si aparecio, y que no se adivino: CLS.** 0,2580 en movil y
0,1782 en escritorio. Dos causas. La chica (0,0047) era el hueco reservado del
heroe, corto por 18 px. La grande (0,1734, el 97 %) **no era del heroe**: el pie
de pagina sale del HTML pegado a un `<main>` vacio y baja de golpe cuando el
bundle pinta. Existia desde antes; el heroe solo la hizo visible. `min-height:
100vh` en `.main` pone el pie debajo del pliegue y un desplazamiento fuera de la
ventana no cuenta como CLS. Con 70vh todavia quedaba 0,1736. Resultado:
**0,0000 en los dos tamanos**, y 0,0000-0,0071 en las cinco vistas.

---

### Conjunto congelado: 6 loci nuevos, un bug real encontrado al crecerlo

Anadidas 6 variantes candidatas de una captura del Atlas de DeepMind (APOA1,
DNM1, WNT7B, CELSR2/PSRC1, BTK, NAGS), cada una resuelta contra el servidor
ANTES de tocar `loci.py`: las 6 coinciden exactamente (posicion + ref + alt),
cero correcciones necesarias. Congeladas con `build-locus`; APOA1 y CELSR2 con
mapa de saturacion (los dos casos con motivo roto/creado), las otras 4 sin el
(`--no-saturation`).

**Bug real, no de codigo nuevo: `run.py` y `atlas_source.py` asumian que todo
scorer de la respuesta trae una columna `variant` en `.obs`.** Con APOA1 tres
scorers (`POLYADENYLATION`, `SPLICE_JUNCTIONS`, `SPLICE_SITE_USAGE`) devolvieron
`n_obs=0` -sin poliadenilacion ni splicing cerca de esa posicion- y por lo tanto
sin esa columna: `KeyError: 'variant'`. No es una respuesta corrupta, es "no hay
nada que reportar en esta modalidad". Arreglado en los dos lugares que hacen
`.obs["variant"]` sobre un scorer de heatmap: se salta el scorer si `n_obs == 0`
o la columna no existe, en vez de asumir que siempre esta.

**La regla del heroe NO cambio de variante en la primera pasada, y la razon no
era la que se sospechaba.** APOA1 quedo con aviPhred **25,96** y CELSR2 con
**21,76** -muy por encima del 0,25 de rs884510-, pero ninguna de las dos tiene
rsid. El criterio 2 original de `featured_pointer` exigia rsid: el bloqueo era
eso, no un umbral de percentil faltante.

**Reestructurada `featured_pointer()` (decision del usuario, con reencuadre):**
el rsid esta ANTICORRELACIONADO con el objetivo, no es un requisito razonable.
rs884510 tiene rsid porque esta al 71 % en PEL -comun, y comun casi siempre es
poco impactante-; APOA1 (25,96) no tiene rsid en dbSNP 155 en absoluto,
verificado contra UCSC track completo. El Atlas existe para puntuar variantes
sin catalogar; exigir rsid descartaba justo esas. Regla nueva:

- **Compuertas** (excluyen, no seleccionan): `provenance.source` en
  `API_SOURCES`, tiene `card` + `saturation`.
- **Piso**: `aviPhred >= 10` (percentil 90). Si nadie lo pasa, `featured` sale
  `None` y la portada cae a su version sin heroe -fallar visible en vez de
  featurear algo que el propio medidor llama "por debajo de la mediana"-.
- **Orden**: aviPhred descendente entre quienes pasan el piso.
- **rsid**: dejo de ser compuerta. Es campo de presentacion.

Con esto el heroe paso a **APOA1, aviPhred 25,96** (top 0,3 %). Tres tests
nuevos en `test_contract.py` fijan el comportamiento: gana sin rsid, nadie pasa
el piso -> `None`, un locus sintetico nunca entra aunque su score sea el mas
alto.

**Enriquecimiento de rsid, no bloqueante:** nuevo modulo
`acquire/ucsc.py`, consulta el track `dbSnp155` de UCSC (hg38, sin llave) por
posicion exacta, cachea en disco, y si falla o no hay nada simplemente sigue
-nunca descarta la variante-. Corre dentro de `resolve_variants` solo cuando
`loci.py` no trae ya un rsid verificado a mano. Confirmado en vivo: CELSR2 es
**rs12740374** (Musunuru et al. 2010, crea el sitio C/EBP en SORT1/CELSR2);
APOA1 no tiene ninguno en dbSNP 155.

**UI**: nuevo `rsidChip()` en `lib/ui.ts`, usado en el heroe, la ficha completa
y el mapa de calor. Sin rsid muestra el chip "sin rsid catalogado" en vez de
omitirlo -es informacion, no un hueco-. El listado compacto de variantes por
locus se dejo tal cual (omite el chip en silencio); mostrarlo en cada fila de
una lista densa era ruido, no argumento.

`min-height: 100vh` en `.main` paso a `100vh` + `100dvh` (el segundo pisa al
primero donde hay soporte). En movil, `vh` mide el viewport GRANDE con la
barra del navegador oculta; si el pie se reserva con eso, en un telefono con la
barra puesta el pie real cae mas abajo de lo reservado y ese hueco se cierra de
golpe al hacer scroll, la misma clase de salto que el heroe ya habia obligado a
evitar por carga. Medido tras el cambio: CLS sigue en 0,0000 en movil y
escritorio, incluso con el heroe nuevo (APOA1/25,96) y el conjunto crecido.

TTI en 3G lento no se movio con el conjunto mas grande (2 saltos, ~1,49-1,56 s
en las cuatro vistas); `pytest` 67 passed, `npm run verify` TODO OK.

## V4 — sashimi de splicing (DNM1, neuronas glutamatergicas)

**La afirmacion de "coste cero" de la seccion Pendiente anterior era falsa,
verificado leyendo el codigo antes de construir nada.** `predict_variant` ya
se llama una vez por variante, pero su `requested_outputs` sale de
`SIGNAL_OUTPUTS` (RNA_SEQ, DNASE, ATAC, CAGE, CHIP_HISTONE, PROCAP) -sin
SPLICE_JUNCTIONS- y su `ontology_terms` son sangre/pulmon/higado -ninguno
neuronal-. Exactamente el escenario que el encargo advertia: con el biosample
por defecto se hubiera dibujado un tejido donde la variante no hace nada.
V4 hace una llamada `predict_variant` APARTE por variante con
`sashimi_ontology` declarado, con `ontology_terms=[curie]` (nunca `None`,
que pediria todos los biosamples disponibles). Coste real: una llamada de
Model API por variante con sashimi, no cero.

**Ontologia**: `CL:0000679` (neurona glutamatergica, Cell Ontology),
confirmada con `AtlasClient.scorer_metadata()` -metadata, no gasta cuota de
prediccion- en vez de supuesta.

**Ventana y piso de magnitud, medidos**: `SASHIMI_HALF_WIDTH` reutiliza el
`DETAIL_HALF_WIDTH` de V3 (variante +-4096 pb) en vez de inventar una tercera
medida. `SASHIMI_MIN_VALUE = 0,01`, elegido sobre percentiles reales de las
5553 uniones de la ventana de DNM1 (p50 = 0,0001, p99 = 0,0207); el lado debil
de la senal real (0,032-0,006) lo cruza claramente.

**Biologia encontrada** (no buscada, salio de mirar los datos). *Corregido:
la primera version de esta nota, y el informe que la acompano, decian que eran
DOS uniones. Son CUATRO.* chr9:128226027 G>A desplaza el sitio aceptor 6 pb en
neuronas glutamatergicas, y lo hace para **los dos donadores de rio arriba a la
vez** -por eso son cuatro uniones y no dos-:

| donador -> aceptor | REF | ALT | ALT - REF |
|---|---|---|---|
| 128222860 -> 128226028 | 0,0320 | 1,5985 | +1,5665 |
| 128224389 -> 128226028 | 0,0269 | 1,4540 | +1,4271 |
| 128222860 -> 128226034 | 1,4270 | 0,0058 | -1,4212 |
| 128224389 -> 128226034 | 1,0909 | 0,0063 | -1,0846 |

Hebra +, asi que 128226028 esta 6 pb rio ARRIBA de 128226034: el exon se alarga
por su extremo 5'. La siguiente union por |delta| esta en -0,46, asi que las
cuatro se separan solas del resto. Son ademas, exactamente, las cuatro cuyos
extremos caen a 20 pb o menos de la variante (el siguiente extremo mas cercano
esta a 43 pb). Es el caso de demostracion.

**Esquema**: `contracts/v1/splice.schema.json`, `status: "ok"|"no_data"`
explicito -mismo patron que "sin rsid catalogado"-: un scorer con `n_obs=0`
para todo el locus (como le paso a APOA1 con POLYADENYLATION/SPLICE_JUNCTIONS/
SPLICE_SITE_USAGE) es un estado, no un artefacto vacio silencioso.

**Reconciliacion REF/ALT por coordenada** `(start, end, strand)`, no por
indice: verificado empiricamente que DNM1 trae el mismo conjunto de 5553
uniones a ambos lados, pero el codigo no asume que eso sea universal (probado
con datos de prueba deliberadamente desordenados).

**Vista**: `web/src/views/spliceSashimi.ts`. Arcos REF arriba / ALT abajo
sobre un eje compartido, nunca superpuestos; grosor logaritmico acotado a
1-8px con leyenda; modo "solo delta" (ALT menos REF, escala divergente, la
misma que ya reserva el sistema visual para diferencias REF/ALT).

**Etiquetado por delta, corregido** (primera version: por magnitud). Las tres
etiquetas caian en arcos constitutivos de 4,3 cuyo delta es 0,01 -ruido- y la
senal real quedaba muda. Ahora: orden por `|ALT - REF|` con piso en
`minValueShown` para que ninguna etiqueta apunte a ruido, mas UNA sola sobre
el arco mayor visible como referencia de escala. Generalizado a D10 en
`docs/01-architecture.md`.

**Resalte por proximidad**: los arcos cuyos extremos caen a <=20 pb de la
variante van a plena intensidad y el resto atenuado, y se dibujan al final
para que queden encima. El 20 esta calibrado contra el artefacto, no razonado
(extremos a 2 y 8 pb; el siguiente a 43). Solo se atenua si hay algo que
resaltar.

**El hallazgo, en la propia vista**: `splice.json` gana un campo opcional
`finding` con el parrafo redactado. El texto lleva la afirmacion y **ninguna
cifra**; las cifras las pinta la vista desde `junctions`, en una tabla debajo.
`pipeline/tests/test_dnm1_finding.py` contrasta la afirmacion frase por frase
contra el artefacto real y rompe la build si dejan de coincidir.

**Dos bugs de dibujo, encontrados mirando el SVG y no la captura**: (1) las dos
uniones que comparten donador tienen el mismo punto medio y la misma altura, asi
que sus etiquetas se dibujaban EXACTAMENTE encima -"1,43" sobre "0,03" se leia
como "0,09", un numero que no existe-; hay un colocador que las separa. (2) la
referencia de escala iba al arco mayor a secas, cuyo punto medio cae fuera del
lienzo: la etiqueta se dibujaba en x = -60, invisible. Ahora se elige la mayor
cuyo punto medio se ve.

**Guarda de track unico**: un curie no garantiza un solo track (medido:
`EFO:0003042` trae 7 en CONTACT_MAPS). `build_splice` comprueba
`values.shape[1] == 1` y se para nombrando los tracks en vez de quedarse con el
primero en silencio.

`npm run verify`: TODO OK, con el conteo exacto de arcos resaltados (6: son las
4 uniones, pero de dos de ellas solo se dibuja el lado REF porque su ALT queda
bajo el piso) como guarda de regresion. `pytest`: 83 passed.

**Riesgo vivo**: solo DNM1 tiene `sashimi_ontology` fijado -el resto de loci no
tiene pestana de splicing, por diseno, no por bug-; la ventana de +-4096 pb
muestra el salto local, no la estructura completa del transcrito de 63,6 kb; la
identidad de conjunto REF/ALT se verifico solo para DNM1; y el colocador de
etiquetas resuelve colisiones por desplazamiento fijo, que basta para 7
etiquetas y no esta probado para muchas mas.

## V5 — diff de mapas de contacto (CELSR2/PSRC1, rs12740374, HepG2)

Caso: `chr1:109274968 G>T`, la variante de Musunuru et al. 2010 que crea el
sitio C/EBP de SORT1. Biosample **HepG2 (`EFO:0001187`)**: el mecanismo
publicado es hepatico y HepG2 es la linea hepatica canonica del menu de 4D
Nucleome. Medido con `scorer_metadata()` antes de gastar cuota: **un solo
track**, `4dn:4DNFIS6HAUPP`, in situ Hi-C.

**BTK descartado con razon, y la razon vale mas que el descarte.** GM12878 es
linfoblastoide y habria encajado con BTK, pero BTK esta en el cromosoma X y
GM12878 viene de donante femenino: el mapa promedia X activa con X inactiva,
que tienen estructura 3D distinta -la inactiva forma megadominios-. Es el peor
cromosoma posible para ensenar contactos en esa linea.

### Las unidades no son las que dice el SDK

El docstring dice "probability that two DNA bases are in contact". Es falso
para lo que devuelve `predict_variant`, y construir sobre esa frase habria
dado una vista sutilmente mentirosa. Medido sobre la ventana real:

- **79,1 % de los valores de REF son negativos** (97,9 % en la diagonal).
- Rango de REF: −0,746 a 1,938.
- `exp(REF)` **no** decae como ley de potencias: se queda rondando 1.
- El propio test del SDK genera estos mapas con `np.random.normal(0, 1, ...)`.

O sea: ya vienen en espacio logaritmico y con el decaimiento por distancia
retirado. Tres consecuencias, todas contra lo que se haria por defecto:
`ALT − REF` **ya es** el log del cociente (no hace falta pseudoconteo, no hay
denominador que se anule); **no hay celdas "sin contacto" que enmascarar** (las
262 144 tienen valor finito y un valor bajo es *deplecion*, no ausencia); y
**no hay que normalizar por distancia** (se cancelaria en la resta, y el modelo
ya lo hizo). Queda en D13.

### El resultado: la estructura no se mueve, y eso es el resultado

| Medicion | Valor |
|---|---|
| Cambio maximo de toda la ventana de 1 Mb | **0,0391** |
| Relieve de la estructura (max − min de REF) | 2,684 |
| El maximo, como fraccion del relieve | **1,46 %** |
| p50 / p99 de \|Δ\| | 0,00195 / 0,0156 |
| `mean\|Δ\|` en la fila del bin de la variante | 0,014270 |
| Feature `MAX_ABS_CONTACT_MAPS` ya congelado en `card.json` | 0,014126 |

Las dos ultimas filas cuadran a menos del 1 %: confirma las unidades, confirma
que HepG2 es el track que manda ese feature del AVI, y confirma la lectura de
`ContactMapScorer` (`variant_scorers.py:245`: media de la diferencia absoluta
sobre las interacciones del bin de la variante, sin signo, 1 Mb). Detalle que
sale de la simetria: "fila y columna" son el mismo conjunto contado dos veces,
asi que **la cruz del AVI es literalmente UNA fila**. Y el mayor cambio del
megabase entero cae dentro de ella: en (255, 380), a 256 kb, REF 1,0703 → ALT
1,0312. Pero cae **fuera del recorte que se dibuja** -el recorte llega al bin
319-, asi que el artefacto lleva `insideDrawnWindow` y el texto lo dice: una
frase cierta sobre una celda que no esta en la imagen es la peor version de
esta vista, porque el lector recorre la fila resaltada y no la encuentra.

### La trampa, y como esta cerrada

Un "redondo por encima del grueso" de |Δ| habria sido 0,05. Medido, con ese
dominio el maximo pinta al **78 % de saturacion** y el **14,26 %** de las
celdas sale con color perceptible: un mapa espectacular hecho de un cambio del
1,5 %, y ningun test habria fallado. La regla que lo corta: **si el dominio
cambia cuando cambian los datos, es autoescalado**, venga redondeado o no.

`CONTACT_DOMAIN = 1.0`, ancla externa a los datos: en espacio logaritmico 1 es
del orden de duplicar o partir por la mitad el contacto -el doble exacto solo si
la base es 2, que es premisa y no medicion; ver riesgo vivo-, la magnitud de un
limite de TAD que se rompe. Saturacion plena pasa a significar "esto reorganizo el locus", e
identica en todos los loci, asi que dos variantes se comparan mirando dos
mapas. Queda en D12. Lo hace estructural, no una buena intencion: el dominio
viaja en el artefacto, la vista no lo recalcula nunca, y
`test_el_dominio_es_LA_CONSTANTE_y_no_se_deriva_de_los_datos` multiplica la
escala de los datos por cien y comprueba que el dominio no se mueve.

### La vista

Un cuadrado, dos mitades: **arriba la estructura (REF)** con escala propia
-etiquetada como lo que es, el relieve que hay, no una medida de efecto- y
**abajo el cambio** con el dominio fijo. Es el argumento entero en una imagen:
relieve de dominios evidente arriba, nada abajo. Se puede porque la simetria se
comprueba al congelar, asi que la mitad de abajo era una copia desperdiciada.

Como el color -correctamente- no carga informacion, la carga se reparte en
tres: la leyenda lleva **marca del maximo observado** dentro del dominio fijo
(medido: al 48 % / 52 % de la barra, pegada al centro; con la lupa se va al
11 % / 89 %); el veredicto va **antes** del mapa, con las cifras y la
comparacion contra el relieve; y la magnificacion es un **boton etiquetado
×20**, ofrecido solo despues de que el estado por defecto haya dicho la verdad.

La cruz del bin de la variante va resaltada: es exactamente lo que midio el
feature del AVI, asi que el enlace desde la cascada SHAP aterriza en las celdas
que produjeron el numero. Un bloque al pie ensena las dos magnitudes lado a
lado **diciendo en que se diferencian**, que es lo unico que impide
confundirlas.

### Hueco real encontrado al anadir el artefacto

`web/scripts/check-provenance.mjs` clasifica por nombre de archivo y **salta lo
que no reconoce**. `contacts.json` no estaba en su `kindOf`, asi que el primer
build lo desplego sin pasar por la compuerta de proveniencia, y siguio diciendo
"todos de la API" -solo que contando 48 en vez de 49-. Registrado, y ademas
cerrado con `test_la_porteria_de_JS_conoce_los_mismos_artefactos_que_la_de_python`,
que lee los dos archivos y compara. Comprobado que el test puede fallar.

### Guardarrail de redaccion

`test_findings_wording.py` recorre **el catalogo** (`loci.LOCI`), no los
artefactos, para que no pueda saltarse: un guardarrail de redaccion que se
salta deja pasar el texto el dia que alguien clona el repo sin `data/dist`.
Comprueba que ningun `*_finding` lleve cifras ni terminos clinicos o de
fenotipo -prefijos, no palabras exactas, y sin tildes, para que `causal` y
`patogenico` caigan igual-, incluidos los nombres de enfermedad de los loci del
catalogo. Y un test comprueba que la lista de prohibidos de verdad atrapa.

### Riesgo vivo

- **El dominio ±1 esta anclado a una interpretacion, no a una medicion.** Que 1
  sea "duplicar el contacto" depende de que la base del logaritmo sea e o 2, y
  eso NO se pudo medir: el SDK no lo documenta y los datos no lo revelan. La
  decision de que 1 es la magnitud de un cambio estructural sigue siendo un
  juicio; lo que si esta medido es que el dominio no se mueve con los datos.
- **Una sola variante con contactos.** `CONTACT_HALF_BINS = 64` esta calibrado
  contra la distancia a SORT1 en este locus. Otro locus con su gen diana a 200
  kb necesitaria otra ventana, y hoy nada lo detecta salvo mirar.
- **El presupuesto va al 71,8 %** (70 625 B de 96 KB). Una ventana mayor o una
  segunda variante con contactos no caben sin revisar la cuantizacion.
- **El texto del hallazgo es prosa libre.** El test protege la aritmetica y el
  vocabulario, no la interpretacion biologica.

## Pendiente

- **H7, el estudio poblacional.** Necesita el VCF de ancestria local de gnomAD.
  Las compuertas G1 a G6 del documento 03 siguen sin correr.
- **N4 comparador, N6 buscador de tracks, N7 vista de gen.**
- Enlazar el visor desde el landing del portafolio.

## Comandos

```bash
# datos
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli build-locus
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli validate
PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q

# recalcular lo derivado del indice (la variante de portada) sin gastar cuota
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli reindex

# paleta y sonda
python pipeline/tools/validate_palette.py --triples
python pipeline/tools/h0_probe.py

# web
cd web && npm run build && npm run verify && npm run verify:links && npm run measure
```

## Despliegue

```bash
cd web && npm run build && cd dist
python -c "import shutil; shutil.make_archive(r'<ruta>/alphagenome-site','zip',root_dir='.')"
# subir por TUS con la URL de hosting_generateUploadURLV1, luego
# hosting_deployStaticSiteArchiveV1 con archive_path=alphagenome-site.zip
cd web && node scripts/verify-live.mjs https://darkgray-alpaca-401605.hostingersite.com/
```
