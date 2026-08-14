#!/usr/bin/env python3
"""
Validate every YAML and XML source file in the solution.

Checks, in order:
  1. every .yaml file parses
  2. every canvas .fx.yaml has the expected top-level key (Screens / App /
     ComponentDefinitions) - catches an indentation slip that still parses
  3. no structural-level // comments remain (they parse as scalars, not comments)
  4. every generated .xml file is well-formed
  5. every screen referenced by Navigate() actually exists as a screen file
  6. every component referenced by ComponentName is defined
  7. component definitions match the pa.yaml v3.0 schema - required properties,
     and the PropertyKind / DataType enums, which Studio reports only as an
     unexplained PA1001 with a line and column

This is a static check. It cannot verify Power Fx semantics, control @version
strings, or delegation behaviour - only `pac` and a real environment can.

Usage:
    python3 tools/validate.py
Exit code is non-zero if anything fails.
"""

from __future__ import annotations

import pathlib
import re
import sys
import xml.etree.ElementTree as ET

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
CANVAS = ROOT / "solution" / "canvas" / "Src"
SRC = ROOT / "solution" / "src"
SCHEMA_DIR = ROOT / "solution" / "schema"

VALID_TOP_KEYS = {"Screens", "App", "ComponentDefinitions"}

failures: list[str] = []
notes: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  FAIL  {msg}")


def ok(msg: str) -> None:
    print(f"  ok    {msg}")


# ---------------------------------------------------------------------------
def check_yaml() -> dict[pathlib.Path, object]:
    print("\nYAML parse")
    loaded: dict[pathlib.Path, object] = {}
    for path in sorted((ROOT / "solution").rglob("*.yaml")):
        rel = path.relative_to(ROOT)
        try:
            loaded[path] = yaml.safe_load(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - report any parse failure
            fail(f"{rel}: {str(exc).splitlines()[0]}")
            continue
        ok(str(rel))
    return loaded


def check_top_keys(loaded: dict[pathlib.Path, object]) -> None:
    print("\nCanvas top-level keys")
    for path, doc in loaded.items():
        if CANVAS not in path.parents:
            continue
        rel = path.relative_to(ROOT)
        if not isinstance(doc, dict):
            fail(f"{rel}: document is {type(doc).__name__}, expected a mapping")
            continue
        keys = set(doc.keys())
        if not keys & VALID_TOP_KEYS:
            fail(f"{rel}: top-level key {sorted(keys)} not one of {sorted(VALID_TOP_KEYS)}")
        else:
            ok(f"{rel} -> {sorted(keys)}")


def check_comment_syntax() -> None:
    print("\nComment syntax (// at structural level)")
    sys.path.insert(0, str(ROOT / "tools"))
    from fix_yaml_comments import convert  # noqa: PLC0415 - local helper

    clean = True
    for path in sorted(CANVAS.rglob("*.yaml")):
        _, changed = convert(path.read_text(encoding="utf-8"))
        if changed:
            fail(f"{path.relative_to(ROOT)}: {changed} structural // comment(s) remain")
            clean = False
    if clean:
        ok("no structural-level // comments")


def check_xml() -> None:
    print("\nXML well-formedness")
    if not SRC.exists():
        notes.append("solution/src not generated yet - run tools/build_solution.py")
        print("  skip  solution/src not present")
        return
    for path in sorted(SRC.rglob("*.xml")):
        rel = path.relative_to(ROOT)
        try:
            ET.parse(path)
        except Exception as exc:  # noqa: BLE001
            fail(f"{rel}: {exc}")
            continue
        ok(str(rel))


def check_navigation(loaded: dict[pathlib.Path, object]) -> None:
    print("\nNavigate() targets and component references")

    screens: set[str] = set()
    components: set[str] = set()
    for path, doc in loaded.items():
        if CANVAS not in path.parents or not isinstance(doc, dict):
            continue
        screens.update(doc.get("Screens", {}) or {})
        components.update(doc.get("ComponentDefinitions", {}) or {})

    nav_re = re.compile(r"Navigate\(\s*([A-Za-z_][A-Za-z0-9_]*)")
    # SchemaV3 instantiates a component as `Control: <ComponentName>` directly.
    # The preview syntax was `Control: Component` plus a `ComponentName:` line;
    # Studio rejects it, so both halves are errors rather than references.
    cmp_re = re.compile(r"^\s*Control:\s*(cmp_[A-Za-z0-9_]*)\s*$", re.M)
    legacy_re = re.compile(r"^\s*(Control:\s*Component\s*$|ComponentName:.*$)", re.M)

    missing = False
    for path in sorted(CANVAS.rglob("*.yaml")):
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        for target in sorted(set(nav_re.findall(text))):
            if target not in screens:
                fail(f"{rel}: Navigate({target}) - no such screen")
                missing = True
        for name in sorted(set(cmp_re.findall(text))):
            if name not in components:
                fail(f"{rel}: Control: {name} - no such component")
                missing = True
        legacy = legacy_re.findall(text)
        if legacy:
            fail(f"{rel}: {len(legacy)} line(s) of preview component syntax "
                 f"(Control: Component / ComponentName:) - use Control: <name>")
            missing = True
    if not missing:
        used = sum(len(set(cmp_re.findall(p.read_text(encoding="utf-8"))))
                   for p in CANVAS.rglob("*.yaml"))
        ok(f"{len(screens)} screens, {len(components)} components, "
           f"all Navigate() targets and Control: cmp_* references resolve")


# From schemas/pa-yaml/v3.0/pa.schema.yaml in microsoft/PowerApps-Tooling.
# Studio reports a violation as PA1001 "Exception during deserialization" with a
# line and column but no explanation, so checking here is much cheaper than
# discovering it one paste at a time.
PFX_DATA_TYPES = {
    "Text", "Number", "Boolean", "DateAndTime", "Screen", "Record", "Table",
    "Image", "VideoOrAudio", "Color", "Currency",
}
PROPERTY_KINDS = {
    "Input", "Output", "InputFunction", "OutputFunction", "Event", "Action",
}
COMPONENT_REQUIRED = [
    "DefinitionType", "Description", "AllowCustomization", "AccessAppScope",
    "CustomProperties", "Properties", "Children",
]


def check_components(loaded: dict[pathlib.Path, object]) -> None:
    """Validate component definitions against the pa.yaml v3.0 schema."""
    print("\nComponent definitions (pa.yaml v3.0)")
    found = False
    clean = True
    for path, doc in loaded.items():
        if not isinstance(doc, dict) or "ComponentDefinitions" not in doc:
            continue
        found = True
        rel = path.relative_to(ROOT)
        for name, comp in (doc["ComponentDefinitions"] or {}).items():
            missing = [k for k in COMPONENT_REQUIRED if k not in comp]
            if missing:
                fail(f"{rel}: {name} missing required {missing}")
                clean = False
            if comp.get("DefinitionType") != "CanvasComponent":
                fail(f"{rel}: {name} DefinitionType "
                     f"{comp.get('DefinitionType')!r} is not CanvasComponent")
                clean = False
            for pname, prop in (comp.get("CustomProperties") or {}).items():
                kind = prop.get("PropertyKind")
                if kind not in PROPERTY_KINDS:
                    fail(f"{rel}: {name}.{pname} PropertyKind {kind!r} "
                         f"not in {sorted(PROPERTY_KINDS)}")
                    clean = False
                dt = prop.get("DataType")
                if kind in ("Input", "Output") and dt not in PFX_DATA_TYPES:
                    fail(f"{rel}: {name}.{pname} DataType {dt!r} "
                         f"not in {sorted(PFX_DATA_TYPES)}")
                    clean = False
    if not found:
        print("  skip  no component definitions found")
    elif clean:
        n = sum(len(d["ComponentDefinitions"]) for d in loaded.values()
                if isinstance(d, dict) and "ComponentDefinitions" in d)
        print(f"  ok    {n} component(s): required properties, PropertyKind "
              f"and DataType all valid")


def check_seed_refs(loaded: dict[pathlib.Path, object]) -> None:
    """Every seed cross-reference must resolve to an alternate key that exists."""
    print("\nSeed referential integrity")
    seed = ROOT / "solution" / "schema" / "seed"
    if not seed.exists() or not any(seed.glob("*.yaml")):
        notes.append("seed not generated - run tools/build_seed.py <dataverse_import>")
        print("  skip  no seed files present")
        return

    def load(name, key):
        path = seed / name
        if not path.exists():
            return []
        doc = loaded.get(path) or yaml.safe_load(path.read_text(encoding="utf-8"))
        return (doc or {}).get(key, []) or []

    riskareas = load("riskareas.yaml", "riskareas")
    domains = load("domains.yaml", "domains")
    directory = load("directory.yaml", "directory")
    functions = load("functions.yaml", "functions")
    ownership = load("ownership.yaml", "ownership")
    deadlines = load("deadlines.yaml", "deadlines")
    flags = load("flags.yaml", "flags")
    assessments = load("assessments.yaml", "assessments")
    asmtowners = load("assessmentowners.yaml", "assessmentowners")
    gaps = load("gaps.yaml", "gaps")

    ra = {r["code"] for r in riskareas}
    dm = {r["code"] for r in domains}
    em = {r["email"] for r in directory}
    fn = {r["code"] for r in functions}
    az = {r["code"] for r in assessments}

    checks = [
        ("domains.riskArea",           domains,    "riskArea",       ra),
        ("domains.owner",              domains,    "owner",          em),
        ("riskareas.owner",            riskareas,  "owner",          em),
        ("functions.riskArea",         functions,  "riskArea",       ra),
        ("functions.domain",           functions,  "domain",         dm),
        ("functions.executiveOwner",   functions,  "executiveOwner", em),
        ("functions.unitOwner",        functions,  "unitOwner",      em),
        ("functions.complianceOwner",  functions,  "complianceOwner", em),
        ("ownership.function",         ownership,  "function",       fn),
        ("ownership.person",           ownership,  "person",         em),
        ("deadlines.function",         deadlines,  "function",       fn),
        ("flags.function",             flags,      "function",       fn),
        ("flags.flaggedBy",            flags,      "flaggedBy",      em),
        ("assessmentowners.assessment", asmtowners, "assessment",    az),
        ("assessmentowners.person",    asmtowners, "person",         em),
        ("gaps.function",              gaps,       "function",       fn),
        ("gaps.assessment",            gaps,       "assessment",     az),
        ("gaps.owner",                 gaps,       "owner",          em),
    ]
    clean = True
    for label, rows, field, valid in checks:
        bad = [r for r in rows
               if r.get(field) not in (None, "") and r.get(field) not in valid]
        if bad:
            sample = bad[0].get(field)
            fail(f"{label}: {len(bad)} unresolved reference(s), e.g. {sample!r}")
            clean = False
    if clean:
        total = sum(len(x) for x in (riskareas, domains, directory, functions,
                                     ownership, deadlines, flags, assessments,
                                     asmtowners, gaps))
        print(f"  ok    {total:,} seeded rows, all cross-references resolve")
        print(f"        riskareas {len(riskareas)}, domains {len(domains)}, "
              f"directory {len(directory)}, functions {len(functions)},")
        print(f"        ownership {len(ownership)}, deadlines {len(deadlines)}, "
              f"flags {len(flags)}, assessments {len(assessments)},")
        print(f"        assessmentowners {len(asmtowners)}, gaps {len(gaps)}")

    # Choice values in the seed must exist in the schema's choice sets.
    schema = loaded.get(SCHEMA_DIR / "dataverse-schema.yaml")
    if isinstance(schema, dict):
        ch = {k: {o["label"] for o in v["options"]}
              for k, v in schema.get("choices", {}).items()}
        enum_checks = [
            ("functions.risk",        functions,  "risk",         ch["su_risklevel"]),
            ("ownership.role",        ownership,  "role",         ch["su_ownershiprole"]),
            ("ownership.subRole",     ownership,  "subRole",      ch["su_ownershipsubrole"]),
            ("deadlines.deadlineType", deadlines, "deadlineType", ch["su_deadlinetype"]),
            ("deadlines.cadence",     deadlines,  "cadence",      ch["su_cadence"]),
            ("deadlines.offsetUnit",  deadlines,  "offsetUnit",   ch["su_offsetunit"]),
            ("flags.source",          flags,      "source",       ch["su_flagsource"]),
            ("flags.status",          flags,      "status",       ch["su_flagstatus"]),
            ("assessments.risk",      assessments, "risk",        ch["su_risklevel"]),
            ("assessments.status",    assessments, "status",      ch["su_assessmentstatus"]),
            ("assessmentowners.role", asmtowners, "role",         ch["su_assessmentownerrole"]),
            ("gaps.status",           gaps,       "status",       ch["su_gapstatus"]),
        ]
        ok_enum = True
        for label, rows, field, valid in enum_checks:
            bad = {r.get(field) for r in rows
                   if r.get(field) not in (None, "") and r.get(field) not in valid}
            if bad:
                fail(f"{label}: value(s) not in choice set: {sorted(bad)}")
                ok_enum = False
        if ok_enum:
            print("  ok    all seed choice values exist in the schema choice sets")


def check_schema_refs(loaded: dict[pathlib.Path, object]) -> None:
    print("\nSchema internal references")
    schema = loaded.get(SCHEMA_DIR / "dataverse-schema.yaml")
    if not isinstance(schema, dict):
        fail("dataverse-schema.yaml did not load as a mapping")
        return

    tables = schema.get("tables", {})
    choices = set(schema.get("choices", {}))
    clean = True

    for logical, table in tables.items():
        for col in table.get("columns", []):
            ctype = col.get("type")
            if ctype == "Choice":
                if col.get("choice") not in choices:
                    fail(f"{logical}.{col['name']}: choice {col.get('choice')} undefined")
                    clean = False
            elif ctype == "Lookup":
                target = col.get("target")
                if target != "systemuser" and target not in tables:
                    fail(f"{logical}.{col['name']}: lookup target {target} undefined")
                    clean = False
            elif ctype == "Rollup":
                rel = col.get("rollup", {}).get("relatedTable")
                if rel not in tables:
                    fail(f"{logical}.{col['name']}: rollup relatedTable {rel} undefined")
                    clean = False

    n_cols = sum(len(t.get("columns", [])) for t in tables.values())
    if clean:
        ok(f"{len(tables)} tables, {n_cols} columns, {len(choices)} choice sets resolve")


# ---------------------------------------------------------------------------
def main() -> int:
    print("Compliance Matrix - static validation")
    loaded = check_yaml()
    check_top_keys(loaded)
    check_comment_syntax()
    check_components(loaded)
    check_schema_refs(loaded)
    check_seed_refs(loaded)
    check_navigation(loaded)
    check_xml()

    print("\n" + "-" * 60)
    for note in notes:
        print(f"note: {note}")
    if failures:
        print(f"{len(failures)} failure(s).")
        return 1
    print("All checks passed.")
    print("Static only - run `pac solution pack` and import to a dev "
          "environment for authoritative validation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
