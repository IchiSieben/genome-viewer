# 09 — Decisiones autónomas (sesión del escenario, 2026-10-15, 18:14–23:30 Lima)

Sesión en modo autónomo con el prompt maestro `docs/09-PROMPT-escenario-educativo.md`. El
dueño no está; cada decisión que se habría consultado queda aquí con qué se eligió, por qué,
qué se descartó y cómo revertirla. Las de la publicación anterior siguen en
`docs/07-decisiones-autonomas.md` (D-01…D-53); esta serie empieza en **E-01** para no
confundirlas. Las marcadas **[REVISAR]** son las primeras que conviene mirar.

---

## E-01 · El visor en vivo en `genome.ichisieben.dev` tal como está (E0) — 18:20

- **Qué:** subdominio `genome` → docroot `public_html/genome-app` creado por API
  (`hosting_domains_create-website-subdomain`), 155 archivos (10,1 MB) subidos uno a uno por
  TUS con `tools/deploy_tus.py`, todos con prefijo `genome-app/`. Build con
  `AGP_SITE=https://genome.ichisieben.dev AGP_BASE=/`, `noindex` puesto.
- **Verificado:** `verify-live.mjs https://genome.ichisieben.dev/` → `TODO OK`, 14 vistas EN/ES
  + 4 en 3G lento (≤ 2,2 s), `X-Robots-Tag noindex` en 18/18 documentos.
  `grep -r genome-viewer dist` → solo la URL del repo (4 apariciones).
- **Descartado:** `deploy-static-site-archive` (prohibido: reemplaza el sitio padre, el Landing).
- **Revertir:** borrar el subdominio y la carpeta `genome-app/` en hPanel (acción del dueño;
  esta sesión no borra nada en Hostinger).

## E-02 · Trampa de Git Bash: `AGP_BASE=/` se convierte en `C:/Program Files/Git/`

- El primer build desde Git Bash salió con `site https://genome.ichisieben.dev/C:/Program Files/Git/`
  (conversión de rutas de MSYS). Se detectó en la línea de log de `build-shells` y **no se subió**.
- **Regla:** los builds para el subdominio se hacen desde PowerShell, o en Git Bash con
  `MSYS_NO_PATHCONV=1`. Está en HANDOFF, "Comandos que importan".

## E-03 · La Mac ejecuta, mide y renderiza; Windows escribe el código **[REVISAR]**

- **Hecho comprobado:** enjambre da a un trabajo `kind: claude` solo
  `Read,Edit,Write,Glob,Grep` + `git status|diff` + `ls` (`enjambre/largos.py:38`), y a uno
  `kind: tests` exactamente un Bash, el `tests-cmd` de `AGENTS.md` (`largos.py:62`). Un agente
  de la Mac **no puede** compilar, abrir Chromium ni medir fps: el "el shader se desarrolla y se
  itera en la Mac" del prompt no es ejecutable tal cual.
- **Qué se eligió:** el patrón que ya funcionó hoy en el Landing (cert-lh, cert-media):
  `tests-cmd: bash tools/verify.sh`, que despacha por la palabra de `.enjambre-lane` a
  `tools/mac/<carril>.sh`. Windows escribe todo el código y los scripts de carril; la Mac
  ejecuta lo gráfico, la medición y el render (doctor, Lighthouse, nubes recalculadas desde
  cero, coste por frame en GPU real, capturas, pósters, video, Blender).
- **Descartado:** dar al agente de la Mac un `kind: claude` para escribir el shader a ciegas
  (no puede ver ni medir lo que escribe; cada vuelta cuesta ~25 min y el contrato del hito no
  se puede comprobar en el nodo).
- **Revertir:** si el dueño quiere que la Mac escriba código, `kind: claude` + un `tests-cmd`
  más amplio en `AGENTS.md`; los carriles siguen sirviendo para verificar.
- El nodo parte de `origin/main` recién traído (`enjambre/worker.sh:64-78`): **se empuja antes
  de cada lanzamiento.**
