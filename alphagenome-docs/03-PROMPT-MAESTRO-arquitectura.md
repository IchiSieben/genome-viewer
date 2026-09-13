# PROMPT MAESTRO — Atlas Andino, fase de arquitectura

**Cómo usarlo:** pégalo completo en Claude Code, en un directorio vacío, con el modelo de razonamiento fuerte. Esta fase **no escribe implementación**: produce compuertas de viabilidad, decisiones de arquitectura y esqueletos. Los ladrillos van después, en una sesión aparte.

**Antes de pegarlo:** ten la llave de AlphaGenome en `~/.env` como `ALPHAGENOME_API_KEY="..."`. Si no la tienes, el prompt igual funciona: la compuerta G4 te lo va a decir y se detiene ahí.

---

```
Vas a diseñar la arquitectura de un proyecto de investigación en genómica
computacional. Esta sesión es SOLO arquitectura. No escribas implementación
real: ni pipelines completos, ni análisis, ni consultas masivas a APIs.

Lee todo el encargo antes de tocar nada.

===============================================================================
CONTEXTO CIENTÍFICO (ya investigado y verificado — no vuelvas a investigarlo)
===============================================================================

El 8 de septiembre de 2026 Google DeepMind publicó el AlphaGenome Atlas:
predicciones precomputadas del efecto de ~9 mil millones de SNVs del genoma
humano, resumidas en un score llamado AVI (AlphaGenome Variant Impact).

El AVI no es una salida del modelo. Es una red neuronal encima que consume 18
features: 10 modalidades regulatorias de AlphaGenome (máximo entre tejidos),
AlphaMissense, 2 scores de conservación (phyloP Cactus 241-way, PhastCons
470-way), 3 banderas de pérdida de función de VEP, y 2 indicadores de indel.
Ningún feature de frecuencia alélica es entrada del modelo.

La etiqueta de entrenamiento sí es un estadístico de frecuencia. Cita textual
del reporte técnico:

  "variants are extracted and classified based on their filtering allele
   frequency group maximum (FAF95_GRPMAX; specifically, the 95% lower bound of
   the maximum filtering allele frequency across genetic ancestry groups)"
  "Proxy neutral (label 0): FAF95_GRPMAX >= 0.001"
  "Proxy impactful (label 1): FAF95_GRPMAX < 0.001"

Para gnomAD v4 genomas, FAF95_GRPMAX = max(faf95) sobre {afr, amr, eas, mid,
nfe, sas}. Los grupos con cuello de botella (asj, fin, ami) están excluidos a
propósito.

LA TESIS DEL PROYECTO, EN CUATRO ESLABONES:

 1. Whiffin et al. 2017 (Genet Med 19:1151) introduce la frecuencia alélica de
    filtrado; ACMG/ClinGen la adoptan como evidencia de benignidad (BA1/BS1).
    El marco colapsa cuando una población no está representada: sin grupo, no
    hay FAF, no hay evidencia de benignidad.

 2. Kore et al. 2025 (Nat Commun 16:8734), de los propios autores de gnomAD,
    aplican inferencia de ancestría local a 7.612 genomas admixed american:
    78,5 % de las variantes AMR divergen >=2x entre tramos de ancestría, y
    81,49 % recibirían una frecuencia máxima más alta tras incorporar
    ancestría local, "potentially altering clinical interpretations".

 3. El AVI cableó FAF95_GRPMAX como etiqueta de entrenamiento.

 4. Nadie lo ha auditado. El reporte del Atlas pide exactamente este trabajo:
    "evaluating these tools across diverse genetic ancestries". En todo el
    reporte, "diversity", "bias" y "representation" no aparecen nunca.

MECANISMO PREDICHO — LA DIRECCIÓN IMPORTA Y ES CONTRAINTUITIVA:

Una variante que segrega en haplotipos de ancestría amerindígena se diluye
dentro del grupo agregado `amr` (que son mosaicos de mestizaje, no una muestra
indígena). Su FAF se queda baja. Se etiqueta "proxy impactful" en
entrenamiento. El modelo aprende que ese contexto de secuencia predice impacto.
En inferencia esas variantes reciben un AVI INFLADO.

La hipótesis es INFLACIÓN, no subestimación. Si en algún momento escribes lo
contrario, está mal.

Como el modelo no ve frecuencia ni ascendencia, esto entra como RUIDO DE
ETIQUETA, no como un detector aprendido de ascendencia. Nunca afirmes que "el
modelo aprendió a penalizar variantes andinas": es arquitectónicamente
imposible y un revisor lo mata. La afirmación correcta es sobre CALIBRACIÓN.

HIPÓTESIS FORMALES:

 H1 (inflación). Variantes con frecuencia apreciable en tramos de ancestría
    amerindígena pero FAF95_GRPMAX < 0,001 reciben AVI más alto que controles
    emparejados con la misma FAF agregada.

 H2 (calibración). El mismo PHRED de AVI compra distinta razón de
    verosimilitud local (LR+) en el conjunto enriquecido en ancestría
    amerindígena que en variantes europeas comunes. Esta es la afirmación
    fuerte: una falla de calibración, no una media desplazada.

 H3 (mecanismo). Bajo selección reciente la conservación es poco informativa
    por construcción. Descomposición SHAP: ¿el score está dominado por
    conservación en ese conjunto?

 H4 (dirección, con verdad de campo). Sobre los 11 eQTLs de PDE1B bajo
    selección en quechuas peruanos (Zhu et al. 2026, Genome Biol Evol
    18(8), PMID 42402195), ¿acierta AlphaGenome la dirección del efecto sobre
    expresión en sangre completa?

Un resultado nulo es publicable: significaría que los features moleculares
rescataron el ruido de etiqueta.

===============================================================================
COMPUERTAS DE VIABILIDAD — HAZ ESTO PRIMERO, ANTES DE CUALQUIER ARQUITECTURA
===============================================================================

Cada compuerta es un go/no-go. Verifícalas EN ORDEN. Si una falla, DETENTE,
repórtala, y propón la alternativa; no sigas a la siguiente ni empieces a
diseñar. Escribe los resultados en `docs/00-feasibility-gates.md` con evidencia
(comando ejecutado, salida, URL, tamaño de archivo).

 G1. El VCF de ancestría local de gnomAD existe y es accesible sin
     autenticación ni requester-pays. Ruta esperada:
       https://storage.googleapis.com/gcp-public-data--gnomad/release/3.1/
         local_ancestry/genomes/gnomad.genomes.v3.1.local_ancestry.amr.vcf.bgz
     Verifica con una petición de rango o HEAD: tamaño, y que exista el .tbi.
     Confirma con bcftools que el header trae campos de AC/AN/AF por
     componente de ancestría, y anota los NOMBRES EXACTOS de esos campos.
     Debe cubrir 14.804.206 SNPs bialélicos de 7.612 muestras.
     Si falla: alternativa es el callset abierto HGDP+1KG en el bucket de AWS
     `gnomad-public-us-east-1` (gratis, sin requester-pays), aceptando menor
     tamaño de muestra.

 G2. Se puede extraer una porción por región sin descargar el archivo entero.
     Prueba `bcftools view -r chr12:54575387-54588844` contra la URL remota.
     Si el índice remoto no funciona, el proyecto cambia de escala: repórtalo.

 G3. gnomAD expone FAF95_GRPMAX de forma consultable para las mismas
     variantes. Averigua por qué vía (campo en el VCF de release, tabla de
     Hail, o el navegador). Necesitamos cruzar frecuencia por tramo de
     ancestría contra la FAF agregada, variante por variante.

 G4. La API del Atlas responde. Con la llave en ~/.env:
       pip install -U "alphagenome>=0.9.0"
     y una consulta de UNA sola variante conocida, por ejemplo
     chr12:54578515:C>T (rs884510, dentro de PDE1B/PPP1R1A), pidiendo
     [Corregido 2026-09-12: este documento daba T>C. La referencia GRCh38 es C;
      T es el ancestral. Ver README, seccion de la variante semilla.]
     ['AVI_SCORE', 'AVI_SCORE_FEATURE_IMPORTANCE'].
     Documenta el ESQUEMA REAL que vuelve: claves del Mapping, columnas de
     .obs y .var, forma de .X, si existe layers['quantiles'], y los NOMBRES
     EXACTOS de los 18 features. Este último punto es crítico y no está
     documentado públicamente.
     Si no hay llave: detente aquí y dilo. Las compuertas G1-G3 igual son
     válidas y el resto de la arquitectura puede diseñarse.

 G5. Estimación de cuota. Mide el tiempo de una consulta de 50 variantes con
     max_workers en 1, 4 y 8. Extrapola a 5.000 y a 50.000 variantes.
     Reporta si aparece RESOURCE_EXHAUSTED y con qué concurrencia.

 G6. Conteo real de la población de estudio. Con G1+G3 resueltas, cuenta
     cuántas variantes cumplen: frecuencia en tramo amerindígena >= 0,01 Y
     FAF95_GRPMAX < 0,001. Hazlo sobre UN cromosoma pequeño (chr22) y
     extrapola. Si el total genome-wide extrapolado es menor a ~2.000, el
     estudio no tiene poder y hay que replantearlo. REPORTA EL NÚMERO.

Las compuertas son la entrega más importante de esta sesión. Un número real de
G6 vale más que cualquier diseño elegante.

===============================================================================
LO QUE DEBES ENTREGAR
===============================================================================

 1. docs/00-feasibility-gates.md — resultados de G1..G6 con evidencia.

 2. docs/01-architecture.md — decisiones de arquitectura, con justificación y
    alternativas descartadas. Debe cubrir explícitamente:

    a) SEPARACIÓN ADQUISICIÓN / ANÁLISIS. La adquisición es lenta, toca red,
       es cacheable y no determinista en el tiempo. El análisis es rápido,
       determinista y testeable. No deben mezclarse nunca.

    b) VOLUMEN. El VCF de LAI son ~15 M de variantes. Decide el modelo de
       procesamiento: streaming por región, por cromosoma, o materialización
       a parquet particionado. Justifica contra memoria disponible.

    c) CONTRATOS ENTRE ETAPAS. Define el esquema de cada parquet intermedio
       (columnas, tipos, claves, invariantes). Una etapa solo debe conocer el
       esquema de su entrada, no la implementación de la anterior.

    d) PROVENIENCIA Y REPRODUCIBILIDAD. Esto NO es opcional en este proyecto:
       los cuantiles del AVI se recalibraron el 18/06/2026 (antes chr22, ahora
       genome-wide) y la inferencia de indels se arregló el 14/07/2026.
       Cualquier comparación entre cosechas de score es inválida. Diseña cómo
       se sella en cada salida: versión del cliente, fecha de consulta, hash
       de la config, versión de los datos de gnomAD.

    e) RESUMIBILIDAD. Toda etapa de red debe poder reanudarse sin repetir
       trabajo. Define la granularidad del checkpoint.

    f) CONFIGURACIÓN. Los umbrales del diseño (frecuencias, bins, ratios) son
       parámetros de investigación, no constantes. Deben vivir en config y ser
       barrables para análisis de sensibilidad.

    g) ESTRATEGIA DE PRUEBA SIN CUOTA. Debe existir un generador sintético con
       el esquema real que permita validar toda la lógica estadística sin
       gastar llamadas, incluyendo un caso con efecto plantado conocido y un
       caso nulo. La validación estadística debe recuperar el efecto plantado
       y reportar nulo en el caso nulo.

 3. El esqueleto del repo: directorios, archivos con firmas de funciones y
    docstrings que digan QUÉ hace cada cosa y POR QUÉ, más `raise
    NotImplementedError` en los cuerpos. Módulos de configuración y esquemas
    completos y funcionales. Tests que expresen los invariantes esperados,
    marcados como xfail.

 4. docs/02-analysis-plan.md — el plan estadístico preregistrable:
    - definición exacta de casos y controles
    - variables de emparejamiento y su justificación
    - los tests, con su estadístico y su tamaño de efecto
    - qué resultado confirmaría y qué resultado refutaría cada hipótesis
    - criterios de parada

 5. docs/03-open-questions.md — lo que no pudiste resolver y qué se necesita.

===============================================================================
REQUISITOS METODOLÓGICOS QUE LA ARQUITECTURA DEBE SOPORTAR
===============================================================================

Estos vienen del precedente del subcampo. No son opcionales: hay un paper
publicado que refuta estudios que los omiten.

 - CONDICIONAR POR FRECUENCIA. Radivojac et al. 2026 (PMID 41756911, UK
   Biobank n=425.978) demostraron que sin estratificar por frecuencia alélica
   casi todas las comparaciones entre ascendencias salen significativas por
   reversión de Simpson. Toda comparación va dentro de bins de FAF, con
   bootstrap estratificado, 1.000 iteraciones, p empírico.

 - EMPAREJAMIENTO POR BOOTSTRAP CON DISTANCIA. Plantilla de Sun et al. 2026
   (PMID 42395544), adaptada del marco de benchmarking de Avsec — o sea, el
   protocolo sancionado por los autores de AlphaGenome. Positivos congelados;
   ~100 negativos por positivo muestreados dentro de estratos; 10 bins de
   log(distancia al TSS); 100 iteraciones; AUROC media con IC 95 %;
   clasificador = |score|, no el score con signo.

 - EMPAREJAR TAMBIÉN POR CONTEXTO TRINUCLEOTÍDICO. El AVI se entrenó con
   downsampling estratificado por trinucleótido; es un confusor real.
   Añadir clase de región y restricción génica.

 - CALIBRACIÓN FORMAL, NO DIFERENCIA DE MEDIAS. Marco de Pejaver et al. 2022
   (AJHG 109:2163, PMID 36413997): LR+ local en función del score, mapeado a
   fuerzas de evidencia ACMG. El experimento decisivo es la curva de LR+ local
   calculada por separado en cada conjunto.

 - NÚMERO EFECTIVO DE HAPLOTIPOS INDEPENDIENTES, no conteo de variantes. En
   poblaciones con cuello de botella las variantes derivadas viajan en pocos
   haplotipos largos. Tratarlas como independientes es anticonservador.

 - RÉPLICA POR DOSIS DE ANCESTRÍA. PEL 77,3 % de ancestría indígena americana
   -> MXL 47,0 % -> CLM 27,4 % -> PUR 12,9 % (Martin et al. 2017, AJHG). Una
   variante genuinamente derivada de ancestría indígena debe mostrar
   frecuencia siguiendo ese gradiente. Un artefacto no lo hará. Es el mejor
   control disponible y sale del mismo callset abierto.

 - CONTAMINACIÓN. 1000 Genomes está dentro de gnomAD v3.1, que gnomAD v4
   heredó, que es sobre lo que se entrenó el AVI. PEL está en train. Trátalo
   como brazo contaminado y repórtalo por separado, nunca como primario.

===============================================================================
RESTRICCIONES
===============================================================================

 - NO CONSUMAS CUOTA MÁS ALLÁ DE LAS COMPUERTAS. Máximo unas cientos de
   variantes en total durante toda esta sesión.

 - LA LLAVE ES PERSONAL E INTRANSFERIBLE según los términos. Va en ~/.env,
   nunca en código, nunca en un commit, nunca impresa en un log. Añade
   .gitignore antes de cualquier otra cosa.

 - USO NO COMERCIAL. Los outputs están sujetos a los AlphaGenome Output Terms
   of Use y eso debe aparecer en el README y en cualquier salida publicable.
   Herramienta de investigación: nada de uso clínico ni consejo médico.

 - ÉTICA DE DATOS INDÍGENAS. El proyecto usa solo datos agregados de
   consentimiento abierto. No hace afirmaciones sobre individuos ni sobre
   comunidades quechuas o aymaras. Debe incluir una declaración de datos y
   ética alineada con los principios CARE. Diséñala ahora, no al final.

 - PYTHON. Estructura src/, tipado, docstrings en español, código y nombres de
   identificadores en inglés. Sin dependencias pesadas innecesarias.

===============================================================================
LO QUE NO DEBES HACER EN ESTA SESIÓN
===============================================================================

 - No implementes los análisis. Firmas y docstrings, nada más.
 - No descargues el VCF completo de LAI. Solo porciones de prueba.
 - No hagas consultas masivas al Atlas.
 - No escribas el visor ni ninguna visualización.
 - No optimices nada.
 - No inventes números. Si no lo mediste, dilo.

===============================================================================
CÓMO TRABAJAR
===============================================================================

Empieza por las compuertas, en orden, reportando cada una al terminarla. Si
una falla, detente y dime qué pasó antes de continuar.

Cuando llegues al diseño: para cada decisión de arquitectura no trivial,
escribe la alternativa que descartaste y por qué. Prefiero un diseño con el
razonamiento visible a uno más pulido sin él.

Si algo del encargo te parece equivocado, dilo. Este plan ya sobrevivió una
ronda de auditoría que invirtió su hipótesis original; asume que todavía puede
tener errores.

Al terminar, resume en diez líneas: qué compuertas pasaron, cuál es el número
de G6, y cuál es el riesgo principal que queda vivo.
```

---

## Después de esta sesión

**Sesión 2 — ladrillos (modelo fuerte de código).** Implementa los módulos que esta sesión dejó con firma, empezando por la capa de adquisición y el generador sintético. Nada de análisis real hasta que el sintético valide la lógica estadística.

**Sesión 3 — la corrida.** Adquisición completa, consulta al Atlas por lotes, análisis. Aquí es donde se gasta la cuota.

**Sesión 4 — el visor.** JSON congelado a partir de la tabla de análisis, página estática. Sin backend ni llave expuesta: es la salida limpia frente a los términos y además va directo a hosting compartido.

## Si la compuerta G6 devuelve un número bajo

Si salen menos de ~2.000 variantes genome-wide, el estudio de calibración no tiene poder y hay tres salidas, en orden de preferencia:

1. **Relajar el umbral de frecuencia en tramo amerindígena** de 0,01 a 0,005 y reportar el análisis de sensibilidad. El costo es más ruido de estimación.
2. **Cambiar la pregunta a discordancia de etiqueta**: en vez de "¿el AVI infla?", preguntar "¿cuántas etiquetas de entrenamiento habrían cambiado de signo usando frecuencias corregidas por ancestría local?". Eso se responde sin tocar el Atlas, es puramente aritmético sobre datos de gnomAD, y sigue siendo un resultado publicable — mide directamente el ruido de etiqueta.
3. **Pivotar al proyecto C** (el visor interactivo), que no depende de nada de esto y sigue siendo el hueco más limpio del ecosistema.
