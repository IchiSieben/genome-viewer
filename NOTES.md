# NOTES — Plataforma AlphaGenome

## Estado: EN LINEA con datos reales

<https://darkgray-alpaca-401605.hostingersite.com/>

H0 a H6 hechos, mas N1, N2 y N3. Falta H7, el estudio poblacional.

---

## 2026-09-11 — sesion 2 (con llave)

### Dos bugs de entorno que bloqueaban todo

1. **`~/.env` estaba en UTF-16 LE**, escrito por la redireccion de PowerShell.
   El lector de la llave asumia UTF-8 y reportaba "no hay llave" teniendo la
   llave delante. Peor: `python-dotenv` sube por el arbol de directorios desde
   cualquier sitio bajo el home, asi que ese archivo rompia `import anndata` en
   TODO proceso Python de la maquina, no solo en este proyecto.
   Arreglado: el archivo esta ahora en UTF-8, con respaldo en
   `~/.env.utf16.bak` y el hash del valor verificado identico. El lector
   detecta el BOM.

2. Detalle que costo media hora: usar el codec `utf-16-le` en vez de `utf-16`
   deja el BOM vivo como un `﻿` invisible al principio de la linea, y
   `str.strip()` no lo quita.

### H0 — la sonda, 39 llamadas

- **Los 18 features del AVI**, con su nombre exacto y en orden, estan en
  `pipeline/src/alphagenome_platform/avi.py`. Un nombre desconocido LANZA.
- **La cascada cierra**: `base + suma(contribuciones) = score crudo`, base
  medida en -0,049016 con dispersion de 3,5e-05 entre variantes.
- **Cuantizacion verificada con senal real**: 0,0061 px de error sobre un panel
  de 400 px. El esquema aguanta.
- **Concurrencia**: 3,09 s / 0,84 s / 0,73 s con 1 / 4 / 8 workers, sin
  RESOURCE_EXHAUSTED. Por defecto se fija 4.
- **Confirmada la correccion del prompt**: `predict_variant` manda
  `iter([request])`, UNA peticion. El troceo de 32 pb es solo de
  `atlas.query_interval`.

### La variante semilla de los documentos esta mal

`rs884510` se da como `chr12:54578515:T>C`. El servidor la rechaza: la
referencia real es **C**. Los alelos que el Atlas conoce son A, G y T. El
pipeline ahora resuelve cada variante contra el servidor antes de usarla.

### Cuatro bugs que solo aparecieron con datos reales

1. **`tracks.json` se paso del presupuesto** (135 kB contra 120). Lo cazo el
   test de presupuesto en la primera corrida real. Se recortan las filas a los
   240 biosamples de mayor efecto y el documento declara cuantos habia.
2. **NaN en el JSON.** El Atlas devuelve NaN en ALPHAMISSENSE para variantes no
   codificantes, y `json.dumps` lo escribe SIN comillas. Python lo relee tan
   tranquilo; `JSON.parse` lo rechaza. La ficha moria con "no es JSON valido" y
   sin decir de que archivo. Ahora `write_json` usa `allow_nan=False`, lo no
   finito se escribe `null`, el error nombra el artefacto, y hay un test que
   busca la cadena en el TEXTO emitido.
3. **El navegador de tracks mostraba datos SINTETICOS con el sello del Atlas.**
   Las rutas de los bloques por variante se escribian relativas al directorio
   de la variante, pero el contrato dice que son relativas a `locus.json`. El
   visor resolvia hacia el directorio del locus, donde seguian los bloques de
   la era de las fixtures, y los dibujaba sin un solo 404 ni error de consola.
   Es el peor fallo de toda la sesion: un artefacto viejo en el sitio
   equivocado se ve igual que uno correcto. Arreglado con prefijo de ruta,
   reconstruccion limpia del locus, y un test que prohibe `.bin` huerfanos.
4. **Un `<g>` de SVG no tiene area propia.** Los clics y los tooltips en el
   hueco entre la etiqueta y la barra de la cascada caian al `<svg>` de fondo.
   Ahora cada fila lleva una banda transparente.

### Rendimiento, medido

Detalle que importa: **el servidor de pruebas no comprimia**, por un `\b` de
una expresion regular escrito como caracter de retroceso (invisible en
cualquier editor). Eso inflaba el numero de 3G un 40 % antes de medir nada.

| | Rapida | 3G lento | En linea, 3G |
|---|---:|---:|---:|
| Portada | 120 ms | 1 336 ms | 1 537 ms |
| Ficha | 154 ms | 2 140 ms | 2 464 ms |
| Navegador | 161 ms | 2 148 ms | 2 350 ms |

4,8 ms por frame contra un presupuesto de 16,7. Heap 9,5 MiB.

Lo que se descarto **por medicion**: worker de descompresion (no hay base64 que
decodificar, el binario se mapea sin copiar) y envolventes precalculadas por
nivel de zoom (el render no es el cuello de botella y multiplicaria artefactos).

### Paleta: validada, no razonada

`python pipeline/tools/validate_palette.py` simula las tres dicromacias y
calcula CIEDE2000. Pasa en vision normal. Bajo dicromacia no separa, **como
ninguna paleta de ocho categorias**: Okabe-Ito saca 0,6 en la misma metrica
donde esta saca 0,9.

**Hallazgo para decidir:** las ranuras 1-2-3, que el encargo reserva para
comparacion simultanea, son el trio mas debil disponible (3,6 en oscuro contra
15,3 del mejor). Se implemento el orden especificado; si alguna vista compara
tres series a la vez, conviene sacarlas de ahi.

### Despliegue

Se creo un sitio NUEVO, `darkgray-alpaca-401605`, en vez de sobreescribir uno
existente. `palevioletred-wolf-386898` tiene un `index.html` de 612 kB puesto el
2026-09-07 que **no esta en el inventario del brief**; no se toco.

Verificado en el sitio desplegado con navegador real: seis vistas, cero errores
de consola, cero peticiones fuera del host. Esa ultima comprobacion es como se
verifica que la web no llama a la API.

---

## Pendiente

- **H7, el estudio poblacional.** Necesita el VCF de ancestria local de gnomAD.
  Las compuertas G1 a G6 del documento 03 siguen sin correr.
- **V4 (sashimi) y V5 (diff de mapas de contacto).** Contratadas en el esquema.
  Su coste de adquisicion es CERO: los datos vienen en la misma llamada de
  `predict_variant` que ya se hace. Solo falta el renderizado.
- **N4 comparador, N6 buscador de tracks, N7 vista de gen.**
- Enlazar el visor desde el landing del portafolio.

## Comandos

```bash
# datos
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli build-locus
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli validate
PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q

# paleta y sonda
python pipeline/tools/validate_palette.py --triples
python pipeline/tools/h0_probe.py

# web
cd web && npm run build && npm run verify && npm run verify:links && npm run measure
```

## Despliegue

```bash
cd web && npm run build && cd dist
python -c "import shutil; shutil.make_archive(r'<ruta>/alphagenome-site','zip',root_dir='.')"
# subir por TUS con la URL de hosting_generateUploadURLV1, luego
# hosting_deployStaticSiteArchiveV1 con archive_path=alphagenome-site.zip
cd web && node scripts/verify-live.mjs https://darkgray-alpaca-401605.hostingersite.com/
```
