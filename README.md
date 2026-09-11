# Visor de predicciones de AlphaGenome

Plataforma web para visualizar efectos de variante predichos por **AlphaGenome**,
más el pipeline que la alimenta.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![alphagenome](https://img.shields.io/badge/alphagenome-0.9.0-4285F4?logo=googlecloud&logoColor=white)
![JSON Schema](https://img.shields.io/badge/JSON%20Schema-2020--12-1f5fd0)
![Sin backend](https://img.shields.io/badge/backend-ninguno-6f7c8a)

---

## Qué es

El 8 de septiembre de 2026 Google DeepMind publicó el **AlphaGenome Atlas**:
predicciones precomputadas del efecto de ~9 mil millones de variantes del genoma
humano, con un score resumen (**AVI**) y sus atribuciones SHAP.

La librería oficial de visualización dibuja **imágenes estáticas con matplotlib**.
Este proyecto es un visor interactivo de navegador para esos mismos resultados.

Lo que hace que valga como pieza de ingeniería no es usar una API nueva. Es que
el resultado es una cadena completa: un pipeline con proveniencia sellada, un
contrato de datos versionado y validado, un presupuesto de bytes defendido con
tests, y una capa de presentación que respeta una restricción de despliegue real.

## Estado

| Hito | Qué es | Estado |
|---|---|---|
| H0 | Verificación de acceso | **Parcial** — sin llave; esquema documentado leyendo el cliente |
| H1 | Contrato de datos y fixtures | **Hecho** — 7 esquemas, 86 artefactos, 51 tests |
| H2 | Esqueleto del pipeline | **Hecho** — adquisición reanudable, proveniencia sellada |
| H3 | Vistas V1 y V2 | **Hecho** — ambos temas, responsive, consola limpia |
| H4 | Datos reales de un locus | **Bloqueado** — necesita `ALPHAGENOME_API_KEY` |
| H5 | V3, navegador de tracks | **Hecho** — canvas y SVG, zoom, doble resolucion |
| H6 | Despliegue | Pendiente — requiere confirmación explícita |
| H7 | Estudio poblacional | Pendiente — necesita H4 |

**No hay llave de API en esta máquina**, así que todo lo que se ve corre sobre
**fixtures sintéticas**. Están marcadas como tales en cada artefacto y la web lo
avisa en pantalla con una franja ámbar. No son predicciones de AlphaGenome.

## Las tres restricciones que definen la arquitectura

1. **Hosting compartido, sin procesos persistentes.** La salida son archivos
   estáticos y nada más.
2. **La llave es personal e intransferible.** La web **nunca** llama a la API. El
   pipeline corre en local, congela los resultados, y la web solo lee archivos.
   No es solo una limitación: hace la página instantánea y sin costo de cuota por
   visitante.
3. **Uso no comercial, de investigación.** Los resultados están sujetos a los
   *AlphaGenome Output Terms of Use*, visible en cada página con contenido
   derivado. Sin uso clínico, sin valor de consejo médico.

De 1 y 2 sale la forma entera:

```
pipeline/   Python, local, con la llave.  ->  data/dist/   artefactos congelados
                                                    |
                                              web/  lee archivos, cero red a Google
```

Las dos capas se tocan solo por `contracts/v1/*.schema.json`.

## Cómo correrlo

Sin llave, que es el camino por defecto:

```bash
python -m pip install -e "pipeline[dev]"
python -m alphagenome_platform.cli fixtures     # genera data/dist/
python -m alphagenome_platform.cli validate     # esquema + presupuesto

cd web && npm install && npm run dev            # http://localhost:5173
```

Con llave, cuando la haya. Va en `~/.env`, **nunca** en el repositorio:

```bash
echo 'ALPHAGENOME_API_KEY="..."' >> ~/.env
python -m alphagenome_platform.cli probe        # UNA variante, completa H0
```

Tests y verificación:

```bash
PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q   # 51 tests
cd web && npm run build && npm run verify
```

`npm run verify` sirve el build **desde una subcarpeta**, como se despliega, y
comprueba en un navegador real que no haya errores de consola, ni peticiones
fallidas, ni **ninguna petición fuera del host**. Esa última comprobación es
cómo se verifica la regla de que la web nunca llama a la API.

## Las vistas

**V1 — Ficha de variante.** El AVI sobre su escala PHRED con marcas
interpretables (10 = top 10 %, 20 = top 1 %, 30 = top 0,1 %), la cascada de
contribuciones SHAP de los 18 features agrupados en sus cuatro familias, y los
tracks más afectados. Las atribuciones del AVI son públicas desde hace tres días
y no había ninguna visualización de ellas.

**V2 — Mapa de calor biosample × modalidad.** El efecto a lo largo de decenas de
biosamples, **agrupados por sistema de órganos y no alfabéticamente**: así una
banda continua de color significa un efecto específico de ese sistema. Escala
divergente con el cero visualmente neutro y dominio por percentil 98, porque usar
el máximo deja que una sola celda extrema aplane todo el resto.

**V3 — Navegador de tracks.** La vista insignia. Señal predicha REF contra ALT a
lo largo del locus, con anotación de genes y transcritos debajo y un eje de
coordenadas GRCh38 real. Rueda para acercar, arrastre para desplazar, teclado
para todo. Al bajar de 8 192 pb de ventana cambia solo al bloque de 1 pb.

Canvas para la señal densa y SVG por encima para ejes, genes y zonas
interactivas. El dibujo recorre **píxeles y no muestras**: por cada columna de
pantalla toma el mínimo y el máximo de las muestras que le tocan, de modo que un
pico estrecho no desaparece por submuestreo y el coste depende del ancho en
píxeles, no del tamaño del arreglo. El área sombreada entre las dos líneas,
coloreada por el signo, es exactamente lo que hace la variante: dos líneas
superpuestas sin ese relleno obligan al ojo a medir distancias verticales
pequeñas, que es justo lo que el ojo hace mal.

**V4 y V5** (sashimi de splicing, diferencia de mapas de contacto) están
contratadas, no construidas. Los paneles de estudio (V6) ya renderizan desde el
manifiesto.

## Decisiones, con su alternativa descartada

Están en [`docs/01-architecture.md`](docs/01-architecture.md), cada una con lo
que se descartó y por qué. Las tres que más definen el proyecto:

- **Sin framework en el frontend.** Vite y TypeScript, sin React ni Astro, y
  **cero dependencias de runtime**: el build pesa 17,3 kB de JS comprimido, las
  cuatro vistas incluidas. Astro se descartó porque su ventaja real (páginas por
  archivo) obliga a reescritura en el servidor, y la restricción es archivos
  estáticos y nada más.
- **int16 crudo en un bloque binario propio**, no base64 dentro de JSON. 2,00
  bytes por valor contra 2,67; y sin decodificación en JS.
- **Se guarda REF y DELTA, no REF y ALT.** La hipótesis inicial era que
  comprimiría mejor. **Se midió y era falsa**: gzip da 1,3 % peor. La decisión
  sobrevive por otro motivo, también medido: guardar el delta lo cuantiza contra
  su propio máximo y es **entre 10× y 221× más preciso** en la cantidad que el
  gráfico realmente dibuja.

## Honestidad, que es parte del diseño

- Cada artefacto sella origen, versión del cliente, fecha UTC, hash de
  configuración y **época de calibración**. Los cuantiles del AVI se recalibraron
  el 18/06/2026 y la inferencia de indels el 14/07/2026: comparar cosechas
  distintas es inválido, y un PHRED no lleva escrito de cuál viene. Un test
  recorre `data/dist/` y falla si algo no lo trae.
- Las fixtures se sellan `source: "synthetic"` y la web lo muestra. Una figura
  hecha con datos inventados no puede pasar por predicción.
- Un estudio declara tamaño de muestra, poder, limitaciones y signo del
  resultado. El esquema **no deja** marcar un estudio como concluyente sin poder
  medido. Un resultado nulo se muestra con la misma prominencia que uno positivo.

## Riesgo principal que sigue vivo

**Los nombres exactos de los 18 features del AVI.** Son server-side: `grep -rn
"AVI"` sobre el paquete `alphagenome` 0.9.0 completo da **cero coincidencias**.
V1 los necesita.

Mitigación: el contrato los modela como lista ordenada de objetos con
`id`/`label`/`family`, no como 18 campos fijos. Si el servidor devuelve otros
nombres, cambia la fixture y no el código del visor. El costo de equivocarse es
una cadena de texto.

## Estructura

```
contracts/v1/     JSON Schema. Fuente normativa del contrato.
pipeline/         Python. Corre en local con la llave. Nunca se despliega.
  src/alphagenome_platform/
    quantize.py     cuantización int16 y formato binario AGSB
    contract.py     validación de esquema y presupuesto de bytes
    provenance.py   sello de proveniencia
    fixtures.py     generador sintético
    acquire/        capa de adquisición, reanudable
  tests/          51 tests
data/dist/        artefactos congelados. Es lo que se despliega.
web/              sitio estático. Vite + TypeScript, sin framework.
docs/             decisiones de arquitectura y evidencia medida
```

## Licencia y términos

Código bajo licencia MIT. Los **resultados derivados de AlphaGenome** están
sujetos a los *AlphaGenome Output Terms of Use*: uso no comercial, de
investigación. No es un dispositivo médico, no constituye consejo médico y no
debe usarse para decisiones clínicas. Todo lo que el visor muestra son
predicciones de un modelo, no mediciones experimentales.
