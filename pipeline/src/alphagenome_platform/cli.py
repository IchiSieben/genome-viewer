"""Interfaz de linea de comandos del pipeline.

Comandos::

    python -m alphagenome_platform.cli fixtures   # genera data/dist/ sintetico
    python -m alphagenome_platform.cli validate   # valida esquema y presupuesto
    python -m alphagenome_platform.cli budget     # tabla de uso de presupuesto
    python -m alphagenome_platform.cli probe      # UNA consulta real al Atlas

``probe`` es el unico comando que gasta cuota, y gasta exactamente una variante.
"""

from __future__ import annotations

import argparse
import json
import logging
import pathlib
import sys
from typing import Any

from alphagenome_platform import contract, fixtures


def _cmd_fixtures(args: argparse.Namespace) -> int:
    """Genera el arbol completo de fixtures sinteticas."""
    dist = pathlib.Path(args.out) if args.out else contract.DIST
    report = fixtures.generate(dist)
    print(f"{len(report['artifacts'])} artefactos escritos en {dist}\n")
    _print_budget_table(report["worst"])
    print(
        "\nTodos llevan source='synthetic'. NO son predicciones de AlphaGenome."
    )
    return 0


def _print_budget_table(worst: dict[str, Any]) -> None:
    print(f"{'tipo':<13}{'peor caso':<32}{'bytes':>10}{'tope':>10}{'uso':>8}")
    print("-" * 73)
    for kind, row in sorted(worst.items()):
        print(
            f"{kind:<13}{row['label'][:31]:<32}{row['bytes']:>10,}"
            f"{row['budget']:>10,}{row['usedFraction']:>7.1%}"
        )


def _cmd_validate(_: argparse.Namespace) -> int:
    """Valida TODO data/dist/ contra esquema y presupuesto."""
    problems: list[str] = []
    counted = 0
    for kind, path in contract.iter_dist():
        counted += 1
        label = str(path.relative_to(contract.DIST))
        try:
            contract.check_budget(kind, path.read_bytes(), label)
        except contract.BudgetExceeded as error:
            problems.append(str(error))
        if path.suffix == ".json":
            try:
                contract.validate(
                    kind, json.loads(path.read_text(encoding="utf-8")), label
                )
            except contract.ContractViolation as error:
                problems.append(str(error))

    if not counted:
        print("data/dist/ esta vacio. Corre primero el comando fixtures.")
        return 1
    if problems:
        for problem in problems:
            print(f"\n{problem}")
        print(f"\n{len(problems)} problemas en {counted} artefactos.")
        return 1
    print(f"{counted} artefactos: esquema y presupuesto correctos.")
    return 0


def _cmd_budget(_: argparse.Namespace) -> int:
    """Muestra el uso de presupuesto de lo que hay en disco."""
    import gzip

    rows: dict[str, dict[str, Any]] = {}
    for kind, path in contract.iter_dist():
        payload = path.read_bytes()
        fraction = len(payload) / contract.BUDGETS[kind].max_bytes
        current = rows.get(kind)
        if current is None or fraction > current["usedFraction"]:
            rows[kind] = {
                "label": str(path.relative_to(contract.DIST)),
                "bytes": len(payload),
                "gzipBytes": len(gzip.compress(payload, 9)),
                "budget": contract.BUDGETS[kind].max_bytes,
                "usedFraction": round(fraction, 4),
            }
    if not rows:
        print("data/dist/ esta vacio.")
        return 1
    _print_budget_table(rows)
    print("\nRazon de cada tope:")
    for kind, budget in sorted(contract.BUDGETS.items()):
        print(f"  {kind:<13}{budget.rationale}")
    return 0


def _cmd_build_locus(args: argparse.Namespace) -> int:
    """Congela loci reales. Es el comando que gasta cuota de verdad."""
    from alphagenome_platform.acquire import atlas_source
    from alphagenome_platform.freeze import run

    try:
        atlas_source.load_api_key()
    except atlas_source.MissingApiKey as error:
        print(error)
        return 2

    outcome = run.build_all(
        args.loci or None,
        max_workers=args.max_workers,
        with_signals=not args.no_signals,
    )
    rows: dict[str, Any] = {}
    for row in outcome["measurements"]:
        current = rows.get(row["kind"])
        if current is None or row["usedFraction"] > current["usedFraction"]:
            rows[row["kind"]] = row
    print()
    print(f"loci congelados: {', '.join(outcome['loci'])}")
    print(f"artefactos escritos: {len(outcome['measurements'])}")
    print()
    _print_budget_table(rows)
    return 0


def _cmd_probe(args: argparse.Namespace) -> int:
    """Consulta UNA variante y documenta el esquema real de la respuesta.

    Es lo que completa el hito H0: los nombres exactos de los 18 features del
    AVI son server-side y no hay forma de obtenerlos sin esta llamada.
    """
    from alphagenome_platform.acquire import atlas_source

    try:
        key = atlas_source.load_api_key()
    except atlas_source.MissingApiKey as error:
        print(error)
        return 2

    from alphagenome.atlas import atlas
    from alphagenome.data import genome
    import importlib.metadata as md

    chromosome, position, ref, alt = args.variant_parts
    client = atlas.create(key)
    variant = genome.Variant(chromosome, position, ref, alt)
    print(f"Consultando {variant} con scorers {list(args.scorers)} ...")

    result = client.query_variant(variant, requested_scorers=list(args.scorers))

    report: dict[str, Any] = {
        "variant": str(variant),
        "clientVersion": md.version("alphagenome"),
        "mappingKeys": sorted(result.keys()),
        "scorers": {},
    }
    for name, adata in result.items():
        report["scorers"][name] = {
            "X_shape": list(adata.X.shape),
            "obs_columns": list(adata.obs.columns) if adata.obs is not None else [],
            "var_columns": list(adata.var.columns) if adata.var is not None else [],
            "var_index_head": [str(i) for i in list(adata.var.index)[:40]],
            "has_quantiles": bool(adata.layers) and "quantiles" in adata.layers,
            "n_obs": int(adata.n_obs),
            "n_vars": int(adata.n_vars),
        }

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nEsquema real escrito en {out}\n")
    for name, info in report["scorers"].items():
        print(f"  {name}")
        print(f"    X {info['X_shape']}  obs {info['n_obs']}  var {info['n_vars']}")
        print(f"    var columns: {info['var_columns']}")
        print(f"    quantiles:   {info['has_quantiles']}")
        if info["var_index_head"]:
            print(f"    var index:   {info['var_index_head'][:20]}")
    print(
        "\nSi el scorer de importancia devolvio 18 nombres, esos son los "
        "features del AVI: ponlos en fixtures.AVI_FEATURES y regenera."
    )
    return 0


def _variant_parts(text: str) -> tuple[str, int, str, str]:
    """Convierte ``chr12:54578515:T>C`` en sus partes.

    El Atlas usa ``>`` entre alelos y no acepta rsIDs.
    """
    try:
        chromosome, position, alleles = text.split(":")
        ref, alt = alleles.split(">")
        return chromosome, int(position), ref.upper(), alt.upper()
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"Formato invalido: {text!r}. Se espera chr:pos:ref>alt, "
            "por ejemplo chr12:54578515:T>C. El Atlas no acepta rsIDs."
        ) from error


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(
        prog="alphagenome-platform",
        description="Pipeline offline de la plataforma AlphaGenome.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("fixtures", help="genera fixtures sinteticas")
    p.add_argument("--out", help="directorio de salida (por defecto data/dist)")
    p.set_defaults(func=_cmd_fixtures)

    p = sub.add_parser("validate", help="valida esquema y presupuesto")
    p.set_defaults(func=_cmd_validate)

    p = sub.add_parser("budget", help="tabla de uso de presupuesto")
    p.set_defaults(func=_cmd_budget)

    p = sub.add_parser(
        "build-locus", help="congela loci REALES desde las APIs (gasta cuota)"
    )
    p.add_argument("loci", nargs="*", help="ids de locus; vacio = todos")
    p.add_argument("--max-workers", type=int, default=4)
    p.add_argument(
        "--no-signals",
        action="store_true",
        help="solo V1 y V2; omite predict_variant y los bloques de senal",
    )
    p.set_defaults(func=_cmd_build_locus)

    p = sub.add_parser("probe", help="UNA consulta real al Atlas (gasta cuota)")
    p.add_argument(
        "--variant",
        dest="variant_parts",
        type=_variant_parts,
        default=("chr12", 54578515, "T", "C"),
        help="variante en formato chr:pos:ref>alt (por defecto rs884510)",
    )
    p.add_argument(
        "--scorers",
        nargs="+",
        default=["AVI_SCORE", "AVI_SCORE_FEATURE_IMPORTANCE"],
        help="scorers del Atlas a pedir",
    )
    p.add_argument(
        "--out",
        default="docs/evidence/h0-online-probe.json",
        help="donde escribir el esquema real observado",
    )
    p.set_defaults(func=_cmd_probe)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
