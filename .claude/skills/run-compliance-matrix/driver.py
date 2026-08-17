#!/usr/bin/env python3
"""Drive the Compliance Matrix canvas app without Power Apps Studio.

The app is a Power Apps canvas app. There is no way to *run* it here: Studio is
a hosted web IDE behind a Microsoft Entra tenant, and .msapp is an archive, not
an executable. What there is, is a complete declarative description of every
screen - control tree, geometry, colour, font, and the mock data the screens
bind to - sitting in mockup/ as pa.yaml.

So this renders it. Each screen's control tree is laid out at the app's real
1366x768, its Power Fx geometry and colour formulas are resolved against the
theme and the mockup collections, and the result is written as HTML and
screenshotted with headless Chromium. Change a Y coordinate in the YAML, re-run
`render`, look at the PNG.

    driver.py screens                 what screens exist, how big they are
    driver.py render <screen|all>     -> out/<screen>.html + out/<screen>.png
    driver.py tree <screen>           resolved control tree with real pixel boxes
    driver.py audit <screen|all>      off-canvas, overlap, contrast, unresolved
    driver.py nav                     the Navigate() graph
    driver.py theme                   resolved gblTheme
    driver.py data [collection]       the mockup collections

What this is not: it is not Studio. It does not run Power Fx behaviour, so
OnSelect does nothing, galleries show unfiltered rows, and a formula this
evaluator cannot read renders as a dashed placeholder rather than silently as
empty. `audit` counts those, so how much of a screen is real is always visible.
"""

from __future__ import annotations

import argparse
import glob
import html as html_mod
import json
import os
import re
import shutil
import subprocess
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import powerfx  # noqa: E402
from powerfx import (  # noqa: E402
    Color,
    Enum,
    Evaluator,
    as_text,
    contrast_ratio,
)

HERE = os.path.dirname(os.path.abspath(__file__))
# The skill lives at <repo>/.claude/skills/run-compliance-matrix/.
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

APP_W, APP_H = 1366, 768          # from the packed msapp's Properties.json
PT_TO_PX = 4.0 / 3.0              # canvas Size is points; CSS wants pixels
NOTFOUND = Evaluator.NOTFOUND

CHROME_CANDIDATES = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    "chromium",
    "chromium-browser",
    "google-chrome",
]


def find_chrome() -> str | None:
    for c in CHROME_CANDIDATES:
        if os.path.isabs(c):
            if os.path.exists(c):
                return c
        else:
            w = shutil.which(c)
            if w:
                return w
    # Any versioned playwright chromium.
    for p in sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")):
        return p
    return None


# ---------------------------------------------------------------------------
# loading the app
# ---------------------------------------------------------------------------


def balanced(text: str, start: int) -> int:
    """Index just past the ')' matching the '(' at or after `start`.

    Quote-aware: the mockup collections contain '(' inside string values.
    """
    i = text.index("(", start)
    depth, n, in_str = 0, len(text), False
    while i < n:
        ch = text[i]
        if in_str:
            if ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def split_top_args(text: str) -> list[str]:
    """Split a call's argument list on top-level commas."""
    out, depth, cur, in_str = [], 0, [], False
    for ch in text:
        if in_str:
            cur.append(ch)
            if ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            cur.append(ch)
        elif ch in "([{":
            depth += 1
            cur.append(ch)
        elif ch in ")]}":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if cur:
        out.append("".join(cur))
    return [a.strip() for a in out if a.strip()]


def find_calls(text: str, fname: str):
    """Yield (first_arg, rest_args_text) for each top-level `fname(...)`."""
    for m in re.finditer(r"\b" + fname + r"\s*\(", text):
        end = balanced(text, m.start())
        args = split_top_args(text[m.end():end - 1])
        if args:
            yield args[0], args[1:]


class App:
    def __init__(self, source: str):
        self.source = source
        self.theme: dict = {}
        self.globals: dict = {}
        self.collections: dict = {}
        self.components: dict = {}
        self.screens: dict = {}
        self._load()

    # -- files -------------------------------------------------------------

    def _yaml(self, path):
        with open(path, encoding="utf-8") as fh:
            return yaml.safe_load(fh)

    def _load(self):
        app_path = os.path.join(self.source, "App.fx.yaml")
        doc = self._yaml(app_path)
        onstart = ((doc or {}).get("App", {}).get("Properties", {}) or {}).get("OnStart", "")
        self._load_theme(onstart)
        self._load_collections(onstart)
        self._load_globals(onstart)

        comp_dir = os.path.join(self.source, "Components")
        for path in sorted(glob.glob(os.path.join(comp_dir, "cmp_*.fx.yaml"))):
            doc = self._yaml(path) or {}
            for name, body in (doc.get("ComponentDefinitions") or {}).items():
                self.components[name] = body

        for path in sorted(glob.glob(os.path.join(self.source, "scr_*.fx.yaml"))):
            doc = self._yaml(path) or {}
            for name, body in (doc.get("Screens") or {}).items():
                self.screens[name] = body

    def _load_theme(self, onstart: str):
        m = re.search(r"Set\(\s*\n?\s*gblTheme\s*,", onstart)
        if not m:
            return
        end = balanced(onstart, m.start())
        args = split_top_args(onstart[onstart.index("(", m.start()) + 1:end - 1])
        if len(args) < 2:
            return
        rec = Evaluator().eval("=" + args[1])
        if isinstance(rec, dict):
            self.theme = rec

    def _load_collections(self, onstart: str):
        for first, rest in find_calls(onstart, "ClearCollect"):
            name = first.strip()
            if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name):
                continue
            rows = []
            for arg in rest:
                # Evaluated with the app hooks, so `ClearCollect(colX, dsX)`
                # and `ClearCollect(colX, Sort(dsX, ...))` carry rows over
                # instead of landing empty - several screens count those.
                rec = Evaluator(ident=self._bare_ident,
                                call=self._table_call).eval("=" + arg)
                if isinstance(rec, dict):
                    rows.append(rec)
                elif isinstance(rec, list):
                    rows.extend(r for r in rec if isinstance(r, dict))
            self.collections[name] = rows
        for first, rest in find_calls(onstart, "Collect"):
            name = first.strip()
            if name in self.collections:
                for arg in rest:
                    rec = Evaluator().eval("=" + arg)
                    if isinstance(rec, dict):
                        self.collections[name].append(rec)

    def _load_globals(self, text: str, into: dict | None = None):
        """Record `Set(gblX, <resolvable literal>)`. Unresolvable ones are left
        out so the evaluator treats them as unknown rather than as blank."""
        target = self.globals if into is None else into
        for first, rest in find_calls(text, "Set"):
            name = first.strip()
            if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name) or not rest:
                continue
            ev = Evaluator(ident=self._bare_ident)
            val = ev.eval("=" + rest[0])
            if val is not None:
                target[name] = val

    def _table_call(self, name, args):
        """Table shaping over an already-loaded collection, at load time."""
        low = name.lower()
        if low in ("sort", "sortbycolumns", "filter", "showcolumns",
                   "addcolumns", "distinct", "firstn", "search"):
            for a in args:
                if isinstance(a.value, list):
                    return a.value
                for nm in a.names():
                    if nm in self.collections:
                        return self.collections[nm]
        return NOTFOUND

    def _bare_ident(self, parts):
        """Identifier hook used while loading App.OnStart itself."""
        if parts[0] == "gblTheme" and len(parts) == 2:
            return self.theme.get(parts[1], NOTFOUND)
        if parts[0] in self.collections and len(parts) == 1:
            return self.collections[parts[0]]
        if parts[0] in self.globals:
            v = self.globals[parts[0]]
            for p in parts[1:]:
                v = v.get(p) if isinstance(v, dict) else None
            return v
        return NOTFOUND

    def screen_globals(self, screen: str) -> tuple[dict, dict]:
        """App globals plus whatever the screen's OnVisible sets.

        This matters twice over. Several screens carry two mutually exclusive
        layouts gated on a mode variable (`gblFdMode = "read"` vs `"edit"`) and
        without OnVisible both would render on top of each other. And the
        aggregate screens ClearCollect their working sets there - Risk
        Dashboard's stat cards count `colAllFunctions`, which exists nowhere
        else - so those have to be picked up per screen, not just from OnStart.
        """
        out = dict(self.globals)
        cols = dict(self.collections)
        body = self.screens.get(screen, {})
        onvis = (body.get("Properties") or {}).get("OnVisible", "")
        if isinstance(onvis, str) and onvis:
            self._load_globals(onvis, into=out)
            for first, rest in find_calls(onvis, "ClearCollect"):
                name = first.strip()
                if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name) or not rest:
                    continue
                rows = []
                for arg in rest:
                    ev = Evaluator(ident=lambda p: (
                        cols[p[0]] if p[0] in cols and len(p) == 1
                        else (out.get(p[0], NOTFOUND) if p[0] in out
                              else NOTFOUND)),
                        call=self._table_call_over(cols))
                    val = ev.eval("=" + arg)
                    if isinstance(val, dict):
                        rows.append(val)
                    elif isinstance(val, list):
                        rows.extend(r for r in val if isinstance(r, dict))
                cols[name] = rows
        return out, cols

    def _table_call_over(self, cols: dict):
        def hook(name, args):
            low = name.lower()
            if low in ("sort", "sortbycolumns", "filter", "showcolumns",
                       "addcolumns", "distinct", "firstn", "search",
                       "groupby", "ungroup"):
                for a in args:
                    if isinstance(a.value, list):
                        return a.value
                    for nm in a.names():
                        if nm in cols:
                            return cols[nm]
            return NOTFOUND

        return hook


# ---------------------------------------------------------------------------
# control tree
# ---------------------------------------------------------------------------


class Node:
    __slots__ = ("name", "template", "variant", "props", "children", "box",
                 "res", "kind", "comp", "unresolved", "depth")

    def __init__(self, name, template, variant, props, children, depth=0):
        self.name = name
        self.template = template
        self.variant = variant
        self.props = props or {}
        self.children = children or []
        self.box = (0.0, 0.0, 0.0, 0.0)
        self.res = {}
        self.kind = ""
        self.comp = None
        self.unresolved = []
        self.depth = depth

    @property
    def base(self) -> str:
        return self.template.split("@")[0]


def parse_children(items, depth=0) -> list[Node]:
    out = []
    for entry in items or []:
        if not isinstance(entry, dict):
            continue
        for name, body in entry.items():
            body = body or {}
            out.append(
                Node(
                    name,
                    str(body.get("Control", "")),
                    body.get("Variant"),
                    body.get("Properties") or {},
                    parse_children(body.get("Children"), depth + 1),
                    depth,
                )
            )
    return out


# ---------------------------------------------------------------------------
# layout + property resolution
# ---------------------------------------------------------------------------

# Defaults that matter for rendering. Power Apps applies these when a property
# is absent; a Label with no Fill is transparent, not white.
GEOM = ("X", "Y", "Width", "Height")


class Layout:
    """Resolves one screen into a tree of nodes with real pixel boxes."""

    def __init__(self, app: App, screen: str, rows: int = 8):
        self.app = app
        self.screen = screen
        self.rows = rows
        self.globals, self.collections = app.screen_globals(screen)
        self.unresolved: list[tuple[str, str, str]] = []
        body = app.screens[screen]
        self.screen_props = body.get("Properties") or {}
        self.root = Node(screen, "Screen", None, self.screen_props,
                         parse_children(body.get("Children")))
        self.root.box = (0.0, 0.0, float(APP_W), float(APP_H))
        self.root.kind = "screen"
        self.root.res = {
            "Fill": self._eval_in(self.root, "Fill", self.root, None, None)
            or Color(255, 255, 255)
        }
        self._resolve_container(self.root, self.root.box, None, None)

    # -- evaluation context ------------------------------------------------

    def _ident_hook(self, node, parent, item, comp_ctx, siblings, parent_box,
                    cell_box):
        def hook(parts):
            head = parts[0]

            if head == "Parent":
                if len(parts) == 1:
                    return None
                p = parts[1]
                # Inside a gallery template, Parent is the gallery: its Width
                # and Height are the control's, TemplateWidth/Height the cell's.
                if cell_box is not None and p in ("TemplateWidth", "TemplateHeight"):
                    return cell_box[2] if p == "TemplateWidth" else cell_box[3]
                if parent is not None:
                    if p == "Width":
                        return parent.box[2]
                    if p == "Height":
                        return parent.box[3]
                    if p == "X":
                        return parent.box[0]
                    if p == "Y":
                        return parent.box[1]
                    if p in parent.res:
                        return parent.res[p]
                # A component's children see its custom properties on Parent.
                if comp_ctx is not None:
                    got = comp_ctx.prop(p)
                    if got is not NOTFOUND:
                        return got
                if parent_box is not None and p in ("Width", "Height", "X", "Y"):
                    return parent_box[{"X": 0, "Y": 1, "Width": 2, "Height": 3}[p]]
                return NOTFOUND

            if head == "Self":
                if len(parts) > 1 and node is not None:
                    p = parts[1]
                    if p in ("X", "Y", "Width", "Height"):
                        idx = {"X": 0, "Y": 1, "Width": 2, "Height": 3}[p]
                        return node.box[idx]
                    if p in node.res:
                        return node.res[p]
                return NOTFOUND

            if head == "ThisItem":
                if item is None:
                    return NOTFOUND
                v = item
                for p in parts[1:]:
                    v = v.get(p) if isinstance(v, dict) else None
                return v

            if head == "gblTheme":
                if len(parts) == 2:
                    return self.app.theme.get(parts[1], NOTFOUND)
                return NOTFOUND

            # A component referring to its own custom property by name.
            if comp_ctx is not None and head == comp_ctx.def_name:
                if len(parts) == 2:
                    got = comp_ctx.prop(parts[1])
                    if got is not NOTFOUND:
                        return got
                return NOTFOUND

            if head in self.globals:
                v = self.globals[head]
                for p in parts[1:]:
                    v = v.get(p) if isinstance(v, dict) else None
                return v

            if head in self.collections:
                return self.collections[head]

            # A sibling control reference: lbl_X.Y, txt_Search.Text, ...
            sib = (siblings or {}).get(head)
            if sib is not None and len(parts) >= 2:
                p = parts[1]
                if p in ("X", "Y", "Width", "Height"):
                    idx = {"X": 0, "Y": 1, "Width": 2, "Height": 3}[p]
                    return sib.box[idx]
                if p in sib.res:
                    return sib.res[p]
                return NOTFOUND

            return NOTFOUND

        return hook

    def _call_hook(self, node):
        def hook(name, args):
            low = name.lower()
            # Table shaping over a named collection: hand back the real rows so
            # gallery templates bind to realistic text.
            if low in ("filter", "search", "sortbycolumns", "sort", "firstn",
                       "showcolumns", "addcolumns", "distinct", "groupby",
                       "with", "forall", "lookup", "first", "countrows"):
                for a in args:
                    for nm in a.names():
                        if nm in self.collections:
                            rows = self.collections[nm]
                            if low == "countrows":
                                return len(rows)
                            if low in ("first", "lookup"):
                                return rows[0] if rows else None
                            if low == "firstn":
                                n = args[1].value if len(args) > 1 else 1
                                n = int(n) if isinstance(n, (int, float)) else 1
                                return rows[:n]
                            return rows
            return NOTFOUND

        return hook

    def _eval_in(self, node, prop, parent, item, comp_ctx, siblings=None,
                 parent_box=None, cell_box=None):
        raw = node.props.get(prop)
        if raw is None and comp_ctx is not None and node is comp_ctx.instance:
            raw = comp_ctx.definition_prop(prop)
        if raw is None:
            return None
        ev = Evaluator(
            ident=self._ident_hook(node, parent, item, comp_ctx, siblings,
                                   parent_box, cell_box),
            call=self._call_hook(node),
        )
        val = ev.eval(raw)
        if ev.unresolved:
            node.unresolved.extend(ev.unresolved)
            for u in ev.unresolved:
                self.unresolved.append((node.name, prop, u))
            # A value that came back despite an unresolved reference inside it
            # is partly guessed - concatenation absorbing a blank, or If()
            # taking the first branch on an unknown condition. Flag it so the
            # render can say so rather than passing it off as exact.
            if val is not None and prop in ("Text", "Default", "HintText"):
                node.res.setdefault("_partial", set()).add(prop)
        return val

    # -- containers --------------------------------------------------------

    def _resolve_container(self, container, box, comp_ctx, item,
                           cell_box=None):
        """Resolve every direct child of `container` inside `box`."""
        kids = container.children
        if not kids:
            return
        siblings = {k.name: k for k in kids}

        auto = self._is_autolayout(container, comp_ctx)
        if auto:
            self._resolve_autolayout(container, box, comp_ctx, item, siblings,
                                     auto, cell_box)
        else:
            # Two passes: a child may reference a sibling declared after it.
            for _ in range(3):
                changed = False
                for kid in kids:
                    before = kid.box
                    self._resolve_box(kid, container, box, comp_ctx, item,
                                      siblings, cell_box)
                    if kid.box != before:
                        changed = True
                if not changed:
                    break

        for kid in kids:
            self._resolve_visual(kid, container, comp_ctx, item, siblings,
                                 box, cell_box)
            self._descend(kid, comp_ctx, item)

    def _is_autolayout(self, container, comp_ctx):
        if container.variant != "AutoLayout":
            return None
        direction = self._eval_in(container, "LayoutDirection", None, None,
                                  comp_ctx)
        gap = self._eval_in(container, "LayoutGap", None, None, comp_ctx)
        return {
            "vertical": not (isinstance(direction, Enum)
                             and direction.member == "Horizontal"),
            "gap": gap if isinstance(gap, (int, float)) else 0,
        }

    def _resolve_autolayout(self, container, box, comp_ctx, item, siblings,
                            auto, cell_box):
        cursor = 0.0
        for kid in container.children:
            w = self._eval_in(kid, "Width", container, item, comp_ctx,
                              siblings, box, cell_box)
            h = self._eval_in(kid, "Height", container, item, comp_ctx,
                              siblings, box, cell_box)
            if auto["vertical"]:
                w = w if isinstance(w, (int, float)) else box[2]
                h = h if isinstance(h, (int, float)) else 24.0
                kid.box = (0.0, cursor, float(w), float(h))
                cursor += float(h) + auto["gap"]
            else:
                w = w if isinstance(w, (int, float)) else 120.0
                h = h if isinstance(h, (int, float)) else box[3]
                kid.box = (cursor, 0.0, float(w), float(h))
                cursor += float(w) + auto["gap"]

    def _resolve_box(self, node, parent, parent_box, comp_ctx, item, siblings,
                     cell_box):
        vals = {}
        # Width and Height first: X and Y often depend on them.
        for prop in ("Width", "Height", "X", "Y"):
            v = self._eval_in(node, prop, parent, item, comp_ctx, siblings,
                              parent_box, cell_box)
            vals[prop] = v if isinstance(v, (int, float)) and not isinstance(v, bool) else None
            node.box = (
                vals.get("X") or node.box[0],
                vals.get("Y") or node.box[1],
                vals.get("Width") or node.box[2],
                vals.get("Height") or node.box[3],
            )
        node.res["_geom_missing"] = [p for p in GEOM if vals.get(p) is None
                                     and p in node.props]
        node.box = (
            float(vals["X"] if vals["X"] is not None else 0.0),
            float(vals["Y"] if vals["Y"] is not None else 0.0),
            float(vals["Width"] if vals["Width"] is not None else 100.0),
            float(vals["Height"] if vals["Height"] is not None else 24.0),
        )

    VISUAL_PROPS = (
        "Fill", "Color", "BorderColor", "BorderThickness", "Text", "Size",
        "Font", "FontWeight", "Align", "VerticalAlign", "Visible", "HintText",
        "Default", "Italic", "Underline", "Image", "TemplateSize",
        "TemplatePadding", "WrapCount", "Items", "Mode", "DisplayMode",
        "HoverFill", "PressedFill", "Layout",
    )

    def _resolve_visual(self, node, parent, comp_ctx, item, siblings,
                        parent_box, cell_box):
        for prop in self.VISUAL_PROPS:
            if prop in node.props or (
                comp_ctx is not None and node is comp_ctx.instance
            ):
                v = self._eval_in(node, prop, parent, item, comp_ctx, siblings,
                                  parent_box, cell_box)
                if v is not None:
                    node.res[prop] = v
        node.kind = self._classify(node)

    def _classify(self, node) -> str:
        base = node.base
        if base in self.app.components:
            return "component"
        return {
            "Label": "label",
            "Rectangle": "rect",
            "Gallery": "gallery",
            "GroupContainer": "group",
            "Image": "image",
            "Classic/Button": "button",
            "Classic/TextInput": "input",
            "Classic/DropDown": "dropdown",
            "Classic/ComboBox": "dropdown",
            "PowerBI": "powerbi",
        }.get(base, "other")

    def _descend(self, node, comp_ctx, item):
        box = node.box
        inner = (0.0, 0.0, box[2], box[3])

        if node.kind == "component":
            defn = self.app.components[node.base]
            ctx = CompCtx(self, node, node.base, defn, comp_ctx, item)
            node.comp = ctx
            node.children = parse_children(defn.get("Children"), node.depth + 1)
            self._resolve_container(node, inner, ctx, item)
            return

        if node.kind == "gallery":
            self._descend_gallery(node, comp_ctx, item)
            return

        if node.children:
            self._resolve_container(node, inner, comp_ctx, item)

    def _descend_gallery(self, node, comp_ctx, item):
        """Lay out gallery rows. Real row data where it can be resolved."""
        w, h = node.box[2], node.box[3]
        tsize = node.res.get("TemplateSize")
        tpad = node.res.get("TemplatePadding") or 0
        wrap = node.res.get("WrapCount") or 1
        items = node.res.get("Items")
        vertical = not (node.variant == "Horizontal")

        tsize = float(tsize) if isinstance(tsize, (int, float)) else (
            62.0 if vertical else 160.0)
        wrap = int(wrap) if isinstance(wrap, (int, float)) and wrap >= 1 else 1
        tpad = float(tpad) if isinstance(tpad, (int, float)) else 0.0

        rows = items if isinstance(items, list) else []
        if vertical:
            cell_w = w / wrap
            visible = max(1, int(h // max(tsize, 1)) + 1) * wrap
        else:
            cell_w = tsize
            visible = max(1, int(w // max(cell_w, 1)) + 1)
        count = min(self.rows * wrap, visible)
        if rows:
            count = min(count, max(len(rows), 1))

        template = node.children
        node.children = []
        node.res["_gallery"] = {
            "vertical": vertical, "tsize": tsize, "tpad": tpad, "wrap": wrap,
            "rows": len(rows) if rows else None,
        }

        for i in range(count):
            if vertical:
                col, row = i % wrap, i // wrap
                cx, cy = col * cell_w, row * tsize
                cw, ch = cell_w - tpad, tsize - tpad
            else:
                cx, cy = i * (cell_w + tpad), 0.0
                cw, ch = cell_w, h
            if cy >= h + tsize:
                break
            cell = Node(f"{node.name}#{i}", "GalleryCell", None, {},
                        clone_children(template), node.depth + 1)
            cell.kind = "cell"
            cell.box = (cx, cy, cw, ch)
            row_item = rows[i] if i < len(rows) else (rows[0] if rows else None)
            cell.res["_item"] = row_item
            node.children.append(cell)
            self._resolve_container(cell, (0.0, 0.0, cw, ch), comp_ctx,
                                    row_item, cell_box=(0.0, 0.0, cw, ch))


def clone_children(nodes) -> list[Node]:
    out = []
    for n in nodes:
        c = Node(n.name, n.template, n.variant, n.props,
                 clone_children(n.children), n.depth)
        out.append(c)
    return out


class CompCtx:
    """A component instance: its overrides, plus its definition's defaults."""

    def __init__(self, layout, instance, def_name, defn, outer, item):
        self.layout = layout
        self.instance = instance
        self.def_name = def_name
        self.defn = defn
        self.outer = outer
        self.item = item
        self._cache = {}

    def definition_prop(self, name):
        props = self.defn.get("Properties") or {}
        if name in props:
            return props[name]
        custom = (self.defn.get("CustomProperties") or {}).get(name)
        if isinstance(custom, dict) and "Default" in custom:
            return custom["Default"]
        return None

    def prop(self, name):
        """Value of a component property: instance override, else definition."""
        if name in self._cache:
            return self._cache[name]
        raw = self.instance.props.get(name)
        scope_outer = True
        if raw is None:
            raw = self.definition_prop(name)
            scope_outer = False
        if raw is None:
            return NOTFOUND
        self._cache[name] = None            # guard against self-reference
        if scope_outer:
            # An instance override is written in the *parent* screen's scope.
            ev = Evaluator(
                ident=self.layout._ident_hook(
                    self.instance, None, self.item, self.outer, None,
                    self.instance.box, None),
                call=self.layout._call_hook(self.instance),
            )
        else:
            ev = Evaluator(
                ident=self.layout._ident_hook(
                    self.instance, None, self.item, self, None,
                    self.instance.box, None),
                call=self.layout._call_hook(self.instance),
            )
        val = ev.eval(raw)
        self._cache[name] = val
        return val


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------

# Canvas controls never auto-size: a Label is a fixed box and text that does not
# fit is simply clipped, silently, in Studio as much as here. Estimating text
# width in Python would be guesswork, so the page measures itself - each text
# span is compared against its control box and the verdict is published in
# document.title, which `chromium --dump-dom` hands back on stdout. That makes
# "does this label actually fit" a browser measurement rather than an opinion.
FIT_SCRIPT = """
<script>
(function () {
  var out = [];
  document.querySelectorAll('div.c[data-name]:not(.nofit)').forEach(function (el) {
    var t = el.querySelector(':scope > div.t');
    if (!t) return;
    var span = t.querySelector(':scope > span');
    if (!span || !span.textContent.trim()) return;
    var dw = Math.round(span.scrollWidth - t.clientWidth + 10);
    var dh = Math.round(span.scrollHeight - t.clientHeight);
    if (dw > 1 || dh > 1) {
      out.push({n: el.getAttribute('data-name'),
                k: el.getAttribute('data-kind'),
                w: Math.round(el.clientWidth), h: Math.round(el.clientHeight),
                dw: dw > 1 ? dw : 0, dh: dh > 1 ? dh : 0,
                t: span.textContent.trim().slice(0, 48)});
    }
  });
  document.title = 'FIT:' + JSON.stringify(out);
})();
</script>
"""

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>{title}</title>
<style>
  html,body {{ margin:0; padding:0; background:#20232a; }}
  #app {{ position:relative; width:{w}px; height:{h}px; overflow:hidden;
          font-family:Verdana,Geneva,sans-serif; }}
  .c {{ position:absolute; box-sizing:border-box; overflow:hidden; }}
  .t {{ display:flex; width:100%; height:100%; box-sizing:border-box;
        padding:0 5px; }}
  .t > span {{ display:block; width:100%; }}
  .unres {{ outline:1px dashed rgba(220,38,38,.55); outline-offset:-1px; }}
  .unres::after {{ content:''; position:absolute; inset:0;
        background:repeating-linear-gradient(45deg,rgba(220,38,38,.06) 0 6px,
        transparent 6px 12px); pointer-events:none; }}
  .partial {{ outline:1px dotted rgba(217,119,6,.5); outline-offset:-1px; }}
  .cell {{ position:absolute; box-sizing:border-box; overflow:hidden; }}
</style></head>
<body><div id="app">{body}</div>{script}</body></html>
"""


def esc(t) -> str:
    return html_mod.escape(as_text(t))


ALIGN_CSS = {"Left": "flex-start", "Center": "center", "Right": "flex-end",
             "Justify": "flex-start"}
VALIGN_CSS = {"Top": "flex-start", "Middle": "center", "Bottom": "flex-end"}


def render_node(node, out: list, stats: dict):
    x, y, w, h = node.box
    visible = node.res.get("Visible")
    if visible is False:
        stats["hidden"] += 1
        return
    stats["controls"] += 1

    style = [f"left:{x:.1f}px", f"top:{y:.1f}px",
             f"width:{max(w,0):.1f}px", f"height:{max(h,0):.1f}px"]

    fill = node.res.get("Fill")
    if isinstance(fill, Color) and fill.a > 0:
        style.append(f"background:{fill.css()}")

    bt = node.res.get("BorderThickness")
    bc = node.res.get("BorderColor")
    if isinstance(bt, (int, float)) and bt > 0:
        col = bc.css() if isinstance(bc, Color) else "rgba(0,0,0,.2)"
        style.append(f"border:{float(bt):.1f}px solid {col}")
    elif node.kind in ("rect", "input", "dropdown") and bt is None:
        if isinstance(bc, Color):
            style.append(f"border:1px solid {bc.css()}")

    classes = ["c"]
    inner = ""

    if node.kind in ("label", "button", "input", "dropdown"):
        text = node.res.get("Text")
        if node.kind == "input":
            text = node.res.get("Default") or node.res.get("HintText")
        if node.kind == "dropdown":
            text = dropdown_text(node)
        if isinstance(text, (list, dict)):
            # A row set reached a Text property, which means the formula around
            # it went unread. "[9 rows]" would look like content; it is not.
            text = None
        unresolved_text = text is None and (
            "Text" in node.props or "Default" in node.props
        )
        if unresolved_text:
            stats["unresolved_text"] += 1
            classes.append("unres")
            classes.append("nofit")   # the placeholder is ours, not the app's
            text = f"{{{node.name}}}"
        elif node.res.get("_partial"):
            # Rendered, but something inside the formula was guessed.
            stats["partial"] += 1
            classes.append("partial")
        color = node.res.get("Color")
        size = node.res.get("Size")
        weight = node.res.get("FontWeight")
        align = node.res.get("Align")
        valign = node.res.get("VerticalAlign")
        font = node.res.get("Font")

        tstyle = []
        if isinstance(color, Color):
            tstyle.append(f"color:{color.css()}")
        elif node.kind == "label":
            tstyle.append("color:rgba(0,0,0,.9)")
        px = (float(size) * PT_TO_PX) if isinstance(size, (int, float)) else (
            13.0 if node.kind == "label" else 14.7)
        tstyle.append(f"font-size:{px:.2f}px")
        tstyle.append(f"line-height:{px * 1.22:.2f}px")
        if isinstance(font, str) and font:
            tstyle.append(f"font-family:{font},Verdana,sans-serif")
        wname = weight.member if isinstance(weight, Enum) else weight
        tstyle.append("font-weight:" + {
            "Bold": "700", "Semibold": "600", "Lighter": "300",
        }.get(str(wname), "400"))
        if node.res.get("Italic") is True:
            tstyle.append("font-style:italic")
        if node.res.get("Underline") is True:
            tstyle.append("text-decoration:underline")
        aname = align.member if isinstance(align, Enum) else align
        vname = valign.member if isinstance(valign, Enum) else valign
        just = ALIGN_CSS.get(str(aname), "center" if node.kind == "button" else "flex-start")
        alit = VALIGN_CSS.get(str(vname), "center")
        tstyle.append(f"justify-content:{just}")
        tstyle.append(f"align-items:{alit}")
        tstyle.append(f"text-align:{ {'flex-start':'left','center':'center','flex-end':'right'}[just] }")
        inner = (f'<div class="t" style="{";".join(tstyle)}">'
                 f"<span>{esc(text)}</span></div>")

    elif node.kind == "image":
        src = node.res.get("Image")
        label = as_text(src) if src is not None else node.name
        classes.append("nofit")
        style.append("background:rgba(255,255,255,.14)")
        inner = ('<div class="t" style="justify-content:center;align-items:center;'
                 f'font-size:9px;color:rgba(255,255,255,.85)"><span>{esc(label)}'
                 "</span></div>")

    elif node.kind == "powerbi":
        classes.append("nofit")
        style.append("background:rgba(0,0,0,.06)")
        inner = ('<div class="t" style="justify-content:center;align-items:center;'
                 'font-size:12px;color:#555"><span>Power BI report</span></div>')

    out.append(f'<div class="{" ".join(classes)}" style="{";".join(style)}" '
               f'data-name="{html_mod.escape(node.name)}" '
               f'data-kind="{node.kind}">{inner}')

    for kid in node.children:
        if kid.kind == "cell":
            cx, cy, cw, ch = kid.box
            out.append(f'<div class="cell" style="left:{cx:.1f}px;top:{cy:.1f}px;'
                       f'width:{cw:.1f}px;height:{ch:.1f}px">')
            for gk in kid.children:
                render_node(gk, out, stats)
            out.append("</div>")
        else:
            render_node(kid, out, stats)

    out.append("</div>")


def dropdown_text(node) -> str | None:
    """What a closed dropdown shows: its Default, else its first item."""
    d = node.res.get("Default")
    if isinstance(d, str) and d:
        return d + "   ▾"
    items = node.res.get("Items")
    if isinstance(items, list) and items:
        first = items[0]
        if isinstance(first, dict):
            for k in ("Value", "Result", "ColLabel"):
                if isinstance(first.get(k), str):
                    return first[k] + "   ▾"
            # Fall back to the first plain-text field, skipping nested records
            # and row sets - "[1 rows]" is not what the control would show.
            for v in first.values():
                if isinstance(v, str) and v:
                    return v + "   ▾"
            return None
        if isinstance(first, str):
            return first + "   ▾"
    return None


def build_html(layout: Layout, fit: bool = False) -> tuple[str, dict]:
    stats = {"controls": 0, "hidden": 0, "unresolved_text": 0,
             "partial": 0}
    body: list[str] = []
    fill = layout.root.res.get("Fill")
    bg = fill.css() if isinstance(fill, Color) else "#fff"
    body.append(f'<div class="c" style="left:0;top:0;width:{APP_W}px;'
                f'height:{APP_H}px;background:{bg}">')
    for kid in layout.root.children:
        render_node(kid, body, stats)
    body.append("</div>")
    return PAGE.format(title=layout.screen, w=APP_W, h=APP_H,
                       body="".join(body),
                       script=FIT_SCRIPT if fit else ""), stats


# ---------------------------------------------------------------------------
# screenshot
# ---------------------------------------------------------------------------


# Chromium's --window-size sizes the *window*, and --screenshot captures the
# window, but the viewport it lays the page out in is shorter than that (87px
# on Chromium 1194). Render into a deliberately oversized window so the whole
# 768px app is inside the viewport, then crop back to exactly 1366x768.
WINDOW_SLACK_X, WINDOW_SLACK_Y = 40, 240


def screenshot(html_path: str, png_path: str) -> str:
    chrome = find_chrome()
    if not chrome:
        raise SystemExit("error: no chromium binary found; looked in "
                         + ", ".join(CHROME_CANDIDATES))
    profile = os.path.join(os.path.dirname(png_path), ".chrome-profile")
    cmd = [
        chrome, "--headless", "--no-sandbox", "--disable-gpu",
        "--disable-dev-shm-usage", "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--user-data-dir={profile}",
        f"--window-size={APP_W + WINDOW_SLACK_X},{APP_H + WINDOW_SLACK_Y}",
        "--virtual-time-budget=1500",
        f"--screenshot={png_path}",
        "file://" + os.path.abspath(html_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not os.path.exists(png_path):
        raise SystemExit("error: chromium wrote no screenshot\n"
                         + (proc.stderr or "")[-2000:])
    crop_png(png_path, APP_W, APP_H)
    return png_path


# --- just enough PNG to crop one, without pulling in Pillow ----------------


def _png_rows(data: bytes):
    pos, idat, meta = 8, b"", None
    while pos < len(data):
        ln = int.from_bytes(data[pos:pos + 4], "big")
        typ = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            meta = (int.from_bytes(chunk[0:4], "big"),
                    int.from_bytes(chunk[4:8], "big"), chunk[8], chunk[9])
        elif typ == b"IDAT":
            idat += chunk
        pos += 12 + ln
    if meta is None:
        raise ValueError("no IHDR")
    import zlib

    w, h, depth, ctype = meta
    if depth != 8 or ctype not in (2, 6):
        raise ValueError(f"unsupported PNG: depth={depth} colour={ctype}")
    nch = 3 if ctype == 2 else 4
    raw = zlib.decompress(idat)
    stride = w * nch
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if f == 1:
            for x in range(nch, stride):
                line[x] = (line[x] + line[x - nch]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - nch] if x >= nch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - nch] if x >= nch else 0
                b = prev[x]
                c = prev[x - nch] if x >= nch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line))
        prev = line
    return w, h, nch, rows


def crop_png(path: str, want_w: int, want_h: int) -> None:
    import zlib

    with open(path, "rb") as fh:
        data = fh.read()
    w, h, nch, rows = _png_rows(data)
    if w == want_w and h == want_h:
        return
    if w < want_w or h < want_h:
        raise SystemExit(
            f"error: chromium viewport {w}x{h} is smaller than the app "
            f"({want_w}x{want_h}); raise WINDOW_SLACK_X/Y in driver.py")
    out = bytearray()
    for y in range(want_h):
        out.append(0)                      # filter type 0: none
        out += rows[y][: want_w * nch]

    def chunk(typ: bytes, payload: bytes) -> bytes:
        return (len(payload).to_bytes(4, "big") + typ + payload
                + zlib.crc32(typ + payload).to_bytes(4, "big"))

    ihdr = (want_w.to_bytes(4, "big") + want_h.to_bytes(4, "big")
            + bytes([8, 2 if nch == 3 else 6, 0, 0, 0]))
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(bytes(out), 6))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------


def load(args) -> App:
    src = args.source if os.path.isabs(args.source) else os.path.join(REPO, args.source)
    if not os.path.isdir(src):
        raise SystemExit(f"error: no such source dir: {src}")
    return App(src)


def pick_screens(app: App, which: str) -> list[str]:
    if which in ("all", "*"):
        return sorted(app.screens)
    matches = [s for s in sorted(app.screens) if s == which]
    if matches:
        return matches
    low = which.lower().lstrip("_")
    matches = [s for s in sorted(app.screens) if low in s.lower()]
    if not matches:
        raise SystemExit(f"error: no screen matches {which!r}. Have: "
                         + ", ".join(sorted(app.screens)))
    return matches


def cmd_screens(app, args):
    print(f"{len(app.screens)} screens in {os.path.relpath(app.source, REPO)}"
          f"  ({APP_W}x{APP_H})\n")
    print(f"  {'screen':<22} {'controls':>8} {'drawn':>6} {'blank':>6} "
          f"{'unresolved':>11}")
    print("  " + "-" * 58)
    for name in sorted(app.screens):
        lay = Layout(app, name)
        _, stats = build_html(lay)
        # Distinct references, matching what `audit -v` lists. The raw
        # occurrence count is much larger because a gallery repeats the same
        # unreadable formula once per row.
        distinct = len({u for _, _, u in lay.unresolved})
        print(f"  {name:<22} {stats['controls']:>8} "
              f"{stats['controls'] - stats['unresolved_text']:>6} "
              f"{stats['unresolved_text']:>6} {distinct:>11}")
    print(f"\n  drawn / blank counts labels rendered vs shown as a "
          f"{{placeholder}}.")
    print(f"  {len(app.components)} components: "
          + ", ".join(sorted(app.components)))


def cmd_render(app, args):
    outdir = args.out if os.path.isabs(args.out) else os.path.join(REPO, args.out)
    os.makedirs(outdir, exist_ok=True)
    for name in pick_screens(app, args.screen):
        lay = Layout(app, name, rows=args.rows)
        page, stats = build_html(lay)
        hp = os.path.join(outdir, name + ".html")
        with open(hp, "w", encoding="utf-8") as fh:
            fh.write(page)
        line = (f"{name:<22} {stats['controls']:>4} controls, "
                f"{stats['hidden']:>3} hidden")
        if args.no_png:
            print(f"  {line}   -> {os.path.relpath(hp, REPO)}")
            continue
        pp = os.path.join(outdir, name + ".png")
        screenshot(hp, pp)
        size = os.path.getsize(pp)
        print(f"  {line}   -> {os.path.relpath(pp, REPO)} ({size:,} bytes)")
    prof = os.path.join(outdir, ".chrome-profile")
    if os.path.isdir(prof):
        shutil.rmtree(prof, ignore_errors=True)


def walk(node, depth=0):
    yield node, depth
    for kid in node.children:
        yield from walk(kid, depth + 1)


def cmd_tree(app, args):
    for name in pick_screens(app, args.screen):
        lay = Layout(app, name, rows=1)
        print(f"\n{name}")
        for node, depth in walk(lay.root):
            if depth == 0:
                continue
            x, y, w, h = node.box
            pad = "  " * depth
            bits = [f"{x:>6.0f},{y:>4.0f} {w:>6.0f}x{h:<5.0f}"]
            vis = node.res.get("Visible")
            flag = " HIDDEN" if vis is False else ""
            text = node.res.get("Text")
            label = ""
            if isinstance(text, str) and text.strip():
                t = text.replace("\n", " ")[:40]
                label = f'  "{t}"'
            elif "Text" in node.props and text is None:
                label = "  <unresolved>"
            g = node.res.get("_gallery")
            if g:
                label += (f"  [gallery {'V' if g['vertical'] else 'H'} "
                          f"tsize={g['tsize']:.0f} wrap={g['wrap']} "
                          f"rows={g['rows']}]")
            print(f"{pad}{' '.join(bits)}  {node.name} "
                  f"({node.kind}){flag}{label}")


def cmd_audit(app, args):
    bad = 0
    for name in pick_screens(app, args.screen):
        lay = Layout(app, name, rows=2)
        parents = build_parents(lay)
        issues = []
        for node, depth in walk(lay.root):
            if depth == 0 or node.kind == "cell":
                continue
            if node.res.get("Visible") is False:
                continue
            x, y, w, h = node.box
            if w <= 0 or h <= 0:
                issues.append(f"zero-size   {node.name} {w:.0f}x{h:.0f}")
            if depth == 1 and (x < 0 or y < 0 or x + w > APP_W + 0.5):
                issues.append(f"off-canvas  {node.name} "
                              f"x={x:.0f} y={y:.0f} w={w:.0f} "
                              f"(right edge {x + w:.0f} > {APP_W})")
            miss = node.res.get("_geom_missing") or []
            if miss:
                issues.append(f"geometry    {node.name} unresolved "
                              + ",".join(miss))
            if node.kind in ("label", "button"):
                fg = node.res.get("Color")
                bgc = nearest_bg(node, lay, parents)
                if isinstance(fg, Color) and isinstance(bgc, Color):
                    flat = fg.over(bgc)
                    ratio = contrast_ratio(flat, bgc)
                    size = node.res.get("Size") or 10
                    weight = node.res.get("FontWeight")
                    wname = weight.member if isinstance(weight, Enum) else weight
                    large = (float(size) >= 14) or (float(size) >= 11.5
                                                    and str(wname) == "Bold")
                    floor = 3.0 if large else 4.5
                    if ratio < floor:
                        issues.append(
                            f"contrast    {node.name} {ratio:.2f}:1 "
                            f"(needs {floor}) {flat.hex()} on {bgc.hex()}")
        uniq = sorted(set(u for _, _, u in lay.unresolved))
        print(f"\n{name}: {len(issues)} issue(s), "
              f"{len(uniq)} distinct unresolved reference(s)")
        for i in issues[: args.limit]:
            print("  " + i)
        if len(issues) > args.limit:
            print(f"  ... {len(issues) - args.limit} more")
        if uniq and args.verbose:
            print("  unresolved: " + ", ".join(uniq[:20]))
        bad += len(issues)
    if bad:
        print(f"\n{bad} issue(s) total")
    return 0


def build_parents(lay):
    parents = {}
    for n, _ in walk(lay.root):
        for k in n.children:
            parents[id(k)] = n
    return parents


def nearest_bg(node, lay, parents=None):
    """The colour actually behind `node`.

    Ancestry alone gets this wrong on this app. Every screen paints its bands
    with sibling Rectangles - the utility bar, the navy hero, card faces - and
    the labels sit *next to* those rectangles, not inside them. So walk earlier
    siblings (canvas z-order is declaration order, so earlier means behind)
    looking for an opaque one whose box covers this control, before falling
    back to the parent chain. Without this, white-on-navy header text reports as
    a 1:1 contrast failure against the screen fill.
    """
    fill = node.res.get("Fill")
    if isinstance(fill, Color) and fill.a >= 0.95:
        return fill
    parents = parents if parents is not None else build_parents(lay)

    def abs_box(n):
        x, y, w, h = n.box
        cur = parents.get(id(n))
        while cur is not None:
            cx, cy, _, _ = cur.box
            x, y = x + cx, y + cy
            cur = parents.get(id(cur))
        return x, y, w, h

    nx, ny, nw, nh = abs_box(node)
    cx, cy = nx + nw / 2.0, ny + nh / 2.0

    cur = node
    while cur is not None:
        parent = parents.get(id(cur))
        if parent is None:
            break
        kids = parent.children
        try:
            idx = kids.index(cur)
        except ValueError:
            idx = len(kids)
        for behind in reversed(kids[:idx]):
            if behind.res.get("Visible") is False:
                continue
            f = behind.res.get("Fill")
            if not isinstance(f, Color) or f.a < 0.95:
                continue
            bx, by, bw, bh = abs_box(behind)
            if bx <= cx <= bx + bw and by <= cy <= by + bh:
                return f
        f = parent.res.get("Fill")
        if isinstance(f, Color) and f.a >= 0.95:
            return f
        cur = parent
    return Color(255, 255, 255)


def measure_fit(html_path: str) -> list[dict]:
    """Run the page and read its self-measurement back out of <title>."""
    chrome = find_chrome()
    if not chrome:
        raise SystemExit("error: no chromium binary found")
    profile = os.path.join(os.path.dirname(html_path), ".chrome-profile")
    cmd = [
        chrome, "--headless", "--no-sandbox", "--disable-gpu",
        "--disable-dev-shm-usage", "--hide-scrollbars",
        "--force-device-scale-factor=1", f"--user-data-dir={profile}",
        f"--window-size={APP_W + WINDOW_SLACK_X},{APP_H + WINDOW_SLACK_Y}",
        "--virtual-time-budget=1500", "--dump-dom",
        "file://" + os.path.abspath(html_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    m = re.search(r"<title>FIT:(.*?)</title>", proc.stdout, re.S)
    if not m:
        return []
    payload = html_mod.unescape(m.group(1))
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return []


def cmd_fit(app, args):
    """Report text that does not fit its control box.

    Canvas has no auto-sizing, so this is a real class of defect: the control
    is the right size in the YAML and the string is simply too long for it.
    """
    outdir = args.out if os.path.isabs(args.out) else os.path.join(REPO, args.out)
    os.makedirs(outdir, exist_ok=True)
    total = 0
    for name in pick_screens(app, args.screen):
        lay = Layout(app, name, rows=args.rows)
        page, _ = build_html(lay, fit=True)
        hp = os.path.join(outdir, name + ".fit.html")
        with open(hp, "w", encoding="utf-8") as fh:
            fh.write(page)
        found = measure_fit(hp)
        # One row of a gallery reports the same overflow as every other row.
        # And anything within a few pixels is inside this renderer's own
        # line-height approximation, not a real clip - hence --min.
        seen, uniq = set(), []
        for f in found:
            if max(f["dw"], f["dh"]) < args.min:
                continue
            key = (f["n"].split("#")[0], f["t"])
            if key in seen:
                continue
            seen.add(key)
            uniq.append(f)
        print(f"\n{name}: {len(uniq)} control(s) with clipped text")
        for f in uniq[: args.limit]:
            over = []
            if f["dw"]:
                over.append(f"needs {f['dw']}px more width")
            if f["dh"]:
                over.append(f"needs {f['dh']}px more height")
            print(f"  {f['n']:<24} {f['w']}x{f['h']}  {', '.join(over)}")
            print(f"  {'':24} \"{f['t']}\"")
        if len(uniq) > args.limit:
            print(f"  ... {len(uniq) - args.limit} more")
        total += len(uniq)
    prof = os.path.join(outdir, ".chrome-profile")
    if os.path.isdir(prof):
        shutil.rmtree(prof, ignore_errors=True)
    print(f"\n{total} clipped control(s) total")


def cmd_nav(app, args):
    """The Navigate() graph, including edges that live in components.

    Most of this app's navigation is one Switch() inside cmp_Header's nav
    gallery, not per-screen OnSelect. Reading only the screen files makes four
    perfectly reachable screens look orphaned.
    """
    def targets_in(path):
        if not path or not os.path.exists(path):
            return []
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        return sorted(set(re.findall(
            r"Navigate\(\s*([A-Za-z_][A-Za-z_0-9]*)", text)))

    edges = {}
    for name in sorted(app.screens):
        edges[name] = targets_in(os.path.join(app.source, name + ".fx.yaml"))
    comp_edges = {}
    for name in sorted(app.components):
        found = targets_in(os.path.join(app.source, "Components",
                                        name + ".fx.yaml"))
        if found:
            comp_edges[name] = found

    print("Navigate() graph\n")
    for src, dsts in edges.items():
        print(f"  {src}")
        for d in dsts:
            mark = "" if d in app.screens else "   <-- MISSING"
            print(f"      -> {d}{mark}")
    for src, dsts in comp_edges.items():
        print(f"  {src}  (component - reachable from every screen using it)")
        for d in dsts:
            mark = "" if d in app.screens else "   <-- MISSING"
            print(f"      -> {d}{mark}")

    reached = {d for v in edges.values() for d in v}
    reached |= {d for v in comp_edges.values() for d in v}
    unreached = set(app.screens) - reached
    if unreached:
        print("\n  not a Navigate() target from anywhere: "
              + ", ".join(sorted(unreached)))
    else:
        print(f"\n  every screen is a Navigate() target "
              f"({len(reached & set(app.screens))}/{len(app.screens)})")
    missing = {d for v in list(edges.values()) + list(comp_edges.values())
               for d in v} - set(app.screens)
    if missing:
        print("  Navigate() to a screen that does not exist: "
              + ", ".join(sorted(missing)))


def cmd_theme(app, args):
    print(f"gblTheme  ({len(app.theme)} entries)\n")
    for k, v in app.theme.items():
        if isinstance(v, Color):
            print(f"  {k:<14} {v.hex()}  a={v.a:g}  lum={v.luminance():.3f}")
        else:
            print(f"  {k:<14} {as_text(v)}")


def cmd_data(app, args):
    if args.collection:
        rows = app.collections.get(args.collection)
        if rows is None:
            raise SystemExit("error: no such collection. Have: "
                             + ", ".join(sorted(app.collections)))
        print(json.dumps(rows[: args.limit], indent=2, default=as_text))
        return
    print(f"{len(app.collections)} mockup collections\n")
    for k in sorted(app.collections):
        rows = app.collections[k]
        cols = sorted({c for r in rows for c in r}) if rows else []
        print(f"  {k:<20} {len(rows):>4} rows   {', '.join(cols[:6])}"
              + (" ..." if len(cols) > 6 else ""))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", default="mockup",
                    help="canvas source dir (default: mockup)")
    ap.add_argument("--today", metavar="YYYY-MM-DD",
                    help="pin Today() so renders are reproducible; every "
                         "mockup date is DateAdd(Today(), n, Days)")
    ap.add_argument("--set", action="append", default=[], metavar="VAR=FORMULA",
                    help="seed a global before rendering, e.g. "
                         "--set 'gblSelectedAssessment=First(dsAssessments)'. "
                         "The detail screens read a selection the previous "
                         "screen's OnSelect puts there, so without this they "
                         "render with an empty record. Repeatable.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("screens", help="list screens with control counts")

    r = sub.add_parser("render", help="render screen(s) to HTML + PNG")
    r.add_argument("screen", nargs="?", default="all")
    r.add_argument("--out", default="out/screens")
    r.add_argument("--rows", type=int, default=8,
                   help="max gallery rows per axis to draw")
    r.add_argument("--no-png", action="store_true", help="HTML only")

    t = sub.add_parser("tree", help="resolved control tree")
    t.add_argument("screen")

    a = sub.add_parser("audit", help="layout and contrast checks")
    a.add_argument("screen", nargs="?", default="all")
    a.add_argument("--limit", type=int, default=25)
    a.add_argument("-v", "--verbose", action="store_true")

    f = sub.add_parser("fit", help="text that is clipped by its control box")
    f.add_argument("screen", nargs="?", default="all")
    f.add_argument("--out", default="out/screens")
    f.add_argument("--rows", type=int, default=2)
    f.add_argument("--limit", type=int, default=12)
    f.add_argument("--min", type=int, default=4, metavar="PX",
                   help="ignore overflow smaller than this; below ~4px is "
                        "inside the renderer's line-height approximation")

    sub.add_parser("nav", help="Navigate() graph")
    sub.add_parser("theme", help="resolved gblTheme")

    d = sub.add_parser("data", help="mockup collections")
    d.add_argument("collection", nargs="?")
    d.add_argument("--limit", type=int, default=3)

    args = ap.parse_args(argv)
    if args.today:
        import datetime

        try:
            powerfx.set_today(datetime.date.fromisoformat(args.today))
        except ValueError:
            raise SystemExit(f"error: --today wants YYYY-MM-DD, got {args.today!r}")
    app = load(args)
    for pair in args.set:
        if "=" not in pair:
            raise SystemExit(f"error: --set wants VAR=FORMULA, got {pair!r}")
        var, formula = pair.split("=", 1)
        val = Evaluator(ident=app._bare_ident,
                        call=app._table_call).eval("=" + formula)
        if val is None:
            raise SystemExit(f"error: --set {var.strip()} did not resolve: "
                             f"{formula.strip()}")
        app.globals[var.strip()] = val
    fn = {
        "screens": cmd_screens, "render": cmd_render, "tree": cmd_tree,
        "audit": cmd_audit, "fit": cmd_fit, "nav": cmd_nav,
        "theme": cmd_theme, "data": cmd_data,
    }[args.cmd]
    return fn(app, args) or 0


if __name__ == "__main__":
    # `driver.py screens | head -3` is the normal way to use this, and the
    # default SIGPIPE handling turns that into a BrokenPipeError traceback.
    try:
        import signal

        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
