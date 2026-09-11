# AlphaGenome / Atlas — estado del arte y proyectos candidatos

*Investigación: 2026-09-10. Auditoría de viabilidad: 2026-09-11. Este documento reemplaza la versión del día 10.*

---

## Estado del recurso (fechas que importan)

- **Jun 2025** — lanzamiento de la API de AlphaGenome. Modelo secuencia→función: 1 Mb de entrada, 11 modalidades de salida, 5.930 tracks humanos / 1.128 de ratón.
- **28 ene 2026** — paper en *Nature* 649:1206–1218 (Avsec et al.). Gana o empata en 25 de 26 evaluaciones de efecto de variante. Pesos abiertos en Kaggle y Hugging Face bajo términos no comerciales; código JAX en `alphagenome_research`. Recomiendan una H100 para inferencia local.
- **18 jun 2026** — recalibración de cuantiles: antes se estimaban sobre chr22, ahora genome-wide. **Rompe comparabilidad con cualquier análisis anterior.**
- **14 jul 2026** — corrección de la inferencia de indels.
- **8 sep 2026** — **AlphaGenome Atlas**. ~9.000 M de SNVs + >100 M de indels precomputados, ~27.000 predicciones escalares por variante, ~1 PB. Score resumen **AVI** con atribuciones SHAP. Mapa de 2.601 motivos con 253 mil millones de instancias. Cliente `alphagenome` 0.9.0 con módulo `atlas`. Ensembl VEP lo integró el mismo día.

## Cuatro vías de acceso, no intercambiables

| Vía | Qué da | API key | Comercial |
|---|---|---|---|
| Model API (`dna_client.create`) | inferencia en vivo, pistas completas a 1 pb, mapas de contacto, ISM | sí | no |
| Atlas API (`atlas.create`) | scores precomputados: `AVI_SCORE`, `AVI_SCORE_FEATURE_IMPORTANCE`, 12 scorers por modalidad; solo humano | sí | no |
| Descarga estática de AVI (TSV+tabix) | un PHRED por SNV, genome-wide, sin atribuciones | no | **sí** (única pieza permisiva) |
| Science Skills (`SKILL.md`) | instrucciones + CLI que envuelve las dos APIs | sí, al ejecutar | no |

Transporte: gRPC contra `gdmscience.googleapis.com:443`, no REST. Un navegador no puede llamarla directo.

## Gotchas verificados en el código fuente

- `genome.Interval` es 0-based semiabierto; `genome.Variant` es 1-based. El intervalo cerrado `chr11:5225727-5226575` se pide como `Interval('chr11', 5225726, 5226575)`.
- El Atlas **no acepta rsIDs**. Formato `chr:pos:ref>alt`, con `>`, no con dos puntos.
- Longitudes válidas: 16 kb, 100 kb, 500 kb, 1 Mb. Las de 2 kb se eliminaron en nov 2025 por bajo rendimiento. Recomendación oficial: 1 Mb.
- `score_variant` no acepta `ontology_terms` aunque `predict_variant` sí. Se filtra sobre el `.var` del AnnData.
- No hay cifras públicas de cuota. Método práctico: subir `max_workers` hasta ver `RESOURCE_EXHAUSTED`.

---

## Anatomía del AVI — corregida

El AVI **no es una salida del modelo**. Es una red neuronal encima que consume 18 features:

| Grupo | n | Features |
|---|---|---|
| Regulatorio (AlphaGenome) | 10 | splicing fusionado, ATAC, DNase, ChIP-TF, ChIP-histonas, CAGE, PRO-cap, RNA-seq, poliadenilación, mapas de contacto. Máximo entre tejidos. |
| Proteína | 4 | AlphaMissense + 3 banderas de VEP (stop ganado, stop perdido, inicio perdido) |
| Conservación | 2 | phyloP Cactus 241-way, PhastCons 470-way |
| Indel | 2 | indicadores de inserción/deleción |

PHRED = −10·log₁₀(1 − cuantil). 10 = top 10 %, 20 = top 1 %, 30 = top 0,1 %.

### La etiqueta de entrenamiento — esto es lo que corregí

El reporte técnico del Atlas dice, literalmente:

> "variants are extracted and classified based on their filtering allele frequency group maximum (FAF95_GRPMAX; specifically, **the 95% lower bound of the maximum filtering allele frequency across genetic ancestry groups**)"
>
> "Proxy neutral (negative, label 0): Variants with FAF95_GRPMAX ≥ 0.001"
> "Proxy impactful (positive, label 1): Variants with FAF95_GRPMAX < 0.001"

**No es "rareza global".** Es el máximo entre grupos de ascendencia. Para gnomAD v4 genomas, `FAF95_GRPMAX = max(faf95)` sobre `{afr, amr, eas, mid, nfe, sas}`. Los grupos con cuello de botella — `asj`, `fin`, `ami` — están **excluidos a propósito**, precisamente para que la deriva de una población fundadora no haga parecer benigna a una variante.

Dos consecuencias:

1. **`amr` está incluido y `nfe` no tiene ningún privilegio.** Una variante común en cualquiera de esos seis grupos recibe FAF alto y se etiqueta neutra.
2. **No hay ningún feature de frecuencia entre las 18 entradas.** La frecuencia entra solo como etiqueta. El modelo no puede aprender "esto parece andino, castígalo" — no ve ascendencia ni frecuencia. Cualquier sesgo entra como **ruido de etiqueta**, no como un detector aprendido.

Esto invalida la versión ingenua de la hipótesis de sesgo. Ver el documento de plan para la versión que sí sobrevive.

---

## El hueco en el ecosistema

8 repos en el topic `alphagenome` de GitHub. 0 visualizaciones interactivas en navegador — la librería oficial es matplotlib estático y el único visor web (11 estrellas) no está desplegado. 0 tutoriales en español. 3 MCPs comunitarios, todos anteriores a 0.9.0, ninguno habla Atlas ni AVI.

**Sesgo poblacional — estado real de la literatura:**

- **Sun, Mews & Bush** (bioRxiv jun 2026, PMID 42395544): Borzoi y AlphaGenome v0.5.0 contra eQTLs de sangre en tres cohortes — afroamericana (n=224), hispana caribeña (n=209), blanca no hispana (n=235). AUROC con variantes fine-mapeadas PIP≥0,9: Borzoi AA 0,837 / CH 0,714 / NHW 0,743; AlphaGenome AA 0,820 / CH 0,758 / NHW 0,756. Atribuyen la ventaja AA a resolución de fine-mapping, no a mejor biología. **Único benchmark de ascendencia sobre modelos secuencia→función que existe.** Hispano caribeño no es andino.
- **"Pervasive ancestry bias in variant effect predictors"** (bioRxiv, 52 VEPs, 14 grupos incluido indígena mexicano): los VEPs entrenados en clínica son los peores. ClinVar clasifica 27,4 % en europeos no finlandeses, 32,6 % en AMR, **10,1 % en indígenas mexicanos**. Ojo: esto ya cubre "indígena americano", pero solo para predictores *missense*.
- **Radivojac et al.** (bioRxiv 2026, PMID 41756911, UK Biobank n=425.978): tras estratificar por frecuencia alélica los predictores son mayormente justos. Sin estratificar, casi todo sale significativo — lo diagnostican como **reversión de Simpson**. Instrucción explícita: *"comparisons of prediction performance between groups should only be made after conditioning on allele frequency."* Es a la vez el mejor precedente metodológico y la refutación más probable.

**Nadie ha evaluado ningún modelo secuencia→función en población indígena americana.** Ese hueco sobrevive.

---

## Proyectos candidatos, reordenados tras la auditoría

**A. Auditoría de calibración del AVI en ascendencia indígena americana** — rediseñado. Ver documento de plan. Esfuerzo 3–5 días para versión de portafolio.

**B. Desacoplar conservación de biología regulatoria** — se integra en A como análisis mecanístico, no como proyecto aparte. Bajo selección reciente la conservación debería ser poco informativa por construcción; si los scores andinos son conservación-driven, eso es una afirmación mecanística.

**C. Primer visor interactivo en el navegador** — sigue intacto y sigue siendo el hueco más limpio. JSON congelado, página estática, sin backend ni llave expuesta. 1–2 días.

**D. Port del SKILL.md a Claude Code + MCP con Atlas** — ~4 h, señal de tooling.

**E. Writeup bilingüe** — coste marginal, vacío total de contenido en español.

**F. Anotador de VCF con AVI** — redundante, VEP ya lo hizo oficialmente.

**Descartar:** cualquier cosa cuyo núcleo sea "correr el modelo sobre N variantes y rankear" (eso *es* el Atlas). Benchmarks de enhancers distales y de splicing (hechos, con código público). Comparador multi-modelo (`pinellolab/chorus` ya lo hace y acepta contribuciones).

---

## Términos — implicación arquitectónica

Uso no comercial, individual. Se pueden publicar resultados y gráficos con aviso de sujeción a los *AlphaGenome Output Terms of Use*. La llave es personal e intransferible → **una web pública no puede llamar la API en vivo**. La salida limpia y además conveniente: análisis local con llave propia → JSON congelado → web estática. Nada relacionado con el trabajo del autor para terceros: investigación en nombre de organizaciones comerciales está excluida y el uso clínico está prohibido explícitamente.

## Sin verificar

Las páginas de términos de DeepMind se renderizan con JavaScript y no se pudieron leer programáticamente; lo resumido viene del README oficial, el FAQ y los SKILL.md. No se confirmó la URL ni el tamaño de la descarga masiva del AVI estático.
