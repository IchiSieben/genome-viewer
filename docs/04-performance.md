# Rendimiento

*Medido el 2026-09-12 con Chromium headless. Datos crudos en
`docs/evidence/performance.json`. Reproducible con
`cd web && npm run build && node scripts/serve-subfolder.mjs --run "node scripts/measure.mjs"`.*

---

## Qué se mide y por qué así

**Tiempo hasta interactivo**, no hasta que carga el HTML. El cronómetro se para
cuando existe el elemento que la persona vino a ver: las barras de la cascada en
la ficha, el canvas en el navegador de tracks. Un `DOMContentLoaded` rápido con
la vista todavía vacía no es un dato útil.

**El servidor de pruebas comprime.** Sin gzip la medición transfiere bytes sin
comprimir y da un tiempo que no se parece a producción: es medir mal, no medir
despacio. La primera versión del servidor de pruebas no comprimía por un fallo
real —un `\b` de una expresión regular escrito como carácter de retroceso— y
eso solo se inflaba el número de 3G en torno a un 40 %.

## Resultados

| Vista | Red rápida | 3G lento antes | 3G lento ahora | Transferido | Saltos |
|---|---:|---:|---:|---:|---:|
| Portada — catálogo montado | 144 ms | 1 452 ms | **1 497 ms** | 24 KiB | 2 |
| Portada — variante del héroe dibujada | 118 ms | *no existía* | **1 491 ms** | 24 KiB | 2 |
| Ficha de variante | 124 ms | 2 231 ms | **1 497 ms** | 25 KiB | 3 → **2** |
| Navegador de tracks | 154 ms | 2 216 ms | **1 469 ms** | 23 KiB | 3 → **2** |

| Interacción | Valor |
|---|---:|
| Render por frame durante desplazamiento | **3,4 ms** |
| 24 pasos de arrastre + 12 de rueda | 1 093 ms |
| Heap de JavaScript | 9,5 MiB |

**La portada se mide dos veces porque son dos preguntas distintas.**
`.catalog__item` es el selector con el que se midió antes de que existiera el
héroe, cuando el catálogo era lo primero de la página; se conserva para que el
antes/después sea comparable, pero hoy el catálogo está *debajo* del héroe, así
que ese número ya no responde «cuándo ve algo el visitante», responde «cuándo
termina de montarse el listado». `.hero__featured .gauge` sí responde la
primera: es el instante en que hay una variante real dibujada arriba del todo.

El héroe costó **60 ms en 3G lento** y unos 3 KiB. La comparación limpia es
contra el mismo selector y con la precarga ya puesta: 1 437 → 1 497 ms. (La
columna «antes» de la tabla es 1 452 ms, que es el número previo a *todo* el
trabajo de precarga, no el previo al héroe.) Esos 3 KiB son exactamente lo que
pesa el `card.json` que la portada antes no pedía. No costó un salto: el
`<link rel="preload">` que el HTML emite manda `card.json` en la misma oleada
que el bundle. La cascada medida de la portada es
`index.html` a 599 ms, y después `card.json` + bundle juntos, terminando a
1 411 ms.

**El objetivo era dos segundos hasta interactivo con la red estrangulada, y las
tres vistas lo cumplen.** Antes no: un enlace profundo se quedaba en 2,2 s, un
10 % por encima, y ese resto no eran bytes sino **latencia**. Con 400 ms de ida
y vuelta, el HTML, el bundle y el artefacto eran tres viajes en serie, y el
tercero existía solo porque nadie sabía qué pedir hasta que el bundle se había
descargado *y ejecutado*.

Ahora son dos: el HTML llega, y el `<link rel="preload">` que el propio HTML
emite pone el artefacto en vuelo **junto** al bundle. En la ficha la segunda
oleada trae `locus.json`, `card.json` y el bundle a la vez y termina a 1 409 ms;
el catálogo ya no es una petición porque viaja incrustado en el HTML. Bajar del
segundo salto exigiría un service worker o HTTP/2 push, que es más maquinaria de
la que este proyecto justifica.

**Dos saltos es tiempo hasta interactivo, no hasta el último byte.** El
cronómetro se para cuando el canvas o la cascada existen. Los bloques `.bin` del
navegador de señal y el `annotations.json` del mapa de saturación siguen
llegando *después* de `locus.json`, y eso no se puede adelantar: sus rutas están
declaradas **dentro** de `locus.json`, son dato y no contrato, así que
especularlas sería adivinar. De ahí que el navegador de tracks transfiera 23 KiB
en 3G y 349 KiB en red rápida: en la medición estrangulada el canvas y su marco
ya existen cuando las señales todavía viajan, y cada lane se pinta al llegar su
bloque. Es el número honesto de *cuándo se ve algo*, no de cuándo está todo.

Con 4,6 ms por frame hay margen de sobra dentro del presupuesto de 16,7 ms que
impone una pantalla de 60 Hz.

## Qué se hizo, en orden de lo que movió el número

### 1. Envolvente mínimo/máximo, no submuestreo

Lo más importante de todo, y ya estaba desde la primera versión de V3. Al
dibujar 8 192 valores en 800 píxeles, tomar uno de cada diez **pierde los picos**,
y en una señal genómica el pico es la información. Peor: los picos que
sobreviven cambian según hacia dónde se desplaza uno, así que la señal parpadea.

`drawLane` recorre **píxeles, no muestras**: por cada columna busca el rango de
muestras que le toca y dibuja el segmento entre su mínimo y su máximo. Es como
renderizan la onda los editores de audio. El coste pasa a depender del ancho en
píxeles y no del tamaño del arreglo.

### 2. Canvas con `devicePixelRatio`

También desde el principio. El búfer se dimensiona a `css_px * dpr` y el
contexto se escala. Sin eso todo se ve borroso en pantallas densas.

### 3. Un render por frame, y transformación durante el gesto

Esto sí es nuevo. Antes cada evento de rueda o de movimiento provocaba un
redibujado completo: una rueda rápida encolaba decenas.

Ahora hay dos mecanismos. `scheduleDraw` coalesce a **un render por frame** con
`requestAnimationFrame`. Y mientras el gesto está vivo se aplica una
transformación CSS barata sobre el mapa de bits ya dibujado —desplazamiento al
arrastrar, escalado al hacer zoom—, y el redibujado a resolución completa espera
140 ms a que el gesto se asiente.

Detalle que importa: al arrastrar, el desplazamiento visual sigue a **lo que la
vista se movió de verdad**, no al ratón. Si la ventana topa con el borde del
locus, el dibujo se para con ella y el tope se ve.

### 4. Compresión y viajes de red

- El servidor de pruebas comprime, como cualquier servidor real. 80 kB de
  script pasan a 28 kB.
- **CSS incrustado en el HTML** tras el build: 29 kB que dejan de ser una
  petición que bloquea el pintado. Con un tope de 64 kB, porque incrustar una
  hoja grande estropearía el cacheado del HTML.
- **Catálogo incrustado en el HTML**, no pedido por red: `scripts/inline-index.mjs`
  mete los 2 056 B de `data/index.json` en un `<script type="application/json">`
  tras el build, con tope de 16 KiB y fallo duro si se pasa —a partir de cierto
  tamaño incrustarlo estropea el cacheado del HTML y conviene volver a pedirlo.
  El archivo suelto **no** se borra: es un artefacto del contrato, con su sello
  de proveniencia, y `vite dev` lo lee por red. `loadIndex()` lo cachea bajo la
  misma clave que usaría la descarga, así que nadie puede acabar pidiendo dos
  veces lo que ya está en la página.
- **Precarga especulativa por convención, desde el `<head>`.** Abrir una
  variante costaba tres viajes en serie: HTML, bundle, artefacto. El tercero solo
  existía porque nadie sabía qué pedir hasta que el bundle se ejecutaba. Pero la
  ruta de esos artefactos es **contrato, no dato**: `data/loci/<locus>/locus.json`
  y `.../variants/<variante>/{card,tracks,saturation}.json` se calculan leyendo
  `location.hash`. Un script clásico en `index.html` —clásico y no módulo, porque
  un módulo se difiere hasta después del parseo, que es justo el retraso que se
  quiere evitar— hace ese cálculo y emite el `<link rel="preload">` mientras el
  bundle sigue viajando. La tercera oleada se funde con la segunda: **−562 ms en
  la ficha y −659 ms en el navegador**, en 3G lento.
  Tres detalles que no son decorativos: los identificadores se validan contra
  `[A-Za-z0-9_-]+` antes de construir la URL, porque el hash lo escribe quien
  visita; `crossorigin="anonymous"` se copia del `fetch()` real, y un juego de
  atributos distinto haría que el navegador descargara **dos veces**; y todo va
  en `try/catch`, porque una especulación equivocada solo puede desperdiciar una
  petición, nunca cambiar lo que se pinta.
- `content-visibility: auto` en los paneles, con `contain-intrinsic-size` para
  que la barra de desplazamiento no salte.

## Estabilidad visual (CLS)

| Vista | Antes del héroe | Ahora |
|---|---:|---:|
| Portada 400x720 | 0,2580 | **0,0000** |
| Portada 1280x900 | 0,1782 | **0,0000** |

El héroe introdujo una regresión de CLS que no se adivinó: se midió con un
`PerformanceObserver` de `layout-shift`. Tenía dos causas y se arreglaron por
separado.

La pequeña (0,0047) era el hueco reservado para la ficha del héroe: se había
reservado 190 px en escritorio y 220 px en móvil, y el contenido montado mide
208 y 228. Ahora son 210 y 232.

La grande (0,1734, el 97 % del total) **no era del héroe**. `<main>` sale del
HTML vacío, así que el pie de página arranca pegado debajo del encabezado y baja
de golpe cuando el bundle pinta la vista. Existía desde antes; el héroe solo la
hizo visible al empujar el pie más lejos. La cura es `min-height: 100vh` en
`.main`: con eso el pie arranca **debajo del pliegue**, y un desplazamiento
fuera de la ventana no cuenta como CLS ni lo ve nadie. `min-height` no encoge
nada que ya sea más alto, así que el layout final de cada vista queda igual.
Con 70vh todavía quedaba 0,1736 en móvil: la ventana hay que cubrirla entera.

Barrido completo de las cinco vistas tras el arreglo, en los dos tamaños:
portada 0,0000 / 0,0000 · acerca de 0,0000 / 0,0000 · ficha 0,0000 / 0,0000 ·
saturación 0,0000 / 0,0001 · señal 0,0023 / 0,0071. Sin desbordamiento
horizontal a 400 px.

## Lo que se descartó, y por qué

**Descompresión en un web worker.** El plan la pedía para "decodificar base64 y
deshacer la cuantización". Aquí no hay base64: los bloques son binario crudo y
se mapean con `new Int16Array(buffer, offset)` sin copiar. Lo único que queda es
multiplicar por la escala, que a 4,6 ms por frame no aparece en la medición.
Mover trabajo a un worker cuesta complejidad y una copia de mensajes; **si una
optimización no mueve un número medido, se quita**.

**Envolventes precalculadas por nivel de zoom en el pipeline.** Es buena idea si
el render fuera el cuello de botella. No lo es: 4,6 ms por frame contra 16,7 de
presupuesto. Además multiplicaría los artefactos por el número de niveles y el
presupuesto de bytes es más ajustado que el de CPU. Queda anotado para cuando un
locus con muchas más lanes lo justifique.

**Prefetch en `requestIdleCallback` del locus adyacente.** No se hizo: con tres
loci el catálogo entero pesa menos que una sola imagen, y adivinar cuál es el
"adyacente" en una lista de tres no tiene sentido. Vuelve a tener sentido con
decenas de loci.
