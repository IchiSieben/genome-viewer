# H0 — Verificación de acceso

*Ejecutado 2026-09-11. Evidencia cruda en `docs/evidence/h0-offline-probe.txt`.*

## Veredicto: PARCIAL. Bloqueado por ausencia de llave.

```
$ ls ~/.env                      -> no existe
$ echo $ALPHAGENOME_API_KEY      -> vacío
```

No hay `ALPHAGENOME_API_KEY` en el entorno ni en `~/.env`. Por lo tanto **ninguna
consulta al Atlas API ni al Model API se ejecutó**, y las partes de H0 que dependen
de la red quedan abiertas. Siguiendo la instrucción del prompt maestro, el proyecto
continúa hacia H1 con fixtures sintéticas.

Lo que sí se hizo: instalar el cliente y **leer su código fuente**, que resuelve una
parte grande de lo que H0 pedía sin gastar un solo token de cuota.

## Lo que quedó verificado (ejecutando, no citando)

| Hecho | Valor | Cómo se verificó |
|---|---|---|
| Cliente instalado | `alphagenome` **0.9.0** | `importlib.metadata.version` |
| Dependencias clave | anndata 0.13.3.post0 · grpcio 1.83.1 | idem |
| Endpoint | `dns:///gdmscience.googleapis.com:443` | `atlas.create()`, literal en fuente |
| Concurrencia por defecto | `DEFAULT_MAX_WORKERS = 10` | constante del módulo |
| Chunk de intervalo | 32 pb por sub-petición | `atlas._INTERVAL_CHUNK_SIZE` |
| `Interval` 0-based semiabierto | `Interval('chr11',5225726,5226575).width == 849` | ejecutado |
| `Variant` 1-based | `Variant('chr12',54578515,'C','T').reference_interval == chr12:54578514-54578515` | ejecutado |
| Longitudes válidas | 16 384 · 131 072 · 524 288 · **1 048 576** | `dna_client.SUPPORTED_SEQUENCE_LENGTHS` |
| Modalidades del modelo | 11 | `dna_output.OutputType` |
| Scorers recomendados | 19 nombres exactos | `RECOMMENDED_VARIANT_SCORERS` |
| Columnas de metadata de track | `name`, `strand` (req.) · `ontology_curie`, `biosample_type`, `biosample_name`, `Assay title` (opc.) | `track_data_utils.metadata_from_proto` |
| Tipos de ontología | CLO, UBERON, CL, EFO, NTR | `ontology.OntologyType` |

**Corrección a la documentación de contexto.** El documento 01 dice "16 kb, 100 kb,
500 kb, 1 Mb". Los valores reales son potencias de dos: 100 kb es **131 072** y
500 kb es **524 288**. La de 1 Mb es exactamente **2²⁰ = 1 048 576**, lo que confirma
el cálculo de presupuesto del prompt al valor exacto.

## Forma de la respuesta del Atlas — leída del código, no adivinada

`atlas.create(api_key)` devuelve un `AtlasClient`. Sus tres métodos de consulta
(`query_variant`, `query_variants`, `query_interval`) pasan todos por
`convert_variant_scores_to_anndata`, así que la forma de salida es la misma:

```
Mapping[str, anndata.AnnData]      # clave = nombre del scorer, tal cual lo
                                   #         devuelve el servidor
  .X                 float32, np.frombuffer(...).reshape(score.shape)
  .obs               DataFrame; siempre columna 'variant' (genome.Variant).
                     Para scorers de gen añade: gene_id, gene_name, strand,
                     junction_Start, junction_End
  .var               DataFrame de metadata de track
  .layers['quantiles']   SOLO si el servidor devolvió calibrated_scores no vacío
```

### Tres gotchas que el código revela y la documentación no

1. **`layers['quantiles']` es condicional.** `convert_variant_scores_to_anndata`
   solo lo crea `if score.calibrated_scores:`. El pipeline debe tratarlo como
   opcional y declararlo en la proveniencia, no asumirlo.

2. **`.var` viene de dos sitios distintos según el método.** `query_variant`
   (singular) pasa `scorer_track_metadata=None` y saca la metadata del propio
   mensaje. `query_variants` (plural) aplica un *field mask* que **excluye**
   `scores.metadata.tracks`, así que la metadata sale de una llamada aparte a
   `scorer_metadata()`. Consecuencia práctica: consultar una variante suelta y
   consultar un lote pueden dar `.var` con columnas distintas. El pipeline debe
   normalizar contra `scorer_metadata()` en ambos casos.

3. **`query_interval` es caro de forma no obvia.** Trocea el intervalo en bloques
   de 32 pb y su barra de progreso cuenta `interval.width * 3`, es decir asume
   3 alelos alternativos por posición. Pedir 1 Mb por intervalo son ~32 768
   sub-peticiones y ~3,1 M de variantes. **Nunca usar `query_interval` sobre un
   locus completo**: para los loci del estudio hay que pasar listas explícitas
   de variantes a `query_variants`.

## Lo que sigue bloqueado, y por qué importa

| Bloqueado | Impacto |
|---|---|
| **Nombres exactos de los 18 features del AVI** | V1 los necesita para la cascada SHAP. Verificado con `grep -rn "AVI"` sobre todo el paquete: **cero coincidencias**. Son nombres server-side, no hay forma de obtenerlos sin consultar. |
| Claves reales del `Mapping` (¿`AVI_SCORE` literal?) | El contrato de datos las trata como opacas para no depender de ellas. |
| Presencia real de `layers['quantiles']` | Ver gotcha 1. |
| Forma real de `.X` por scorer | El presupuesto se calculó sobre la forma documentada de `TrackData`, no medida. |
| Cuota y `RESOURCE_EXHAUSTED` a 1/4/8 workers | Sin medir. No se inventa un número. |

**Mitigación de diseño.** Los 18 features son la única incógnita que toca una vista.
El contrato de datos (H1) los modela como una **lista ordenada de objetos con
`id`/`label`/`family`**, no como 18 campos fijos con nombre. La vista V1 renderiza
lo que venga; si el servidor devuelve 18 nombres distintos a los supuestos, cambia
la fixture, no el código del visor.

## Siguiente acción cuando aparezca la llave

`pipeline/` incluye `python -m alphagenome_platform.cli probe` — una única consulta
de `chr12:54578515:C>T` que vuelca el esquema real a
`docs/evidence/h0-online-probe.json` y completa esta tabla. Coste: 1 variante.
