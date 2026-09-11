# NOTES — Plataforma AlphaGenome

## 2026-09-11 — sesion 1

### Hecho
- **H0 parcial.** No hay `ALPHAGENOME_API_KEY` en esta maquina. Se instalo
  `alphagenome` 0.9.0 y se documento el esquema real **leyendo el codigo fuente**,
  sin gastar cuota. Evidencia en `docs/evidence/h0-offline-probe.txt`.
- **H1.** Contrato de datos en `contracts/v1/` (7 esquemas JSON Schema),
  generador de fixtures, 86 artefactos, 51 tests en verde.
- **H2.** Esqueleto del pipeline: adquisicion reanudable con cache por variante,
  proveniencia sellada con epoca de calibracion, CLI con 4 comandos.
- **H3.** Vistas V1 (ficha de variante) y V2 (mapa tejido x modalidad) completas,
  en tema claro y oscuro, responsive, verificadas en navegador.

### Decidido, y por que
- **Frontend sin framework** (Vite + TS). Astro descartado: su ventaja son las
  paginas por archivo, y eso exige reescritura en el servidor que la restriccion
  de hosting estatico no permite. Build final: 12,5 kB de JS comprimido.
- **Enrutado por hash**, para que cada estado sea un enlace compartible que
  sobrevive a la recarga en cualquier servidor estatico.
- **int16 crudo en bloque AGSB propio**, no base64 en JSON: 2,00 B/valor contra
  2,67, y sin decodificacion en JS.
- **REF+DELTA en vez de REF+ALT.** OJO: la razon que yo daba (mejor compresion)
  se midio y es FALSA, gzip da 1,3 % peor. La decision se mantiene por precision:
  guardar el delta es entre 10x y 221x mas preciso en la cantidad que se dibuja.
  Esta escrito asi en `docs/01-architecture.md` a proposito.
- **Dominio de color por percentil 98**, no por maximo: con el maximo una sola
  celda extrema aplana todo el mapa.

### Bloqueado de verdad
- **H4 (datos reales de un locus)** y **H7 (estudio)**: falta la llave. Va en
  `~/.env` como `ALPHAGENOME_API_KEY`, nunca en el repo.
- **H6 (despliegue)**: no se toca Hostinger sin confirmacion explicita en la
  sesion. Regla permanente del workspace.

### Pendiente, no bloqueado
- **H5, vista V3** (navegador de tracks, canvas + SVG). Los bloques de senal, el
  decodificador y sus tests ya existen; falta la vista.
- Los 18 nombres de features del AVI siguen siendo provisionales. `probe`
  los resuelve en una sola consulta cuando haya llave.

### Comandos que funcionan
```
python -m pip install -e "pipeline[dev]"
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli fixtures
PYTHONPATH=pipeline/src python -m alphagenome_platform.cli validate
PYTHONPATH=pipeline/src python -m pytest pipeline/tests -q
cd web && npm install && npm run build
```
