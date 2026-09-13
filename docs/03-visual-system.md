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

| Paleta | Peor par, 4 visiones | Peor par, visión normal | Mejor trío |
|---|---:|---:|---:|
| Okabe-Ito (8 colores) | 0,6 | 21,7 | **57,1** |
| Esta paleta, tema claro | **0,9** | 13,3 | 15,1 |
| Esta paleta, tema oscuro | **0,8** | 14,1 | 15,3 |

Las tres columnas juntas, porque una sola engaña. En el peor par de las ocho
—la columna que mide el techo de una paleta categórica— esta paleta queda
marginalmente por encima de la referencia del campo, y eso confirma lo que
importa: **el límite es el número de categorías, no los valores elegidos.** En
las otras dos Okabe-Ito gana, y por mucho en el trío. La razón es concreta y no
se arregla eligiendo mejores hexadecimales: su mejor trío es celeste + amarillo
+ negro, y el **negro** aquí es la tinta del texto en los dos temas, no una
serie disponible. Una paleta que puede gastar un extremo del eje de luminosidad
en una categoría juega otro juego.

Citar el 0,6 contra el 0,9 sin las otras dos columnas sería quedarse con la
única métrica favorable. Los tres números salen del mismo código, sobre las
mismas cuatro visiones, en `docs/evidence/palette-validation.txt`.

### La consecuencia de diseño

Como el color no puede cargar solo con la identidad, no lo hace:

- Leyenda siempre que haya dos o más series; con cuatro o menos, además
  etiqueta directa.
- Un canal **no cromático** disponible por familia (`modalityDash`), para cuando
  hay series superpuestas.
- En el navegador de tracks cada modalidad tiene su propio carril, y dentro de
  él REF y ALT se distinguen por grosor y por el relleno con signo entre ambas,
  no solo por color.

### El trío de comparación simultánea: 5-6-7, medido

El encargo reservaba **las tres primeras ranuras** para las vistas donde varias
series se comparan a la vez. Medidas, eran el trío flojo, y la ficha de variante
—que compara tres familias de AVI de un vistazo— usaba algo aún peor:

| Trío | Peor par, claro | Peor par, oscuro | Conjunto |
|---|---:|---:|---:|
| Ranuras 1-2-3, las del encargo | 11,9 | 3,6 | 3,6 |
| Ranuras 1-7-3, las que usaba `familyColor` | 11,9 | **1,7** | **1,7** |
| **Ranuras 5-6-7, las que usa ahora** | 13,0 | 15,3 | **13,0** |

Las tres columnas son el **peor par sobre las cuatro visiones**, que es la única
métrica con la que se puede comparar fila contra fila. En tema claro el cambio
apenas mueve la aguja —de 11,9 a 13,0, ambos limitados por la tritanopia—; toda
la ganancia está en el oscuro, de **1,7 a 15,3**.

Ese 1,7 era un defecto real, no una cifra de informe: en tema oscuro, el azul
`#3987e5` de *Regulatorio* y el violeta `#9085e9` de *Proteína* colapsan bajo
**protanopia** a una distancia que no se distingue. Las dos barras contiguas de
la cascada eran el mismo color para una parte del público.

El criterio para elegir el reemplazo tiene tres partes, y ninguna es estética:

1. **Peor par, no promedio.** Un trío vale lo que vale su par más débil.
2. **Las cuatro visiones, y el peor de los dos temas.** El color de una familia
   es el mismo token en claro y en oscuro, así que puntuarlos por separado da
   dos ganadores distintos y ninguno sirve. Por eso la columna *Conjunto* es el
   mínimo: 5-6-7 llega a 13,0 porque en claro, bajo tritanopia, verde y violeta
   quedan justo ahí.
3. **La ranura 8 fuera.** Está reservada al estado crítico y usarla como serie
   la volvería ambigua. Excluirla no cuesta nada: 5-6-7 también gana si se
   incluye.

Con ese criterio, **5-6-7 es el único trío de los 35 posibles que pasa el umbral
de 12,0**, y es el primero del ranking. Dentro del trío todos los pares quedan
por encima, así que cuál familia recibe cuál ranura es indiferente.

Ningún hexadecimal cambió: es una reasignación de ranuras. Y para que no vuelva
a desfasarse, `validate_palette.py` **lee las ranuras de `familyColor` en
`color.ts`** y falla si no coinciden con las que valida o si la separación cae
por debajo del umbral. Esa comprobación no depende de que alguien la recuerde:
`pipeline/tests/test_palette.py` la recalcula en cada `pytest`, y no afirma el
trío sino que lo mide, así que tocar un hex de `tokens.css` también la dispara.
`python pipeline/tools/validate_palette.py --triples`
imprime el ranking completo; su salida está en
[`evidence/palette-validation.txt`](evidence/palette-validation.txt).

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

Las ranuras 5, 6 y 7 aparecen dos veces: aquí como familias de modalidad, y
arriba como el trío de familias de AVI. Es la misma reutilización deliberada —
once colores compitiendo sería peor que reusar tres— y no genera ambigüedad
porque viven en paneles distintos de la ficha y nunca comparten leyenda.

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

### La única excepción a "divergente = diferencia": el mapa de contacto REF

El diff de contactos dibuja **dos rampas divergentes en el mismo cuadrado**: la
mitad de abajo es el diff, que es una diferencia y le corresponde; la de arriba
es el mapa REF, que es un nivel, y por la regla de arriba tocaría secuencial.

Se usa divergente igualmente porque el dato lo pide: el mapa de contactos llega
en espacio logarítmico con el decaimiento por distancia ya retirado (D13), o
sea, es una cantidad **con signo y con cero verdadero** —positivo es
enriquecimiento sobre lo esperado a esa distancia, negativo es depleción—. El
79,1 % de sus valores son negativos. Pintarlo en secuencial obligaría a elegir
un extremo como "cero", que es justo el error que la rampa divergente existe
para evitar.

Lo que esa excepción cuesta, y cómo se paga: dos rampas iguales en una misma
imagen invitan a leer el relieve de arriba como si fueran cambios. Contra eso
van una **separación diagonal** trazada entre las dos mitades, **dos leyendas
separadas** —cada una con su título y su dominio— y el rótulo explícito de que
la de arriba es *la estructura que ya había* y su escala es propia, no un
dominio fijo. Si aparece una tercera vista que quiera repetir el truco, la
condición es la misma: cantidad con signo, cero real y leyendas separadas.

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
