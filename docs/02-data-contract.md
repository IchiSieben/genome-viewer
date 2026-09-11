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
│   │   └── tracks.json                        V2  (≤ 120 KB)
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
python -m alphagenome_platform.cli validate     # esquema + presupuesto de data/dist/
PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q
cd web && npm run build && npm run verify
```

`npm run verify` sirve el build **desde una subcarpeta** y comprueba en un
navegador real que no haya errores de consola, ni peticiones fallidas, ni
**ninguna petición fuera del host**, que es como se verifica que la web no llama
a la API.
