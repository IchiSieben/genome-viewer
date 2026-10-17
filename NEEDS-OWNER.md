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

## 6. E5b (opcional): Blender está en la Mac, el add-on Molecular Nodes no

- **Qué:** el carril `blender` (rama `mac/stage-blender`) salió con 31: «Molecular Nodes add-on
  MISSING». Instalar software en la Mac es decisión tuya. No bloquea nada: el escenario usa sus
  propios pósters (E-22).
- **Comando**, en la Mac: instalar Molecular Nodes desde Blender → Preferencias → Get Extensions
  (o `blender --command extension install molecularnodes` si tu versión lo trae). Después, desde
  Windows, relanzar con un id nuevo:
  ```bash
  cp tasks/TASK-stage-blender.md tasks/TASK-stage-blender2.md && git add tasks && git commit -m "task: blender2" && git push origin master:main
  cd ../enjambre && python enjambre.py run --node mac --repo AlphaGenome --task ../AlphaGenome/tasks/TASK-stage-blender2.md --detach --budget 2 --model sonnet
  ```

## 7. ~~Ramas `mac/*` pesadas en el remoto público~~ — HECHO el 2026-10-16 (E-27)

- Se borraron por orden tuya: 13 remotas y 15 locales. Antes se comprobó en Drive, por hash, que
  estaban los vídeos de `media4`. Todo queda en
  `Portfolio/_papelera_claude/alphagenome-mac-branches-2026-10-16.bundle` (sha256 `2ef53896…c88dd1`).
  La receta para recuperarlas está en E-27 y en el HANDOFF.

## 8. Subtítulos quemados en el vídeo (opcional)

- Los mp4 llevan los títulos de capítulo como pista aparte, porque el ffmpeg de la Mac no trae
  libass (E-25). Para quemarlos en Windows: `ffmpeg -i stage-es.mp4 -vf "subtitles=stage-es.srt"
  -c:v libx264 -crf 20 -an stage-es-burnt.mp4` y subir el resultado con `rclone copy` como
  versión nueva.

## 9. rclone: el client_id compartido de Google Drive se retira en 2026

- `rclone` avisa de que el client_id compartido dejará de funcionar este año. Crea uno propio
  (https://rclone.org/drive/#making-your-own-client-id) y ejecuta `rclone config reconnect Gdrive:`.

## 10. La nota D-41 del HANDOFF apunta a un archivo que ya no existe

- `Portfolio/_papelera_claude/` no existía al llegar a E7: el bundle
  `genome-viewer-backup/pre-sanitize-2026-09-26.bundle` ya no está. Esta sesión volvió a crear la
  carpeta solo para la copia vieja del landing. Si el bundle lo borraste tú, no hay nada que hacer.

## 11. Cancelar los trabajos viejos de AlphaGenome en la cola de enjambre

- **Qué:** `stage-visual2`, `stage-lh`, `stage-media` y `stage-posters` llevan desde el 2026-10-15
  esperando a la Mac, y ya están superados por `visual5`, `lh2`, `media4` y `posters2`. Si la Mac
  vuelve, `stage-media` subiría otra rama `mac/stage-media` con unos 100 MB de vídeo y desharía E-27.
- **Comando** (no está probado si `kill` saca de la cola un trabajo que aún no ha arrancado;
  después comprueba con `status` que ya no aparecen):
  ```bash
  cd ../enjambre && for j in stage-visual2 stage-lh stage-media stage-posters; do python enjambre.py kill $j; done
  python enjambre.py status | grep -A6 '^queue'
  ```
