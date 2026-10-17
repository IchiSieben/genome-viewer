# Decisiones autónomas — interfaz (fases A y B, desde el 2026-10-17)

> Formato: fecha · tarea · qué se eligió · por qué · qué se descartó · cómo revertirlo.
> Las anteriores siguen donde estaban: publicación en `docs/07-decisiones-autonomas.md` (D-xx),
> escenario en `docs/09-decisiones-autonomas.md` (E-01…E-27). Esta serie es F-xx.

## F-01 · 2026-10-17 · Ramas `mac/*` empujadas otra vez por la cola vieja (cierra E-27)

- **Qué pasó:** el riesgo de NEEDS-OWNER #11 se cumplió. La Mac volvió el 2026-10-17 a las 04:44
  UTC y lanzó los cuatro trabajos viejos (`stage-visual2`, `stage-lh`, `stage-media`,
  `stage-posters`), que empujaron cuatro ramas `mac/*` al remoto público.
- **Qué se hizo:** lo mismo que en E-27, porque la orden del dueño era que no haya ramas `mac/*`
  en el remoto. Se creó el bundle
  `Portfolio/_papelera_claude/alphagenome-mac-branches-2026-10-17.bundle` (112 430 955 bytes,
  sha256 `dfafe2cce9863094cb33f5d58b7efeff365f69ff310d0245283a0d1b17977ca7`, 4 heads), se probó
  la recuperación en un repositorio vacío y después se borraron las 4 remotas y las 4 locales. Ninguna llevaba
  vídeo: `stage-media` solo cambiaba 4 archivos de texto.
- **Para que no vuelva a pasar:** los contratos nuevos llevan `push: false`, como pide
  `docs/DELEGAR.md` para un repo público. Así la rama vuelve a Windows por `git fetch` y no se
  publica. La cola ya está vacía, así que NEEDS-OWNER #11 queda cerrado.
- **Revertir:** `git fetch <bundle> 'refs/heads/mac/*:refs/heads/mac/*'`.

## F-02 · 2026-10-17 · Dónde se anotan las decisiones

- El prompt pide leer `docs/DECISIONES.md`, que no existía. Se crea este archivo para la serie
  nueva y no se mezcla con 07 y 09, que quedan como registro de sus sesiones.

## F-03 · 2026-10-17 · A1, la molécula: una velocidad angular, no un reloj más el scroll

- **Causa medida** con `scripts/verify-motion.mjs`, que registra dentro de la página cada
  100 ms con `performance.now()`:
  1. `yaw = reloj·k + scrollY·k'`. Cada scroll giraba o invertía la molécula: 7,5–8,3 rad/s en un
     cambio de capítulo, cuando el reposo es 0,09 rad/s.
  2. Un cambio de capítulo volvía a poner el tamaño en 1. Al salir del viaje de escalas, el tamaño
     saltaba de 0,004 a 1 (~10/s).
  3. Una petición a mitad de transición rehacía la pareja desde la estructura anterior.
  4. El ciclo automático de la portada seguía dentro del capítulo 1.
  5. No había arrastre.
- **Elegido:**
  - Una velocidad angular integrada con `dt` acotado a 50 ms, así que ni una pestaña oculta ni una
    tarea larga se convierten en salto.
  - Arrastre sobre el espacio vacío: no empieza sobre texto, enlaces ni controles, para no robar
    la selección.
  - Inercia al soltar, calculada con los últimos 100 ms del gesto, que vuelve al giro lento en
    ~1,1 s.
  - Las transiciones se encolan. El tamaño se suaviza (τ 220 ms) con un tope de 1,8/s.
  - El pie nombra lo que dibuja la isla.
  - En táctil, el arrastre horizontal gira y el vertical hace scroll
    (`touch-action: pan-y pinch-zoom`, el zoom con dos dedos sigue funcionando).
  - Con reduced-motion siguen los pósters fijos, como antes.
- **Descartado:**
  - Three.js/OrbitControls: unos 150 kB para algo que cabe en 60 líneas.
  - Dar `pointer-events` al canvas: tapaba el texto.
  - Mantener el giro ligado al scroll: era la causa.
- **Revertir:** `git revert ed0baf5`.

## F-04 · 2026-10-17 · A2, el tour: medir después de mover

- **Causa:** `scrollIntoView({behavior:'smooth'})` y la medida iban en el mismo instante, con la
  página todavía desplazándose. La tarjeta quedaba donde estaba el objetivo antes del scroll: la
  3.ª en 813–1012 px de 844 (390 px) y la 4.ª en 1071–1291 de 900 (1440 px), con «Saltar» fuera
  de pantalla.
- **Elegido:**
  - Scroll instantáneo.
  - La tarjeta va debajo si cabe, encima si no, y pegada al borde si tampoco; siempre dentro de la
    pantalla. Se recoloca con el scroll y al cambiar el tamaño.
  - Escape se captura desde cualquier foco. Enter ya no avanza dos pasos.
  - **Nuevo:** un clic en el fondo oscurecido también cierra el tour.
- **Revertir el clic en el fondo:** quitar el `overlay.addEventListener('click', …)` de
  `web/src/tour.ts`.
- **Commit:** `2d44140`.

## F-05 · 2026-10-17 · A3, maquetación

- **Rótulo y pie:** ahora son barras opacas, y el degradado queda fuera de ellas. Antes eran un
  degradado con transparencia y el texto se veía a través de «Genome Viewer».
- **Leyenda duplicada:** se quita la línea «En pantalla: …» de cada capítulo y la leyenda única es
  el pie fijo, que sigue a la isla. Se descartó quitar el pie, porque es lo único que nombra la
  estructura durante el viaje de escalas y en la portada.
  **Revertir:** volver a poner `<p class="st-struct">` en `build-stage.mjs`.
- **«How DNA is packed» cortado por la izquierda: no reproducido.**
  - Se probó en Chromium, Firefox y WebKit, de 1280 a 2560 px, con DPR 1 y 1,25, sin interfaz y con
    barras clásicas de Windows.
  - En todos, `scrollWidth == clientWidth` y el título empieza en x = 48.
  - Se añade `html { overflow-x: clip }` como guarda (no crea contenedor de scroll, así que el
    sticky del viaje de escalas sigue funcionando), y `verify-layout` lo comprueba en cinco anchos.
  - Se pide navegador y captura en NEEDS-OWNER.
- **Visto de paso, sin tocar en la fase A:** en 1440 px la molécula queda detrás de la columna de
  texto. Es tema de colocación y tamaño, así que va a la fase B.
- **Commit:** `8f36ede`.

## F-06 · 2026-10-17 · A4, un solo interruptor de nivel de lectura

- **Elegido:**
  - Un grupo de dos botones (`aria-pressed`) en la barra fija, con la etiqueta visible «Nivel de
    lectura». En móvil va en una segunda fila a todo el ancho.
  - La frase del encargo aparece en un globo bajo el interruptor la primera vez, con un botón
    «Entendido».
  - Elegir un nivel o pulsar «Entendido» la guarda para siempre (`agp-register-hint`).
  - El bloque que se está leyendo no se mueve al cambiar: Δ ≤ 0,3 px medido.
- **Descartado:**
  - Un `<select>`: esconde las dos opciones detrás de un clic.
  - Un interruptor flotante abajo: competía con el pie de la estructura.
- **Revertir:** `git revert` del commit de A4.

## F-07 · 2026-10-17 · Auditoría de privacidad antes de cada push

- `tools/privacy-audit.sh` revisa los commits que van a salir (`origin/main..HEAD`). Pasa gitleaks
  y busca en las líneas añadidas y en los mensajes de commit nombres de terceros, correos
  (salvo noreply y example.*), rutas de usuario, IP privadas y claves con valor.
- Se probó con una fuga plantada de cada clase en un worktree temporal: detectó las 6.
- Un fallo de la primera versión: el paso de correos podía devolver `fail=0` y tapar un fallo
  anterior. Se corrigió antes del primer push.

## F-08 · 2026-10-17 · Una descarga tardía ya no devuelve la molécula a un capítulo pasado

- **Encontrado** por `verify-layout` en la batería completa: en 1920 px, leyendo el capítulo 7, la
  molécula y su leyenda se quedaban en 5FLM (Pol II, capítulo 5).
- **Causa:** si una estructura no estaba descargada, `show()` la pedía y, al llegar, la mostraba
  aunque el lector ya estuviera en otro capítulo.
  - Con red o CPU lentas la última en llegar ganaba.
- **Prueba** (falla con el código anterior): `verify-layout`, bloque «descarga tardía».
  - Retrasa 4 s la descarga de 5FLM y pasa c5 → c6 → c7.
  - Exige que la molécula y la leyenda sean las de c7.
- **Arreglo:** `island.ts` guarda la última estructura pedida (`wanted`). Una descarga solo se
  muestra si sigue siendo esa.
- **Revertir:** `git revert` del commit.

## F-09 · 2026-10-17 · La inercia usa también la posición del `pointerup`

- **Medido:** Chromium entrega los `pointermove` una vez por fotograma. El último tramo de un
  lanzamiento puede llegar solo en el `pointerup`:
  - el `pointerup` llegó 18 px más allá del último `pointermove`;
  - ese `pointermove` llegó después del `pointerup`.
  - El código ignoraba la posición del `pointerup`. Veía 140–170 ms sin movimiento, cerca del
    umbral de 180 ms, y a veces anulaba la inercia.
- **Arreglo:** al soltar, si el `pointerup` trae otra posición, se aplica antes de calcular la
  velocidad. Solo con `pointerup`: un `pointercancel` no trae una posición fiable.
- **Prueba:** `verify-motion`. Suelta en el mismo instante que el último movimiento, como una mano.
- **Revertir:** `git revert` del commit.

## F-10 · 2026-10-17 · La fase B se detiene en la propuesta

- El encargo dice «Me lo muestras y PARAS». Es un punto que espera el OK del dueño, aunque el
  modo autónomo diga que ningún «espera mi OK» detiene la ejecución.
  - **Sí se hace:** se entrega en rama propia el mockup en HTML, las capturas y
    `evidence/identidad/propuesta-genome.md`.
  - **No se hace:** nada de la fase B toca `main` ni producción.
- **Descartado:** implementar la fase B en producción con la mejor opción, como hace el modo
  autónomo con las variantes. El encargo lo prohíbe de forma explícita y específica.
