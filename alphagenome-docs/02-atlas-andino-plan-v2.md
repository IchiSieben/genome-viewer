# Atlas Andino v2 — plan ejecutable

*Auditoría de viabilidad: 2026-09-11. Esta versión reemplaza el plan del 10 de septiembre, que tenía la premisa invertida.*

---

## 1. Qué se rompió en la v1, y por qué importa

Tres fallos, encontrados contrastando el reporte técnico del Atlas contra la documentación de gnomAD. Los dejo escritos porque son el tipo de error que un revisor encuentra en la primera página.

### Fallo 1 — la premisa era falsa

La v1 decía que el AVI se entrenó con "rareza global". El reporte técnico dice `FAF95_GRPMAX`: el límite inferior al 95 % del **máximo de la frecuencia alélica de filtrado entre grupos de ascendencia genética**. Para gnomAD v4 genomas ese máximo se toma sobre `{afr, amr, eas, mid, nfe, sas}`, y los grupos con cuello de botella — `asj`, `fin`, `ami` — se **excluyen deliberadamente** para impedir que la deriva de una población fundadora haga parecer benigna a una variante.

Es decir: gnomAD ya diseñó una defensa contra exactamente el problema que la v1 denunciaba. Una variante común en peruanos entra por `amr` y recibe FAF alto.

### Fallo 2 — la dirección estaba invertida

La v1 preguntaba si el AVI **subestima** variantes andinas. El mecanismo real predice lo contrario. Si una variante segrega en haplotipos indígenas y se diluye dentro del grupo `amr` (que son mosaicos de mestizaje, no una muestra indígena), su FAF se queda baja → se etiqueta **"proxy impactful"** en entrenamiento → el modelo aprende que ese contexto de secuencia predice impacto → en inferencia recibe un AVI **inflado**.

La hipótesis correcta es **inflación**, no subestimación.

### Fallo 3 — circularidad

gnomAD v3.1 incorporó los ~2.500 genomas de 1000 Genomes a su callset. gnomAD v4 los heredó. El AVI se entrenó sobre genomas de gnomAD v4.1. **PEL está dentro del conjunto de entrenamiento.** Evaluar en PEL es evaluar en train.

*(Este punto quedó sin confirmación documental directa — gnomAD no publica el desglose por población de 1000G. Verificar consultando una variante PEL-enriquecida en el subset HGDP/1KG antes de afirmarlo en un paper.)*

### Fallo 4 — poder estadístico

En 1,5 Mb salen ~50 variantes que pasan `AF_PEL ≥ 0,05 AND AF_global ≤ 0,01` (estimación por dos vías independientes, rango 30–110). Pero en una población con cuello de botella esas variantes viajan en pocos haplotipos largos: el número efectivo de unidades independientes es ~5–20, no 50. Cualquier test que las trate como independientes es anticonservador.

Además: con n=85 (170 alelos), una frecuencia estimada de 0,05 tiene IC 95 % de Wilson [0,026 – 0,094]. No se puede distinguir un 2 % real de un 9 % real. Y el umbral `AF ≥ 0,05` equivale a `AC ≥ 9`, que a frecuencia verdadera 0,05 es literalmente una moneda al aire (P = 0,479).

---

## 2. La versión que sobrevive, y es más fuerte

### La cadena argumental

Cuatro eslabones, cada uno con cita verificada. Esto es lo que convierte "demo andina" en contribución metodológica.

1. **Whiffin et al. 2017** (*Genet Med* 19:1151, PMID 28518168) introduce la frecuencia alélica de filtrado. ACMG/ClinGen la adoptan como evidencia de benignidad (criterios BA1/BS1). El marco usa el límite inferior de confianza del máximo por población — y colapsa cuando una población no está en la referencia: sin grupo, no hay FAF, no hay evidencia de benignidad.

2. **Kore et al. 2025** (*Nat Commun* 16:8734, PMID 41053080), de los propios autores de gnomAD, aplican inferencia de ancestría local a 27 M de variantes en 7.612 genomas admixed american. Resultado: **78,5 % de las variantes AMR divergen ≥2× entre tramos de ancestría**, y **81,49 % recibirían una frecuencia máxima más alta tras incorporar ancestría local**, "potentially altering clinical interpretations". Entre variantes ClinVar de alta confianza, ~10 % del grupo AMR superan el umbral clínico del 5 % con datos específicos de ancestría pese a quedar por debajo con frecuencias agregadas.

3. **El AVI cableó ese FAF como etiqueta.** `FAF95_GRPMAX < 0.001` = "proxy impactful".

4. **Nadie lo ha auditado**, y el paper del Atlas pide exactamente este trabajo:

   > "we hope that community-driven efforts will continue to make in silico models like AVI more useful by establishing robust standards for calibration of non-coding variants and **evaluating these tools across diverse genetic ancestries**."

En todo el reporte técnico, las palabras "diversity", "bias" y "representation" no aparecen ni una vez, y "ancestry" aparece dos veces: en la definición del FAF y en esa frase. No hay ninguna evaluación estratificada por ascendencia.

### El dato que lo hace posible — y que no existía antes

gnomAD publica el VCF de ancestría local:

```
https://storage.googleapis.com/gcp-public-data--gnomad/release/3.1/local_ancestry/genomes/
    gnomad.genomes.v3.1.local_ancestry.amr.vcf.bgz
```

7.612 muestras, 14.804.206 SNPs bialélicos, con AC/AN/AF **por componente de ancestría: amerindígena, africana y europea**, por separado. Eso es 90× el tamaño de PEL y ataca el problema directamente en vez de por proxy.

### Hipótesis, en su forma defendible

> **H1 (inflación).** Variantes con frecuencia apreciable en tramos de ancestría amerindígena pero `FAF95_GRPMAX < 0,001` — el conjunto que el AVI etiquetó como "impactante" en entrenamiento — reciben scores AVI más altos que controles emparejados con la misma FAF agregada.
>
> **H2 (calibración).** El mismo PHRED de AVI compra distinta razón de verosimilitud local (LR+) en variantes enriquecidas en ancestría amerindígena que en variantes europeas comunes. Esto es una falla de **calibración**, más fuerte que una diferencia de medias.
>
> **H3 (mecanismo).** Bajo selección reciente la conservación es poco informativa por construcción. Si en ese conjunto el score está dominado por las contribuciones SHAP de conservación, es una afirmación mecanística sobre por qué falla.
>
> **H4 (dirección, con verdad de campo).** Sobre los 11 eQTLs de PDE1B bajo selección en quechuas peruanos (Zhu et al. 2026), ¿acierta AlphaGenome la *dirección* del efecto sobre expresión en sangre completa?

**Ninguna afirma que el AVI "esté mal".** Afirman que su calibración depende de la ascendencia de referencia, y que existe un mecanismo documentado que lo explica. Un resultado nulo es igual de publicable: significaría que los features moleculares rescataron el ruido de etiqueta.

---

## 3. Datos

| Rol | Fuente | n | Acceso |
|---|---|---|---|
| **Primario** | gnomAD v3.1 LAI AMR VCF | 7.612 muestras / 14,8 M SNPs | Abierto, bucket público |
| **Réplica por dosis de ancestría** | gnomAD v3.1.2 HGDP+1KG callset | PEL 85, MXL 64, CLM 94, PUR 104 + HGDP indígenas ~64 | Abierto; **AWS `gnomad-public-us-east-1` es gratis**, GCP es requester-pays |
| **Brazo contaminado** | 1000G PEL | 85 | Reportar aparte: está en train |
| **Verdad de campo** | Zhu et al. 2026, 11 eQTLs de PDE1B | — | Tablas del paper |
| **Control interno** | Ecorregiones no andinas del Perú (Caro-Consuegra 2022) | 286 | Publicado |

**La dosis de ancestría es el mejor control que tenemos.** PEL 77,3 % indígena americana → MXL 47,0 % → CLM 27,4 % → PUR 12,9 % (Martin et al. 2017, AJHG). Una variante genuinamente derivada de ancestría indígena debe mostrar frecuencia que siga ese gradiente. Un artefacto de PEL no lo hará.

**No usar:** el Peruvian Genome Project (EGA, acceso controlado, semanas de trámite) ni el Mexican Biobank (igual). Y **no citar** los "1,6 millones de variantes novedosas" del PGP como evidencia de variación común peruana: "novedosa" ahí significa solo "ausente de dbSNP", sin desglose de frecuencia, y por el benchmark de Byrska-Bishop ~93 % de las variantes novedosas frente a dbSNP son singletons.

### Loci andinos, coordenadas verificadas contra Ensembl (GRCh38)

| Gen | Coordenadas | Variantes con rs publicadas |
|---|---|---|
| EPAS1 | 2:46.293.667–46.386.702 | rs570553380 (H194R, hipomorfo, con knockin de ratón), rs149348765 |
| EGLN1 | 1:231.359.560–231.422.749 | rs1769793, rs2064766, rs2437150, rs2491403, rs479200 (VO₂max en altura) |
| HIF1A | 14:61.695.357–61.748.529 | señal XP-nSL |
| NOS2 | 17:27.755.283–27.800.758 | haplotipos (Crawford 2017) |
| RASGEF1B | 4:81.426.393–82.044.244 | rs2159657, rs17005141, rs12649837 |
| PPP1R1A / PDE1B | 12:54.575.387–54.588.844 | **rs884510**, y los eQTLs rs10876566, rs7954532, rs2669406 |

Control negativo: RPL13A, TBP, SDHA, PPIA, HPRT1, YWHAZ.

---

## 4. Método, siguiendo el precedente del subcampo

El subcampo ya convergió en una receta. Seguirla desarma objeciones antes de que se formulen.

**1. Condicionar por frecuencia alélica. No negociable.** Radivojac et al. demostraron que sin estratificar casi todo sale significativo por reversión de Simpson. Binear por FAF y comparar dentro de bin; bootstrap estratificado por ascendencia × bin, 1.000 iteraciones, p empírico.

Y luego el giro que ellos no podían hacer: **para el AVI la frecuencia no es solo un confusor a eliminar, es la vía causal bajo estudio**, porque la etiqueta *es* un estadístico de frecuencia. Hacerlo explícito convierte la objeción en la tesis.

**2. Emparejamiento por bootstrap con distancia.** Plantilla de Sun et al., que a su vez la adaptaron del marco de benchmarking de Avsec — o sea, es el protocolo sancionado por los propios autores de AlphaGenome. Positivos congelados; negativos muestreados dentro de estratos, ~100 por positivo; 10 bins de log(distancia al TSS); 100 iteraciones de bootstrap; AUROC media con IC 95 %; clasificador = |score|, no el score con signo.

Emparejar además por **contexto trinucleotídico** — el AVI se entrenó con downsampling estratificado por trinucleótido, así que es un confusor real — y por clase de región y restricción génica.

**3. Calibración formal, no diferencia de medias.** Marco de Pejaver et al. 2022 (*AJHG* 109:2163, PMID 36413997): estimar LR+ local en función del score y mapear intervalos a fuerzas de evidencia ACMG. Herramienta: `BayesQuantify` (R, PMID 40973199).

**El experimento decisivo:** calcular la curva de LR+ local para el AVI por separado en el conjunto enriquecido en ancestría amerindígena y en el conjunto europeo emparejado. Si el mismo PHRED compra distinta fuerza de evidencia, eso es una falla de calibración — mucho más fuerte que una media desplazada.

**4. Reportar el número efectivo de haplotipos independientes**, no el conteo de variantes.

---

## 5. Las cinco objeciones y sus respuestas

| # | Objeción | Respuesta |
|---|---|---|
| 1 | "n=85 de Lima urbana no es una población andina de altura, y tus frecuencias tienen varianza enorme" | Primario = LAI AMR (n=7.612). PEL pasa a réplica, declarando su fracción de ancestría indígena. Reportar FAF95, nunca frecuencias puntuales. |
| 2 | "Esto es confusión por frecuencia alélica, no ascendencia — reversión de Simpson" | Estratificar dentro de bins de FAF + bootstrap estratificado. Y argumentar que para el AVI la frecuencia *es* la vía causal, porque es la etiqueta. |
| 3 | "Tus controles están emparejados por lo incorrecto y contaminados" | Emparejar por trinucleótido, distancia al TSS, clase de región y restricción. Controles de ecorregiones no andinas del Perú. Reportar con ≥2 definiciones de control. |
| 4 | "No tienes verdad de campo. Un desplazamiento de distribución no es un sesgo" | **La más seria.** Las variantes andinas comunes *están* enriquecidas en función adaptativa: si el AVI las puntúa alto, quizá acierta. Respuesta: curvas de calibración en vez de medias, los 11 eQTLs de PDE1B como verdad de campo direccional, y la descomposición SHAP. |
| 5 | "Scores precomputados, cuantiles inestables, y cero marco ético" | Fijar y reportar la versión exacta del Atlas y del cliente; restringir a SNVs; declaración explícita de datos y ética. |

**Sobre la ética, en serio.** Investigación sobre genomas indígenas sin participación comunitaria es un problema que detiene revisiones. El consentimiento de 1000G cubre uso abierto, pero el *encuadre* ("adaptación andina quechua") invoca a una comunidad que no consintió ese encuadre. Incluir declaración: solo datos agregados de consentimiento abierto, ninguna afirmación sobre individuos o comunidades quechuas o aymaras, adhesión a los principios CARE de gobernanza de datos indígenas. Y considerar escribirle a Heinner Guio (INS Perú), Víctor Borda, Timothy O'Connor o Abigail Bigham: una colaboración convierte el flanco más débil en el más fuerte.

---

## 6. Novedad, honestamente acotada

| Afirmación | Veredicto |
|---|---|
| "Primera evaluación del AlphaGenome/AVI en población indígena americana" | ❌ Sobreafirmación. Indígenas mexicanos ya aparecen en auditorías de sesgo de VEPs. |
| "Primera evaluación de un modelo **secuencia→función regulatorio** en población de ascendencia mayoritariamente indígena americana" | ✅ Novedoso. |
| "Primera auditoría de sesgo del score **AVI** en cualquier población" | ✅ Novedoso, y con ventana temporal: el AVI tiene tres días. |

Titular seguro: *primera evaluación estratificada por ascendencia de predicciones regulatorias secuencia→función en una población de ascendencia mayoritariamente indígena americana.*

---

## 7. Alcance por niveles

**Nivel 1 — portafolio (3–5 días).** Descarga del VCF de LAI, construcción del conjunto de discordancia etiqueta-vs-ancestría, consulta al Atlas, emparejamiento y test H1, réplica por dosis de ancestría. Produce una figura defendible y un repo limpio.

**Nivel 2 — preprint (+1–2 semanas).** Añade calibración formal (curvas de LR+), la verdad de campo de PDE1B con test de dirección, la descomposición SHAP, y el escrito bilingüe.

**Nivel 3 — colaboración.** Contactar al grupo peruano; extender al Peruvian Genome Project vía solicitud a su comité.

El nivel 1 se sostiene solo si el nivel 2 nunca llega.

---

## Referencias verificadas

- Avsec et al. 2026. *Nature* 649:1206–1218. [10.1038/s41586-025-10014-0](https://doi.org/10.1038/s41586-025-10014-0)
- AlphaGenome Atlas, reporte técnico. [PDF](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/alphagenome-atlas-a-predictive-map-of-every-possible-dna-letter-change-in-the-human-genome/alphagenome-atlas.pdf)
- Whiffin et al. 2017. *Genet Med* 19:1151. PMID 28518168. [10.1038/gim.2017.26](https://doi.org/10.1038/gim.2017.26)
- Kore et al. 2025. *Nat Commun* 16:8734. PMID 41053080. [10.1038/s41467-025-63340-2](https://doi.org/10.1038/s41467-025-63340-2)
- Sun, Mews & Bush 2026. bioRxiv. PMID 42395544. [10.64898/2026.06.22.730889](https://doi.org/10.64898/2026.06.22.730889)
- Radivojac et al. 2026. bioRxiv. PMID 41756911. [10.64898/2026.02.14.705914](https://doi.org/10.64898/2026.02.14.705914)
- Pejaver et al. 2022. *AJHG* 109:2163. PMID 36413997. [10.1016/j.ajhg.2022.10.013](https://doi.org/10.1016/j.ajhg.2022.10.013)
- Manrai et al. 2016. *NEJM* 375:655. PMID 27532831. [10.1056/NEJMsa1507092](https://doi.org/10.1056/NEJMsa1507092)
- Martin et al. 2019. *Nat Genet* 51:584. PMID 30926966. [10.1038/s41588-019-0379-x](https://doi.org/10.1038/s41588-019-0379-x)
- Duncan et al. 2019. *Nat Commun* 10:3328. PMID 31346163. [10.1038/s41467-019-11112-0](https://doi.org/10.1038/s41467-019-11112-0)
- Popejoy & Fullerton 2016. *Nature* 538:161. PMID 27734877. [10.1038/538161a](https://doi.org/10.1038/538161a)
- Corpas et al. 2024. *Cell Genom* 5:100724. PMID 39694036. [10.1016/j.xgen.2024.100724](https://doi.org/10.1016/j.xgen.2024.100724)
- Zhu et al. 2026. *Genome Biol Evol* 18(8). PMID 42402195. [10.1093/gbe/evag164](https://doi.org/10.1093/gbe/evag164)
- Brutsaert et al. 2019. *PNAS* 116:24006. PMID 31712437. [10.1073/pnas.1906171116](https://doi.org/10.1073/pnas.1906171116)
- Jorgensen et al. 2023. *Mol Biol Evol* 40(7). PMID 37463421. [10.1093/molbev/msad162](https://doi.org/10.1093/molbev/msad162)
- Crawford et al. 2017. *AJHG* 101:752. PMID 29100088. [10.1016/j.ajhg.2017.09.023](https://doi.org/10.1016/j.ajhg.2017.09.023)
- Bigham et al. 2010. *PLoS Genet* 6:e1001116. PMID 20838600. [10.1371/journal.pgen.1001116](https://doi.org/10.1371/journal.pgen.1001116)
- Caro-Consuegra et al. 2022. *Mol Biol Evol* 39(8). PMID 35860855. [10.1093/molbev/msac158](https://doi.org/10.1093/molbev/msac158)
- Lindo et al. 2018. *Sci Adv* 4:eaau4921. PMID 30417096 — **la cláusula de honestidad:** no encuentran barridos selectivos en componentes conocidos de la respuesta a hipoxia. La adaptación andina es disputada y poligénica.
- Koenig et al. 2024. *Genome Res* 34:796. [10.1101/gr.278378.123](https://doi.org/10.1101/gr.278378.123)
- Borda et al. 2024, GLAD. *Cell Genom* 4:100692. PMID 39486408.
- Guio et al. 2025, Peruvian Genome Project. *Front Genet* 16:1614021. PMID 40772273.
- 1000 Genomes Consortium 2015. *Nature* 526:68 — la frase que endosa el diseño: *"762,000 variants that are rare (<0.5%) within the global sample but much more common (>5%) in at least one population... PEL in the Americas... Drifted variants within such populations may reveal phenotypic associations that would be hard to identify in much larger global samples."*

## Verificaciones pendientes

- Confirmar documentalmente que PEL está en el callset de gnomAD, consultando una variante PEL-enriquecida en el subset HGDP/1KG.
- Resolver la contradicción interna de Zhu et al.: el resumen dice alelos "expression-decreasing" y la discusión dice "increase PDE1B expression". Revisar tablas suplementarias antes de fijar la hipótesis de dirección.
- Recuperar la lista de autores de "Pervasive ancestry bias in variant effect predictors" (bioRxiv 10.1101/2024.05.20.594987) antes de citarlo.
- Los cálculos de faf95 usaron Clopper-Pearson como proxy de `filtering_allele_frequency` de Hail. Recalcular con Hail para publicación.
