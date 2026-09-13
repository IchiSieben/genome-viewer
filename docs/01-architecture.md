# Arquitectura

*2026-09-11. Cada decisión lleva la alternativa que se descartó y por qué. Las
mediciones están en `docs/evidence/`; ningún número de este documento es
estimado salvo donde dice explícitamente que lo es.*

---

## De dónde sale todo

Tres restricciones fijan la arquitectura entera antes de que haya una sola
decisión de gusto:

| | Restricción | Consecuencia |
|---|---|---|
| R1 | Hosting compartido, sin procesos persistentes | La salida del build son archivos estáticos y nada más |
| R2 | La llave es personal e intransferible | La web **nunca** llama a la API. Nadie puede llamarla desde el navegador |
| R3 | Uso no comercial, investigación | Aviso de *Output Terms* visible en cada página con contenido derivado |

De R1 y R2 sale la única forma posible:

```
pipeline/  (Python, local, con la llave)
     |  emite
     v
data/dist/  (artefactos congelados, versionados, con sello de proveniencia)
     |  lee
     v
web/  (estático; cero peticiones a Google)
```

Las dos capas se tocan **solo** por el contrato de `contracts/v1/*.schema.json`.
El web no conoce el código del pipeline y el pipeline no conoce el del web.

R2 tiene un corolario que se paga en comandos: **nada que se pueda derivar del
disco puede costar una llamada a la API**. Por eso existe
`cli.py reindex`, que recalcula lo derivado de `index.json` —hoy el puntero
`featured` de la portada— leyendo los `locus.json` ya congelados, sin tocar
Google. Ver «La variante de portada se deriva, no se escribe» en
[`02-data-contract.md`](02-data-contract.md).

---

## El presupuesto de datos

Este era el problema técnico de verdad, así que se resolvió primero y con
mediciones.

### El tamaño del problema

Una predicción sobre 1 Mb a 1 pb son **1 048 576 valores por track**. Verificado,
no supuesto: `dna_client.SUPPORTED_SEQUENCE_LENGTHS` devuelve exactamente
`[16384, 131072, 524288, 1048576]`, así que "1 Mb" es 2²⁰ al valor exacto. En
float32 eso son 4 MiB por track; veinte tracks son 80 MiB por locus. Inviable.

### Estrategia: tres reducciones que se multiplican

**1. Doble resolución.** Vista general en bins de 128 pb sobre 1 Mb = 8 192
valores. Detalle a 1 pb en ±4 kb = 8 192 valores. La misma cifra en los dos
niveles, lo que simplifica el código de render: una sola ruta de dibujo.

El binning por media borra los picos estrechos, y un sitio de splicing de 2 pb
que desaparece al alejar el zoom es un **error de lectura del gráfico**, no una
simplificación. Por eso `bin_signal` admite `max` por magnitud conservando el
signo, y hay un test que lo fija.

**2. Cuantización a int16** con escala por arreglo.

**3. Troceado por modalidad.** Un archivo por (locus, resolución, modalidad). La
web descarga solo las modalidades que muestra. Es lo que hace que la primera
pintura cueste **10 165 B** en vez de 2,5 MB.

### Codificación: qué se midió

`docs/evidence/h1-budget-measurements.txt`, 4 tracks × 2 arreglos × 8 192 valores:

| Codificación | Bytes | gzip | B/valor |
|---|---:|---:|---:|
| **int16 crudo (elegido)** | **131 152** | **52 872** | **2,00** |
| int16 en base64 dentro de JSON | 174 900 | 60 176 | 2,67 |
| JSON con números en texto | 426 152 | 71 928 | 6,50 |

**Descartado: base64 dentro de JSON**, que es lo que proponía el plan. Cuesta
25 % más sin comprimir y obliga a decodificar en JS antes de poder dibujar. Un
`.bin` aparte se lee con `fetch().arrayBuffer()` y se mapea con
`new Int16Array(buffer, offset, length)` sin copiar ni decodificar nada.

**Descartado: Arrow o Parquet.** Necesitan un lector WASM de cientos de KB para
leer archivos de 130 KB. El costo fijo se come el beneficio.

### El error de cuantización, juzgado en píxeles

La pregunta correcta no es "¿el error es pequeño?" sino "¿se ve?". Sobre un
panel de 400 px de alto, el error medido queda **por debajo de 0,05 px** — una
vigésima de píxel. El test `test_el_error_de_cuantizacion_es_invisible_en_pantalla`
falla si se pasa de ahí, y está escrito en píxeles justamente para que el
criterio no se pueda diluir.

### REF + DELTA: la razón que yo creía, y la razón real

La hipótesis de partida era que guardar REF y DELTA (en vez de REF y ALT)
comprimiría mucho mejor, porque el delta es casi todo ceros. **Se midió y es
falsa:**

```
REF+DELTA  gzip 52 872 B      REF+ALT  gzip 52 219 B      -> 1,3 % PEOR
```

La decisión sobrevive de todos modos, por un motivo distinto que también se
midió. La vista dibuja la **diferencia**. Si se guardan REF y ALT, cada uno se
cuantiza contra el máximo de la señal completa, y al restarlos en el navegador
los dos errores se suman sobre una cantidad mucho más chica que esa señal. Si se
guarda el delta, se cuantiza contra su propio máximo:

| \|delta\|max | \|señal\|max | error REF+DELTA | error REF+ALT | factor |
|---:|---:|---:|---:|---:|
| 0,0672 | 7,6131 | 1,03e-06 | 2,27e-04 | 221× |
| 0,3463 | 11,3128 | 5,26e-06 | 3,31e-04 | 63× |
| 1,4536 | 7,5133 | 2,22e-05 | 2,22e-04 | 10× |

Entre **10× y 221× más preciso** en lo que el gráfico efectivamente muestra, y
la ganancia crece justo cuando el efecto es pequeño, que es cuando la precisión
importa. La compresión no justificaba la elección; la precisión sí.

Queda escrito así a propósito: la conclusión correcta con el razonamiento
equivocado sigue siendo un error de ingeniería.

### Presupuestos que rompen el build

Declarados en `contract.BUDGETS`, verificados sobre **todo** `data/dist/`, no
solo sobre lo que la última corrida escribió.

| Artefacto | Tope | Peor caso real | Uso |
|---|---:|---:|---:|
| `index.json` | 32 KB | 1 024 B | 3,1 % |
| `locus.json` | 64 KB | 3 366 B | 5,1 % |
| `card.json` (V1) | 50 KB | 5 775 B | 11,3 % |
| `tracks.json` (V2) | 120 KB | 14 500 B | 11,8 % |
| bloque de señal (V3) | 160 KiB | 132 624 B | 81,0 % |
| `annotations.json` | 128 KB | 929 B | 0,7 % |
| manifiesto de estudio | 96 KB | 2 592 B | 2,6 % |
| `saturation.json` (N1) | 96 KB | 27 331 B | 28,5 % |
| `splice.json` (V4) | 64 KB | 2 903 B | 4,4 % |
| `contacts.json` (V5) | 96 KB | 70 625 B | 71,8 % |

El único ajustado es el bloque de señal, y es el único derivado de una fórmula
cerrada: 4 tracks × 2 arreglos × 8 192 × 2 B = 131 072 B más cabecera. El 19 %
de holgura cubre modalidades con más tracks.

---

## Decisiones

### D1 — Sin framework en el frontend: Vite + TypeScript

**Elegido.** Salida estática, TypeScript para tipar el contrato de datos, y el
runtime del navegador no carga ningún framework.

**Descartado: Astro.** Es la opción obvia y ya se usa en el resto del portafolio.
Su ventaja real son las páginas por archivo generadas en el build, y aquí esa
ventaja se cae por dos motivos. Primero, el estado que importa (locus, variante,
vista, modalidades visibles) es de navegación dentro de un visor, no una
jerarquía de documentos. Segundo, en hosting compartido una ruta profunda tipo
`/variant/chr12-54578515-C-T` da 404 al recargar salvo que se agregue reescritura
en `.htaccess`; el enrutado por hash funciona en cualquier servidor sin tocar
nada. Astro habría añadido una capa de build cuyo beneficio principal hay que
desactivar.

**Descartado: React o Svelte.** El trabajo pesado es pintar en canvas. Un árbol
de componentes que se re-renderiza no ayuda a dibujar 8 192 puntos por track, y
el runtime compite por el presupuesto de bytes con los datos, que es lo que el
visitante vino a ver.

### D2 — Enrutado por hash

`#/variant/ppp1r1a-pde1b/chr12-54578515-C-T?view=card` funciona en
cualquier servidor estático, sobrevive a la recarga y hace que cada estado del
visor sea un enlace que se puede compartir. Feo, pero de riesgo cero.

**Descartado: History API.** Requiere reescritura del servidor. R1 dice archivos
estáticos y nada más, y una regla de `.htaccess` es justo el tipo de cosa que se
pierde al mover el sitio de carpeta.

### D3 — Gráficos escritos a mano sobre `d3-scale` y `d3-array`

Se usan de d3 **solo las utilidades matemáticas**: escalas, ticks con valores
redondos, y bisección. Nada de `d3-selection`.

**Descartado: Chart.js, Plot, Vega-Lite.** El listón pide un solo sistema visual
en todas las vistas. Con una librería de alto nivel se pasa el tiempo peleando
contra sus defaults, y aun así las vistas genómicas hay que escribirlas a mano.
Mezclar deja seis gráficos que parecen de seis personas distintas, que es
exactamente lo que el encargo prohíbe.

**Descartado: d3 completo.** Trae selección y transiciones que duplican lo que
ya hacen el DOM y el canvas.

### D4 — Canvas para la señal, SVG encima para todo lo demás

Miles de puntos por track en SVG se atraganta. La señal densa va a canvas; ejes,
anotación de genes, tooltips y overlays interactivos van en SVG por encima, donde
sí hay eventos y accesibilidad. Es la decisión de rendimiento que define V3.

### D5 — Bloque binario autodescriptivo (`AGSB`)

```
[0:4]   magic "AGSB"
[4:8]   versión de formato uint16 + relleno
[8:12]  longitud de la cabecera JSON uint32
[12:..] cabecera JSON, rellenada para que la carga quede en múltiplo de 8
[..:]   int16 little-endian, arreglos concatenados
```

El relleno se calcula sobre el **offset absoluto**, no sobre la longitud de la
cabecera: el prefijo mide 12 bytes, así que rellenar la cabecera a múltiplo de 8
dejaría la carga en 12+8k, que es 4 módulo 8. Se detectó al medir la alineación,
no leyendo el código, y hay un test parametrizado sobre 12 tamaños de cabecera
que lo fija.

El archivo se identifica solo, sin el índice. Un `.bin` suelto en un disco sigue
siendo legible dentro de un año.

### D6 — Caché del navegador por URL con hash de contenido

Los artefactos grandes llevan el hash en el nombre y se sirven con caché larga;
`index.json` es lo único que se revalida. Dentro de la sesión, un `Map` en
memoria evita repetir el `fetch` al volver a un locus.

**Descartado: Cache API o IndexedDB.** Reimplementan lo que el caché HTTP ya
hace bien, y añaden un camino de invalidación propio que puede quedar rancio.

### D7 — Versionado del contrato

`schemaVersion` semver en todo artefacto.

* **major**: se quita o se re-tipa un campo. La web **rechaza** un major que no
  conoce y lo dice en pantalla, en vez de renderizar basura.
* **minor**: campos opcionales nuevos. La web ignora lo que no conoce.
* **patch**: documentación o validación.

Los esquemas viven en `contracts/v1/` y son la fuente normativa para las dos
capas.

### D8 — Proveniencia obligatoria, no opcional

Dos fechas lo vuelven no negociable: el **18/06/2026** se recalibraron los
cuantiles del AVI (antes chr22, ahora genome-wide) y el **14/07/2026** se
corrigió la inferencia de indels. Comparar artefactos de cosechas distintas es
inválido, y un PHRED no lleva escrito de qué cosecha viene.

Todo artefacto sella origen, versión del cliente, fecha UTC, hash de
configuración y época de calibración. Un test recorre `data/dist/` y falla si
algo no lo trae. Las fixtures se sellan `source: "synthetic"` y la web lo muestra
en pantalla: una figura hecha con datos inventados no puede pasar por predicción.

### D9 — Los estudios se declaran, no se programan

Un estudio es un manifiesto que nombra **tipos de vista** que el visor ya sabe
renderizar (`distribution`, `calibration`, `dosage`, `forest`, `scatter`,
`table`, `note`) y les pasa datos. Agregar un estudio no toca el código del
visor. Si hay que tocarlo, la abstracción está mal.

El manifiesto obliga a declarar tamaño de muestra, poder, limitaciones y signo
del resultado. El esquema no deja marcar un estudio como `positive` o `null` sin
poder medido, y el test lo verifica. Un resultado nulo se muestra como resultado
nulo.

### D10 — En un visor de efecto de variante se ordena y se etiqueta por DELTA, no por nivel

Esto falló **dos veces**, con criterios distintos, antes de escribirse aquí.

La primera: el héroe de la ficha de variante mostraba el **rsid**. Un rsid es un
identificador de catálogo, no una medida — dice que alguien vio antes esa
posición, no que la variante haga nada. Ocupaba el sitio del número que sí
importa.

La segunda: los arcos del sashimi se etiquetaban por **magnitud** (`max(REF,
ALT)`). Medido en DNM1: las tres etiquetas caían en uniones constitutivas de
4,3 que se mueven **0,01** entre REF y ALT, mientras las cuatro uniones que la
variante realmente desplaza (Δ entre 1,08 y 1,57) quedaban mudas. El gráfico
era correcto y no decía nada. No falló ruidosamente: falló enseñando lo que más
tinta ocupaba.

El patrón común no es "usar la columna correcta". Es que **el nivel es una
propiedad del tejido y el delta es la propiedad de la variante**, y este visor
trata de variantes. El nivel solo entra como referencia de escala: una sola
etiqueta sobre el arco mayor, para que los deltas tengan contra qué leerse.

Consecuencias que ya están en el código:

- Orden por `|ALT − REF|`, con un piso (`minValueShown`) para que una etiqueta
  no pueda apuntar a ruido.
- Resalte por proximidad a la variante, no por grosor: los arcos que tocan su
  posición van a plena intensidad y el resto atenuado.
- **Aplica a V5 tal cual**: el diff de mapas de contacto resalta por |cambio|,
  nunca por fuerza de contacto. Un mapa Hi-C está dominado por la diagonal y
  por los TAD, que son idénticos en REF y en ALT; ordenar por fuerza de
  contacto en V5 es exactamente el mismo error con otra modalidad, y ya no
  cuenta como sorpresa.

Alternativa descartada: dejar el orden por magnitud y confiar en el tooltip
para descubrir el delta. Descartada porque obliga a pasar el ratón por 21 arcos
para encontrar los 4 que importan, y en móvil no hay ratón.

### D11 — Cada familia de modalidad se pide en su propia llamada, con sus propios términos de ontología

El biosample correcto depende de la biología que se está enseñando, así que no
puede venir de una lista compartida a nivel de locus.

V4 lo demostró y costó cuota descubrirlo. La cabecera de `build_locus.py` decía
que una sola llamada a `predict_variant` daba «V3, V4 y V5 de una vez». Es
verdad en cuanto a *outputs* y falso en cuanto a *utilidad*: esa llamada usa
`ONTOLOGY_TERMS` (sangre, pulmón, hígado), y pedir `SPLICE_JUNCTIONS` ahí habría
dibujado el splicing de DNM1 en sangre — **simétrico, sin error, sin aviso**. El
fallo silencioso es la parte cara: un gráfico vacío se nota, un gráfico
correcto de un tejido equivocado no.

La regla: llamadas dirigidas, una por familia, cada una con su curie declarado
por variante (`VariantSpec.sashimi_ontology`), nunca `None`. Y el curie se
confirma con `scorer_metadata()` — RPC de solo metadatos, sin coste de
predicción — **antes** de gastar cuota.

Dos límites medidos de esta regla, que se documentan porque no son teóricos:

1. **Un curie no garantiza un solo track.** En los metadatos de `CONTACT_MAPS`,
   `EFO:0003042` (H1-hESC) trae **seis** tracks, y `EFO:0003045` (H9) otros seis.
   El código leía `values[i, 0]`, que
   habría elegido el primero en silencio. `build_splice` ahora se para y nombra
   los tracks: agregarlos sería una decisión de modelado que nadie tomó.
2. **A veces el menú no tiene la biología que necesitas.** `CONTACT_MAPS` expone
   28 tracks, **todos** de 4D Nucleome y **todos** líneas celulares: cero tejido
   primario, cero neuronal. Ninguna variante de demostración actual tiene ahí su
   tejido. Cuando pasa esto la salida honesta no es elegir el curie que más se
   parezca y callarse: es elegir uno canónico y **decirlo en la vista**, igual
   que se dice «sin rsid catalogado» o «modalidad silenciosa».

Alternativa descartada: una sola llamada gorda con la unión de todas las
ontologías. Más barata en número de peticiones y más cara en todo lo demás —
paga tracks que ninguna vista pinta, y sobre todo borra la relación entre
«esta vista» y «este biosample», que es justo lo que hay que enseñar en pantalla.

---

### D12 — Un dominio de color que cambia con los datos es autoescalado, aunque venga redondeado

La regla, en una frase que se puede aplicar sin discutir: **si el dominio cambia
cuando cambian los datos, es autoescalado.** Da igual cómo se vista. Un "número
redondo por encima del grueso de la distribución" también es autoescalado, solo
que con un paso de redondeo encima.

Por qué hace falta enunciarlo así: en V5 el candidato razonable era ±0,05, redondo
y por encima del percentil 99 de |Δ|. Medido, con ese dominio el cambio máximo
pinta al **78 % de saturación** y el **14,26 %** de las celdas sale con color
perceptible. El mapa se vería como una reorganización estructural. Lo que de
verdad hay es un cambio de **0,0391 sobre un relieve de 2,684: el 1,46 %**. Y
nada habría fallado: ningún test puede distinguir un patrón dramático hecho de
señal de uno hecho de ruido si la escala se ajusta sola al ruido.

El ancla tiene que ser **externa a los datos**. `CONTACT_DOMAIN = 1.0` lo es, y
además significa algo: el mapa de contactos llega en espacio logarítmico (ver
D13), así que 1 es del orden de duplicar o partir por la mitad el contacto —la
magnitud de un límite de TAD que se rompe o un bucle de CTCF que se pierde—. Con
eso, saturación plena pasa a querer decir *"esto reorganizó el locus"*, y dos
variantes distintas se comparan mirando dos mapas, sin releer dos leyendas.

Con una salvedad que se declara y no se disimula: que 1 sea **exactamente** el
doble depende de que la base del logaritmo sea 2, y la base no se pudo medir —el
SDK no la documenta y los datos no la revelan—. Es la premisa de partida, no un
hallazgo. Lo que sí está medido es lo único de lo que depende la regla: que el
dominio no se mueve cuando se mueven los datos. Si la base resultara ser *e*, el
ancla seguiría siendo externa y comparable entre loci; solo cambiaría la frase
con que se traduce a biología.

Consecuencia aceptada, no sufrida: **el mapa sale casi plano, y eso es el
resultado.** Lo que no se puede permitir es que callen el color *y* el número a
la vez. El peso informativo se reparte en tres:

1. la leyenda lleva una **marca** de dónde cae el máximo observado dentro del
   dominio fijo, así que la pequeñez se ve y no solo se lee (medido: la marca se
   queda al 48 % / 52 % de la barra, pegada al centro);
2. el texto lo dice con cifras, incluida la comparación contra el relieve que la
   estructura ya tenía;
3. la magnificación existe, pero es un **botón con su factor en la etiqueta**
   (`×20`), y solo se ofrece después de que el estado por defecto haya dicho la
   verdad. Magnificación etiquetada sí; autoescalado silencioso no.

Lo que lo hace estructural y no una buena intención: el dominio **viaja en el
artefacto**, la vista lo usa tal cual y no lo recalcula nunca, y
`test_el_dominio_es_LA_CONSTANTE_y_no_se_deriva_de_los_datos` cambia la escala de
los datos por un factor de cien y comprueba que el dominio no se mueve.

Descartado: dominio por locus anclado al rango de REF. Sigue cambiando con los
datos —es autoescalado por locus— y rompe la comparación entre variantes, que es
justo lo que un dominio absoluto compra.

### D13 — Las unidades se miden, no se leen en el docstring

El SDK documenta los mapas de contacto como *"the probability that two DNA bases
are in contact"*. Es falso para lo que devuelve `predict_variant`, y construir
sobre esa frase habría producido una vista sutilmente mentirosa.

Lo medido, sobre la ventana real de 1 Mb: **el 79,1 % de los valores de REF son
negativos** (el 97,9 % en la diagonal principal), el rango es −0,746 a 1,938, y
`exp(REF)` **no** decae como ley de potencias con la distancia —se queda rondando
1—. El propio test del SDK genera estos mapas con `np.random.normal(0, 1, ...)`.
Es decir: el mapa ya llega en espacio logarítmico y con el decaimiento por
distancia retirado, del tipo log(observado/esperado).

Tres consecuencias, y las tres van **contra** lo que se haría por defecto con
probabilidades:

1. `ALT − REF` **ya es** el log del cociente. No hay que dividir y, por tanto, no
   hace falta pseudoconteo: no hay denominador que se vaya a cero.
2. **No hay celdas "sin contacto" que enmascarar.** Las 262 144 tienen valor
   finito, y un valor bajo significa *depleción*, no ausencia. Una máscara contra
   un suelo inexistente pintaría una afirmación falsa.
3. **No hay que normalizar por distancia.** Se cancelaría en la resta de todos
   modos —mismo locus en REF y en ALT— y encima el modelo ya lo hizo.

El corolario general: antes de elegir la transformación de una modalidad nueva,
se miran los valores. Signo, rango, percentiles y decaimiento cuestan una llamada
que ya se iba a gastar, y deciden más que cualquier párrafo de documentación.

## Riesgo principal que sigue vivo

**Los nombres de los 18 features del AVI.** Son server-side. `grep -rn "AVI"`
sobre el paquete `alphagenome` 0.9.0 completo da **cero coincidencias**, así que
no hay forma de obtenerlos sin una llave. V1 es la vista que los necesita.

Mitigación: el contrato los modela como lista ordenada de objetos con
`id`/`label`/`family`, no como 18 campos fijos. Si el servidor devuelve nombres
distintos, cambia la fixture y no el visor. El costo de equivocarse es una
cadena de texto, no un rediseño.
