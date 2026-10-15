# PROMPT MAESTRO — El escenario: capa 3D + narrativa educativa del Visor del genoma

**Qué es esto.** El visor (`web/`) está construido y publicado en GitHub: H0–H6 hechos, V1–V5, N1, N4, N6, i18n ES/EN, 136 tests, 28 kB gz. Lo que falta para que sea un *producto final* que puedas enseñar a gente de un laboratorio de biología es la capa de arriba: una portada que impacte, una narrativa que explique el genoma no codificante desde "ocho años" hasta "postdoc", con referencias verificadas, y el despliegue definitivo en `genome.ichisieben.dev` con video de demo. Este prompt construye exactamente eso y nada más.

**Cómo usarlo.** Abre Claude Code en `Portfolio/` (la raíz del workspace, para que alcance `AlphaGenome/`, `Landing/` y `enjambre/` a la vez). Pega el mini prompt del final de este archivo. Es **autónomo por diseño**: no se detiene a consultar, publica desde el primer hito y re-despliega en vivo al cerrar cada uno. La Mac ya está encendida y en enjambre; el prompt la usa sin pedir permiso.

---

```
Vas a construir la capa final del Visor del genoma: una portada y una narrativa
educativa con estructuras moleculares reales en 3D, encima del visor que ya
existe en AlphaGenome/. Estás en la raíz del workspace Portfolio/: el visor
está en AlphaGenome/, el landing en Landing/, el orquestador en enjambre/.
Lee AlphaGenome/HANDOFF.md, AlphaGenome/NOTES.md, AlphaGenome/docs/03-visual-
system.md, AlphaGenome/docs/MIGRAR-SUBDOMINIO.md, Landing/MIGRACION-
SUBDOMINIOS.md y enjambre/README.md antes de empezar. No vuelvas a investigar
lo que ya está verificado en AlphaGenome/docs/ y alphagenome-docs/.

===============================================================================
MODO AUTÓNOMO — ESTO MANDA SOBRE TODO LO DEMÁS
===============================================================================

El dueño no está y no va a estar hasta pasada la medianoche (hora de Lima).
No le preguntes nada. No esperes OK de nadie. No te detengas a reportar entre
hitos: reporta por escrito y sigue. Reglas:

 A1. Toda decisión que normalmente consultarías se toma, se anota en
     AlphaGenome/docs/09-decisiones-autonomas.md con la razón y cómo
     revertirla, y se sigue. Lo que no puedas resolver sin él (un token que
     no existe, un programa que no está instalado) va a
     AlphaGenome/NEEDS-OWNER.md con el comando exacto, y rodeas el obstáculo
     con el plan B que este prompt ya nombra. Nunca te quedas parado.
 A2. EN VIVO DESDE EL PRIMER HITO. El hito E0 termina con el visor actual
     (tal cual está) publicado en https://genome.ichisieben.dev. A partir de
     ahí, cada hito que cierra en verde se re-despliega. El dueño va a
     supervisar desde fuera mirando la URL: lo que no está en vivo, para él
     no existe.
 A3. SOLO SE DESPLIEGA LO VERDE. Antes de cada subida: pytest, build,
     verify, verify:links en verde, y la llave ausente del historial. Si un
     hito no cierra en verde, no se sube; se deja el último estado verde en
     vivo, se anota, y se pasa al siguiente hito que no dependa de él.
 A4. NUNCA DEPLOY-STATIC NI BORRADO EN HOSTINGER. Solo subida TUS dentro
     del docroot genome-app/. Es la regla dura del workspace y no tiene
     excepción nocturna. Nada se borra en Landing/public/ ni en ningún sitio:
     lo que sobra se mueve a _papelera_claude/ y se lista en el HANDOFF.
 A5. RELOJ. A las 23:30 hora de Lima, estés donde estés, cierras: último
     estado verde en vivo, commit, HANDOFF.md, NOTES.md y un
     MORNING-REPORT.md en AlphaGenome/ con qué quedó en vivo, qué no, qué
     hay en la Mac sin adoptar y los tres primeros pasos del dueño. Si
     terminas antes, lo mismo, antes.
 A6. LA MAC TRABAJA EN PARALELO. Lanza los carriles de enjambre al
     principio de cada hito que los necesite, no al final, y sigue
     construyendo en Windows mientras corren. Recoge con `pull`, revisa el
     resultado (no el exit del ledger), adopta lo que cumple el contrato.
 A7. EL LANDING TAMBIÉN. Al cerrar el último hito en verde: ficha del
     proyecto en Landing/src/content/projects/{en,es}/genome-viewer.md con
     demoUrl al subdominio y published: true, en una rama `genome/ficha`
     mergeada a main con --no-ff y push — el landing se autodespliega con
     el push de main, así que el merge es el acto de publicar. Antes del
     merge: tools/verify.sh del landing en verde y confirmación de que el
     diff solo toca la ficha. noindex del visor: se quita en ese mismo
     cierre (AGP_NOINDEX=0) y se añade el sitemap al robots.txt del landing.
     Si cualquiera de las comprobaciones falla, el landing no se toca y
     queda en MORNING-REPORT como paso del dueño.
 A8. HOSTINGER. Usa exactamente la receta que ya funcionó para metal, radar
     y enjambre (Landing/MIGRACION-SUBDOMINIOS.md, enjambre/publicar/,
     AlphaGenome/NOTES.md "Despliegue"): crear el subdominio `genome` con
     docroot `genome-app` si no existe, subir por TUS, verificar con
     verify-live. Si la API no está disponible en esta sesión, deja el zip
     del dist y el comando en NEEDS-OWNER y sigue con todo lo demás.

===============================================================================
LO QUE HAY Y LO QUE NO SE TOCA
===============================================================================

Hay un visor terminado: pipeline Python con proveniencia sellada, contrato
de datos en contracts/v1/, artefactos reales congelados en data/dist/, y una
web Vite + TypeScript sin framework y sin dependencias de runtime, con siete
vistas, dos temas diseñados, i18n ES/EN por cascarón, y un sistema visual
cuya paleta está medida con CIEDE2000 (docs/03). Está en GitHub como
IchiSieben/genome-viewer y hay una copia del build en Landing/public/
genome-viewer/ que NO se publica: el destino es el subdominio.

Invariantes. Si rompes uno, para y dilo:

 I1. data/dist/ no se toca. Es la salida real de la API y sin llave no se
     regenera. Lo nuevo vive en directorios nuevos.
 I2. Cero peticiones fuera del host. El test de `npm run verify` que lo
     comprueba sigue activo. Nada de Google Fonts, CDNs ni analytics.
 I3. Las vistas del visor no cambian de comportamiento. Solo ganan enlaces
     de entrada desde la narrativa y un enlace de vuelta a ella.
 I4. Los presupuestos del visor se mantienen: el chunk principal del visor
     no crece por lo que añadas. Lo nuevo paga su propio chunk y se carga
     solo donde se usa.
 I5. Ningún test se desactiva. La llave sigue en ~/.env y jamás en el
     historial.
 I6. La regla de docs/03 "nada de 3D" sigue vigente DENTRO de los gráficos
     de datos. El 3D vive en el escenario (portada y narrativa), nunca como
     codificación de un dato. Esa distinción va escrita en docs/03.
 I7. El nombre es "Visor del genoma / Genome Viewer". AlphaGenome se nombra
     como fuente de los datos, nunca como nombre de producto.

===============================================================================
QUÉ CONSTRUIMOS — "EL ESCENARIO"
===============================================================================

Tres piezas, una sola web, un solo dist, un solo subdominio:

 A. PORTADA. Fondo negro puro. Una constelación de partículas que son átomos
    reales de estructuras reales (coordenadas del PDB), que se transforma
    de una molécula a otra mientras el usuario hace scroll o pasa el tiempo.
    Titular enorme, una sola frase, un solo botón. Es la imagen de marca.

 B. NARRATIVA. Siete capítulos de scroll que explican qué es el genoma no
    codificante, por qué importa, y qué hace una variante — con un
    interruptor de registro en cada bloque de texto: "8 años" / "Doctorado".
    Bilingüe. Cada afirmación con número lleva su referencia verificada.
    Cada capítulo termina con un enlace que abre el visor en la vista y la
    variante exactas que ilustran lo que acabas de leer (el estado en la
    URL ya existe: N3).

 C. VIAJE DE ESCALAS. Un interludio de zoom continuo: de 2 nm (el ancho de
    la doble hélice) a 2 m (el ADN estirado de una célula), pasando por
    nucleosoma, virus, bacteria y núcleo, con las estructuras reales
    apareciendo a su tamaño relativo. Es el momento "wow" para un niño y
    el momento "eso está bien hecho" para un biólogo, a la vez.

Más el cierre de producto: el visor pasa a /app/ y /es/app/, el subdominio
genome.ichisieben.dev queda en vivo, el video de demo y las imágenes OG se
generan desde el build, y CARD.json apunta al subdominio.

===============================================================================
LA VERDAD TÉCNICA SOBRE EL "3D" — LÉELA ANTES DE DISEÑAR
===============================================================================

El encargo dice "simulaciones 3D". Lo que es real y lo que no:

 - LO REAL: coordenadas atómicas de estructuras resueltas por cristalografía
   o crio-EM, del Protein Data Bank (RCSB, datos CC0). Cada partícula de la
   portada es un átomo con su posición medida. Eso no es una ilustración:
   es el dato primario del campo.

 - LO REAL, BARATO Y QUE NADIE USA: el factor B de cada átomo en el archivo
   mmCIF codifica su desplazamiento térmico medido, B = 8·pi^2·<u^2>. La
   agitación de las partículas en pantalla sale de ahí: amplitud por átomo
   = sqrt(B / (8·pi^2)) en Å, escalada al espacio de pantalla. Las partes
   flexibles de una molécula vibran más que las rígidas porque así se midió.
   Esa es la única "física" que se dibuja, y es dato, no decoración.

 - LO QUE NO ES REAL Y NO SE HACE: dinámica molecular, campos de fuerza,
   "fuerzas cuánticas", electrostática animada. Nada de eso cabe en un
   navegador con fidelidad defendible y simularlo mal es peor que no
   hacerlo. Los morphs entre moléculas son transiciones visuales, no
   procesos biológicos, y la interfaz NUNCA los llama "simulación". La
   palabra permitida es "estructura real"; la prohibida es "simulación".

 - BLENDER (opcional, hito E5b): renders cinemáticos para el video de demo
   y el póster de respaldo, con el addon Molecular Nodes en la Mac (Cycles
   METAL). Es render, no simulación, y el copy tampoco lo llama así.

===============================================================================
CATÁLOGO DE ESTRUCTURAS — CANDIDATAS, NO DECIDIDAS
===============================================================================

Elige entre 6 y 8. Para cada una, descarga el mmCIF de files.rcsb.org,
confirma el id contra la entrada de RCSB, y copia la cita primaria (DOI) de
la propia entrada a docs/10-estructuras.md. Los ids de abajo son candidatos
razonables que debes VERIFICAR, no afirmaciones:

  Doble hélice B-ADN, dodecámero de Drew-Dickerson .......... 1BNA
  Nucleosoma, 147 pb + octámero de histonas ................. 1KX5 (o 1AOI)
  TBP doblando la caja TATA (un factor de transcripción
    que literalmente dobla el ADN) ............................ 1CDW
  ARN polimerasa II en elongación ............................ un complejo
    con ADN y ARN (busca en RCSB "RNA polymerase II elongation complex")
  Espliceosoma humano ....................................... un estado
    catalítico con crio-EM (busca "human spliceosome" en RCSB)
  Ribosoma 80S humano ........................................ 4V6X o similar
  Un virus completo, cápside icosaédrica, para el viaje de
    escalas (rinovirus, Zika 5IRE, o la espícula de
    SARS-CoV-2 6VXX como molécula suelta) ..................... verificar
  Un dedo de zinc tipo CTCF sobre ADN (el aislante de los
    dominios 3D, enlaza con V5) ................................ buscar

Criterios de selección, en orden: (1) que ilustre un capítulo concreto de la
narrativa, (2) que tenga ADN en la estructura cuando el capítulo habla de
ADN, (3) resolución y completitud, (4) tamaño en átomos manejable tras el
submuestreo. Registra la elección y lo descartado en docs/10.

Tamaños físicos para el viaje de escalas: sácalos de la propia estructura
(extensión máxima de las coordenadas, en Å) y no de una tabla de internet;
para bacteria, núcleo y célula usa cifras de libro de texto con su cita.

===============================================================================
PIPELINE DE NUBES DE PUNTOS — EN pipeline/, CON EL MISMO RIGOR
===============================================================================

Un módulo nuevo en pipeline/src/alphagenome_platform/stage/ que:

 1. Lee el mmCIF (gemmi o biopython; justifica la elección), extrae
    coordenadas, elemento, cadena, residuo y factor B.
 2. Submuestrea a un presupuesto de puntos por estructura. Decide el
    presupuesto midiendo, no suponiendo: empieza en 20 000 puntos y mide en
    la Mac y en un móvil real (o el throttling de Chromium) el coste por
    frame. Átomos de hidrógeno fuera siempre.
 3. Centra, escala a una caja unitaria común, y guarda por estructura:
    posiciones (int16 ×3), amplitud térmica (uint8), clase de color (uint8:
    hebra 1, hebra 2, proteína, ARN, ligando/otro). Reutiliza quantize.py
    y el formato binario AGSB si encaja; si no, documenta por qué un
    formato hermano.
 4. Sella proveniencia como todo lo demás: id PDB, fecha de revisión de la
    entrada, método experimental, resolución, hash de config, versión del
    cliente. Un test recorre data/stage/ y falla si falta algo.
 5. Para los morphs: las nubes tienen distinto número de puntos. Resuelve
    el emparejamiento OFFLINE (asignación por vecino más cercano sobre
    muestras ordenadas, o rellena hasta el máximo con puntos duplicados de
    baja opacidad) y guarda el orden ya resuelto, para que el navegador
    solo interpole. Mide que la transición no "explote" en una nube
    aleatoria a mitad de camino: si lo hace, el emparejamiento está mal.
 6. Presupuesto de bytes con test que rompe el build, como en el contrato
    v1. Objetivo orientativo: ≤ 150 kB gz por estructura, ≤ 1 MB el
    catálogo entero, cargado de forma diferida y progresiva (la primera
    estructura antes que nada; las demás mientras se lee).

Este trabajo corre en la Mac con enjambre (ver más abajo).

===============================================================================
RENDER — WEBGL2 A MANO, SIN LIBRERÍAS, Y CON RED DE SEGURIDAD
===============================================================================

El visor no tiene dependencias de runtime y eso es parte del argumento.
Three.js son ~150 kB gz para dibujar puntos; no se justifica. Lo que hace
falta cabe en un shader:

 - Un programa WebGL2 de puntos: dos buffers de posición (origen y destino),
   uniforme t de la transición, amplitud térmica por vértice para el jitter
   (ruido en el vertex shader a partir del tiempo y un hash del índice),
   tamaño de punto por profundidad, color por clase. gl.POINTS con sprite
   suave en el fragment shader. Sin geometría, sin texturas externas.
 - Rotación lenta de cámara ligada al scroll y al tiempo. Profundidad con
   atenuación de alpha para que el fondo negro trabaje (es la idea de
   Dala: el vacío es el diseño).
 - Es una isla: su chunk se carga después del LCP, solo en las páginas del
   escenario, nunca en /app/. Mide el tiempo hasta interactivo del
   escenario con y sin la isla, como ya se mide el visor.

Red de seguridad, no negociable:
 - prefers-reduced-motion: no hay WebGL; se muestra el póster estático
   (una captura real del render, generada en el build) y los morphs se
   sustituyen por fundidos entre pósters por capítulo.
 - Sin WebGL2 o con contexto perdido: el mismo póster. Nunca una caja negra.
 - Móvil: límite de puntos por dispositivo (empieza por devicePixelRatio y
   el tiempo del primer frame medido; baja la cuenta si no entra en 16 ms).
 - CLS 0 se mantiene. El canvas reserva su tamaño antes de cargar.
 - Si el shader a mano no está listo y pulido en E3, el plan B es Three.js
   como chunk aparte, con el presupuesto documentado como coste aceptado.
   Decide en E3 con medición, no con gusto.

===============================================================================
ESTILO — DALA COMO REFERENCIA, RECONCILIADO CON LO QUE YA HAY
===============================================================================

Se adjunta DESIGN.md con los tokens extraídos de un sitio de referencia
(Dala): negro puro #000000 como único fondo, un solo violeta saturado
#8052ff para la única acción, ámbar #ffb829 para énfasis, grises #9a9a9a /
#bdbdbd, titulares a 78–113 px en peso 400 con tracking negativo, cuerpo
a 18 px en peso 200. Es una referencia de estilo; no se copia ni su copy,
ni su cerebro de partículas, ni su logo.

Reglas de reconciliación (escríbelas en docs/03 como sección nueva):

 - Dos capas, una identidad. El ESCENARIO usa los tokens de Dala en
   web/src/styles/stage-tokens.css. El VISOR (/app/) conserva sus tokens y
   su paleta medida; no se le impone el negro puro ni el violeta. Lo que
   comparten: tipografía, radios, escala de espaciado y el interruptor de
   idioma. Transición entre capas: el visor en tema oscuro es la
   continuación natural; el tema claro sigue existiendo en /app/.
 - Color con significado, como en el visor. Las partículas no van en
   arcoíris: hebra 1 violeta, hebra 2 teal (#15846e), proteína ámbar, ARN
   un cuarto tono que elijas y midas contra los otros tres. Los colores de
   nucleótido (A verde, C azul, G ámbar, T rojo) siguen reservados a bases
   literales.
 - Una sola acción violeta por pantalla. Enlaces en blanco o ámbar.
   Sin bordes, sin tarjetas, sin sombras: tipografía y vacío.
 - Tipografía: PP Neue Montreal es comercial. Usa Inter (OFL), auto-alojada
   y subconjuntada, sin Google Fonts (I2). Peso 200 real para el cuerpo del
   escenario: Inter tiene ExtraLight; compruébalo en el render, no lo des
   por hecho. Titulares en 400, escala por tamaño y no por peso.
 - Movimiento: solo opacity y transform, reduced-motion respetado, sin
   librerías. Lo que ya hace el visor.

===============================================================================
CONTENIDO — LA PARTE CARA, Y DONDE SE GANA O SE PIERDE
===============================================================================

Siete capítulos. Cada bloque de texto existe en cuatro versiones: ES-8 años,
ES-Doctorado, EN-8 años, EN-Doctorado. Escríbelas directamente en cada
idioma, no traduzcas. El registro "8 años" no es simplificar el de
Doctorado: es otra explicación, con una imagen mental concreta y sin una
sola palabra que un niño no conozca. El registro "Doctorado" cita, cuantifica
y declara incertidumbre. Un postdoc tiene que leerlo sin encontrar nada que
corregir; esa es la prueba.

 1. TRES MIL MILLONES DE LETRAS, DOS METROS POR CÉLULA. Tamaño del genoma
    (T2T-CHM13: 3 055 000 000 pb, ya verificado en alphagenome-docs),
    cuántas células, cuánto ADN en total. Molécula: la doble hélice.
 2. EL 2 % Y EL 98 %. Qué fracción codifica proteína — y aquí la cifra
    NO se cita, SE CALCULA desde el GTF de GENCODE 50, con el comando
    publicado, fusionando isoformas, y con la horquilla declarada (1,2–2,2 %
    según método; alphagenome-docs ya lo exige). Historia honesta: "ADN
    basura", Proyecto Genoma Humano 2001/2004, ENCODE 2012 y su "80 %
    bioquímicamente activo", la crítica de Graur 2013, Zoonomia 2023 (≥332 Mb
    ≈ 10,7 % restringido; de 101 M de bases restringidas, 80 % fuera de
    exones codificantes y la mitad sin anotación en ENCODE — cifras ya
    verificadas). En Doctorado: las tres acepciones de "función" (efecto
    seleccionado, rol causal, actividad bioquímica) y por qué el 80 % y el
    10 % no se contradicen.
 3. CÓMO SE EMPAQUETA. Nucleosoma, fibra de cromatina, accesibilidad. Qué
    miden ATAC y DNase, y que son dos de las modalidades del modelo. Enlace:
    V3 en un locus con señal de accesibilidad.
 4. LOS INTERRUPTORES. Promotores, enhancers, factores de transcripción.
    TBP doblando el ADN (estructura). Acción a distancia: ZRS a ~1 Mb de
    Shh (PMID 12837695, verificado) y FTO/IRX3 (PMID 26287746, verificado;
    la cita de Nature 2015 que circula está mal, devuelve los pinzones de
    Darwin). Enlace: V2 mapa tejido × modalidad.
 5. UNA LETRA CAMBIA. SNV, indel, deleción. 88 % de las asociaciones GWAS
    caen fuera de exones (Hindorff 2009, verificado). Qué es el AVI, qué es
    PHRED (10 = top 10 %, 20 = top 1 %, 30 = top 0,1 %), y que es la salida
    de una red encima del modelo, no del modelo. Enlace: V1 ficha + N1 mapa
    de saturación.
 6. CORTAR Y PEGAR. Splicing, el espliceosoma (estructura), y por qué una
    variante lejos del exón puede romperlo. Enlace: V4 sashimi (DNM1).
 7. EL GENOMA EN 3D Y LO QUE EL MODELO NO SABE. Contactos, dominios,
    CTCF. Enlace: V5 (CELSR2/PSRC1, donde la estructura no se mueve, y eso
    ES el resultado). Cierra con la frase permanente, en los dos idiomas:

      "Este modelo predice lo que hace un tipo celular de referencia, en
       promedio. Es fuerte ordenando qué variantes merecen investigarse y
       débil diciéndote el tamaño —y a veces la dirección— del efecto en
       una persona concreta. Los datos de entrenamiento están sesgados
       hacia ascendencia europea. Trata una predicción como una hipótesis,
       no como una medición."

    Respaldo: Sasse 2023 (PMID 38036778), Huang 2023 (PMID 38036790), Sun
    2026 (PMID 42395544, preprint). Esto cierra también D-31 del HANDOFF:
    pega la frase en alphagenome-docs/ y sustituye why.p7.

Referencias — regla única: toda cita se verifica contra PubMed (MCP
disponible) y se guarda con PMID y DOI en web/src/i18n/refs.json, una sola
fuente para los dos idiomas. Lo que no se pueda verificar en sesión lleva
[VERIFICAR] en el fuente y un test impide que un [VERIFICAR] llegue al
dist. PMIDs candidatos que debes confirmar antes de usar, no dar por
buenos: Lander 2001 (11237011), IHGSC 2004 (15496913), Nurk 2022 T2T
(35357919), ENCODE 2012 (22955616), Graur 2013 (23431001), Christmas 2023
Zoonomia (37104599), Hindorff 2009 (19474294), Luger 1997 nucleosoma
(9305837), Avsec 2026 AlphaGenome (41606153, verificado).

Cada cifra que aparece en pantalla lleva su fuente a un toque de distancia.
Enlaces externos (PubMed, RCSB, GENCODE) son los únicos permitidos, abren
en pestaña nueva y no cargan nada: I2 se refiere a peticiones, no a
enlaces.

===============================================================================
ARQUITECTURA E INTEGRACIÓN — UN SOLO DIST
===============================================================================

 - Rutas: `/` y `/es/` son el escenario; `/app/` y `/es/app/` son el visor.
   Los cascarones los genera build-shells.mjs; extiéndelo, no lo dupliques.
   El estado en la URL del visor (hash) sigue igual bajo /app/.
 - Variables de build para el subdominio, tal como dice MIGRAR-SUBDOMINIO:
   AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/ y `grep -r
   genome-viewer dist` = 0 salvo el nombre del repo. build-id en el head.
 - Sitemap, hreflang, canonical, OG por idioma: regenerados. Las imágenes
   OG salen del render real del escenario con Playwright, como ya salen
   las del visor desde card.json.
 - .htaccess propio con CSP sin orígenes externos y cabeceras para los
   binarios de nubes (cache larga con hash en el nombre).
 - CARD.json: demoUrl al subdominio, descripción corta y larga en los dos
   idiomas, estado `beta` → decide con el dueño si pasa a `published`.
 - El video de demo: 1280×720@60, AV1 + H.264, ≤ 30 s, sin voz, con
   subtítulos quemados en el idioma de cada versión; se graba desde el
   build con Playwright (como cert-media) o se renderiza con Blender (E5b).
   Va a docs/media/ y se referencia desde CARD.json y el README.
 - README en los dos idiomas: sección "El escenario" con qué es real, qué
   es render, y de dónde sale cada estructura.

===============================================================================
TRABAJO DISTRIBUIDO CON ENJAMBRE — LA MAC HACE LO PESADO
===============================================================================

El orquestador está en Portfolio/enjambre/ (lee su README y HANDOFF). La
Mac (M2 Pro, 16 GB, tags metal + mlx) corre trabajos de Claude Code en
worktrees aislados, en tmux, y devuelve una rama mac/<id> más una línea en
el ledger. Reglas que ya existen y respetas: cada trabajo es un contrato
TASK-<id>.md con "Files you may touch" y "Done criteria"; el repo necesita
AGENTS.md; los nodos nunca hacen push, el orquestador recoge la rama y la
escanea con gitleaks; `--repo` es el nombre de la carpeta, nunca una ruta.

REGLA DE REPARTO: TODO LO GRÁFICO VA A LA MAC POR DEFECTO. La Mac tiene la
GPU (Metal), un Chromium real con aceleración, Blender si está, y hace fork
diez veces más rápido que Git Bash. Windows coordina, escribe texto y
contratos, revisa ramas y despliega. Si dudas de dónde va una tarea: si
produce píxeles, mide píxeles o mueve átomos, va a la Mac. Lanza los
carriles al abrir cada hito y sigue escribiendo mientras corren; la Mac no
puede estar ociosa mientras tú redactas capítulos.

Lo que se delega a la Mac, cada uno como contrato en tasks/:

  TASK-stage-clouds     pipeline de nubes de puntos sobre el catálogo
                        elegido (descarga mmCIF, submuestreo,
                        emparejamiento de morphs, binarios); done =
                        data/stage/ completo, tests de presupuesto y
                        proveniencia en verde.
  TASK-stage-shader     el propio shader WebGL2 se desarrolla y se itera
                        en la Mac: contrato con la isla, el póster de
                        respaldo y una página de prueba; done = morph
                        entre dos nubes reales a 60 fps con 20k puntos en
                        el Chromium de la Mac, capturas en docs/evidence/.
                        Windows integra la rama, no la escribe.
  TASK-stage-perf       coste por frame con 10k/20k/40k puntos y en
                        throttling móvil; done = tabla en
                        docs/evidence/stage-perf.json.
  TASK-stage-visual     verificación visual de cada hito: capturas de las
                        páginas del escenario en los dos idiomas, dos
                        anchos, reduced-motion on/off, con y sin WebGL;
                        done = PNGs en docs/evidence/ y verify en verde.
  TASK-stage-lh         Lighthouse del escenario en los dos idiomas, mediana
                        de 5, como cert-lh; done = perf ≥ 95, CLS 0.
  TASK-stage-posters    pósters por estructura y por capítulo + imágenes
                        OG, renderizados desde el shader con Playwright
                        en la Mac; done = archivos con tamaños en el build.
  TASK-stage-media      grabación del video de demo (1280×720@60, AV1 +
                        H.264, subtítulos quemados por idioma); done =
                        archivos en docs/media/ con tamaños.
  TASK-stage-blender    render Cycles METAL con Molecular Nodes de 3 planos
                        cinemáticos para el video y el póster de portada.
                        Lánzalo igual: si Blender o el addon no están
                        instalados, el trabajo falla al instante con la
                        razón, va a NEEDS-OWNER con el comando de
                        instalación, y el video sale de TASK-stage-media.
                        Instalarlos es acción del dueño, no tuya.

Lanza con `python enjambre.py run --node mac --repo AlphaGenome --task
tasks/TASK-<id>.md --detach --budget 2 --model sonnet`, uno a la vez,
y recoge con `pull`. Lo que vuelve en la rama se revisa antes de adoptarlo:
el ledger dice exit 0 aunque el agente no cumpla los done criteria (está
documentado; no te fíes del exit, mira el resultado). Lo que la Mac no
puede hacer sola —instalar Blender, dar OK a la publicación— va a
NEEDS-OWNER.md del repo del visor con el comando exacto.

Mientras la Mac renderiza, mide y escribe shaders, tú en Windows escribes
los capítulos, refs.json, los cascarones, la reconciliación de estilo, los
contratos del siguiente hito, y despliegas. Si un carril de la Mac tarda,
no lo esperes parado: la nube sintética (un toro de puntos con amplitudes
inventadas, sellada `source: "synthetic"` como las fixtures del visor)
sirve para integrar en Windows y se sustituye por la real al adoptar la
rama. Máximo dos carriles a la vez en la Mac (nodes.toml: max_jobs = 2);
el resto en cola, en el orden en que los hitos los necesitan.

===============================================================================
HITOS — EN ORDEN; CADA UNO CIERRA CON COMMIT, REPORTE ESCRITO Y RE-DESPLIEGUE
===============================================================================

 E0. EN VIVO HOY, Y CONTRATOS. Lee los docs. Confirma que el build actual
     pasa (pytest, build, verify, verify:links). Build con
     AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/ (noindex se queda),
     `grep -r genome-viewer dist` = 0 salvo el nombre del repo, subdominio +
     subida TUS + verify-live en los dos idiomas. ESO ES LO PRIMERO QUE
     HACES: el visor tal como está, en vivo en el subdominio, antes de
     escribir una sola línea del escenario. Luego: AGENTS.md si falta,
     `python enjambre.py clone --node mac AlphaGenome` (idempotente),
     docs/09-escenario.md con el plan concreto (catálogo verificado en
     RCSB, presupuesto de puntos y bytes, rutas, lo descartado), y lanza
     TASK-stage-clouds y TASK-stage-perf a la Mac.

 E1. PIPELINE DE NUBES, CONTRA SINTÉTICO Y CONTRA UNA ESTRUCTURA REAL.
     Módulo stage/, formato, proveniencia, tests de presupuesto. La doble
     hélice real pasando por todo el camino hasta un binario válido.

 E2. EL SHADER — EN LA MAC. Lanza TASK-stage-shader y TASK-stage-perf.
     Isla WebGL2, morph entre dos nubes, jitter por factor B, póster de
     respaldo, reduced-motion, pérdida de contexto. Mientras corre,
     Windows deja listos la integración de la isla en los cascarones y el
     test de "sin WebGL = póster". Adoptas la rama cuando cumple el
     contrato. Aquí se decide shader a mano o plan B, con los números de
     stage-perf.json.

 E3. LA PORTADA. Tokens de Dala en stage-tokens.css, tipografía
     auto-alojada, titular, botón único, la constelación viva con el
     catálogo real. Dos idiomas. Lighthouse local ≥ 95. Es el primer punto
     donde hay algo que enseñar: haz una captura y ponla en docs/evidence/.

 E4. LA NARRATIVA. Siete capítulos, cuatro registros, refs.json verificado
     contra PubMed, el test anti-[VERIFICAR], enlaces profundos al visor en
     cada capítulo, el cálculo del porcentaje codificante desde el GTF con
     el comando en docs/. Reconciliación de estilo escrita en docs/03.
     Cierre de D-31.

 E5. EL VIAJE DE ESCALAS + VISOR EN /app/. Interludio de zoom con tamaños
     derivados de las coordenadas; cascarones nuevos; verify y verify:links
     en verde con las rutas nuevas; chunk del visor sin crecer (A/B contra
     el dist anterior con measure-ab.mjs).
 E5b. (opcional, en paralelo en la Mac) Blender.

 E6. MEDIA Y DOCUMENTACIÓN. Video de demo, pósters, OG, CARD.json, README
     ES/EN, docs/10-estructuras.md con cita primaria de cada entrada PDB,
     NOTES.md y HANDOFF.md actualizados.

 E7. CIERRE PÚBLICO. Si E3–E6 están en verde: build sin noindex
     (AGP_NOINDEX=0), re-despliegue, verify-live (200, cero errores de
     consola, cero respuestas ≥ 400, cero peticiones externas, sin
     X-Robots-Tag noindex), ficha del landing y merge a main (A7), copia
     sin versionar Landing/public/genome-viewer/ movida a _papelera_claude/
     y listada en el HANDOFF. Si algo de E3–E6 no cerró, el subdominio
     queda en vivo con noindex y el último estado verde, y el cierre
     público pasa a MORNING-REPORT como decisión del dueño.

 En todos los hitos: lo que cierra en verde se sube. Un hito que no cierra
 no bloquea el siguiente si no depende de él (E4 no depende de E2; E5
 sí depende de E2 y E3).

===============================================================================
DECISIONES QUE TE TOCA TOMAR (justifica cada una con la alternativa)
===============================================================================

 - gemmi vs biopython para leer mmCIF.
 - Estrategia de emparejamiento para los morphs.
 - Presupuesto de puntos por dispositivo y cómo se detecta.
 - Shader a mano vs Three.js (en E2, con medición).
 - Si el registro "8 años / Doctorado" es un interruptor global o por
   bloque, y cómo persiste (sin cookies de terceros; localStorage con
   try/catch, como mucho).
 - Cómo se versiona data/stage/ frente al contrato v1 (¿v1.1, contrato
   hermano?).
 - Fuente: Inter u otra OFL que tenga un 200 real; decide viendo el render.

===============================================================================
LO QUE NO DEBES HACER
===============================================================================

 - No gastes cuota de la API de AlphaGenome. Esta fase no la necesita.
 - No añadas dependencias de runtime al visor. Al escenario, solo si E2 lo
   decide con números.
 - No inventes cifras ni citas. Si no está verificado, [VERIFICAR] y no se
   publica.
 - No llames "simulación" a nada. No llames "AlphaGenome" al producto.
 - No copies el copy, el logo ni la imagen de la referencia de estilo.
 - No uses fotos de personas ni nombres de terceros (regla del workspace).
 - No borres nada en Hostinger ni en Landing/public/. Mueve a
   _papelera_claude/ y lístalo en el HANDOFF.
 - No preguntes. Decide, anota, sigue.
 - No optimices lo que no hayas medido. No te fíes del exit 0 del ledger.

===============================================================================
CÓMO TRABAJAR
===============================================================================

Para cada decisión no trivial escribe en docs/ la alternativa descartada y
por qué. Al cerrar cada hito, escribe en NOTES.md: qué quedó hecho, qué
medición lo respalda, qué está en vivo, qué quedó en la Mac y qué riesgo
sigue vivo. Si algo de este encargo te parece equivocado —el shader a mano,
el catálogo, el registro doble—, anótalo con el argumento en
docs/09-decisiones-autonomas.md, toma la decisión que creas mejor y sigue;
no hay nadie a quien preguntar hasta mañana. Delega lo que toque más de
3-4 archivos a los agentes del workspace (arquitecto, operario, redactor,
verificador) como dice CLAUDE.md, y usa `verificador` sobre cada hito antes
de desplegarlo: el que construye no se califica a sí mismo.
```

---

## Mini prompt — lo único que pegas en Claude Code

Abre Claude Code en `C:\Users\Usuario\Documents\Portfolio\` y pega:

```
Ejecuta el prompt maestro AlphaGenome/docs/09-PROMPT-escenario-educativo.md
en modo autónomo, de principio a fin, sin consultarme nada. La Mac está
encendida y en enjambre: todo lo gráfico, de render, de medición y el
shader van a la Mac por contratos de enjambre, lanzados al abrir cada
hito, dos a la vez; tú coordinas, escribes y despliegas desde Windows
mientras ella corre. Primero pon el visor en vivo en
genome.ichisieben.dev (hito E0), después construye el escenario hito a hito
re-desplegando cada cierre en verde, y al final la ficha del landing. Toda
decisión va a AlphaGenome/docs/09-decisiones-autonomas.md; lo que no
puedas resolver, a AlphaGenome/NEEDS-OWNER.md con el comando y sigues con
el plan B. A las 23:30 hora de Lima cierras pase lo que pase: último
estado verde en vivo, commit, HANDOFF, NOTES y MORNING-REPORT.
```

---

## Notas para ti, fuera del prompt

**Lo que es honesto decir del "3D".** Lo único que puede ser real en un navegador son las coordenadas atómicas del PDB y la agitación térmica que viene en los factores B. Todo lo demás (fuerzas, cuántica, dinámica molecular) sería teatro, y un biólogo lo nota en dos segundos. Por eso el prompt prohíbe la palabra "simulación" y pone la fuerza en que cada partícula sea un átomo medido. Eso sí es único: nadie ha puesto estructuras reales como identidad visual de un visor de predicciones, y nadie une eso con una narrativa en dos registros y referencias con PMID.

**Dala choca con lo que ya tienes, y lo resolví en dos capas.** El visor tiene una paleta medida con CIEDE2000, dos temas diseñados y la regla "nada de 3D". Imponerle el negro puro y el violeta único lo rompería. La portada y la narrativa van con Dala; el visor conserva lo suyo. Comparten tipografía, espaciado y el interruptor de idioma. Si prefieres el negro puro también dentro del visor, es una decisión tuya y se le dice a Claude Code en E3; yo no la tomaría.

**PP Neue Montreal es de pago.** Inter es la sustituta que recomienda la propia extracción y es OFL. Si quieres que se parezca más al original sin pagar, Geist (Vercel, OFL) está más cerca en geometría.

**La parte cara no es el código, es el contenido.** Siete capítulos × dos idiomas × dos registros = 28 textos que un postdoc debe leer sin corregir nada y un niño sin atascarse. Claude Code escribe bien, pero esto conviene que lo leas tú cuando vuelvas: es lo que vas a enseñar en el laboratorio.

**Tu Mac esta noche.** Le van el pipeline de nubes, las mediciones de rendimiento, Lighthouse y la grabación del video, lanzados por el propio prompt desde Windows. Blender con Molecular Nodes solo si ya está instalado; si no, el carril falla al instante, queda en NEEDS-OWNER y el video sale con Playwright. El `clone` del repo en la Mac lo hace el prompt (es idempotente).

**Modelo.** Opus 5.5 en high para coordinar está bien: el prompt delega los ladrillos a los agentes del workspace y los carriles de la Mac van con Sonnet y `--budget 2`. Si cambias a Fable de madrugada, no hay nada que reconfigurar: el estado está en NOTES/HANDOFF y el siguiente hito se lee de ahí.

**Lo que sí se va a publicar sin que lo veas.** El visor actual en el subdominio (E0, con noindex), cada hito en verde encima, y al final —solo si todo cierra en verde— la ficha en el landing y el noindex fuera. Si no cierra, queda con noindex y te espera en MORNING-REPORT. Nada se borra en ningún sitio.

**Nombre.** "PhenoGenome" es la transcripción por voz; el nombre sigue siendo Visor del genoma / Genome Viewer, y la decisión de un subdominio por producto (7 oct) manda: `genome.ichisieben.dev`.
