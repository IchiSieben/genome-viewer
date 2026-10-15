#!/usr/bin/env python3
"""deploy_tus.py - upload web/dist/ to genome.ichisieben.dev, file by file, over TUS.

    python tools/deploy_tus.py --dry-run        # list what would go up, uploads nothing
    python tools/deploy_tus.py                  # needs HUP_URL, HUP_AK, HUP_RK in the env

The HUP_* values come from the Hostinger API operation hosting_files_generate-upload-url
(the hosting account and the parent domain ichisieben.dev); they are short-lived and never written to disk.

Hard rule of the workspace: every path is prefixed with the subdomain docroot `genome-app/`.
Never the archive deploy (deploy-static-site-archive): it replaces the parent site, the Landing.
Nothing is deleted on the server; a file that disappears from dist/ stays there until the owner
removes it.
"""
from __future__ import annotations

import os
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "web" / "dist"
PREFIX = "genome-app"


def files() -> list[Path]:
    return sorted(p for p in DIST.rglob("*") if p.is_file())


def upload_one(session, url: str, headers: dict, path: Path) -> tuple[str, bool, str]:
    rel = path.relative_to(DIST).as_posix()
    data = path.read_bytes()
    u = "%s/%s?override=true" % (url, urllib.parse.quote(PREFIX + "/" + rel))
    for attempt in range(3):
        try:
            r1 = session.post(u, headers={**headers, "Upload-Length": str(len(data)), "Upload-Offset": "0"},
                              timeout=60)
            r2 = session.patch(u, headers={**headers, "Content-Type": "application/offset+octet-stream",
                                            "Upload-Offset": "0"}, data=data, timeout=300)
            ok = r1.status_code == 201 and r2.status_code == 204 and r2.headers.get("Upload-Offset") == str(len(data))
            if ok:
                return rel, True, ""
            why = f"{r1.status_code}/{r2.status_code}"
        except Exception as e:  # network hiccup: retry
            why = type(e).__name__
    return rel, False, why


def main() -> int:
    if not (DIST / "index.html").is_file():
        print("no dist/index.html: build first", file=sys.stderr)
        return 2
    todo = files()
    total = sum(p.stat().st_size for p in todo)
    print(f"{len(todo)} files, {total / 1e6:.1f} MB -> {PREFIX}/")
    if "--dry-run" in sys.argv:
        for p in todo:
            print("  ", PREFIX + "/" + p.relative_to(DIST).as_posix())
        return 0
    import requests
    url, ak, rk = os.environ["HUP_URL"].rstrip("/"), os.environ["HUP_AK"], os.environ["HUP_RK"]
    headers = {"X-Auth": ak, "X-Auth-Rest": rk, "Tus-Resumable": "1.0.0"}
    s = requests.Session()
    # Upload html shells last so a visitor never gets a shell pointing at bundles not yet there.
    shells = [p for p in todo if p.suffix == ".html"]
    rest = [p for p in todo if p.suffix != ".html"]
    bad = []
    for batch in (rest, shells):
        with ThreadPoolExecutor(max_workers=6) as ex:
            for rel, ok, why in ex.map(lambda p: upload_one(s, url, headers, p), batch):
                if not ok:
                    bad.append(f"{rel} ({why})")
    print(f"uploaded {len(todo) - len(bad)}/{len(todo)}")
    for b in bad:
        print("  FAIL", b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
