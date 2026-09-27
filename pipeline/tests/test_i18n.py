"""The i18n contract of the web viewer.

What is enforced, and why
-------------------------
1. Parity: `es.json` and `en.json` (and the narrative pair) have the same keys
   and the same `{placeholders}` per key. A key present in one language only
   is a blank label in the other.
2. Every key the code asks for exists. `t('x')` with a missing key prints the
   key on screen; this catches it before a screenshot does.
3. Nothing loose in the `.ts`: string literals that read like prose (Spanish
   or English) outside `src/i18n/` fail. That is the "no loose text" rule.
4. Option (A) for `data/dist/`: the artifacts stay untouched and their prose is
   overridden by stable id. The Spanish override must be IDENTICAL to the
   artifact text except for diacritics, so the dictionary can fix accents but
   can never change what the pipeline said. Every piece of artifact prose has
   an override in both languages.
5. Identifiers are not translated: coordinates, rsIDs, curies, GRCh38 appear
   identically in both languages of the same key.
6. The wording guardrail of the findings (no clinical terms, no disease names
   of the catalog) applies to the English findings and to the narrative texts
   in both languages, plus a small list of promise words.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
I18N = ROOT / "web" / "src" / "i18n"
SRC = ROOT / "web" / "src"
DIST = ROOT / "data" / "dist"


def _load(name: str) -> dict[str, str]:
    return json.loads((I18N / name).read_text(encoding="utf-8"))


ES = _load("es.json")
EN = _load("en.json")
NES = _load("narrative.es.json")
NEN = _load("narrative.en.json")
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _plain(text: str) -> str:
    """Lowercase, no diacritics (n-tilde becomes n), whitespace collapsed."""
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", stripped).strip()


# --------------------------------------------------------------------------
# 1. Parity
# --------------------------------------------------------------------------


@pytest.mark.parametrize("a,b,label", [(ES, EN, "main"), (NES, NEN, "narrative")])
def test_same_keys_in_both_languages(a, b, label):
    only_a = sorted(set(a) - set(b))
    only_b = sorted(set(b) - set(a))
    assert not only_a and not only_b, f"{label}: es-only {only_a[:10]}, en-only {only_b[:10]}"


@pytest.mark.parametrize("a,b", [(ES, EN), (NES, NEN)])
def test_same_placeholders(a, b):
    bad = [
        k for k in a
        if k in b and set(PLACEHOLDER.findall(a[k])) != set(PLACEHOLDER.findall(b[k]))
    ]
    assert not bad, f"placeholders differ: {bad[:10]}"


def test_no_empty_values():
    empty = [k for d in (ES, EN, NES, NEN) for k, v in d.items() if not str(v).strip()]
    assert not empty, empty[:10]


# --------------------------------------------------------------------------
# 2. Every key used exists
# --------------------------------------------------------------------------

# `(?<![.\w])`: `blocks.has(...)` is Map.has, not the i18n `has`.
CALL = re.compile(r"(?<![.\w])(t|tp|has|dataText)\(\s*(['\"`])([^'\"`]+?)\2")
TEMPLATE_CALL = re.compile(r"(?<![.\w])(t|tp|has|dataText)\(\s*`([^`]*)`")


def _ts_files():
    for path in SRC.rglob("*.ts"):
        if "i18n" in path.relative_to(SRC).parts:
            continue
        yield path


def test_every_literal_key_exists():
    keys = set(ES) | set(NES)
    missing = []
    for path in _ts_files():
        text = path.read_text(encoding="utf-8")
        for fn, _, key in CALL.findall(text):
            if "${" in key:
                continue
            if fn == "tp":
                wanted = [f"{key}.one", f"{key}.other"]
            else:
                wanted = [key]
            if fn in ("has", "dataText"):
                continue  # optional by design: fall back to the artifact
            missing += [f"{path.name}: {w}" for w in wanted if w not in keys]
    assert not missing, missing[:20]


def test_every_template_key_has_a_family():
    """`t(`variant.tab.${id}`)` needs at least one key with that prefix."""
    keys = set(ES) | set(NES)
    missing = []
    for path in _ts_files():
        for fn, body in TEMPLATE_CALL.findall(path.read_text(encoding="utf-8")):
            prefix = body.split("${", 1)[0]
            if prefix and not any(k.startswith(prefix) for k in keys):
                missing.append(f"{path.name}: {body}")
    assert not missing, missing[:20]


# --------------------------------------------------------------------------
# 3. Nothing loose in the .ts
# --------------------------------------------------------------------------

STRING = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")
PROSE_WORDS = re.compile(
    r"\b(de|la|el|los|las|del|con|sin|para|por|una|que|esta|este|no es|"
    r"the|of|and|with|without|this|that|is|are|not|from|for)\b",
    re.IGNORECASE,
)
ACCENTED = re.compile(r"[áéíóúñÁÉÍÓÚÑ¿¡]")


def _strip_comments(code: str) -> str:
    code = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), code, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$|(?<=[;{}),\s])//[^\n'\"`]*$", "", code)


def _looks_like_prose(s: str) -> bool:
    s = re.sub(r"\$\{[^}]*\}", " ", s)
    if ACCENTED.search(s):
        return True
    words = re.findall(r"[A-Za-z]{2,}", s)
    if len(words) < 3:
        return False
    # CSS class lists, selectors, attribute names and URLs are not prose.
    if re.fullmatch(r"[\w\s.#:\-\[\]=\"'>,()/*%]+", s) and not PROSE_WORDS.search(s):
        return False
    if "__" in s or "--" in s:
        return False
    return bool(PROSE_WORDS.search(s))


ALLOW_MARK = "i18n-ok"


def test_no_loose_prose_in_typescript():
    offenders = []
    for path in _ts_files():
        lines = path.read_text(encoding="utf-8").split("\n")
        code = _strip_comments("\n".join(lines)).split("\n")
        for n, line in enumerate(code, 1):
            if ALLOW_MARK in lines[n - 1] or "console." in line or "throw new Error" in line:
                continue
            for m in STRING.finditer(line):
                s = next(g for g in m.groups() if g is not None)
                if _looks_like_prose(s):
                    offenders.append(f"{path.relative_to(SRC)}:{n}: {s[:70]}")
    assert not offenders, "loose prose in .ts:\n" + "\n".join(offenders[:30])


# --------------------------------------------------------------------------
# 4. Option (A): artifact prose overridden by stable id
# --------------------------------------------------------------------------


def _artifact_texts() -> dict[str, str]:
    """Every piece of prose inside data/dist, keyed as the dictionary keys it."""
    out: dict[str, str] = {}
    if not DIST.exists():
        return out
    for f in DIST.glob("loci/*/variants/*/card.json"):
        c = json.loads(f.read_text(encoding="utf-8"))
        for fam in c["featureFamilies"]:
            out[f"data.family.{fam['id']}"] = fam["label"]
        for ft in c["features"]:
            out[f"data.feature.{ft['id']}"] = ft["label"]
    for f in DIST.glob("loci/*/variants/*/tracks.json"):
        t = json.loads(f.read_text(encoding="utf-8"))
        for m in t["modalities"]:
            out[f"data.modality.{m['id']}"] = m["label"]
        for o in t["organSystems"]:
            out[f"data.organ.{o['id']}"] = o["label"]
    for f in DIST.glob("loci/*/locus.json"):
        loc = json.loads(f.read_text(encoding="utf-8"))
        for v in loc["variants"]:
            if v.get("note"):
                out[f"data.note.{v['variant']['id']}"] = v["note"]
    for f in DIST.glob("loci/*/variants/*/*.json"):
        d = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(d, dict) and d.get("finding"):
            out[f"data.finding.{f.parent.name}"] = d["finding"]
    for f in DIST.glob("studies/*/manifest.json"):
        s = json.loads(f.read_text(encoding="utf-8"))
        base = f"data.study.{s['id']}"
        out[f"{base}.label"] = s["label"]
        out[f"{base}.summary"] = s["summary"]
        h = s.get("honesty") or {}
        if (h.get("power") or {}).get("note"):
            out[f"{base}.power.note"] = h["power"]["note"]
        for i, lim in enumerate(h.get("limitations") or []):
            out[f"{base}.limitations.{i}"] = lim
        if h.get("ethics"):
            out[f"{base}.ethics"] = h["ethics"]
        for p in s.get("panels") or []:
            if p.get("title"):
                out[f"{base}.panel.{p['id']}.title"] = p["title"]
            body = (p.get("data") or {}).get("body")
            if body:
                out[f"{base}.panel.{p['id']}.body"] = body
    return out


ARTIFACT = _artifact_texts()
needs_dist = pytest.mark.skipif(not ARTIFACT, reason="data/dist not frozen")


@needs_dist
def test_every_artifact_text_has_an_override_in_both_languages():
    missing = [k for k in ARTIFACT if k not in ES or k not in EN]
    assert not missing, missing[:20]


@needs_dist
def test_spanish_override_equals_artifact_modulo_accents():
    bad = [
        f"{k}:\n  artifact: {ARTIFACT[k]}\n  es:       {ES[k]}"
        for k in ARTIFACT
        if k in ES and _plain(ES[k]) != _plain(ARTIFACT[k])
    ]
    assert not bad, "\n".join(bad[:5])


def test_no_orphan_data_overrides():
    if not ARTIFACT:
        pytest.skip("data/dist not frozen")
    orphans = [k for k in ES if k.startswith("data.") and k not in ARTIFACT]
    assert not orphans, orphans[:20]


# --------------------------------------------------------------------------
# 5. Identifiers are not translated
# --------------------------------------------------------------------------

IDENT = re.compile(r"chr[0-9XYM]+:[\d,]+(?:-[\d,]+)?|\brs\d+\b|\b[A-Z]{2,5}:\d{5,}\b|GRCh38")


@pytest.mark.parametrize("a,b", [(ES, EN), (NES, NEN)])
def test_identifiers_identical_across_languages(a, b):
    bad = [
        k for k in a
        if k in b and sorted(IDENT.findall(a[k])) != sorted(IDENT.findall(b[k]))
    ]
    assert not bad, [(k, IDENT.findall(a[k]), IDENT.findall(b[k])) for k in bad[:5]]


# --------------------------------------------------------------------------
# 6. Wording guardrail: findings (EN) and narrative (both languages)
# --------------------------------------------------------------------------

EN_CLINICAL = (
    "caus", "disease", "patient", "syndrom", "diagnos", "pathogen", "clinic",
    "symptom", "treatment", "therap", "prognos", "risk of", "predispos",
    "inherit", "affected", "epilep", "encephalopath", "cholesterol", "ldl",
    "coronary", "infarct", "atheroscler", "agammaglobulin", "immunodeficien",
    "hyperammonem", "anemia", "anaemia", "hemoglobin",
)
ES_CLINICAL = (
    "caus", "enferm", "pacient", "sindrom", "diagnost", "patogen", "clinic",
    "sintom", "tratamien", "terapi", "pronostic", "riesgo de", "predispos",
    "hereda", "afectad", "epilepsi", "encefalopat", "colesterol", "ldl",
    "coronari", "infarto", "aterosclero", "agammaglobulin", "inmunodeficien",
    "hiperamonem", "anemia", "hemoglobin",
)
PROMISES = (
    "revolucion", "revolution", "breakthrough", "cura", "curar", "cure",
    "garantiz", "guarantee", "transformara", "will transform", "game-changer",
)
# Whole words for the short ones ("cura" is not "curated", "cure" is not "secure").
WHOLE_WORD = {"cura", "cure", "ldl"}
# Disclaimers negate the clinical reading; they are allowed verbatim.
DISCLAIMERS = (
    "no es un diagnostico", "no es un dispositivo medico", "consejo medico",
    "decisiones clinicas", "not a diagnosis", "not a medical device",
    "medical advice", "clinical decisions", "clinical use", "uso clinico",
)


def _guarded(text: str, banned) -> list[str]:
    plain = _plain(text).lower()
    for phrase in DISCLAIMERS:
        plain = plain.replace(phrase, " ")
    hits = []
    for b in banned:
        pattern = rf"\b{re.escape(b)}\b" if b in WHOLE_WORD else rf"\b{re.escape(b)}"
        if re.search(pattern, plain):
            hits.append(b)
    return hits


def test_english_findings_respect_the_wording_guardrail():
    bad = {k: _guarded(v, EN_CLINICAL + PROMISES) for k, v in EN.items() if k.startswith("data.finding.")}
    bad = {k: v for k, v in bad.items() if v}
    assert not bad, bad


@pytest.mark.parametrize("d,banned", [(NES, ES_CLINICAL + PROMISES), (NEN, EN_CLINICAL + PROMISES)])
def test_narrative_respects_the_wording_guardrail(d, banned):
    bad = {k: _guarded(v, banned) for k, v in d.items() if not k.startswith("ref.")}
    bad = {k: v for k, v in bad.items() if v}
    assert not bad, bad


@pytest.mark.parametrize("d,banned", [(ES, ES_CLINICAL + PROMISES), (EN, EN_CLINICAL + PROMISES)])
def test_comparator_respects_the_wording_guardrail(d, banned):
    # N4 only subtracts displayed values; its copy must not slide into a verdict.
    texts = {k: v for k, v in d.items() if k.startswith("compare.")}
    assert texts, "no compare.* keys"
    bad = {k: _guarded(v, banned + VERDICTS) for k, v in texts.items()}
    bad = {k: v for k, v in bad.items() if v}
    assert not bad, bad


VERDICTS = ("mas dan", "more damag", "mas grave", "more severe", "peor", "worse")


def test_the_wording_guard_catches_what_it_should():
    assert _guarded("This variant causes disease", EN_CLINICAL)
    assert _guarded("Un avance que revolucionará la medicina", PROMISES)
    assert not _guarded("It is a prediction, not a diagnosis.", EN_CLINICAL)
