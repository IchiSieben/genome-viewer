# NEEDS-OWNER — lo que esta sesión no puede hacer sola

Sesión autónoma del 2026-10-15 (escenario). Cada entrada: qué, por qué no se hizo, comando exacto.
Nada aquí bloquea lo que ya está en vivo.

## 1. `Landing/.git/index.lock` huérfano desde las 08:55

- **Qué:** un archivo de 0 bytes de otra sesión bloquea el índice del Landing. Esta sesión no lo
  borró (no lo creó). La ficha y el `robots.txt` se fusionaron en un worktree aparte, con su
  propio índice, sin tocar la copia de trabajo de `Landing/` (E-18).
- **Comando**, cuando no haya ninguna sesión trabajando en el Landing:
  ```bash
  cd ~/Documents/Portfolio/Landing && rm .git/index.lock && git status && git pull --ff-only
  ```
  Después, `git branch -d genome/ficha` si ya está fusionada.

## 2. La frase permanente: «los datos de entrenamiento están sesgados hacia ascendencia europea»

- **Qué:** se publica literal, como pide el prompt maestro (cierra D-31), pero ninguna referencia
  de `web/src/i18n/refs.json` la respalda tal cual; la nota de `sun2026` pide no citarlo para eso.
- **Decidir:** dejarla, añadirle una cita, o quitar esa oración. Está en
  `web/src/i18n/chapters.{es,en}.json` (c7.b3, registro experto), en `why.p7` de
  `web/src/i18n/narrative.{es,en}.json` y en `alphagenome-docs/04-frase-permanente.md`.

## 3. Repetir el A/B del visor en una máquina tranquila (E-19)

```bash
git worktree add ../ab-ref 95d8709 && cd ../ab-ref/web && npm ci \
  && MSYS_NO_PATHCONV=1 AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/ npm run build
cd ~/Documents/Portfolio/AlphaGenome/web
AGP_AB_PATH_NEW=app/ node scripts/measure-ab.mjs ../../ab-ref/web/dist 5
AGP_AB_LANG=es AGP_AB_PATH_REF=es/ AGP_AB_PATH_NEW=es/app/ node scripts/measure-ab.mjs ../../ab-ref/web/dist 5
```

## 4. Coste por frame en un teléfono real

- Medido en GPU de escritorio (GTX 1050 Ti: 0,3–0,5 ms) y en render por CPU (SwiftShader:
  2,9–4,9 ms) (E-21). Falta un teléfono de gama media: abrir
  `https://genome.ichisieben.dev/?points=20000` y, en la consola remota,
  `__stage.bench(120)` → mediana.

## 5. Motivos de descarte de 5MQF, 6ICZ y 1I6H

- `docs/10-estructuras.md` → «Descartadas»: la consulta de esa sesión no dejó sus datos.
