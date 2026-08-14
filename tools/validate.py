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
    cmp_re = re.compile(r"^\s*ComponentName:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$", re.M)

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
                fail(f"{rel}: ComponentName {name} - not defined")
                missing = True
    if not missing:
        ok(f"{len(screens)} screens, {len(components)} components, all references resolve")


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
    check_schema_refs(loaded)
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
