#!/usr/bin/env python3
"""Generate docs/CANVAS-UI-GEN-BRIEF.md - a handoff brief for canvas-apps-ui-gen.

That skill reads a design from an image, or from a text description in its
"build from scratch" mode, and then synthesises two internal artifacts before it
generates anything: a structural skeleton in a specific indented format, and a
design spec whose DESIGN TOKENS block it invents from the screen's purpose.

Both of those are things this repo already knows exactly. Handing the skill a
screenshot would make it re-derive geometry it can only approximate, and let it
invent a palette when there is an approved one. So this writes the skeleton and
the tokens in the skill's own format, straight out of mockup/**, for pasting
into a session where the skill has its reference/ and agents/ files.

    python3 tools/build_skill_brief.py

Regenerate whenever mockup/ changes.
"""

from __future__ import annotations

import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCKUP = os.path.join(ROOT, "mockup")
OUT = os.path.join(ROOT, "docs", "CANVAS-UI-GEN-BRIEF.md")

# The skill's bracket notation wants a bare control name, not SchemaV3's
# "Template@version". Version pinning is deliberately left out of the brief:
# the skill's own reference/ files are authoritative for versions in the tenant
# it runs against, and that is the whole reason for handing the work to it.
CONTROL_NAMES = {
    "Label": "Label",
    "Rectangle": "Rectangle",
    "Classic/Button": "Classic/Button",
    "Classic/TextInput": "Classic/TextInput",
    "Classic/DropDown": "Classic/DropDown",
    "Classic/ComboBox": "Classic/ComboBox",
    "Image": "Image",
    "Gallery": "Gallery",
    "GroupContainer": "GroupContainer",
}

# active-var / active-col per gallery. The skill mandates a Current<Noun>
# variable even for galleries that only navigate on tap, so every gallery gets
# one; the rename map at the end of the brief points each back to the global the
# shipping app actually uses, where there is one.
GALLERY_STATE = {
    "gal_Figures":       ("CurrentFigureID", None),
    "gal_Destinations":  ("CurrentDestinationID", None),
    "gal_MyFunctions":   ("CurrentFunctionID", "su_functioncode"),
    "gal_MyDeadlines":   ("CurrentDeadlineID", "su_deadlinecode"),
    "gal_Functions":     ("CurrentFunctionID", "su_functioncode"),
    "gal_FnCols":        ("CurrentColumnID", None),
    "gal_Deadlines":     ("CurrentDeadlineID", "su_deadlinecode"),
    "gal_RiskAreas":     ("CurrentRiskAreaID", "su_riskareacode"),
    "gal_Domains":       ("CurrentDomainID", "su_domaincode"),
    "gal_Directory":     ("CurrentPersonID", "su_email"),
    "gal_Exec":          ("CurrentPersonID", "su_email"),
    "gal_Assessments":   ("CurrentAssessmentID", "su_assessmentcode"),
    "gal_Gaps":          ("CurrentGapID", "su_gapcode"),
}

RENAME_MAP = {
    "CurrentFunctionID": "gblSelectedFunction (a whole record, not a code)",
    "CurrentAssessmentID": "gblSelectedAssessment (a whole record)",
    "CurrentDeadlineID": "no equivalent - deadlines are opened through their function",
    "CurrentGapID": "gblSelectedGap",
    "CurrentColumnID": "no equivalent - the table header gallery is display only",
    "CurrentFigureID": "no equivalent - the figures band is display only",
    "CurrentDestinationID": "no equivalent - destination cards navigate on tap",
}


def load(path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def children_of(body):
    for entry in (body or {}).get("Children") or []:
        (name, child), = entry.items()
        yield name, (child or {})


def is_svg_image(props):
    return "svg" in str(props.get("Image", "")).lower()


def is_icon(props):
    """An inline SVG is only an icon if it is icon-sized. The hero block is a
    260px decorative panel drawn the same way, and tagging it `icon` would send
    the generator looking for a 20px glyph."""
    if not is_svg_image(props):
        return False
    size = str(props.get("Width", ""))
    return bool(re.fullmatch(r"=\s*\d+", size)) and int(size.lstrip("= ")) <= 48


def is_overlay(control, props):
    """A full-size transparent Classic/Button used purely as a click target."""
    if control != "Classic/Button":
        return False
    fill = str(props.get("Fill", ""))
    text = str(props.get("Text", "")).strip()
    transparent = re.search(r"RGBA\(\s*0,\s*0,\s*0,\s*0\s*\)", fill) is not None
    return transparent and text in ('=""', "=", "")


def roles(name, control, props, in_gallery):
    out = []
    if control == "Gallery":
        return out  # handled separately, needs the data contract
    if is_overlay(control, props):
        out.append("transparent overlay")
    if control == "Image":
        out.append("icon" if is_icon(props) else "inline SVG panel")
    if control == "Rectangle" and re.search(r"card", name, re.I):
        out.append("card")
    if control == "GroupContainer":
        if "LayoutOverflowY" in props or re.search(r"scroll", name, re.I):
            out.append("scrollable")
    if in_gallery:
        out.append("gallery-child")
    return out


def gallery_columns(name, body):
    """The exact column names the generated Table() must carry, in the order the
    children first touch them. Read off ThisItem.* across the whole subtree."""
    found = []

    def visit(b):
        for prop in (b.get("Properties") or {}).values():
            for col in re.findall(r"ThisItem\.([A-Za-z_][A-Za-z0-9_.]*)", str(prop)):
                col = col.rstrip(".")
                if col not in found:
                    found.append(col)
        for _, child in children_of(b):
            visit(child)

    visit(body)
    # A dotted path means the mock row needs a nested record, so keep the path.
    # Drop a bare prefix when something deeper uses it - Distinct() yields a
    # single column literally named Value, and listing both Value and
    # Value.su_name says nothing the deeper path does not already say.
    return [c for c in found
            if not any(other != c and other.startswith(c + ".") for other in found)]


def gallery_annotation(name, body, variant):
    cols = gallery_columns(name, body)
    var, key = GALLERY_STATE.get(name, (None, None))
    if var is None:
        var = "Current" + re.sub(r"^gal_", "", name) + "ID"
    if key is None:
        key = next((c for c in cols if re.search(r"(code|id|email)$", c, re.I)), None)
    if key is None:
        key = (cols[0] if cols else "ItemID")
    if key not in cols:
        # The key is a real alternate key the screen does not happen to display.
        # The mock table still needs it, so add it rather than substitute a
        # display column that is not unique.
        cols = cols + [key]
    return (f"Gallery, {variant or 'Vertical'}, "
            f"items-cols: {'|'.join(cols) if cols else 'ItemLabel|ItemID'}, "
            f"active-var: {var}, active-col: {key}")


def describe(name, body, in_gallery):
    control = body.get("Control", "")
    props = body.get("Properties") or {}
    if control.startswith("cmp_"):
        tag = f"Component: {control}"
        if in_gallery:
            tag += ", gallery-child"
        return tag
    base = CONTROL_NAMES.get(control.split("@")[0], control.split("@")[0])
    if base == "Gallery":
        tag = gallery_annotation(name, body, body.get("Variant"))
        return tag + (", gallery-child" if in_gallery else "")
    parts = [base]
    if base == "GroupContainer":
        parts.append(body.get("Variant") or "ManualLayout")
    parts += roles(name, base, props, in_gallery)
    return ", ".join(parts)


def tree(body, prefix, in_gallery, lines):
    kids = list(children_of(body))
    for i, (name, child) in enumerate(kids):
        last = i == len(kids) - 1
        lines.append(f"{prefix}{'└── ' if last else '├── '}{name} [{describe(name, child, in_gallery)}]")
        deeper = prefix + ("    " if last else "│   ")
        nested = in_gallery or child.get("Control", "").startswith("Gallery")
        tree(child, deeper, nested, lines)


def geometry(body):
    """Flat X / Y / Width / Height table for every control that declares any.

    The skeleton format carries hierarchy and role but no numbers, so the skill
    sizes controls itself. That is the correct default when it is working from a
    screenshot; here the numbers already exist and are already balanced against
    a 1366x768 canvas, so they are handed over rather than re-derived."""
    rows = []

    def visit(b, depth):
        for name, child in children_of(b):
            props = child.get("Properties") or {}
            if any(k in props for k in ("X", "Y", "Width", "Height")):
                rows.append((
                    "  " * depth + name,
                    *[str(props.get(k, "")).lstrip("=").strip().replace("\n", " ")
                      for k in ("X", "Y", "Width", "Height")],
                ))
            visit(child, depth + 1)

    visit(body, 0)
    if not rows:
        return ""
    widths = [max(len(r[i]) for r in rows) for i in range(5)]
    head = ("control", "X", "Y", "Width", "Height")
    widths = [max(w, len(h)) for w, h in zip(widths, head)]
    out = ["  ".join(h.ljust(w) for h, w in zip(head, widths)).rstrip(),
           "  ".join("-" * w for w in widths)]
    for r in rows:
        out.append("  ".join(c.ljust(w) for c, w in zip(r, widths)).rstrip())
    return "\n".join(out)


def screen_block(fname):
    doc = load(os.path.join(MOCKUP, fname))
    (name, body), = doc["Screens"].items()
    props = body.get("Properties") or {}
    lines = [f"Screen: {name}", "Paste target: b (new screen)", ""]
    root = list(children_of(body))
    for i, (cname, child) in enumerate(root):
        last = i == len(root) - 1
        lines.append(f"  {'└── ' if last else '├── '}{cname} [{describe(cname, child, False)}]")
        deeper = "  " + ("    " if last else "│   ")
        tree(child, deeper, child.get("Control", "").startswith("Gallery"), lines)
    count = sum(1 for line in lines if "[" in line)
    fill = props.get("Fill", "")
    return name, count, fill, "\n".join(lines), geometry(body)


TOKENS = """```
DESIGN TOKENS  (authoritative - do NOT synthesise a palette, these are the
approved Syracuse University Brand Guidelines p.23 values)

Palette (7):
  Background        RGBA(255, 255, 255, 1)    White
  Surface           RGBA(250, 251, 253, 1)    page tint behind cards
  Border            RGBA(226, 229, 234, 1)    all 1px rules and card borders
  Text-Primary      RGBA(  0,  14,  84, 1)    Navy, PMS 281C - headings
  Text-Secondary    RGBA(112, 119, 128, 1)    PMS Cool Gray 9C - body, meta
  Accent-Primary    RGBA(247, 105,   0, 1)    Orange, PMS 158C
  Accent-Secondary  RGBA(215,  65,   0, 1)    PMS 1665C - links only, WCAG AA on white

Status colours (risk bands and deadline pills, not part of the 7):
  High              RGBA(220,  38,  38, 1)
  Moderate          RGBA(217, 119,   6, 1)
  Low               RGBA( 22, 163,  74, 1)
  Unrated           RGBA(173, 179, 184, 1)    blank risk is a first-class state
Pill backgrounds are ColorFade(<status>, 0.88); the 7px dot and the text use
the status colour at full opacity.

Typography:
  Family   Verdana        (one family throughout, display and body)
  Heading  14
  Body     11
  Caption  9

Density (balanced - this is a register and a set of record views):
  LayoutGap  12
  PaddingH   16
  PaddingV   12

Radius:
  Container    0
  Interactive  0
  Every card, pill, and tile is square. This is a decision, not an oversight -
  do not round anything. BorderRadius is also not a valid property on
  Rectangle@2.3.0 or Classic/Button@2.2.0; it raises PA2108 on both.

State colours (derived from Accent-Primary):
  HoverFill       RGBA(247, 105, 0, 0.08)
  PressedFill     RGBA(247, 105, 0, 0.15)
  FocusedBorder   RGBA(247, 105, 0, 1)
  DisabledFill    RGBA(250, 251, 253, 1)
  DisabledColor   RGBA(112, 119, 128, 0.38)
Navy buttons are the exception already in the app: Fill Navy, HoverFill
RGBA(32, 50, 153, 1) (PMS 2728C), Color White.
```"""


COMPONENTS = """The app has four canvas components. Every screen embeds `cmp_Header`, so a
screen pasted into an app that does not have them will not resolve.

| Component | Custom properties (all Input unless noted) | Renders |
|---|---|---|
| `cmp_Header` | `ActiveScreen` Text, `OpenGapCount` Number | Navy utility bar, lockup, primary nav. 1366x104. |
| `cmp_RiskPill` | `Risk` Text; Output `RiskColor` Color, `RiskLabel` Text | Square chip, 74x24. High / Moderate / Low, anything else including blank renders Unrated. |
| `cmp_DuePill` | `DueDate` DateAndTime, `Complete` Boolean | Deadline chip, 104x24. Guards against deadlines with no due date. |
| `cmp_PageHead` | `Eyebrow` Text, `Title` Text, `Subtitle` Text | Page heading block. |

Two ways to handle them:

- **Preferred** - paste the four component definitions from `mockup/Components/`
  into the target app first, then generate screens that reference them by name.
  Keeps one header to tune instead of fourteen.
- **Standalone** - tell the skill to inline `cmp_Header` as a plain container of
  controls in each screen. Only do this if the target app cannot take the
  components."""


HEADER = """# Handoff brief for `canvas-apps-ui-gen`

Paste this into a session where that skill has its `reference/`, `agents/`, and
`templates/` files. It pre-answers every question the skill asks and supplies the
two artifacts it would otherwise have to invent - the structural skeleton and the
DESIGN TOKENS block - so the run is a faithful rebuild of this app rather than a
fresh interpretation of it.

**Generated from the files in `mockup/` by `tools/build_skill_brief.py`. Do not hand-edit.**

---

## How to use it

1. Invoke the skill with no image. It asks which mode - answer **3, build from
   scratch**. There is no screenshot to give it, and it does not need one: the
   geometry below is exact, where a screenshot would only be an approximation.
2. Answer its Phase 3 questions with the canned answers below.
3. Paste the **shared context** section, then the **one screen block** you want
   generated. One screen per run - the skill writes one file per invocation.

---

## Canned answers to the skill's Phase 3 questions

| Question | Answer |
|---|---|
| Where will you paste this YAML? | **(b) As a new screen** - full `Screens:` block |
| Classic or Modern (Fluent)? | **Classic.** Deliberate: the brand hex values have to render exactly, and the Fluent theme overrides them. Do not substitute Modern controls. |
| Colour palette? | **Supplied below. Do not synthesise one.** |
| Overall layout pattern? | Fixed header, then one full-bleed scrolling body. Explicit X/Y manual layout, 1366x768 tablet canvas. Not AutoLayout - see constraints. |
| Primary purpose? | Per screen: see the purpose line in each block. |
| Responsive? | **No.** Tablet only. Widths are `Parent.Width` arithmetic, not breakpoints. |
| Modifications from the design? | **None.** Replicate exactly. |

---

## Shared context - paste this with every screen

### Design tokens

"""

CONSTRAINTS = """### Constraints that override the skill's defaults

These are decisions already made and validated in this app. The skill's own
defaults conflict with several of them, so they win:

1. **Radius 0 everywhere.** The skill defaults to Container 6 / Interactive 4.
   Not here. `BorderRadius` additionally raises PA2108 on `Rectangle@2.3.0` and
   `Classic/Button@2.2.0`; the replacement is the four corner properties
   (`RadiusTopLeft` and friends), and the correct value for all of them is 0.
2. **Classic controls only.** Not a version-confidence issue - Fluent overrides
   the brand palette.
3. **Manual layout, explicit X/Y.** The skill's skeleton format is AutoLayout
   first. Every coordinate in the blocks below is real and already balanced
   against a 1366x768 canvas; keep them. AutoLayout is used only where the
   source says `GroupContainer, AutoLayout`.
4. **No emojis, no em dashes** in any string property. The app's copy has none.
5. **Blank risk is `Unrated`, a visible state.** Never let it fall through to
   Low, and never blend it into Low in a breakdown or coverage map - it gets its
   own band. 390 of 392 functions in the real data have no rating, so this is the
   common case, not an edge case.
6. **Every gallery needs its `items-cols` honoured exactly.** Those are real
   Dataverse column names. The mock `Table()` the skill generates must use them
   verbatim or the screen will not bind when the real data source is swapped in.
   A dotted entry means a nested record, not a column called `a.b`:
   `Value.su_name` says the row is `{Value: {su_name: "..."}}`. Galleries fed by
   `Distinct()` get a single column literally named `Value` - that is Power Fx's
   own naming, not a placeholder. Any `*code` or `su_email` entry at the end of
   the list is the alternate key: the screen does not display it, but the mock
   rows need it because it is what `active-col` compares against.
7. **A column that is `Blank()` in every mock row has no inferred type**, and
   dereferencing it (`ThisItem.su_owner.su_name`) throws rather than returning
   blank. Give every nullable column a typed value on at least one row.

### Components
"""


def main() -> int:
    files = sorted(f for f in os.listdir(MOCKUP)
                   if f.startswith("scr_") and f.endswith(".fx.yaml"))
    blocks = [screen_block(f) for f in files]

    purposes = {
        "scr_Home": "Landing page. Hero with search, a figures band, destination cards, and two rails: functions assigned to you and your upcoming deadlines.",
        "scr_Functions": "Searchable register of all compliance functions, with a card view and a table view.",
        "scr_FunctionDetail": "Record detail and edit view for one function, plus its deadlines, ownership, and flags. The largest screen in the app.",
        "scr_RiskAreas": "Thirteen risk areas with counts and risk distribution.",
        "scr_Domains": "Sixty-one domains, including the ones with zero functions.",
        "scr_Deadlines": "Deadline register and calendar. Only Fixed Recurring rows carry a due date.",
        "scr_Directory": "People and offices, with each person's portfolio.",
        "scr_ExecutiveTeam": "Executive view of portfolios by owner.",
        "scr_Assessments": "List of conducted assessments. Administrator only.",
        "scr_AssessmentDetail": "One assessment: date, overall risk, status, unit, owners, and the gaps it produced. Administrator only.",
        "scr_GapTracker": "Open and closed gaps with aging. Administrator only.",
        "scr_RiskDashboard": "Risk distribution, heat map, and coverage. Administrator only.",
        "scr_Reporting": "Embedded Power BI reports. Administrator only. In the mockup this is a placeholder panel.",
        "scr_NoAccess": "Courtesy message for non-administrators. Smallest screen - a good first run.",
    }

    parts = [HEADER, TOKENS, "\n", CONSTRAINTS, "\n", COMPONENTS, "\n\n---\n"]
    parts.append("\n## Screen blocks\n\nOne per run. Each is already in the "
                 "skeleton format the skill expects.\n")
    for name, count, fill, block, geom in blocks:
        parts.append(f"\n### {name}  ({count} controls)\n")
        parts.append(f"\n**Purpose.** {purposes.get(name, '')}\n")
        parts.append(f"\n**Screen `Fill`:** `{fill}`\n")
        parts.append(f"\n```\n{block}\n```\n")
        if geom:
            parts.append("\n<details><summary>Geometry - use these values, "
                         "do not re-derive them</summary>\n\n")
            parts.append(f"```\n{geom}\n```\n\n</details>\n")

    parts.append("\n---\n\n## Variable rename map\n\n")
    parts.append("The skill's format requires a `Current<Noun>` variable on every "
                 "gallery. This app uses different names, and in two cases a whole "
                 "record rather than a code. Rename after generating, or leave the "
                 "`Current*` names and wire them up later:\n\n")
    parts.append("| Skill variable | This app |\n|---|---|\n")
    for var, real in sorted(RENAME_MAP.items()):
        parts.append(f"| `{var}` | {real} |\n")

    parts.append("\n---\n\n## What not to ask the skill for\n\n")
    parts.append("`ComplianceMatrix.msapp` in the repository root already opens in "
                 "Studio with all 14 screens. Use this brief to regenerate or "
                 "redesign a screen, not to rebuild what already works.\n")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("".join(parts))

    total = sum(c for _, c, _, _, _ in blocks)
    print(f"Wrote {os.path.relpath(OUT, ROOT)}")
    print(f"  {len(blocks)} screen blocks, {total} controls described")
    with open(OUT, encoding="utf-8") as fh:
        print(f"  {sum(1 for _ in fh):,} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
