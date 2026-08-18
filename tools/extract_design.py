#!/usr/bin/env python3
"""Unpack the standalone HTML prototype into reviewable source.

`design/Compliance_Matrix_standalone.html` is a self-contained export: one
bundler shell wrapping the real document, plus every asset inlined as
gzipped base64 keyed by UUID. Opening it in a browser works, but a 3 MB file
with two 300 KB lines is not something a diff can show you, and it is the
input to the canvas conversion - so the parts a human reads get written out
flat.

    python3 tools/extract_design.py [--check]

Writes design/src/*.jsx, design/css/*.css and design/assets/*.svg. `--check`
verifies the extracted files match the bundle without writing, which is what
tools/validate.py calls so the two can never drift apart silently.

Fonts are deliberately not extracted. The bundle carries Sherman Sans,
Sherman Serif and Syracuse Block as OTF/TTF; those are licensed brand assets,
they are already inside the standalone file, and canvas apps cannot load a
custom face anyway.
"""

from __future__ import annotations

import argparse
import base64
import difflib
import gzip
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(ROOT, "design", "Compliance_Matrix_standalone.html")
OUT = os.path.join(ROOT, "design")

# The document loads seven babel scripts by UUID. UUIDs are regenerated on
# every export, so files are named by what the code actually is, matched on a
# signature rather than on an id that will not survive the next re-export.
SIGNATURES = [
    ("ReactDOM.createRoot", "app"),
    ("const FUNCTIONS", "data"),
    ("function Icon(", "ui-kit"),
    ("function Home(", "screens-browse"),
    ("function OwnershipChain(", "ownership"),
    ("function FunctionDetailScreen(", "screen-function-detail"),
    ("function GapTracker(", "screens-admin"),
    ("@ds-bundle", "design-system-manifest"),
]

# Anything this size is a vendored stylesheet, not authored CSS. The one that
# trips it is the Syracuse Digital Design System, dds.min.css v1.10.0.
VENDOR_CSS_BYTES = 100_000

TEXT_MIMES = {"text/javascript", "application/javascript", "image/svg+xml"}


class ExtractError(Exception):
    pass


def load_bundle(path: str) -> tuple[str, dict]:
    """Return (inner document, asset map).

    Both are single JSON values on their own line inside the shell - the
    document as a JSON string, the assets as a JSON object. Found by shape
    rather than by line number, which the exporter is free to change.
    """
    if not os.path.exists(path):
        raise ExtractError(f"bundle not found: {path}")

    inner = assets = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line[0] not in '{"':
                continue
            try:
                value = json.loads(line)
            except ValueError:
                continue
            if isinstance(value, str) and value.lstrip().startswith("<!DOCTYPE"):
                inner = value
            elif isinstance(value, dict) and value and all(
                isinstance(v, dict) and "data" in v for v in value.values()
            ):
                assets = value

    if inner is None:
        raise ExtractError("no inner document found in the bundle")
    if assets is None:
        raise ExtractError("no asset map found in the bundle")
    return inner, assets


def asset_bytes(entry: dict) -> bytes:
    raw = base64.b64decode(entry["data"])
    return gzip.decompress(raw) if entry.get("compressed") else raw


def label_for(text: str) -> str | None:
    for needle, name in SIGNATURES:
        if needle in text:
            return name
    return None


def collect(inner: str, assets: dict) -> tuple[dict[str, str], list[str]]:
    """Map output path -> text. Second return is a list of skipped notes."""
    files: dict[str, str] = {}
    skipped: list[str] = []

    # --- scripts, in document order -------------------------------------
    ids = re.findall(r'<script[^>]*src="([0-9a-f-]{36})"', inner)
    seen = set()
    index = 0
    for asset_id in ids:
        if asset_id in seen:
            continue
        seen.add(asset_id)
        entry = assets.get(asset_id)
        if entry is None or entry["mime"] not in TEXT_MIMES:
            continue
        text = asset_bytes(entry).decode("utf-8")
        label = label_for(text)
        if label is None:
            # React, ReactDOM and Babel come in the same way. They are
            # enormous and nobody reviews them.
            skipped.append(f"vendor script {asset_id[:8]} ({len(text):,} bytes)")
            continue
        index += 1
        files[f"src/{index:02d}-{label}.jsx"] = text

    # --- stylesheets, in document order ---------------------------------
    blocks = re.findall(r"<style>(.*?)</style>", inner, re.S)
    index = 0
    for block in blocks:
        if len(block) >= VENDOR_CSS_BYTES:
            skipped.append(f"vendor stylesheet ({len(block):,} bytes)")
            continue
        # Order matters: the app layer declares its own :root overrides, so
        # "has :root" alone would claim it for the token sheet.
        if "Function Detail" in block or ".fd{" in block:
            name = "function-detail"
        elif "application layer" in block:
            name = "app"
        elif ":root" in block:
            name = "tokens"
        elif "@font-face" in block:
            name = "fonts"
        else:
            name = "misc"
        index += 1
        files[f"css/{index:02d}-{name}.css"] = block

    # --- inline SVG assets ----------------------------------------------
    # Referenced from CSS and markup by UUID; only the ones small enough to
    # be a logo or a mark are worth keeping as files.
    # An SVG's own id is the stable name where it has one. Where it does not,
    # fall back to a position, never to the UUID - the UUID is regenerated on
    # every export and would rename the file on each re-extract.
    unnamed = 0
    for entry in assets.values():
        if entry["mime"] != "image/svg+xml":
            continue
        text = asset_bytes(entry).decode("utf-8")
        ident = re.search(r'<svg[^>]*\bid="([^"]+)"', text)
        if ident:
            name = re.sub(r"[^A-Za-z0-9_-]+", "-", ident.group(1)).strip("-").lower()
        else:
            unnamed += 1
            name = f"mark-{unnamed:02d}"
        files[f"assets/{name}.svg"] = text

    return files, skipped


def normalize(text: str) -> str:
    """Extracted files are written with a trailing newline; the bundle's are
    not guaranteed to have one. Compare without that difference."""
    return text.rstrip("\n") + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bundle", default=BUNDLE)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--check", action="store_true",
                    help="verify the extracted files match; write nothing")
    args = ap.parse_args()

    try:
        inner, assets = load_bundle(args.bundle)
        files, skipped = collect(inner, assets)
    except ExtractError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if not files:
        print("error: bundle produced no extractable files", file=sys.stderr)
        return 1

    if args.check:
        problems = []
        for rel, text in sorted(files.items()):
            path = os.path.join(args.out, rel)
            if not os.path.exists(path):
                problems.append(f"missing: design/{rel}")
                continue
            with open(path, encoding="utf-8") as fh:
                have = fh.read()
            if normalize(have) != normalize(text):
                diff = list(difflib.unified_diff(
                    normalize(have).splitlines(), normalize(text).splitlines(),
                    "on disk", "in bundle", lineterm="", n=0))
                problems.append(f"stale: design/{rel}\n    "
                                + "\n    ".join(diff[:6]))
        for problem in problems:
            print(problem, file=sys.stderr)
        if problems:
            print(f"\n{len(problems)} file(s) out of sync. "
                  "Run: python3 tools/extract_design.py", file=sys.stderr)
            return 1
        print(f"design/: {len(files)} extracted files match the bundle")
        return 0

    for rel, text in sorted(files.items()):
        path = os.path.join(args.out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(normalize(text))
        print(f"  design/{rel:44s} {len(text):>8,} bytes")

    print(f"\nWrote {len(files)} files from {os.path.basename(args.bundle)}")
    for note in skipped:
        print(f"  skipped {note}")
    fonts = sum(1 for e in assets.values() if e["mime"].startswith("font/"))
    print(f"  skipped {fonts} font faces and "
          f"{sum(1 for e in assets.values() if e['mime'] == 'binary/octet-stream')}"
          " unlabelled font payloads (licensed brand assets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
