# MORNING-REPORT — fase A (bugs) y fase B (identidad), 2026-10-17

> Sesión autónoma sobre tu revisión en escritorio: «tiene bugs y le falta personalidad». Las
> decisiones están en `docs/DECISIONES.md` (F-01…F-13). Lo que necesita tu mano está en
> `NEEDS-OWNER.md` #12–#14.

## Fase A: en vivo en https://genome.ichisieben.dev/ (y /es/)

Cada bug tiene una prueba que lo reproducía y fallaba antes del arreglo:

| Bug | Qué cambió | Prueba |
|---|---|---|
| A1 molécula | Gira sola y sin pausa. Sigue al arrastre y conserva la inercia al soltar, también cuando el `pointerup` llega antes que el último movimiento. Después vuelve al giro de reposo. Al cambiar de capítulo no salta ni gira por el scroll. Respeta reduced-motion. A 5 fps se recupera a tiempo. | `web/scripts/verify-motion.mjs` |
| A2 tour | Las tarjetas caben en 390, 768 y 1440 px. «Saltar» y Escape funcionan en cada paso. Se recuerda si ya lo viste. | `web/scripts/verify-tour.mjs` |
| A3 layout | Sin scroll lateral. Cabecera y pie opacos, sin texto debajo. Una sola leyenda por estructura. Una descarga tardía ya no devuelve el escenario a un capítulo que ya dejaste. | `web/scripts/verify-layout.mjs` |
| A4 nivel | Un único interruptor fijo en la barra. La primera vez dice «Elige cómo quieres leer: como a los ocho años o como en un doctorado». Cambia todos los bloques a la vez y se recuerda. | `web/scripts/verify-register.mjs` |

- **Cifras:**
  - 12 commits en `fase-a-bugs`, integrada en `main`.
  - Build desplegado: 182 archivos, 12,5 MB.
  - verify-live: TODO OK.
  - En la Mac (Metal), `stage-visual10`: stage, motion, layout, register y tour dan TODO OK en ES y EN.
- Tres de las fallas en la Mac eran de la prueba, no del producto: el ritmo de fotogramas de
  Chromium sin pantalla. Cada una tiene su decisión: F-11, F-12 y F-13.

## Fase B: propuesta, sin implementar (rama `fase-b-identidad`)

- **Léela primero:** `evidence/identidad/propuesta-genome.md`.
- **Mockup:** `python -m http.server 8123 --directory evidence/identidad/mockup`. Luego abre
  `es/capitulo-1.html`, `en/chapter-1.html`, `es/visor.html` y `en/viewer.html`.
- **Qué se ve distinto:**
  - La doble hélice real de 1BNA, átomo por átomo (486 esferas), ocupa media pantalla y gira de
    pie.
  - A, C, G y T tienen color propio (Okabe-Ito). Ese color se repite en la leyenda, en la secuencia
    CGCGAATTCGCG y en la variante del visor.
  - Bricolage Grotesque 800 en titulares y cifras enormes; Atkinson Hyperlegible en el texto, con
    una medida de unos 66 caracteres.
  - El visor ya no tiene botón azul ni bordes de Bootstrap. Ahora muestra el PHRED 25,96 enorme,
    una regla de rareza y la cascada SHAP.
- **Cifras:**
  - Contraste AA: el texto más tenue llega a 6,0:1; la T, a 4,8:1.
  - Fuentes: 93 KB en total.
  - GPU de la Mac: el peor fotograma (p90) es 6,8 ms, incluso con los 218 776 átomos de 4UG0.
- **Base elegida: The Pudding** (Oro, Information is Beautiful Awards 2024). Lleva injertos de
  Ciechanowski y de Learn.Genetics.

## Qué mirar con tus propios ojos

1. **En el sitio en vivo, en escritorio:**
   - Arrastra la molécula y suéltala en pleno movimiento: debe seguir girando hacia ese lado y
     volver despacio al giro de reposo.
   - Baja capítulo a capítulo: no debe haber saltos de tamaño ni de ángulo.
2. **El tour en tu móvil:** las tarjetas deben quedar dentro de la pantalla y «Saltar» debe
   funcionar.
3. **El «título cortado» que viste (#12):** no lo pude reproducir. Dime en qué navegador y a qué
   ancho lo viste.
4. **El mockup en un teléfono real (#13):** comprueba si los átomos completos van fluidos.
5. **La propuesta:** ¿apruebas la base, la tipografía y el color? ¿Entra 4OO8 (Cas9) en el
   capítulo 7?

---

# MORNING-REPORT — sesión del escenario, 2026-10-15

> Sesión autónoma del 2026-10-15, de 13:14 a ~18:05 Lima (plan terminado antes de las 23:30), con `docs/09-PROMPT-escenario-educativo.md`. Los hitos
> E0–E7 están cerrados. Las decisiones están en `docs/09-decisiones-autonomas.md` (E-01…E-26;
> empieza por las **[REVISAR]**: E-03, E-07, E-11, E-17 y E-19). Lo que necesita tu mano está en `NEEDS-OWNER.md`.

## Qué está en vivo

- **https://genome.ichisieben.dev/** y **/es/**: el **escenario**. Es un relato en siete
  capítulos, del ADN al efecto de una variante, con dos niveles de lectura (8 años por defecto, o
  doctorado). Detrás del texto hay nubes de puntos de 8 estructuras reales del PDB en WebGL2.
  Cada capítulo termina en la vista del visor que lo demuestra.
- **https://genome.ichisieben.dev/app/** y **/es/app/**: el **visor**, igual que antes, en su ruta
  nueva. Los enlaces viejos `/#/…` redirigen.
- **Público:** sin `noindex` desde las ~17:45. `robots.txt` y `sitemap.xml` responden 200;
  verify-live da TODO OK y ningún documento lleva noindex (0/23). Lo desplegado es el build de
  `6db6ea1` con `AGP_NOINDEX=0`.
- **Ficha en el landing:** https://ichisieben.dev/projects/genome-viewer/. Está en Landing `main`
  `5fd2dd7`, y el `robots.txt` del landing anuncia el sitemap del visor.
- **Medido en vivo:**
  - Lighthouse móvil, mediana de 5: escenario EN 99/100/100/66 y ES 100/100/100/66; visor
    100/96/100/66 (rendimiento/accesibilidad/buenas prácticas/SEO). El SEO 66 se midió todavía con
    noindex; falta volver a medirlo.
  - Coste por frame: 0,3–0,5 ms en una GTX 1050 Ti, 0,7–0,8 ms en el M2 Pro y 2,9–4,9 ms con render
    por CPU, contra un presupuesto de 16,7 ms.
- **Vídeo de demostración** EN y ES (72 s, 1280×720 a 60 fps, H.264 y AV1) en
  `Gdrive:01-Trabajo/Portfolio/AlphaGenome/media/2026-10-15/`. Se verificó contra
  `drive.manifest` por hash.

## Lo que encontré y arreglé hoy, por si lo ves raro en el historial

- **E-24, el más importante:** desde `79699ab`, los capítulos 2–7 enseñaban siempre la doble hélice
  (1BNA). El selector de secciones también recogía los `<img>` de póster, y la prueba que había
  («el pie cambia al bajar») pasaba gracias al viaje de escalas. Ya está arreglado, y hay una
  prueba nueva por capítulo que falló con el código viejo antes de pasar con el nuevo.
- **E-22:** tres pósters (1CDW, 1KX5, 5KKQ) eran de antes del cambio de tamaño de los puntos y se
  veían casi negros. Se sustituyeron por los renderizados en la Mac.
- **Velos:** la cabecera y el pie fijos dejaban ver texto por debajo. Ahora llevan un velo.

## Qué no está (y por qué)

- **Subtítulos quemados en el vídeo:** van como pista aparte, porque el ffmpeg de la Mac no trae
  libass (NEEDS-OWNER #8).
- **Blender (E5b, opcional):** falta el add-on Molecular Nodes en la Mac (NEEDS-OWNER #6).
- **Teléfono real:** el coste por frame no se ha medido en un móvil (NEEDS-OWNER #4).
- **SEO sin noindex:** sin volver a medir.
- **A/B del visor en una máquina tranquila:** E-19, [REVISAR], NEEDS-OWNER #3.
- **Captura de página completa en Metal:** Chromium se niega a hacerla, así que queda como aviso.
  La revisión visual sí pasa entera en la Mac: con un navegador por idioma, EN y ES salen en verde
  en WebGL (`visual5`, E-26).

## Lo que quedó en la Mac sin adoptar

| Rama | Qué tiene | Estado |
|---|---|---|
| `mac/stage-clouds` | nubes recalculadas desde cero | 8/8 idénticas (E-16); nada que adoptar |
| `mac/stage-perf` | primera medida de frames | inválida, medía el limitador (E-21) |
| `mac/stage-perf2` | coste por frame en M2 Pro | adoptado: `docs/evidence/stage-perf-mac.json` |
| `mac/stage-posters2` | pósters y OG | adoptados (E-22) |
| `mac/stage-lh2` | Lighthouse de 4 páginas × 5 corridas | resúmenes adoptados; los 40 informes siguen en la rama |
| `mac/stage-media3` | vídeo grabado con el bug E-24 | descartado |
| `mac/stage-media4` | vídeo bueno | adoptado: Drive + `.srt` en `docs/media/` |
| `mac/stage-visual5` | verify:stage en Metal, un navegador por idioma | EN y ES TODO OK (E-26) |
| `mac/stage-visual`, `visual3`, `visual4` | intentos anteriores | superados por `visual5` (E-17, E-24, E-26) |
| `mac/stage-blender` | — | falta Molecular Nodes |
| `stage-lh-base`, `stage-doctor2` | línea base y diagnóstico | no se empujaron (`pushed=False`) |

> **2026-10-16:** todas estas ramas (y `stage-lh-base`/`stage-doctor2`) se borraron del remoto
> y de local. Están íntegras en `_papelera_claude/alphagenome-mac-branches-2026-10-16.bundle`
> (E-27).

En la cola de enjambre hay entradas viejas en espera (`stage-visual2`, `stage-lh`, `stage-media`,
`stage-posters`) que nunca se lanzaron. Ya están superadas: se pueden cancelar.

## Tus tres primeros pasos

1. **Abrir https://genome.ichisieben.dev/es/ y leerlo de arriba abajo** en los dos registros.
   Revisa sobre todo la frase permanente del capítulo 7 en el registro doctorado (NEEDS-OWNER #2:
   no tiene cita) y la E-17.
2. **Quitar el `index.lock` huérfano del Landing** cuando no haya ninguna sesión trabajando ahí
   (NEEDS-OWNER #1). Después, `git pull --ff-only` en `Landing/` para traer `5fd2dd7`.
3. **Decidir sobre la papelera y las ramas pesadas:**
   `Portfolio/_papelera_claude/genome-viewer-landing-legacy-2026-10-15/` (11 MB, borrable) y las
   ramas `mac/*` con vídeo en el remoto público (NEEDS-OWNER #7). *Las ramas ya están borradas, E-27;
   falta cancelar la cola, NEEDS-OWNER #11.*
