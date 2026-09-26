[English](README.en.md)

# Visor del genoma

*No oficial. Qué le hace una variante al genoma, predicho.*

El nombre evita la marca registrada de Google en un nombre de producto;
**AlphaGenome** se sigue nombrando como la fuente de los datos.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.48-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-1f5fd0)
![static](https://img.shields.io/badge/static-0%20API%20calls-6f7c8a)

**En línea:** <https://ichisieben.dev/genome-viewer/> ·
<https://ichisieben.dev/genome-viewer/es/> (español)

Es una beta. En esta primera subida lleva `noindex`: no aparece en
buscadores todavía.

---

## Qué es

El 8 de septiembre de 2026 Google DeepMind publicó el **AlphaGenome Atlas**:
predicciones precomputadas del efecto de ~9 mil millones de variantes del genoma
humano, con un score resumen (**AVI**) y sus atribuciones SHAP.

La librería oficial de visualización dibuja **imágenes estáticas con matplotlib**.
Este proyecto es un visor interactivo de navegador para esos mismos resultados.

Lo que hace que valga como pieza de ingeniería no es usar una API nueva. Es que
el resultado es una cadena completa: un pipeline con proveniencia sellada, un
contrato de datos versionado y validado, un presupuesto de bytes defendido con
tests, y una capa de presentación que respeta una restricción de despliegue real.

## Estado

| Hito | Qué es | Estado |
|---|---|---|
| H0 | Verificación de acceso | **Hecho** — 39 llamadas; los 18 features del AVI resueltos |
| H1 | Contrato de datos y fixtures | **Hecho** — 7 esquemas, 86 artefactos, 51 tests |
| H2 | Esqueleto del pipeline | **Hecho** — adquisición reanudable, proveniencia sellada |
| H3 | Vistas V1 y V2 | **Hecho** — ambos temas, responsive, consola limpia |
| H4 | Datos reales de tres loci | **Hecho** — PPP1R1A/PDE1B, RASGEF1B, RPL13A |
| H5 | V3, navegador de tracks | **Hecho** — canvas y SVG, zoom, doble resolución |
| H6 | Despliegue | **Hecho** — [en línea](https://ichisieben.dev/genome-viewer/) |
| N1 | Mapa de saturación | **Hecho** — 512 posiciones × 3 alternativas |
| N2 | Enlace cruzado entre vistas | **Hecho** |
| N3 | Estado en la URL | **Hecho** — locus, variante, vista, pistas y zoom |
| i18n | Español e inglés, sin framework | **Hecho** — ver [`docs/08-i18n.md`](docs/08-i18n.md) |
| Identidad | Marca desde la visualización, movimiento, imágenes OG | **Hecho** — ver [`docs/05-visual-audit.md`](docs/05-visual-audit.md) |
| Narrativa | Páginas de por qué, hoja de ruta, cómo está hecho y referencias | **Hecho** |
| N4, N6, N7 | — | Planeadas |
| H7 | Estudio poblacional | **Pendiente** — si el resultado es nulo, se publica igual |

Los datos son **reales**, del Atlas API y del Model API. El generador de
fixtures sintéticas sigue existiendo para desarrollar sin gastar cuota, y lo que
sale de él se sella `source: "synthetic"` y la web lo avisa con una franja
ámbar. Nada sintético está publicado.

## Las tres restricciones que definen la arquitectura

1. **Hosting compartido, sin procesos persistentes.** La salida son archivos
   estáticos y nada más.
2. **La llave es personal e intransferible.** La web **nunca** llama a la API. El
   pipeline corre en local, congela los resultados, y la web solo lee archivos.
   No es solo una limitación: hace la página instantánea y sin costo de cuota por
   visitante.
3. **Uso no comercial, de investigación.** Los resultados están sujetos a los
   *AlphaGenome Output Terms of Use*, visible en cada página con contenido
   derivado. Sin uso clínico, sin valor de consejo médico.

De 1 y 2 sale la forma entera:

```
pipeline/   Python, local, con la llave.  ->  data/dist/   artefactos congelados
                                                    |
                                              web/  lee archivos, cero red a Google
```

Las dos capas se tocan solo por `contracts/v1/*.schema.json`.

## Idiomas

Inglés en la raíz (`/genome-viewer/`, x-default) y español en
`/genome-viewer/es/`, cada uno como cascarón HTML propio generado en el build.
El bundle es uno solo; ninguno de los dos idiomas paga por el diccionario del
otro. `data/dist/` no se toca: su prosa se sobrescribe por id estable desde el
diccionario (opción A), así que los artefactos siguen siendo la fuente
congelada de datos. Detalle completo, con lo que se midió y lo que se
descartó, en [`docs/08-i18n.md`](docs/08-i18n.md).

## Identidad y movimiento

La marca sale de la propia visualización: cuatro barras de altura distinta en
los cuatro primeros colores categóricos, el mismo patrón que ya vivía en la
cabecera. Las imágenes Open Graph por idioma se generan en el build con
Playwright, a partir de datos reales del `card.json` congelado — no son una
maqueta. El movimiento respeta `prefers-reduced-motion` (sin esa preferencia,
ninguna animación corre) y solo anima `opacity`/`transform`, nunca el layout;
el CLS medido es 0. Auditoría completa en
[`docs/05-visual-audit.md`](docs/05-visual-audit.md).

## Cómo correrlo

Sin llave, que es el camino por defecto. **No hay paso de arranque**: el clon
ya trae `data/dist/` entero —los JSON del contrato y los bloques de señal—,
porque son salida real de la API y sin llave no se regeneran.

```bash
python -m pip install -e "pipeline[dev]"
python -m alphagenome_platform.cli validate     # esquema + presupuesto

cd web && npm install && npm run dev            # http://localhost:5173
```

Las fixtures sintéticas **no** son ese camino. Son una herramienta de
desarrollo sin cuota —para tocar el visor sin datos reales delante— y escriben
en un arbol aparte, `data/fixtures/`, que no se versiona:

```bash
python -m alphagenome_platform.cli fixtures     # -> data/fixtures/, ids demo-*
```

Los dos mundos no comparten ni directorio ni nombres: todo locus sintético
lleva el prefijo `demo-`. Antes compartian ambas cosas, y `fixtures` llego a
sobreescribir artefactos reales que habian costado cuota. Lo que este parrafo
afirma esta comprobado en `pipeline/tests/test_dos_mundos.py`, no solo escrito
aqui.

Con llave, cuando la haya. Va en `~/.env`, **nunca** en el repositorio:

```bash
echo 'ALPHAGENOME_API_KEY="..."' >> ~/.env
python -m alphagenome_platform.cli probe        # UNA variante, completa H0
```

Datos reales, con la llave en `~/.env`:

```bash
python -m alphagenome_platform.cli build-locus          # todo el catalogo de loci.py
python -m alphagenome_platform.cli build-locus rpl13a   # solo uno
```

Build y verificación:

```bash
PYTHONUTF8=1 PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q   # 110 tests

cd web
npm run build           # también escribe cascarones por idioma, 404, sitemap,
                         # .htaccess, iconos e imágenes OG — necesita Chromium (Playwright)
AGP_NOINDEX=0 npm run build   # el mismo build, sin el noindex de la beta

npm run verify         # 16 escenarios en Chromium, dos temas, ancho de movil
npm run verify:links   # enlace cruzado y estado en la URL
npm run measure        # tiempo hasta interactivo y coste por frame

node scripts/measure-ab.mjs <dist-de-referencia> [rondas]   # A/B contra un build anterior
AGP_AB_LANG=es node scripts/measure-ab.mjs <dist-de-referencia>   # el mismo A/B en español
```

`npm run verify` sirve el build **desde una subcarpeta**, como se despliega, y
comprueba en un navegador real que no haya errores de consola, ni peticiones
fallidas, ni **ninguna petición fuera del host**. Esa última comprobación es
cómo se verifica la regla de que la web nunca llama a la API.

## Las vistas

**V1 — Ficha de variante.** El AVI sobre su escala PHRED con marcas
interpretables (10 = top 10 %, 20 = top 1 %, 30 = top 0,1 %), la cascada de
contribuciones SHAP de los 18 features agrupados en sus cuatro familias, y los
tracks más afectados. Las atribuciones del AVI son públicas desde hace tres días
y no había ninguna visualización de ellas.

**V2 — Mapa de calor biosample × modalidad.** El efecto a lo largo de decenas de
biosamples, **agrupados por sistema de órganos y no alfabéticamente**: así una
banda continua de color significa un efecto específico de ese sistema. Escala
divergente con el cero visualmente neutro y dominio por percentil 98, porque usar
el máximo deja que una sola celda extrema aplane todo el resto.

**V3 — Navegador de tracks.** La vista insignia. Señal predicha REF contra ALT a
lo largo del locus, con anotación de genes y transcritos debajo y un eje de
coordenadas GRCh38 real. Rueda para acercar, arrastre para desplazar, teclado
para todo. Al bajar de 8 192 pb de ventana cambia solo al bloque de 1 pb.

Canvas para la señal densa y SVG por encima para ejes, genes y zonas
interactivas. El dibujo recorre **píxeles y no muestras**: por cada columna de
pantalla toma el mínimo y el máximo de las muestras que le tocan, de modo que un
pico estrecho no desaparece por submuestreo y el coste depende del ancho en
píxeles, no del tamaño del arreglo. El área sombreada entre las dos líneas,
coloreada por el signo, es exactamente lo que hace la variante: dos líneas
superpuestas sin ese relleno obligan al ojo a medir distancias verticales
pequeñas, que es justo lo que el ojo hace mal.

**N1 — Mapa de saturación.** Para cada posición de una ventana de 512 pb, el AVI
de las **tres** bases alternativas posibles. Es el gráfico insignia de la
genómica con aprendizaje profundo y no existía en navegador para AlphaGenome.
Los motivos aparecen solos, como columnas contiguas de color fuerte. La
secuencia de referencia no se pide a ninguna fuente extra: cada variante llega
como `chr:pos:REF>ALT`, así que se deduce de la propia respuesta del Atlas.

Escala **secuencial**, no divergente, aunque el sistema visual reserve la
divergente para diferencias REF/ALT: el AVI mide impacto, no dirección, y una
rampa divergente inventaría un eje que el dato no tiene. El score crudo con
signo se guarda igual, por si otra vista lo quiere.

**V4** (sashimi de splicing) y **V5** (diferencia de mapas de contacto) están
construidas, cada una con su propia llamada a `predict_variant` y su propio
término de ontología: pedirlas junto a las señales usaría los biosamples por
defecto del locus, y en un tejido donde la variante no actúa el gráfico sale
simétrico sin que nada falle.

En V5 el resultado es que **la estructura tridimensional no se mueve**, y la
vista lo dice con cifras en vez de esconderlo: el dominio del color es una
constante del contrato y no se autoescala al rango del diff, así que un cambio
del 1,5 % del relieve estructural se ve como lo que es. Los paneles de estudio
(V6) ya renderizan desde el manifiesto.

## Decisiones, con su alternativa descartada

Están en [`docs/01-architecture.md`](docs/01-architecture.md), cada una con lo
que se descartó y por qué. Las tres que más definen el proyecto:

- **Sin framework en el frontend.** Vite y TypeScript, sin React ni Astro, y
  **cero dependencias de runtime**: el build pesa 28,4 kB de JS comprimido, las
  siete vistas incluidas. Astro se descartó porque su ventaja real (páginas por
  archivo) obliga a reescritura en el servidor, y la restricción es archivos
  estáticos y nada más.
- **int16 crudo en un bloque binario propio**, no base64 dentro de JSON. 2,00
  bytes por valor contra 2,67; y sin decodificación en JS.
- **Se guarda REF y DELTA, no REF y ALT.** La hipótesis inicial era que
  comprimiría mejor. **Se midió y era falsa**: gzip da 1,3 % peor. La decisión
  sobrevive por otro motivo, también medido: guardar el delta lo cuantiza contra
  su propio máximo y es **entre 10× y 221× más preciso** en la cantidad que el
  gráfico realmente dibuja.

## Honestidad, que es parte del diseño

- Cada artefacto sella origen, versión del cliente, fecha UTC, hash de
  configuración y **época de calibración**. Los cuantiles del AVI se recalibraron
  el 18/06/2026 y la inferencia de indels el 14/07/2026: comparar cosechas
  distintas es inválido, y un PHRED no lleva escrito de cuál viene. Un test
  recorre `data/dist/` y falla si algo no lo trae.
- Las fixtures se sellan `source: "synthetic"` y la web lo muestra. Una figura
  hecha con datos inventados no puede pasar por predicción.
- Un estudio declara tamaño de muestra, poder, limitaciones y signo del
  resultado. El esquema **no deja** marcar un estudio como concluyente sin poder
  medido. Un resultado nulo se muestra con la misma prominencia que uno positivo.

## Lo que la corrida con datos reales corrigió

**La variante semilla de los documentos de contexto estaba invertida.** La
variante correcta es `chr12:54578515:C>T`. Los documentos la daban como `T>C` y
el servidor la rechaza con *"reference base does not match the expected
reference base: C"*. Los alelos que el Atlas conoce en esa posición son A, G y
T. El pipeline **resuelve cada variante contra el servidor antes de usarla**
(`freeze/build_locus.py::resolve_variants`), en vez de fiarse de un literal.

El sentido de la corrección se verificó además contra la fuente primaria. Según
PubMed, Zhu et al. 2026, *Genome Biol Evol* 18(8), PMID 42402195
([DOI](https://doi.org/10.1093/gbe/evag164)), tabla 2: para `rs884510` en
12:54578515 el alelo **derivado es C** y el **ancestral es T** (frecuencia del
derivado 0,25 en quechuas peruanos frente a 0,42 en AMR). La referencia GRCh38
lleva el alelo derivado, y eso es exactamente lo que hace confusa la notación:
`C>T` describe el paso *de vuelta* al ancestral. El alelo con efecto es el
ancestral — *"the ancestral Peruvian allele (T) was associated with a 1.39
standard deviation decrease in [Hb]"*.

Dos matices del mismo paper, para no sobre-leer el dato:

- `rs884510` mapea al 3′ UTR de *PDE1B* y **no** es eQTL de *PDE1B* ni de
  *PPP1R1A* en ningún tejido consultado. Los eQTLs son otros: `rs10876566`,
  `rs7954532`, `rs2669406`.
- La asociación con [Hb] sobrevive la corrección FDR en el test **por gen**, no
  en el test por SNP. Ningún SNP pasa la corrección múltiple por sí solo.

Esto no cambia nada de lo que el visor muestra —el AVI no sabe de hemoglobina—
pero sí es la razón por la que este locus está en el catálogo, y conviene que
esté citado donde se pueda comprobar.

**Los 18 features del AVI ya no son provisionales.** Salieron de una consulta
real y viven en `pipeline/src/alphagenome_platform/avi.py` con su familia
explícita. Un nombre desconocido **lanza**: es mejor que el pipeline se detenga
a que la cascada de V1 caiga callada en la familia equivocada.

**La cascada cierra.** `base + Σ contribuciones = score crudo`, con el valor base
medido en **-0,049016** y una dispersión entre variantes de 3,5e-05. Un test lo
comprueba en cada ficha.

## Riesgo principal que sigue vivo

**Ensembl REST es intermitente.** Devuelve 500 y agota el tiempo de lectura con
frecuencia para ciertos genes, PPP1R1A entre ellos. La anotación se pide por
trozos, se cachea en disco, cae de `lookup` a `overlap` como respaldo y **nunca
bloquea una corrida**: un locus se congela con o sin carril de genes. Aun así,
reconstruir desde cero en un mal momento puede dar un carril incompleto.

## Estructura

```
contracts/v1/     JSON Schema. Fuente normativa del contrato.
pipeline/         Python. Corre en local con la llave. Nunca se despliega.
  src/alphagenome_platform/
    quantize.py     cuantización int16 y formato binario AGSB
    contract.py     validación de esquema y presupuesto de bytes
    provenance.py   sello de proveniencia
    fixtures.py     generador sintético
    acquire/        capa de adquisición, reanudable
  tests/          110 tests (incluye i18n y guardarraíl de tildes)
data/dist/        artefactos congelados. Es lo que se despliega.
web/              sitio estático. Vite + TypeScript, sin framework.
  src/i18n/       diccionarios es/en, narrativa, formato numérico
  scripts/        build-shells, build-icons, verify, verify:links, measure, measure-ab
docs/             decisiones de arquitectura, i18n, auditoría visual y evidencia medida
```

## Licencia y términos

Código bajo licencia MIT. Los **resultados derivados de AlphaGenome** están
sujetos a los *AlphaGenome Output Terms of Use*: uso no comercial, de
investigación. No es un dispositivo médico, no constituye consejo médico y no
debe usarse para decisiones clínicas. Todo lo que el visor muestra son
predicciones de un modelo, no mediciones experimentales.

---

Yoichi Palacios (iC7) — <https://ichisieben.dev/>
