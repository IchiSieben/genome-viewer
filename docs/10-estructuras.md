# 10 — Estructuras del escenario

Catálogo de las ocho estructuras del PDB que forman las nubes de puntos del
escenario ([09-escenario.md](09-escenario.md)). Todos los datos de la tabla salen
de `data/stage/index.json` (construido el 2026-10-15, `configHash`
`cf394469242c4739`, lector `gemmi 0.7.5`); la cita es la cita primaria que
declara la propia entrada del PDB.

## Catálogo

Cada estructura se submuestrea a 20 000 puntos. "Extensión máx." es la mayor
extensión de las coordenadas de la nube (`maxExtentA`), en nm.

| PDB | Qué es | Cap. | Método | Resolución | Cita primaria | gz | Extensión máx. |
|---|---|---:|---|---:|---|---:|---:|
| [1BNA](https://www.rcsb.org/structure/1BNA) | Doble hélice de ADN-B: un dodecámero de ADN | 1 | rayos X | 1,9 Å | Drew et al. 1981, *Proc Natl Acad Sci USA*, [doi:10.1073/pnas.78.4.2179](https://doi.org/10.1073/pnas.78.4.2179), PMID 6941276 | 39,8 KiB | 4,2 nm |
| [4UG0](https://www.rcsb.org/structure/4UG0) | Ribosoma 80S humano, la máquina que traduce el ARN a proteína | 2 | criomicroscopía electrónica | 3,6 Å | Khatter et al. 2015, *Nature*, [doi:10.1038/nature14427](https://doi.org/10.1038/nature14427), PMID 25901680 | 149,0 KiB | 29,6 nm |
| [1KX5](https://www.rcsb.org/structure/1KX5) | Partícula central del nucleosoma: 147 pares de bases de ADN enrolladas en proteínas histonas | 3 | rayos X | 1,94 Å | Davey et al. 2002, *J Mol Biol*, [doi:10.1016/S0022-2836(02)00386-8](https://doi.org/10.1016/S0022-2836(02)00386-8), PMID 12079350 | 138,2 KiB | 15,5 nm |
| [1CDW](https://www.rcsb.org/structure/1CDW) | Dominio central de la proteína TBP humana unido a una caja TATA de ADN | 4 | rayos X | 1,9 Å | Nikolov et al. 1996, *Proc Natl Acad Sci USA*, [doi:10.1073/pnas.93.10.4862](https://doi.org/10.1073/pnas.93.10.4862), PMID 8643494 | 66,6 KiB | 5,3 nm |
| [5FLM](https://www.rcsb.org/structure/5FLM) | ARN polimerasa II de mamífero mientras transcribe, con ADN y ARN | 5 | criomicroscopía electrónica | 3,4 Å | Bernecky et al. 2016, *Nature*, [doi:10.1038/NATURE16482](https://doi.org/10.1038/NATURE16482), PMID 26789250 | 146,8 KiB | 15,7 nm |
| [5XJC](https://www.rcsb.org/structure/5XJC) | Espliceosoma humano justo antes de unir los exones | 6 | criomicroscopía electrónica | 3,6 Å | Zhang et al. 2017, *Cell*, [doi:10.1016/j.cell.2017.04.033](https://doi.org/10.1016/j.cell.2017.04.033), PMID 28502770 | 147,7 KiB | 32,8 nm |
| [5KKQ](https://www.rcsb.org/structure/5KKQ) | Dedos de zinc 3 a 7 de la proteína CTCF unidos a ADN | 7 | rayos X | 1,744 Å | Hashimoto et al. 2017, *Mol Cell*, [doi:10.1016/j.molcel.2017.05.004](https://doi.org/10.1016/j.molcel.2017.05.004), PMID 28529057 | 91,0 KiB | 9,4 nm |
| [5IRE](https://www.rcsb.org/structure/5IRE) | Virus del Zika, cápside completa (ensamblaje biológico 1) | viaje de escalas | criomicroscopía electrónica | 3,8 Å | Sirohi et al. 2016, *Science*, [doi:10.1126/science.aaf5316](https://doi.org/10.1126/science.aaf5316), PMID 27033547 | 148,0 KiB | 46,9 nm |

Total del catálogo: 927,2 KiB gz (949 435 B). Los límites que vigila el test son
150 KiB por estructura y 1 MiB en total.

Notas de lectura:

- 1BNA tiene 486 átomos pesados, menos que los 20 000 puntos: 19 514 puntos son
  duplicados de relleno que el render dibuja con baja opacidad. 1KX5 (6 375),
  1CDW (17 929) y 5KKQ (16 224) también rellenan. Las otras cuatro no.
- 5IRE se expande a su ensamblaje biológico (661 440 átomos pesados); las demás se
  usan tal como están en la entrada.
- En el viaje de escalas, el ancho de la hélice (2,2 nm) es la extensión menor de
  1BNA, no la que muestra la tabla.
- Las clases de color se asignan por tipo de polímero de cada cadena: en las
  estructuras con ADN, las cadenas alternan hebra 1 y hebra 2.

## Criterio de selección

El prompt maestro fija cuatro criterios, en este orden: (1) que ilustre un
capítulo concreto, (2) que tenga ADN cuando el capítulo habla de ADN,
(3) resolución y completitud, (4) tamaño en átomos manejable tras el
submuestreo. El repo no registra una puntuación por estructura contra esos
criterios.

## Descartadas

Candidatas consideradas y no usadas. Los motivos salen de la consulta a la API de RCSB
que se hizo al elegir el catálogo (2026-10-15; título, método, resolución y número de
átomos de cada entrada). Donde esa consulta no dejó datos, se dice.

- [1AOI](https://www.rcsb.org/structure/1AOI): nucleosoma con 146 pb a 2,8 Å (rayos X). Se eligió 1KX5, 147 pb a 1,94 Å.
- [4V6X](https://www.rcsb.org/structure/4V6X): ribosoma 80S humano a 5,0 Å (crio-EM, 237 685 átomos). Se eligió 4UG0, el mismo ribosoma a 3,6 Å.
- [6VXX](https://www.rcsb.org/structure/6VXX): espícula del SARS-CoV-2 a 2,8 Å, una proteína suelta y no un virus. El viaje de escala necesitaba una cápside entera: 5IRE, el virus del Zika.
- [1TGH](https://www.rcsb.org/structure/1TGH): complejo TBP/ADN a 2,9 Å. Se eligió 1CDW, el dominio central de la TBP humana con ADN a 1,9 Å.
- [4A3J](https://www.rcsb.org/structure/4A3J): ARN polimerasa II en el inicio de la transcripción, con un híbrido ADN-ARN de 2 nt, a 3,7 Å. El capítulo 5 cuenta la elongación: 5FLM.
- [2DRP](https://www.rcsb.org/structure/2DRP): péptido con dos dedos de zinc a 2,8 Å, que no es CTCF. Se eligió 5KKQ, los dedos 3–7 de CTCF humano con ADN a 1,744 Å.
- [5MQF](https://www.rcsb.org/structure/5MQF), [6ICZ](https://www.rcsb.org/structure/6ICZ), [1I6H](https://www.rcsb.org/structure/1I6H): se consideraron, pero la consulta de esa sesión no dejó sus datos en el registro. Motivo no registrado.


## Licencia

Los datos del PDB (coordenadas, factores B y metadatos de la entrada) son
CC0 1.0, tal como queda sellado en `provenance.license` de cada estructura:
`CC0 1.0 (RCSB PDB data)`. No exige atribución; aun así, cada estructura lleva
su enlace a RCSB y su cita primaria en la página del escenario (sección de
referencias) y en el pie que cambia al hacer scroll. De los artículos solo se
enlaza la cita (DOI y PMID); no se copian textos ni figuras.
