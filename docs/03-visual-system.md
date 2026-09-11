# Sistema visual

*Los valores están en `web/src/styles/tokens.css` y son la única fuente. Ninguna
vista declara un color propio: si necesita uno que no está, el que falta es un
token.*

---

## La paleta está medida, no razonada

`python pipeline/tools/validate_palette.py` simula las tres dicromacias con el
método Brettel-Viénot-Mollon y calcula distancias **CIEDE2000** entre todos los
pares. CIEDE2000 se acerca a la percepción; la distancia euclidiana en RGB no,
y por eso no se usa.

### Lo que dice la medición

| | Par más cercano | ΔE2000 |
|---|---|---:|
| Claro, visión normal | naranja / rojo | **13,3** |
| Oscuro, visión normal | magenta / rojo | **14,1** |
| Claro, protanopia | naranja / verde | 5,5 |
| Claro, deuteranopia | naranja / rojo | 7,0 |
| Claro, tritanopia | naranja / magenta | 0,9 |
| Oscuro, tritanopia | naranja / amarillo | 0,8 |

**La paleta pasa en visión normal** y no separa bajo dicromacia. Eso segundo no
es un defecto de estos hex: **ninguna paleta de ocho categorías lo consigue.**
Medido contra Okabe-Ito, la paleta para daltonismo más usada en ciencia, sobre
la misma métrica y las mismas cuatro visiones:

| Paleta | Peor par de las cuatro visiones |
|---|---:|
| Okabe-Ito (8 colores) | 0,6 |
| Esta paleta, tema claro | **0,9** |
| Esta paleta, tema oscuro | **0,8** |

Es decir, esta paleta es ligeramente **mejor** que la referencia del campo. El
límite es el número de categorías, no los valores elegidos.

### La consecuencia de diseño

Como el color no puede cargar solo con la identidad, no lo hace:

- Leyenda siempre que haya dos o más series; con cuatro o menos, además
  etiqueta directa.
- Un canal **no cromático** disponible por familia (`modalityDash`), para cuando
  hay series superpuestas.
- En el navegador de tracks cada modalidad tiene su propio carril, y dentro de
  él REF y ALT se distinguen por grosor y por el relleno con signo entre ambas,
  no solo por color.

### Un hallazgo que conviene decidir

El encargo reserva **las tres primeras ranuras** para las vistas donde todas las
series se comparan a la vez. Medidas, son el trío flojo:

| Tema | Mejor trío disponible | Ranuras 1-2-3 |
|---|---:|---:|
| Claro | 15,1 (aqua + amarillo + violeta) | **11,9** |
| Oscuro | 15,3 (verde + violeta + rojo) | **3,6** |

Azul y aqua colapsan bajo tritanopia, y en tema oscuro el trío queda en 3,6, que
es indistinguible. Se implementó la asignación fija tal como se especificó,
porque el orden de ranuras es una decisión declarada; pero si alguna vista llega
a comparar tres series simultáneamente, **conviene sacarlas de las ranuras
1-2-3**. `python pipeline/tools/validate_palette.py --triples` imprime el
ranking completo.

## Asignación: once modalidades, ocho ranuras

Ciclar la paleta daría el mismo color a dos series distintas. Las once
modalidades se agrupan en **siete familias**, una por ranura:

| Ranura | Color | Familia | Modalidades |
|---:|---|---|---|
| 1 | azul | Expresión | RNA-seq, CAGE, PRO-cap |
| 2 | naranja | Accesibilidad | ATAC, DNase |
| 3 | aqua | Unión de factores | ChIP-TF |
| 4 | amarillo | Histonas | ChIP-histonas |
| 5 | magenta | Splicing | sitios, uso, uniones |
| 6 | verde | Contacto 3D | mapas de contacto |
| 7 | violeta | Poliadenilación | poliadenilación |
| 8 | rojo | *libre* | — |

La ranura 8 queda sin usar a propósito: es roja y competiría con el color de
estado crítico.

**El color sigue a la entidad, nunca a su posición en un ranking.** Filtrar
modalidades no repinta a las que quedan.

## Las tres escalas

**Categórica** para familias de modalidad, con asignación fija.

**Secuencial** para magnitud sin signo: un solo tono, trece pasos, nunca
arcoíris. En tema oscuro la rampa **invierte su dirección**, porque sobre fondo
oscuro la magnitud alta tiene que ser la más clara.

**Divergente** para toda diferencia REF contra ALT: polo frío azul, polo cálido
rojo, y punto medio **gris neutro**. El cero tiene que leerse como "nada": si el
punto medio tirara hacia alguno de los polos, el mapa sugeriría un efecto donde
no lo hay. Mismo número de pasos por brazo, y dominio simétrico para que el cero
caiga en el centro del color.

En el mapa de calor el extremo del dominio se toma por **percentil 98**, no por
el máximo: una sola celda extrema comprimiría todo el resto contra el neutro y
el patrón desaparecería. La leyenda marca el recorte con ≥ y ≤ para que nadie
lea el extremo como si fuera el valor real.

## Estado y nucleótidos: canales reservados

Los colores de estado (bueno, aviso, serio, crítico) **nunca** se usan como una
serie más, y siempre van acompañados de icono y etiqueta.

Los colores de nucleótido (A verde, C azul, G ámbar, T rojo) son convención del
dominio y viven en un canal separado del categórico. Solo aparecen donde se
muestren bases literales, nunca para series.

## Tema oscuro

Es un juego de pasos propio, no una inversión automática. Se declara bajo dos
ámbitos: la media query del sistema operativo, excluyendo `[data-theme="light"]`,
y un ámbito `[data-theme="dark"]` para el interruptor del visor. Así el
interruptor gana en las dos direcciones.

## Reglas que no se negocian

- **Un solo eje.** Nunca dos escalas verticales en el mismo gráfico.
- El texto lleva tokens de texto, nunca el color de la serie; la marca de color
  al lado es la que carga la identidad.
- Marcas finas, rejilla y ejes discretos. La densidad de información es el lujo.
- Cifras tabulares en todo número, coordenada y score: en una tabla las columnas
  tienen que alinearse por dígito.
