# Delegar a la Mac — AlphaGenome (genome-viewer)

Router: `../enjambre/routing.toml`. Sin pantalla → Mac. `ssh mac` a pelo está bloqueado por un hook: todo pasa por enjambre.

| Conviene en la Mac | Comando (desde `Portfolio/enjambre/`) |
|---|---|
| Ver la ruta sin gastar nada | `python enjambre.py run --node mac --repo AlphaGenome --task ../AlphaGenome/tasks/TASK-<id>.md --dry-run` |
| Un carril (agente `claude -p`, gasta cuota) | `python enjambre.py run --node mac --repo AlphaGenome --task ../AlphaGenome/tasks/TASK-<id>.md --detach --budget 2 --model sonnet` |
| Seguirlo / recogerlo | `python enjambre.py status --follow <id>` · `python enjambre.py pull <id> --repo AlphaGenome` |
| ¿Está libre la Mac? | `python enjambre.py status` |

Cómo funciona un carril aquí: el agente del nodo solo puede ejecutar `bash tools/verify.sh`
(el `tests-cmd` de `AGENTS.md`). Escribe una palabra en `.enjambre-lane` y el script despacha
a `tools/mac/<carril>.sh`. Todo lo repetible es código del repo; el agente solo nombra la
intención y reporta. Los carriles largos corren separados y devuelven exit 90 mientras siguen.

**El nodo parte de `origin/main` recién traído**: empuja antes de lanzar o correrá código viejo.

Intérprete en la Mac: `python3` o el `.venv` del clon. Nunca `py` (solo Windows).
Push: este repo es público; el trabajo vuelve como rama `mac/<id>` por `git fetch` desde la Mac
(`push: false` en el TASK).

Se queda en Windows: escribir código, contratos y textos; desplegar en Hostinger (credenciales).

**Probado:** 2026-10-15, ver `docs/09-decisiones-autonomas.md` (primeras corridas del escenario).
