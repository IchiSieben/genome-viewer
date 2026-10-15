# MORNING-REPORT — sesión del escenario, 2026-10-15

> Sesión autónoma, 13:14–23:30 Lima, con `docs/09-PROMPT-escenario-educativo.md`. Los hitos
> E0–E7 están cerrados. Las decisiones están en `docs/09-decisiones-autonomas.md` (E-01…E-25;
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
- **Revisión visual en la Mac (Metal):** en EN pasa entera. En ES, el mismo navegador cayó a
  póster en el segundo idioma, sin errores de consola: la degradación prevista funcionó, pero no
  se sabe por qué no levantó WebGL. Se separaron los idiomas en procesos distintos (`visual5`).
  Resultado: VISUAL5_RESULT.

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
| `mac/stage-visual`, `visual3`, `visual4` | verify:stage en Metal | fallos explicados arriba y en E-17/E-24 |
| `mac/stage-blender` | — | falta Molecular Nodes |
| `stage-lh-base`, `stage-doctor2` | línea base y diagnóstico | no se empujaron (`pushed=False`) |

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
   ramas `mac/*` con vídeo en el remoto público (NEEDS-OWNER #7).
