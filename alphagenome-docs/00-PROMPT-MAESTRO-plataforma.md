# PROMPT MAESTRO — Plataforma AlphaGenome

**Este es el único prompt que necesitas ejecutar.** Reemplaza al prompt de arquitectura anterior: invierte el orden de prioridades y deja el estudio poblacional como contenido de la plataforma, no como la apuesta central.

**Cómo usarlo:** abre Claude Code en un directorio vacío, adjunta los tres documentos de contexto (`01-alphagenome-estado-y-proyectos.md`, `02-atlas-andino-plan-v2.md`, y este mismo archivo), y pega el bloque de abajo.

**Antes:** llave en `~/.env` como `ALPHAGENOME_API_KEY="..."`. Si no la tienes, el hito 0 te lo dirá y podrás avanzar igual hasta el hito 3 usando datos sintéticos.

---

```
Vas a construir una plataforma web para visualizar predicciones de AlphaGenome,
más un pipeline que la alimenta. Te adjunté tres documentos de contexto
científico ya investigado y verificado — léelos antes de empezar y no vuelvas a
investigar lo que ya está ahí.

===============================================================================
QUÉ ESTAMOS CONSTRUYENDO, Y POR QUÉ EN ESTE ORDEN
===============================================================================

El 8 de septiembre de 2026 Google DeepMind publicó el AlphaGenome Atlas:
predicciones precomputadas del efecto de ~9 mil millones de variantes del
genoma humano. La librería oficial de visualización es matplotlib estático. No
existe ninguna visualización interactiva nativa de navegador de efectos de
variante de AlphaGenome — lo verifiqué contra GitHub, bioRxiv, Hugging Face
Spaces, Observable y las listas curadas. El único visor web que existe renderiza
PNGs en el servidor, tiene 11 estrellas y no está desplegado en ningún lado.

Ese hueco es el objetivo. La plataforma es el entregable principal.

Hay además un estudio poblacional planificado (documento 02) sobre si el score
AVI está calibrado distinto según la ascendencia. Ese estudio puede no dar
señal: su compuerta de poder estadístico puede fallar. Por eso NO es el centro.
Es el primer contenido que llena la plataforma. Si el estudio sale nulo, la
plataforma se publica igual con contenido descriptivo, y el resultado nulo se
muestra honestamente como lo que es.

Diseña todo bajo esa lógica: LA PLATAFORMA NO PUEDE DEPENDER DE QUE UN ESTUDIO
CONCRETO SALGA BIEN.

===============================================================================
LAS TRES RESTRICCIONES QUE DETERMINAN TODA LA ARQUITECTURA
===============================================================================

 R1. HOSTING COMPARTIDO, SIN PROCESOS PERSISTENTES. El destino es un plan de
     hosting web compartido de Hostinger. No hay backend, no hay Node corriendo,
     no hay cron propio. La salida del build tiene que ser archivos estáticos y
     nada más.

 R2. LA LLAVE ES PERSONAL E INTRANSFERIBLE. Los términos de AlphaGenome lo dicen
     explícitamente, incluso dentro de la propia organización. Por lo tanto la
     web NUNCA llama a la API. El pipeline corre en local con la llave, congela
     los resultados, y la web solo lee archivos. Esto no es una limitación: es
     además la arquitectura correcta, porque hace la página instantánea y sin
     costo de cuota por visitante.

 R3. USO NO COMERCIAL, INVESTIGACIÓN. Los outputs están sujetos a los
     AlphaGenome Output Terms of Use y eso debe aparecer visible en la web y en
     el README. Nada de uso clínico ni de consejo médico, y ninguna conexión con
     trabajo para organizaciones comerciales.

De R1 y R2 sale la arquitectura entera: PIPELINE OFFLINE -> ARTEFACTOS
CONGELADOS -> SITIO ESTÁTICO. Tres capas, acopladas solo por un contrato de
datos versionado.

===============================================================================
ARQUITECTURA
===============================================================================

  pipeline/        Python. Corre en local con la llave. Consulta las APIs,
                   calcula, y emite artefactos. Nunca se despliega.

  data/dist/       Los artefactos congelados. Versionados, con sello de
                   proveniencia. Es el contrato entre las dos capas: el web
                   solo conoce este esquema, jamás el código del pipeline.

  web/             Sitio estático. Lee de data/dist/. Cero llamadas de red a
                   Google. Build a HTML/CSS/JS plano.

  studies/         Cada estudio es un directorio autocontenido: manifiesto,
                   datos, y configuración de vistas. La plataforma los descubre
                   por el manifiesto. Añadir un estudio nuevo no debe requerir
                   tocar el código del visor.

REGLA DE ORO: si para agregar un estudio nuevo hay que modificar el visor, la
abstracción está mal. El visor renderiza tipos de vista; los estudios declaran
qué vistas quieren y con qué datos.

===============================================================================
EL PRESUPUESTO DE DATOS — RESUÉLVELO ANTES DE DISEÑAR LAS VISTAS
===============================================================================

Este es el problema técnico de verdad y todo lo demás depende de cómo lo
resuelvas.

Una predicción de AlphaGenome sobre 1 Mb a resolución de 1 pb son 1.048.576
valores por track. En float32 eso son 4 MB por track. Con veinte tracks estás en
80 MB por locus. Inviable para una web.

Haz el cálculo tú mismo y decide, pero la estrategia que propongo como punto de
partida es doble resolución:

  - VISTA GENERAL: bins de 128 pb sobre 1 Mb = 8.192 valores por track.
  - DETALLE: 1 pb en una ventana de ±4 kb alrededor de la variante = 8.192
    valores por track.

Y para la codificación: JSON con números en texto gasta entre 5 y 8 bytes por
valor. Cuantizar a int16 con un factor de escala y serializar como base64 da
~2,67 bytes por valor. Eso son ~22 KB por track y resolución. Veinte tracks en
dos resoluciones quedan en ~875 KB por locus, que con gzip del servidor es
perfectamente servible si además cargas por locus bajo demanda y no todo de
golpe.

Decide y justifica: el esquema de bins, el esquema de cuantización (y su pérdida
de precisión, que debe ser irrelevante frente al grosor de la línea en pantalla),
el formato de serialización, la estrategia de carga diferida, y un índice ligero
que liste los loci disponibles sin descargar ninguno.

Documenta el presupuesto por vista en KB y pon un test que falle si un artefacto
supera su presupuesto. Un visor que tarda en cargar no es un visor.

===============================================================================
LAS VISTAS, EN ORDEN DE PRIORIDAD
===============================================================================

Prioridad = novedad dividida entre peso de datos. Las dos primeras son ligeras y
nadie las ha hecho nunca; empieza por ahí y tendrás algo mostrable el primer día.

 V1. FICHA DE VARIANTE  [datos: ~50 KB]
     Una variante. El AVI situado sobre su escala PHRED, un desglose en cascada
     de las contribuciones SHAP de los 18 features, y los tracks más afectados.
     Las atribuciones del AVI son públicas desde hace tres días y nadie las ha
     visualizado. Es la vista más novedosa y la más barata.
     Agrupa los 18 features en sus cuatro familias (10 regulatorios, 4 de
     proteína, 2 de conservación, 2 de indel) y deja ver tanto la contribución
     neta con signo como la magnitud relativa.

 V2. MAPA DE CALOR TEJIDO x MODALIDAD  [datos: ~100 KB]
     Una variante, su efecto a lo largo de cientos de biosamples, agrupados por
     modalidad y por sistema de órganos. Escalares, así que pesa poco. Permite
     ver de un vistazo si un efecto es ubicuo o específico de tejido, que es
     justamente lo que AlphaGenome aporta y ninguna herramienta muestra.
     Necesita orden con criterio: agrupa por ontología, no alfabéticamente.

 V3. NAVEGADOR DE TRACKS  [datos: ~875 KB por locus]
     La vista insignia. Señal predicha REF contra ALT a lo largo del locus, por
     modalidad, superpuestas, con anotación de genes y transcritos debajo y un
     eje de coordenadas real. Zoom y desplazamiento; al acercarte más allá de
     cierto umbral cambia a la resolución de 1 pb.
     Convenciones de navegador genómico: carriles por track, coordenadas
     GRCh38, hebra indicada, colores de nucleótido estándar (A verde, C azul,
     G ámbar, T rojo) solo donde se muestren nucleótidos.
     NOTA TÉCNICA: miles de puntos por track en SVG se atraganta. Usa canvas
     para las señales densas y SVG encima para anotaciones, ejes y overlays
     interactivos. Es la decisión de rendimiento que define esta vista.

 V4. SASHIMI DE SPLICING  [datos: ~30 KB]
     Arcos de uniones de empalme REF contra ALT, con grosor proporcional al uso
     predicho. Solo tiene sentido en variantes que afectan splicing.

 V5. DIFERENCIA DE MAPAS DE CONTACTO  [datos: ~200 KB]
     Matriz 2D de contacto REF menos ALT, paleta divergente centrada en cero.
     Es la modalidad más vistosa de AlphaGenome y la que menos gente entiende;
     una buena leyenda vale más que la figura.

 V6. PANELES DE ESTUDIO  [datos: variable]
     Gráficos del análisis poblacional. Distribuciones por grupo, curvas de
     calibración, réplica por dosis de ancestría. Se definen desde el
     manifiesto del estudio, no se codifican a mano.

Construye V1 y V2 completas antes de empezar V3. Prefiero dos vistas terminadas
y pulidas que cinco a medias.

===============================================================================
EL LISTÓN DE CALIDAD VISUAL
===============================================================================

Esto es una pieza de portafolio y la calidad del ploteo es parte del argumento.
No es decoración: es el producto.

 - UN SOLO SISTEMA VISUAL. Todas las vistas comparten paleta, tipografía, escala
   de espaciado, estilo de eje y estilo de tooltip. Defínelo una vez como tokens
   y derívalo todo de ahí. Que se vea como un producto, no como seis gráficos de
   seis personas distintas.

 - PALETAS CON CRITERIO. Divergente y centrada en cero para diferencias REF/ALT
   (el cero debe ser visualmente neutro). Secuencial para magnitudes. Categórica
   solo para modalidades, y con suficiente separación perceptual. Verifica
   contraste; nada de rojo-verde como único canal de información.

 - TEMA CLARO Y OSCURO, ambos diseñados, no uno invertido automáticamente.

 - CADA EJE CON UNIDADES REALES. Coordenadas genómicas con separadores de
   millar, escalas de señal con su unidad, y el PHRED con sus marcas
   interpretables (10 = top 10 %, 20 = top 1 %, 30 = top 0,1 %).

 - TOOLTIPS CON VALORES, no con adornos. Posición exacta, valor REF, valor ALT,
   diferencia, nombre del track y biosample.

 - ESTADOS VACÍOS Y DE CARGA que digan algo útil. Un locus que aún no se ha
   descargado debe decirlo, no quedarse en blanco.

 - RESPONSIVE DE VERDAD. Funciona en móvil: las vistas dense se vuelven
   desplazables horizontalmente dentro de su contenedor, sin que la página
   entera se desplace de lado.

 - SIN BASURA GRÁFICA. Nada de sombras en las barras, ni degradados decorativos,
   ni 3D. La densidad de información es el lujo.

===============================================================================
HONESTIDAD EN LA PRESENTACIÓN DE ESTUDIOS
===============================================================================

Requisito no negociable, y además es señal de madurez científica en un
portafolio.

Cada estudio debe declarar en su manifiesto y mostrar en pantalla: el tamaño de
muestra, el poder estadístico, las limitaciones conocidas, y si el resultado fue
positivo, nulo o no concluyente. Un resultado nulo se muestra como resultado
nulo, con la misma prominencia que uno positivo.

Todo gráfico derivado de predicciones lleva visible que son predicciones de un
modelo, no mediciones. Y el aviso de los AlphaGenome Output Terms of Use va en
el pie de cada página con contenido derivado.

Si el estudio poblacional resulta sin poder estadístico, la plataforma lo
publica igual con ese hallazgo declarado. "Medimos y no alcanzó" es un resultado;
maquillarlo no lo es.

===============================================================================
HITOS — EJECUTA EN ORDEN, DETENTE Y REPORTA EN CADA UNO
===============================================================================

 H0. VERIFICACIÓN DE ACCESO  [sin esto no hay nada]
     - pip install -U "alphagenome>=0.9.0"
     - Una consulta de UNA variante al Atlas API, por ejemplo
       chr12:54578515:C>T, pidiendo ['AVI_SCORE','AVI_SCORE_FEATURE_IMPORTANCE'].
       [Corregido 2026-09-12: este documento daba T>C. La referencia GRCh38 en
        esa posicion es C; T es el alelo ancestral. Ver README, seccion de la
        variante semilla.]
     - DOCUMENTA EL ESQUEMA REAL: claves del Mapping, columnas de .obs y .var,
       forma de .X, si existe layers['quantiles'], y los NOMBRES EXACTOS de los
       18 features. Esto último no está documentado públicamente y lo necesitas
       para V1.
     - Una consulta de predict_variant al Model API sobre un intervalo, para ver
       la forma real de los TrackData y confirmar el cálculo del presupuesto.
     - Mide tiempos con max_workers en 1, 4 y 8. Reporta si aparece
       RESOURCE_EXHAUSTED.
     Si no hay llave: dilo, salta a H1 y usa fixtures sintéticas.

 H1. CONTRATO DE DATOS Y FIXTURES
     Define el esquema completo de data/dist/ y escribe un generador de fixtures
     sintéticas que lo cumpla. El frontend se desarrolla contra las fixtures, de
     modo que el trabajo de UI nunca se bloquea por cuota ni por red. Valida el
     esquema con un validador real, no con confianza.

 H2. ESQUELETO DEL PIPELINE
     Capas de adquisición y de congelado, con proveniencia sellada en cada
     artefacto: versión del cliente, fecha de consulta, hash de configuración.
     ESTO NO ES OPCIONAL: los cuantiles del AVI se recalibraron el 18/06/2026 y
     la inferencia de indels se corrigió el 14/07/2026, así que comparar
     artefactos de cosechas distintas es inválido y el sello es lo único que lo
     hace detectable.
     Reanudable por lotes. Sin reanudación, un corte de red te cuesta la cuota
     entera.

 H3. VISTAS V1 Y V2, COMPLETAS Y PULIDAS
     Contra fixtures. Sistema visual definido. Ambos temas. Responsive.
     Este es el primer punto donde tienes algo que enseñar.

 H4. DATOS REALES PARA UN LOCUS
     Corre el pipeline sobre un solo locus bien elegido y enchufa V1 y V2 a
     datos de verdad. Verifica que el presupuesto de KB se cumple.

 H5. VISTA V3
     El navegador de tracks. Canvas para señal, SVG para anotaciones.

 H6. DESPLIEGUE
     Build estático y despliegue al hosting. Verifica que carga rápido de
     verdad, con la red simulada lenta, no en localhost.

 H7. ESTUDIO 1
     El análisis poblacional del documento 02, con sus compuertas de viabilidad,
     como primer contenido de la plataforma. Si su compuerta de poder falla,
     publícalo declarando exactamente eso.

Detente y reporta en cada hito. No avances si el anterior no está sólido.

===============================================================================
DECISIONES QUE TE TOCA TOMAR (justifica cada una, con la alternativa descartada)
===============================================================================

 - Framework del frontend, o ninguno. Restricción dura: salida estática. Astro
   compila a estático y encaja; vanilla también. Elige por lo que haga el código
   más simple de mantener, no por lo que suene mejor.
 - Librería de gráficos. Los tracks genómicos no los hace ninguna librería
   lista; eso es canvas a mano o D3. Para los gráficos estándar de los estudios
   puede convenir algo más alto nivel. Puedes mezclar, pero entonces el sistema
   visual compartido tiene que imponerse sobre ambos.
 - Formato binario de los artefactos de señal.
 - Estrategia de caché en el navegador para loci ya descargados.
 - Cómo se versiona el contrato de datos cuando cambie.

===============================================================================
RESTRICCIONES DE PROCESO
===============================================================================

 - NO GASTES CUOTA MÁS ALLÁ DE LO NECESARIO. H0 son unas pocas variantes. H4 es
   un locus. Nada más hasta H7.
 - LA LLAVE VA EN ~/.env, nunca en código, nunca en un commit, nunca en un log.
   Escribe el .gitignore antes que cualquier otra cosa.
 - Python con estructura src/, tipado y docstrings. Comentarios y docstrings en
   español; identificadores y nombres de archivo en inglés.
 - Tests donde haya lógica de verdad: presupuesto de datos, validación de
   esquema, cuantización y su error, estadística de los estudios. No pidas
   cobertura por cobertura.
 - No optimices lo que no hayas medido.
 - No inventes números. Si no lo mediste, dilo.

===============================================================================
CÓMO TRABAJAR
===============================================================================

Empieza leyendo los tres documentos adjuntos. Luego H0.

Para cada decisión de arquitectura no trivial, escribe en docs/ la alternativa
que descartaste y por qué. Prefiero un diseño con el razonamiento visible a uno
más pulido sin él: quiero poder discutir las decisiones, no solo heredarlas.

Si algo de este encargo te parece equivocado, dilo. Este plan ya sobrevivió una
ronda de auditoría que invirtió la hipótesis original del estudio; asume que
todavía puede tener errores.

Al terminar cada hito, resume en pocas líneas: qué quedó hecho, qué medición lo
respalda, y cuál es el riesgo principal que sigue vivo.
```

---

## Notas para ti, fuera del prompt

**Sobre el despliegue.** Tienes el conector de Hostinger disponible en la sesión de Cowork: `hosting_deployStaticSiteArchiveV1` sube un archivo comprimido del build directamente. O sea que el hito H6 se puede hacer desde aquí sin FTP si quieres.

**Sobre el orden con los modelos.** Este prompt está pensado para que el hito 0 al 2 los haga el modelo de razonamiento fuerte (decisiones de arquitectura, contrato de datos, presupuesto), y del 3 en adelante entre el de código a poner ladrillos. El corte natural es después de H2.

**Sobre el repo v1.** El `atlas-andino.tar.gz` que ya bajaste no se tira: `design.py` (emparejamiento), `analysis.py` (delta de Cliff, tests) y el generador sintético se reutilizan tal cual dentro de `studies/`. Lo obsoleto es solo la definición de casos y la dirección de la hipótesis, que el documento 02 ya corrige.

**Lo que hace que esto valga como portafolio, y conviene que lo tengas claro al escribir el README:** no es que uses una API nueva. Es que el resultado es una pieza de ingeniería de datos completa — un pipeline con proveniencia sellada, un contrato de datos versionado, un presupuesto de bytes defendido con tests, y una capa de presentación que respeta una restricción de despliegue real. Eso es exactamente lo que hace un ingeniero de datos, aplicado a un dominio donde además entiendes la biología.
