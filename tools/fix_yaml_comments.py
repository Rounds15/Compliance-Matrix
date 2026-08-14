#!/usr/bin/env python3
"""
Normalize comment syntax in Power Apps .fx.yaml sources.

Power Apps source files are YAML documents whose scalar values happen to be
Power Fx formulas. The two languages disagree about comments:

    YAML     ->  # comment
    Power Fx ->  // comment

A `//` line at the YAML structural level is not a comment at all; the parser
reads it as a plain scalar and the file fails to load. A `#` inside a Power Fx
formula is likewise wrong. This script walks each file, tracks whether the
current line sits inside a block scalar (introduced by `|` or `>`), and rewrites
only the structural-level `//` lines to `#`, leaving formula bodies untouched.

Usage:
    python3 tools/fix_yaml_comments.py <file-or-dir>... [--check]
"""

from __future__ import annotations

import argparse
import pathlib
import sys


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def convert(text: str) -> tuple[str, int]:
    """Return (converted_text, number_of_lines_changed)."""
    lines = text.split("\n")
    out: list[str] = []
    changed = 0

    # Indentation of the key that opened the current block scalar, or None.
    block_indent: int | None = None

    for line in lines:
        stripped = line.strip()

        if block_indent is not None:
            # A block scalar continues through blank lines and any line indented
            # deeper than the key that introduced it.
            if stripped == "" or _indent_of(line) > block_indent:
                out.append(line)
                continue
            block_indent = None  # fell out of the block

        if stripped.startswith("//"):
            indent = " " * _indent_of(line)
            out.append(indent + "#" + stripped[2:])
            changed += 1
            continue

        # Detect the start of a block scalar: a mapping key whose value is
        # `|`, `|-`, `>`, `>-` and nothing else.
        if stripped.endswith(("|", "|-", ">", ">-")) and ":" in stripped:
            value = stripped.split(":", 1)[1].strip()
            if value in ("|", "|-", ">", ">-"):
                block_indent = _indent_of(line)

        out.append(line)

    return "\n".join(out), changed


def strip_comments(text: str) -> tuple[str, int]:
    """
    Remove YAML comments, leaving anything inside a quoted string alone.

    Power Apps Studio's "Paste code" parser rejects `#` comments with PA1001,
    so paste-ready output has to be comment-free. A naive strip would corrupt
    this app badly: the theme is built from hex colours ("#DC2626") and the
    icons are inline SVG carrying fill='#F76900'. Both live inside quotes.

    A `#` opens a comment only when it is outside quotes AND either starts the
    line or is preceded by whitespace - the same rule the YAML spec uses.
    Returns (text, lines_changed).
    """
    out: list[str] = []
    changed = 0

    for line in text.split("\n"):
        in_single = in_double = False
        cut = None
        for i, ch in enumerate(line):
            if ch == "'" and not in_double:
                in_single = not in_single
            elif ch == '"' and not in_single:
                in_double = not in_double
            elif ch == "#" and not in_single and not in_double:
                if i == 0 or line[i - 1] in " \t":
                    cut = i
                    break
        if cut is None:
            out.append(line)
            continue
        changed += 1
        stripped = line[:cut].rstrip()
        # A whole-line comment disappears; a trailing one leaves its code behind.
        if stripped:
            out.append(stripped)

    # Collapse the blank runs that removing comment blocks leaves behind.
    collapsed: list[str] = []
    for line in out:
        if not line.strip() and collapsed and not collapsed[-1].strip():
            continue
        collapsed.append(line)
    return "\n".join(collapsed), changed


def iter_files(targets: list[pathlib.Path]):
    for t in targets:
        if t.is_dir():
            yield from sorted(t.rglob("*.yaml"))
            yield from sorted(t.rglob("*.yml"))
        elif t.is_file():
            yield t


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("targets", nargs="+", type=pathlib.Path)
    ap.add_argument(
        "--check",
        action="store_true",
        help="report what would change without writing",
    )
    args = ap.parse_args(argv)

    total_files = 0
    total_lines = 0
    for path in iter_files(args.targets):
        original = path.read_text(encoding="utf-8")
        converted, changed = convert(original)
        if changed:
            total_files += 1
            total_lines += changed
            verb = "would convert" if args.check else "converted"
            print(f"  {verb} {changed:>3} line(s)  {path}")
            if not args.check:
                path.write_text(converted, encoding="utf-8")

    if total_files == 0:
        print("No structural-level // comments found.")
    else:
        print(f"\n{total_lines} line(s) across {total_files} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
