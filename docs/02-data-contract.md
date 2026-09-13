# Contrato de datos v1

*La fuente normativa son los archivos de `contracts/v1/`. Este documento explica
las decisiones; cuando los dos discrepen, manda el esquema, porque es contra él
que el pipeline valida antes de escribir nada a disco.*

---

## Qué es y qué no es

El contrato es la **única** frontera entre el pipeline y la web. El pipeline no
sabe cómo se dibuja nada; la web no sabe de dónde salieron los números. Todo lo
que cruza esa frontera son archivos en `data/dist/` que validan contra estos
esquemas.

La consecuencia práctica que importa: **el trabajo de interfaz no puede quedar
bloqueado por la cuota de la API ni por la red.** El generador de fixtures emite
artefactos que cumplen el mismo contrato, y la web no distingue unos de otros
salvo por el sello de proveniencia, que muestra en pantalla a propósito.

## Árbol de artefactos

```
data/dist/
├── index.json                                 catálogo ligero  (≤ 32 KB)
├── loci/<locusId>/
│   ├── locus.json                             variantes y mapa de bloques (≤ 64 KB)
│   ├── annotations.json                       genes y transcritos  (≤ 128 KB)
│   ├── variants/<variantId>/
│   │   ├── card.json                          V1  (≤ 50 KB)
│   │   ├── tracks.json                        V2  (≤ 120 KB)
│   │   ├── saturation.json                    N1  (≤ 96 KB)
│   │   └── splice.json                        V4  (≤ 64 KB)
│   └── signals/<nivel>/<modalidad>.bin        V3  (≤ 160 KiB por archivo)
└── studies/<studyId>/manifest.json            V6  (≤ 96 KB)
```

Las rutas dentro de `locus.json` son **relativas a ese archivo**, no a la raíz,
para que mover un locus de carpeta no obligue a reescribirlas.

## Orden de carga

Es lo que hace que la primera pintura cueste **10 165 bytes** y no 2,5 MB:

1. `index.json` en el arranque. Solo punteros, ningún dato de variante.
2. `locus.json` al entrar a un locus.
3. `card.json` o `tracks.json` al abrir una vista de variante.
4. Un `.bin` **por modalidad y por nivel de resolución**, y solo cuando esa
   modalidad se muestra. Elegir una modalidad nueva descarga un archivo; el
   nivel de 1 pb no se pide hasta que la ventana baja de 8 192 pb.

## La variante de portada se deriva, no se escribe

`index.json` puede traer un campo `featured` con el locus, la variante y si esa
variante tiene mapa de saturación. Es lo que la portada muestra **ya cargado**,
sin que el visitante tenga que elegir nada.

Lo que importa del campo no es su forma, es de dónde sale: **lo calcula el
pipeline leyendo los `locus.json` que acaba de emitir**. No hay un config con el
nombre de la variante escrito a mano. Un puntero escrito a mano sobrevive al
artefacto al que apunta —se renombra un locus, se deja de congelar una
saturación— y la portada se rompe en la cara del primer visitante. Uno derivado
no puede quedar desfasado, porque se recalcula cada vez que los datos cambian.
Es el mismo patrón que la compuerta de proveniencia y que el validador de
paleta: la comprobación lee el valor que el código usa de verdad, en vez de
confiar en una copia.

**Compuertas** (excluyen candidatas, no las eligen):

1. **Que el locus venga de la API** (`provenance.source` en `API_SOURCES`).
   Ningún locus sintético entra al sorteo del héroe.
2. **Que tenga `card` y mapa de saturación.** La portada promete acceso directo
   al mapa; una promesa que lleva a un 404 es peor que no hacerla.
3. **Que el `aviPhred` alcance el percentil 90** (`PHRED >= 10` en la escala del
   medidor). Por debajo de eso el propio medidor rotula la variante «por debajo
   de la mediana del genoma», y featurear algo que la pantalla misma califica
   de mediocre es peor que no featurear nada.

Entre las que pasan las tres, gana el **`aviPhred` más alto**.

**El rsid NO es compuerta**, y la primera versión de esta regla se equivocó al
tratarlo como una. dbSNP no tiene entrada para la enorme mayoría de los ~9 000
millones de SNVs que el Atlas puede puntuar —es justo el punto del Atlas:
puntuar lo que nadie ha catalogado—, así que exigir rsid descartaba
sistemáticamente a las variantes más interesantes de mostrar. Peor: el rsid está
**anticorrelacionado** con lo que hace buena una demo. `rs884510` tiene rsid
precisamente porque es común (71 % de frecuencia derivada en peruanos), y común
casi siempre significa poco impactante; una variante con `aviPhred` alto y sin
catalogar —nadie la ha visto, el modelo igual tiene una opinión— es el mejor
argumento del visor, no una razón para ocultarla. El rsid sigue viajando en el
artefacto y se muestra cuando existe; cuando no, la interfaz lo dice
explícitamente («sin rsid catalogado») en vez de omitirlo en silencio.

Si nada pasa las tres compuertas, el índice sale **sin** `featured` y la
portada cae a su versión sin héroe. Es preferible a lo que hacía la regla
anterior con un único candidato disponible: elegir "el más alto que haya",
aunque el medidor lo calificara de mediocre.

El puntero de hoy es `chr11:116,837,649 T>G` (APOA1), con `aviPhred` **25,96**
—top 0,3 %— y sin rsid catalogado en dbSNP 155. Cuando el conjunto crezca con
algo que puntúe más alto, el puntero se moverá solo.

### Enriquecimiento de rsid, no bloqueante

`resolve_variants` intenta rellenar el rsid contra el track `dbSnp155` de UCSC
(hg38, sin llave) cuando `loci.py` no trae ya uno verificado a mano. Es
enriquecimiento, no contrato: si UCSC no tiene nada en esa posición, o la
consulta falla, la variante sigue construyéndose igual, sin rsid. Ver
`acquire/ucsc.py`.

### `reindex`: recalcular el puntero sin gastar cuota

```bash
python -m alphagenome_platform.cli reindex
```

Recalcula las partes **derivadas** de `index.json` —hoy solo `featured`— leyendo
el disco, sin una sola llamada a la API. Existe porque la derivación puede
cambiar (criterio nuevo, variante nueva con saturación) y volver a correr
`build-locus` solo para refrescar un puntero costaría cuota real sin traer un
dato nuevo, lo que choca con la regla de cero costo variable.

Lo que `reindex` **no** hace: inventar proveniencia. El sello y la fecha del
índice en disco se conservan tal cual, porque describen la corrida que trajo los
datos, y esta no trae ninguno.

## Los dos niveles de resolución

| Nivel | Bin | Cobertura | Valores por track |
|---|---:|---|---:|
| `overview` | 128 pb | 2²⁰ pb (1 048 576) | 8 192 |
| `detail` | 1 pb | ±4 096 pb sobre la variante | 8 192 |

La misma cifra en los dos niveles no es casualidad: deja una sola ruta de
dibujo en el visor.

El binning por media borra los picos estrechos, y un sitio de splicing de 2 pb
que desaparece al alejar el zoom es un **error de lectura del gráfico**. Por eso
`bin_signal` admite `max` por magnitud conservando el signo, y hay un test que
lo fija.

## El bloque binario `AGSB`

```
[0:4]    magic "AGSB"
[4:6]    versión de formato, uint16 LE
[6:8]    relleno
[8:12]   longitud de la cabecera JSON, uint32 LE
[12:..]  cabecera JSON utf-8, rellenada hasta que la carga quede en múltiplo de 8
[..:]    int16 LE; por cada track, el arreglo REF seguido del arreglo DELTA
```

**El relleno se calcula sobre el offset absoluto de la carga, no sobre la
longitud de la cabecera.** El prefijo mide 12 bytes, así que rellenar la
cabecera a múltiplo de 8 dejaría la carga en 12+8k, que es 4 módulo 8, y
`new Int16Array(buffer, offset)` lanzaría `RangeError`. Se detectó midiendo la
alineación, no leyendo el código, y hay un test parametrizado sobre doce tamaños
de cabecera que lo fija.

El archivo se identifica solo: un `.bin` suelto, sin el índice, sigue siendo
legible dentro de un año.

### Por qué se guarda DELTA y no ALT

La hipótesis de partida era que comprimiría mejor, porque el delta es casi todo
ceros. **Se midió y es falsa:** gzip da 1,3 % *peor*.

La decisión sobrevive por precisión, que también se midió. La vista dibuja la
**diferencia**. Con REF y ALT guardados por separado, cada uno se cuantiza contra
el máximo de la señal completa y al restarlos los dos errores se suman sobre una
cantidad mucho menor que esa señal. Guardado el delta, se cuantiza contra su
propio máximo: entre **10× y 221× más preciso**, y la ventaja crece justo cuando
el efecto es pequeño.

### Cuantización

Cada arreglo lleva su `scale`, su `transform` (`linear` o `log1p`) y su
`maxAbsError` **medido**, no estimado. El criterio de aceptación no está escrito
en porcentaje sino en píxeles: sobre un panel de 400 px de alto el error queda
por debajo de **0,05 px**. El test está escrito así justamente para que el
criterio no se pueda diluir.

## Proveniencia: por qué es obligatoria

Dos fechas la vuelven no negociable:

- **2026-06-18**, recalibración de los cuantiles del AVI: antes se estimaban
  sobre chr22, ahora genome-wide.
- **2026-07-14**, corrección de la inferencia de indels.

Comparar artefactos de cosechas distintas es inválido, y **un PHRED no lleva
escrito de qué cosecha viene**. Por eso todo artefacto sella `source`,
`clientVersion`, `queriedAt` en UTC, `configHash` y `calibrationEpoch`. Un test
recorre `data/dist/` entero y falla si algo no lo trae.

`hasQuantiles` es un campo aparte porque `layers['quantiles']` **es condicional**:
el cliente 0.9.0 solo lo crea si el servidor devolvió `calibrated_scores` no
vacío. Asumir que está es un error silencioso.

`source: "synthetic"` marca las fixtures, y la web lo muestra en una franja
ámbar. Una figura hecha con datos inventados no puede pasar por predicción.

### La compuerta: ningún artefacto sintético llega al despliegue

Que el JSON diga la verdad **no basta**. El peor fallo de la sesión 2 fue un
artefacto que declaraba su origen correctamente y aun así se dibujaba como si
fuera real, porque nadie leía ese campo. La defensa tiene que ser mecánica.

**La regla.** Los únicos orígenes que cuentan como "de la API" son
`atlas-api` y `model-api`, declarados como **conjunto explícito**. No es una
prueba de subcadena: con `"api" in source` bastaría llamar al origen `fake-api`
para colarse, y hay un test que fija esa decisión.

Un artefacto con cualquier otro origen —o **sin sello**— rompe el build. Con una
sola excepción, concedida por **propiedades del documento** y no por su ruta:

> la ficha de un estudio con `status: "planned"` cuyos paneles sean **todos** de
> tipo `note`, es decir que no traiga ni un número.

Publicar el plan de un estudio antes de correrlo es justo lo que este proyecto
dice querer hacer; lo que no vale es que ese documento lleve cifras inventadas.
En cuanto el estudio se declara concluyente, o le entra un panel con datos,
pierde la excepción. Las excepciones concedidas **se imprimen siempre** en la
salida del build: una excepción silenciosa deja de ser una excepción y pasa a ser
un agujero.

**Dónde corre, dos veces.** La regla está implementada en dos sitios porque hay
dos caminos al despliegue:

| Implementación | Corre en | Por qué hace falta |
|---|---|---|
| `contract.assert_production_provenance` | `cli validate`, `pytest` | El pipeline no puede dejar `data/dist/` en mal estado |
| `web/scripts/check-provenance.mjs` | `npm run sync`, y por tanto `npm run build` | `web/dist/` es lo que se sube; si la compuerta viviera solo en Python, bastaría olvidarse de correrlo |

**Son dos implementaciones de un solo contrato.** Si se cambia una hay que
cambiar la otra; `web/scripts/test-provenance-gate.mjs` corre los mismos cuatro
casos que `pipeline/tests/test_contract.py` contra la versión de JS, para que no
se separen en silencio.

**En pantalla.** Cada vista lleva la marca de origen junto al título
(`sourceChip`), además de la franja completa al pie (`provenanceStrip`) con
cliente, fecha, hash de configuración y época de calibración. Un origen que no
esté en el conjunto se pinta como aviso, con borde, fondo y texto cambiados —no
solo color.

**Lo que la marca en pantalla NO puede hacer**, y conviene decirlo para no
confiarse: no habría cazado el fallo de la sesión 2. Los bloques `.bin` de señal
no llevan sello propio, así que un bloque viejo en el sitio equivocado se dibuja
bajo el sello del locus correcto. Contra eso sirven el test de `.bin` huérfanos y
esta compuerta, no la interfaz. La interfaz sirve para el caso más común: que
alguien mire una figura y sepa, sin preguntar, si es una predicción o una
fixture.

## Los 18 features del AVI

Se modelan como una **lista ordenada de objetos** con `id`, `label`, `family` y
`contribution`, no como 18 campos con nombre fijo.

La razón es que sus nombres reales son server-side: `grep -rn "AVI"` sobre el
paquete `alphagenome` 0.9.0 completo da **cero coincidencias**. Hasta que haya
una llave y se pueda correr `probe`, los nombres de la fixture son
provisionales. Modelarlos como lista hace que sustituirlos sea cambiar una
fixture y no tocar el visor.

Las cuatro familias, que sí están documentadas, suman 18: 10 regulatorios,
4 de proteína, 2 de conservación, 2 de indel. Un test lo verifica en cada ficha.

## Formato disperso del mapa de calor

`tracks.json` guarda las celdas como `[índiceBiosample, índiceModalidad, valor,
cuantil]` y omite lo indistinguible de cero. Una matriz densa con los nombres
repetidos en cada celda costaría varias veces más, y el mapa es disperso por
naturaleza.

Un test verifica que ningún índice apunte fuera de rango: un índice roto dejaría
celdas huérfanas que el visor dibujaría en el sitio equivocado sin quejarse.

## `splice.json`: por qué necesita su propia llamada a `predict_variant`

`SPLICE_JUNCTIONS` no viaja en la llamada que ya arma `card.json`/`tracks.json`:
esa llamada pide `SIGNAL_OUTPUTS` (RNA_SEQ, DNASE, ATAC, CAGE, CHIP_HISTONE,
PROCAP) sobre `ONTOLOGY_TERMS` fijo (sangre, pulmón, hígado). Si una variante
solo hace algo en un biosample fuera de esa lista -el caso de DNM1, splicing en
neuronas glutamatérgicas-, esa llamada dibujaría un tejido donde no pasa nada,
simétrico y sin fallar. `splice.json` solo se genera para las variantes que
declaran `sashimi_ontology` en `loci.py`, con una llamada `predict_variant`
aparte y `ontology_terms=[ese_curie]` -nunca `None`, que pediría todos los
biosamples disponibles-. El curie se confirma con `AtlasClient.scorer_metadata()`
(metadata, no gasta cuota de predicción) en vez de suponerse.

`status` es `"ok"` o `"no_data"`, igual que el resto de scorers que pueden
devolver `n_obs=0`: un biosample sin observaciones es un estado que hay que
decir, no un artefacto vacío silencioso. Las uniones REF y ALT se reconcilian
por `(start, end, strand)`, nunca por índice de arreglo -verificado que DNM1
trae el mismo conjunto a ambos lados, pero nada garantiza que eso sea
universal-, y se descartan las que no llegan a `minValueShown` en ninguno de
los dos lados (ese piso se mide, ver `docs/01-architecture.md`).

Un curie **no** garantiza un solo track: en los metadatos de `CONTACT_MAPS`,
`EFO:0003042` (H1-hESC) trae **seis**. Como el artefacto lee `values[i, 0]`,
`build_splice` comprueba `values.shape[1] == 1` y se detiene nombrando los
tracks en vez de quedarse con el primero en silencio. Agregarlos sería una
decisión de modelado, y no le corresponde al congelador tomarla.

### `finding`: la frase lleva la afirmación, la vista pone las cifras

Campo opcional. Es el párrafo redactado a mano que convierte un gráfico *de
datos* en un gráfico *de un hallazgo*, y solo lo llevan las variantes donde
alguien midió algo que merece decirse (hoy: DNM1 en `splice.json` y
CELSR2/PSRC1 en `contacts.json`).

La regla de reparto es la que hace que no envejezca:

- **El texto no lleva cifras.** Prosa congelada con números dentro es prosa que
  miente en cuanto el artefacto se regenera, y nadie se entera porque el número
  sigue teniendo pinta de número.
- **Las cifras las pinta la vista** desde `junctions`, en la tabla que va justo
  debajo del párrafo. Son verdad por construcción.
- **La afirmación la vigila un test.** `pipeline/tests/test_dnm1_finding.py` lee
  el artefacto real y comprueba, frase por frase, lo que el párrafo dice: que
  son cuatro uniones, que son las que tocan la variante, que los dos aceptores
  distan seis bases, que cada donador invierte su preferencia, y que ordenar
  por magnitud no las encuentra. Si alguien regenera `splice.json` y la
  biología sale distinta, rompe la build antes de que el demo enseñe un
  hallazgo que ya no está en sus propios datos. El test también falla si
  aparece una cifra dentro del texto.

La alternativa -derivar el párrafo en la vista a partir de las uniones- se
descartó: generaría una afirmación biológica automática, y una afirmación
automática equivocada es peor que ninguna. La otra alternativa -escribirlo en
el código de la vista- haría que la vista supiera qué es DNM1.

### El texto de un hallazgo no entra en terreno clínico

La segunda mitad de la regla, y la que no puede depender de que haya artefactos
congelados. Un hallazgo redactado es la única prosa del proyecto que afirma algo
sobre biología, así que tiene una línea que no cruza: **se queda en lo que el
modelo predice, nunca en lo que le pasa a una persona.**

Es a la vez lo que exigen los *Output Terms* de AlphaGenome (R3: uso no
comercial, de investigación, no diagnóstico) y lo que separa un visor publicable
de uno que insinúa un diagnóstico sin decirlo.

`pipeline/tests/test_findings_wording.py` lo vigila recorriendo **el catálogo**
(`loci.LOCI`), no los artefactos. La diferencia importa:
`test_dnm1_finding.py` se salta si `data/dist` no está, que es correcto para
comprobar que una afirmación sigue siendo cierta contra sus datos; pero un
guardarraíl de redacción que se salta es un guardarraíl que deja pasar el texto
el día que alguien clona el repo sin artefactos.

Comprueba dos cosas sobre cada campo `*_finding` del catálogo:

- **Ninguna cifra**, la misma regla de arriba.
- **Ningún término clínico ni de fenotipo.** La lista es de *prefijos*, no de
  palabras exactas, para que `causal`, `causado` y `causante` caigan con `caus`;
  y el texto se normaliza sin tildes y en minúsculas, para que `patogénico` no se
  cuele por la tilde. Incluye además los nombres de enfermedad asociados a los
  loci del catálogo —epilepsia y encefalopatía por DNM1, colesterol/LDL/coronario
  /infarto por CELSR2–SORT1, agammaglobulinemia por BTK, hiperamonemia por NAGS,
  anemia y hemoglobina por PPP1R1A—, una línea por locus. Si entra un locus
  nuevo, entra ahí su enfermedad.
- Y un test comprueba que **la lista de prohibidos de verdad atrapa**: un
  guardarraíl que no puede disparar no prueba nada.

## `contacts.json`: el dominio del color es parte del contrato

Tercera llamada a `predict_variant`, por la misma razón que `splice.json` (D11):
`CONTACT_MAPS` no está en `SIGNAL_OUTPUTS` y su menú de ontologías es otro mundo
—28 tracks, **todos** de 4D Nucleome y **todos** líneas celulares: cero tejido
primario, cero neuronal—. El biosample correcto aquí casi nunca coincide con el
de las otras modalidades de la misma variante, así que se declara por variante
en `contacts_ontology`.

Medido antes de gastar cuota, con `scorer_metadata()`: HepG2 es `EFO:0001187` y
trae **un solo track** (`4dn:4DNFIS6HAUPP`, in situ Hi-C). El guardarraíl de
multitrack está igualmente puesto —`EFO:0003042` (H1-hESC) y `EFO:0003045` (H9)
traen seis cada uno— y en mapas de contacto lee el **último** eje, no el segundo:
la forma es `(bins, bins, tracks)`.

**Lo que el artefacto lleva y por qué.**

| Campo | Por qué está |
|---|---|
| `domain` | El dominio absoluto del color, constante del pipeline. La vista lo usa tal cual y **no lo recalcula nunca**. Ver D12. |
| `visibleThreshold` | Fracción del dominio por debajo de la cual el cambio no alcanza un paso de color. Existe para que la vista pueda escribir *"por debajo del umbral visible"* en vez de dejar un mapa en blanco que lo mismo significa "no pasó nada" que "falló la carga". |
| `maxAbsDelta` | Medido sobre la ventana **predicha** de 1 Mb, no sobre el recorte que se dibuja: afirmar "el cambio máximo es X" mirando solo lo dibujado sería afirmarlo sobre una muestra elegida por conveniencia. |
| `maxAbsDeltaAt` | El precio de medir sobre el megabase: el máximo puede caer fuera de lo dibujado —en CELSR2 **cae fuera**—, así que lleva `insideDrawnWindow` y la vista lo declara. Ojo a los marcos: `fullBin` va en coordenadas de la matriz completa, `variantBin` en las del recorte. |
| `referenceRange` | El relieve que la estructura **ya tenía**. Sin él, "el cambio máximo es 0,0391" no significa nada; con él, significa el 1,46 %. |
| `variantRowMeanAbsDelta` | Reconstrucción local de lo que mide `ContactMapScorer` del AVI. Se guarda para poder enseñar las dos magnitudes lado a lado **diciendo en qué se diferencian**: la del AVI va sin signo, es diferencia cruda y solo mira la fila del bin de la variante; el mapa va con signo y cubre la ventana entera. Medido en CELSR2: 0,014270 contra el 0,014126 congelado en `card.json`. |
| `reference` y `delta` | Triángulo superior por filas, en enteros a multiplicar por `scales`. |

**Por qué solo medio cuadrado.** La simetría no se supone: `build_contacts` la
comprueba con `array_equal(m, m.T)` y se para si falla, porque de ella depende
que guardar la mitad siga siendo reversible. Un mapa de contactos transpuesto se
ve idéntico, así que un error de orden no lo delataría ningún ojo; lo delata un
test que reconstruye la matriz entera y la compara.

**Por qué enteros.** El modelo ya entrega valores cuantizados —835 valores
distintos de |Δ| en 262 144 celdas—, así que guardar decimales largos sería
guardar ruido de punto flotante ocupando bytes. Medido: 26,0 KB en enteros frente
a 53,9 KB en decimales, con error máximo de 5 × 10⁻⁶ contra un máximo de 0,039.

**Por qué ±64 bins.** No es un redondo: el TSS de SORT1 —el gen diana publicado
de rs12740374, y por tanto el único sitio de la ventana donde un cambio de
contacto significaría algo— cae **61 bins** río abajo de la variante. ±32 y ±48
no lo alcanzan. Hay un test que lo fija.

**`status: "no_data"` no es un diff plano.** `no_data` es que no hubo mapa. Un
`maxAbsDelta` pequeño es `status: "ok"`: no es un dato que falta, es la medición
de que la estructura no se movió, y eso es un resultado.

## Estudios

Un estudio **declara** qué vistas quiere; no trae código. Los tipos disponibles
son `distribution`, `calibration`, `dosage`, `forest`, `scatter`, `table` y
`note`. Agregar un estudio no debe tocar el visor; si hay que tocarlo, la
abstracción está mal.

El bloque `honesty` es obligatorio: tamaño de muestra, poder, limitaciones y
signo del resultado. El esquema **no permite** marcar un estudio como `positive`
o `null` sin poder medido, y el test lo verifica. `effectiveUnits` pide
haplotipos independientes y no conteo de variantes, porque en una población con
cuello de botella las variantes viajan juntas y tratarlas como independientes es
anticonservador.

Un tipo de panel todavía no implementado se muestra diciendo que falta, no se
oculta: el manifiesto ya declaró la intención y el visor no finge tener datos.

## Versionado

`schemaVersion` semver en todo artefacto.

| Cambio | Parte | Qué hace la web |
|---|---|---|
| Se quita o se re-tipa un campo | **major** | **Rechaza** el artefacto y lo dice en pantalla |
| Se agregan campos opcionales | **minor** | Ignora lo que no conoce |
| Documentación o validación | **patch** | Nada |

Rechazar en un cambio de major es lo correcto y no un exceso de celo:
renderizar un contrato distinto produce un gráfico plausible y equivocado, que
es peor que no mostrar nada.

## Presupuesto de bytes

El presupuesto **es parte del contrato**, no una recomendación: `write_json`
valida, mide y solo entonces escribe, y superar el tope rompe el build. Un visor
que tarda en cargar no es un visor.

Los topes y su uso real están en `docs/01-architecture.md`. Para verlos sobre lo
que hay en disco:

```bash
python -m alphagenome_platform.cli budget
```

El único ajustado es el bloque de señal (81 %), y es el único derivado de una
fórmula cerrada: 4 tracks × 2 arreglos × 8 192 valores × 2 bytes = 131 072 B más
cabecera.

## Cómo se comprueba todo esto

```bash
# esquema + presupuesto + proveniencia de data/dist/
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli validate
PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q
cd web && node scripts/test-provenance-gate.mjs   # la compuerta sabe decir no
cd web && npm run build && npm run verify
```

`npm run verify` sirve el build **desde una subcarpeta** y comprueba en un
navegador real que no haya errores de consola, ni peticiones fallidas, ni
**ninguna petición fuera del host**, que es como se verifica que la web no llama
a la API.
