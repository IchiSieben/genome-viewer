# Rendimiento

*Medido el 2026-09-11 con Chromium headless. Datos crudos en
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

| Vista | Red rápida | 3G lento (400 kbps, 400 ms) | Transferido |
|---|---:|---:|---:|
| Portada | 120 ms | **1 336 ms** | 19 KiB |
| Ficha de variante | 154 ms | **2 140 ms** | 22 KiB |
| Navegador de tracks | 161 ms | **2 148 ms** | 20 KiB |

| Interacción | Valor |
|---|---:|
| Render por frame durante desplazamiento | **4,8 ms** |
| 24 pasos de arrastre + 12 de rueda | 1 101 ms |
| Heap de JavaScript | 9,5 MiB |

**El objetivo era dos segundos hasta interactivo con la red estrangulada.** La
portada lo cumple con margen. Las vistas enlazadas directamente se quedan en
2,15 s, un 7 % por encima, y ese resto es **latencia pura**, no bytes: con
400 ms de ida y vuelta, el HTML, el script y el artefacto son tres viajes que
no se pueden solapar más de lo que ya están. Bajar de ahí exigiría un service
worker o HTTP/2 push, que es más maquinaria de la que este proyecto justifica.

Con 4,8 ms por frame hay margen de sobra dentro del presupuesto de 16,7 ms que
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

- El servidor de pruebas comprime, como cualquier servidor real. 50 kB de
  script pasan a 18 kB.
- **CSS incrustado en el HTML** tras el build: 21 kB que dejan de ser una
  petición que bloquea el pintado. Con un tope de 64 kB, porque incrustar una
  hoja grande estropearía el cacheado del HTML.
- **`<link rel="preload">` del catálogo**, que se pide en paralelo con la
  descarga del script en vez de después de ejecutarlo.
- **Precarga especulativa por convención.** Abrir una variante costaba tres
  viajes en serie: índice, locus, ficha. Las rutas de los dos últimos son parte
  del contrato, no un dato, así que se piden en paralelo con el índice. Como el
  caché es por URL, cuando el código real los pide ya están en vuelo. Si el
  índice dijera otra ruta, la especulación se descarta: nunca cambia lo que se
  muestra. Esto solo se llevó unos 580 ms de la ficha en 3G.
- `content-visibility: auto` en los paneles, con `contain-intrinsic-size` para
  que la barra de desplazamiento no salte.

## Lo que se descartó, y por qué

**Descompresión en un web worker.** El plan la pedía para "decodificar base64 y
deshacer la cuantización". Aquí no hay base64: los bloques son binario crudo y
se mapean con `new Int16Array(buffer, offset)` sin copiar. Lo único que queda es
multiplicar por la escala, que a 4,8 ms por frame no aparece en la medición.
Mover trabajo a un worker cuesta complejidad y una copia de mensajes; **si una
optimización no mueve un número medido, se quita**.

**Envolventes precalculadas por nivel de zoom en el pipeline.** Es buena idea si
el render fuera el cuello de botella. No lo es: 4,8 ms por frame contra 16,7 de
presupuesto. Además multiplicaría los artefactos por el número de niveles y el
presupuesto de bytes es más ajustado que el de CPU. Queda anotado para cuando un
locus con muchas más lanes lo justifique.

**Prefetch en `requestIdleCallback` del locus adyacente.** No se hizo: con tres
loci el catálogo entero pesa menos que una sola imagen, y adivinar cuál es el
"adyacente" en una lista de tres no tiene sentido. Vuelve a tener sentido con
decenas de loci.
