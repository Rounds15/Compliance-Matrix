#!/usr/bin/env python3
"""
Assert that a block of canvas YAML will paste into Power Apps Studio.

The bar is not "well-formed YAML" - it is "Studio accepts it with zero PA
errors". Every rule below exists because a paste failed on it:

  Rule 1  root wrapper present and correct     PA1001 "not found on type PaModule"
  Rule 2  no YAML '#' comments                 PA1001 YamlInvalidSyntax
  Rule 3  Control: <ComponentName>             PA1003 / PA2101
  Rule 4  only properties the control has      PA2108
  Rule 5  spaces only, consistent indentation  surfaces as Rule 1
  Rule 6  block scalars for multi-line values  YamlInvalidSyntax

Rules 1, 2, 3, 5 and the component-definition schema checks are exact - they
either hold or they do not. Rule 4 is only as good as tools/control_properties
.json, which records confirmed-rejected properties as hard failures and treats
anything outside the current inventory as unverified rather than valid. That
distinction is deliberate: an invented allow-list would reject good properties
and give false confidence about bad ones.

Usage:
    python3 tools/paste_check.py <file-or-dir>... [--strict]

--strict promotes unverified-property warnings to failures.
Exit code is non-zero if any hard rule trips.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

import yaml

MANIFEST = json.loads(
    (pathlib.Path(__file__).resolve().parent / "control_properties.json")
    .read_text(encoding="utf-8")
)
CONTROLS = MANIFEST["controls"]
INSTANCES = MANIFEST["component_instances"]
SCHEMA = MANIFEST["schema"]

VALID_ROOTS = {"Screens", "ComponentDefinitions", "App"}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, path, rule, msg):
        self.errors.append(f"{path}: [{rule}] {msg}")

    def warn(self, path, rule, msg):
        self.warnings.append(f"{path}: [{rule}] {msg}")


# ---------------------------------------------------------------------------
def _indent(line: str) -> int:
    return len(line) - len(line.lstrip())


def _strip_quoted(line: str) -> str:
    """Blank out quoted spans so '#' inside a string is not seen as a comment."""
    out, in_s, in_d = [], False, False
    for ch in line:
        if ch == "'" and not in_d:
            in_s = not in_s
            out.append(ch)
        elif ch == '"' and not in_s:
            in_d = not in_d
            out.append(ch)
        else:
            out.append(" " if (in_s or in_d) else ch)
    return "".join(out)


def _block_scalar_mask(lines: list[str]) -> list[bool]:
    """
    True for lines that are the body of a `|` or `>` block scalar.

    Inside one, a leading '#' is content and the indentation is the author's,
    not YAML structure - so Rules 2 and 5 must skip them. Power Fx formulas are
    all block scalars, so without this the checker flags most of the app.
    """
    mask = [False] * len(lines)
    key_ind = None
    for i, line in enumerate(lines):
        if key_ind is not None:
            if line.strip() == "" or _indent(line) > key_ind:
                mask[i] = True
                continue
            key_ind = None
        stripped = line.strip()
        if ":" in stripped and stripped.endswith(("|", "|-", ">", ">-")):
            value = stripped.split(":", 1)[1].strip()
            if value in ("|", "|-", ">", ">-"):
                key_ind = _indent(line)
    return mask


def check_text(text: str, path: str, rep: Report, allow_comments: bool = False) -> None:
    lines = text.split("\n")
    in_block = _block_scalar_mask(lines)

    # -- Rule 2: no YAML comments -------------------------------------------
    if not allow_comments:
        for i, line in enumerate(lines, 1):
            if in_block[i - 1]:
                continue
            bare = _strip_quoted(line)
            for m in re.finditer(r"#", bare):
                j = m.start()
                if j == 0 or bare[j - 1] in " \t":
                    rep.error(f"{path}:{i}", "Rule 2",
                              "YAML '#' comment - Studio raises PA1001")
                    break

    # -- Rule 5: spaces only, consistent step -------------------------------
    for i, line in enumerate(lines, 1):
        if "\t" in line[: _indent(line) + 1]:
            rep.error(f"{path}:{i}", "Rule 5", "tab in indentation")
    steps = {_indent(l) for i, l in enumerate(lines)
             if l.strip() and not in_block[i]}
    odd = sorted(s for s in steps if s % 2)
    if odd:
        rep.warn(path, "Rule 5",
                 f"structural indentation not on a 2-space step: {odd[:5]}")

    # -- Rule 3: preview component syntax -----------------------------------
    for i, line in enumerate(lines, 1):
        if in_block[i - 1]:
            continue
        if re.match(r"^\s*Control:\s*Component\s*$", line):
            rep.error(f"{path}:{i}", "Rule 3",
                      "'Control: Component' is preview syntax - PA2101. "
                      "Use Control: <ComponentName>")
        if re.match(r"^\s*ComponentName:", line):
            rep.error(f"{path}:{i}", "Rule 3",
                      "'ComponentName:' is preview syntax - PA1003. "
                      "Put the name in Control:")

    # -- parse ---------------------------------------------------------------
    try:
        doc = yaml.safe_load(text)
    except Exception as exc:  # noqa: BLE001
        rep.error(path, "Rule 6", f"does not parse: {str(exc).splitlines()[0]}")
        return
    if not isinstance(doc, dict):
        rep.error(path, "Rule 1",
                  f"root is {type(doc).__name__}, expected a mapping")
        return

    # -- Rule 1: root wrapper -----------------------------------------------
    roots = set(doc)
    bad_roots = roots - set(SCHEMA["root_keys"])
    if bad_roots:
        rep.error(path, "Rule 1",
                  f"root key(s) {sorted(bad_roots)} are not PaModule properties "
                  f"{SCHEMA['root_keys']} - PA1001")
    if not roots & VALID_ROOTS:
        rep.error(path, "Rule 1",
                  f"no Screens / ComponentDefinitions / App wrapper "
                  f"(found {sorted(roots)})")

    # -- component definitions ----------------------------------------------
    for name, comp in (doc.get("ComponentDefinitions") or {}).items():
        missing = [k for k in SCHEMA["component_required"] if k not in comp]
        if missing:
            rep.error(path, "Schema", f"{name} missing required {missing}")
        for pname, prop in (comp.get("CustomProperties") or {}).items():
            kind = prop.get("PropertyKind")
            if kind not in SCHEMA["property_kinds"]:
                rep.error(path, "Schema",
                          f"{name}.{pname} PropertyKind {kind!r} invalid")
            dt = prop.get("DataType")
            if kind in ("Input", "Output") and dt not in SCHEMA["data_types"]:
                rep.error(path, "Schema",
                          f"{name}.{pname} DataType {dt!r} invalid "
                          f"(valid: {SCHEMA['data_types']})")

    # -- Rule 4: properties belong to their control -------------------------
    _check_properties(lines, path, rep, in_block)


def _check_properties(lines: list[str], path: str, rep: Report,
                      in_block: list[bool]) -> None:
    """Walk Control: / Properties: pairs and vet each property name."""
    ctrl = None
    prop_ind = None
    for i, line in enumerate(lines, 1):
        if not line.strip() or in_block[i - 1]:
            continue
        ind = _indent(line)
        m = re.match(r"\s*Control:\s*(\S+)\s*$", line)
        if m:
            ctrl, prop_ind = m.group(1), None
            continue
        if re.match(r"\s*Properties:\s*$", line) and ctrl:
            prop_ind = ind + 4
            continue
        if prop_ind is None or ctrl is None:
            continue
        if ind < prop_ind:
            prop_ind = None
            continue
        if ind != prop_ind:
            continue
        pm = re.match(r"\s*([A-Za-z][A-Za-z0-9_]*):", line)
        if not pm:
            continue
        prop = pm.group(1)

        if ctrl.startswith("cmp_"):
            allowed = set(INSTANCES.get("layout", [])) | set(INSTANCES.get(ctrl, []))
            if ctrl in INSTANCES and prop not in allowed:
                rep.error(f"{path}:{i}", "Rule 4",
                          f"'{prop}' is not a custom or layout property of "
                          f"{ctrl} - PA2108")
            continue

        spec = CONTROLS.get(ctrl)
        if spec is None:
            rep.warn(f"{path}:{i}", "Rule 4",
                     f"control {ctrl} is not in the manifest - "
                     f"its properties cannot be checked")
            continue
        if prop in spec["rejected"]:
            rep.error(f"{path}:{i}", "Rule 4",
                      f"'{prop}' on {ctrl}: {spec['rejected'][prop]}")
        elif prop not in spec["known"]:
            rep.warn(f"{path}:{i}", "Rule 4",
                     f"'{prop}' on {ctrl} is not in the verified inventory - "
                     f"confirm it pastes, then add it to "
                     f"tools/control_properties.json")


# ---------------------------------------------------------------------------
def check_paths(targets: list[pathlib.Path], strict: bool = False,
                allow_comments: bool = False) -> Report:
    rep = Report()
    files: list[pathlib.Path] = []
    for t in targets:
        files.extend(sorted(t.rglob("*.fx.yaml")) if t.is_dir() else [t])
    for f in files:
        check_text(f.read_text(encoding="utf-8"), str(f), rep, allow_comments)
    if strict:
        rep.errors.extend(rep.warnings)
        rep.warnings = []
    return rep


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("targets", nargs="+", type=pathlib.Path)
    ap.add_argument("--strict", action="store_true",
                    help="treat unverified-property warnings as failures")
    ap.add_argument("--allow-comments", action="store_true",
                    help="permit YAML comments (the production source keeps "
                         "them as documentation; build_mockup.py strips them "
                         "on the way out)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    rep = check_paths(args.targets, args.strict, args.allow_comments)
    n = sum(len(list(t.rglob("*.fx.yaml"))) if t.is_dir() else 1
            for t in args.targets)

    for w in rep.warnings:
        print(f"  warn  {w}")
    for e in rep.errors:
        print(f"  FAIL  {e}")

    if rep.errors:
        print(f"\n{len(rep.errors)} paste-blocking error(s) across {n} file(s).")
        return 1
    if not args.quiet:
        msg = f"{n} file(s) paste-ready"
        if rep.warnings:
            msg += f", {len(rep.warnings)} unverified-property warning(s)"
        print(f"  ok    {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
