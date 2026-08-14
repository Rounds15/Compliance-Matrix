#!/usr/bin/env python3
"""Build a binary ComplianceMatrix.msapp from the canvas source.

Power Apps Studio opens .msapp directly; it will not open .pa.yaml. The modern
`pac canvas pack --layout SourceCode` path refuses to run on hand-authored
sources - it requires a .msapr companion file that only Studio produces - so
this builds the older "Experimental" source layout instead, which pac can pack
from nothing but files on disk.

That layout is a different dialect from the SchemaV3 .pa.yaml in mockup/:

    SchemaV3                         Experimental
    ------------------------------   ----------------------------------
    - lbl_Title:                     lbl_Title As label:
        Control: Label@2.5.1             Text: ="Hello"
        Properties:
          Text: ="Hello"
    Control: cmp_Header              cmp_HeaderHome As cmp_Header:
    ComponentDefinitions: cmp_X      cmp_X As CanvasComponent:  (+ sidecar json)

Everything else - control unique ids, publish order, style names, the theme,
the checksum, the template store - has to be supplied as separate files. This
script writes all of them, then shells out to `pac canvas pack`.

    python3 tools/build_msapp.py [--sources mockup] [--out ComplianceMatrix.msapp]

Requires the `pac` CLI on PATH. Run tools/build_mockup.py first if the canvas
source has changed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Control mapping
# ---------------------------------------------------------------------------
# SchemaV3 pins "Template@version"; the classic layout uses the bare template
# name plus an optional variant, and carries the version separately. Style
# names come from the default theme - a control with a style the theme does not
# define makes the packer throw on lookup, so anything not listed here gets "".

TEMPLATES = {
    "Label":             {"template": "label",          "version": "2.5.1",  "style": "defaultLabelStyle"},
    "Rectangle":         {"template": "rectangle",      "version": "2.3.0",  "style": "defaultRectangleStyle"},
    "Classic/Button":    {"template": "button",         "version": "2.2.0",  "style": "defaultButtonStyle"},
    "Image":             {"template": "image",          "version": "2.2.3",  "style": "defaultImageStyle"},
    "Classic/TextInput": {"template": "text",           "version": "2.3.2",  "style": "defaultTextStyle"},
    "Classic/DropDown":  {"template": "dropdown",       "version": "2.3.1",  "style": "defaultDropdownStyle"},
    "Classic/ComboBox":  {"template": "combobox",       "version": "2.4.0",  "style": "defaultComboBoxStyle"},
    "HtmlViewer":        {"template": "htmlViewer",     "version": "2.1.0",  "style": "defaultHtmlViewerStyle"},
    "Gallery": {
        "template": "gallery", "version": "2.15.0", "style": "defaultGalleryStyle",
        "variants": {"Vertical": "galleryVertical", "Horizontal": "galleryHorizontal"},
    },
    "GroupContainer": {
        "template": "groupContainer", "version": "1.5.0", "style": "",
        "variants": {
            "ManualLayout": "manualLayoutContainer",
            "AutoLayout": "verticalAutoLayoutContainer",
        },
    },
}

# Custom component property types, as the one-letter keys the msapp stores.
DATA_TYPE_KEYS = {
    "Text": "s",
    "Number": "n",
    "Boolean": "b",
    "DateAndTime": "d",
    "Color": "c",
    "Screen": "h",
    "Record": "r",
    "Table": "t",
    "Image": "i",
    "Media": "m",
    "Currency": "$",
}

# galleryTemplate is the only template the packer will not synthesise: its
# transform dereferences the template object unconditionally, so a gallery in
# the source NREs unless a parsed template exists. The packer only needs the
# widget envelope - InputDefaults selects which gallery properties migrate onto
# the template child, and none of ours do.
GALLERY_TEMPLATE_XML = """<?xml version="1.0" encoding="utf-8"?>
<widget xmlns="http://openajax.org/metadata"
        name="galleryTemplate"
        id="http://microsoft.com/appmagic/galleryTemplate"
        version="2.15.0">
  <properties>
  </properties>
</widget>
"""


class BuildError(Exception):
    pass


# ---------------------------------------------------------------------------
# Reading the SchemaV3 source
# ---------------------------------------------------------------------------

def load_yaml(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        try:
            return yaml.safe_load(fh) or {}
        except yaml.YAMLError as exc:
            raise BuildError(f"{os.path.relpath(path, ROOT)}: {exc}") from exc


def child_entries(children):
    """SchemaV3 children are a list of single-key maps; yield (name, body)."""
    for entry in children or []:
        if not isinstance(entry, dict) or len(entry) != 1:
            raise BuildError(f"malformed child entry: {entry!r}")
        (name, body), = entry.items()
        yield name, (body or {})


# ---------------------------------------------------------------------------
# Writing the classic dialect
# ---------------------------------------------------------------------------

def emit_property(name: str, value, indent: str, out: list) -> None:
    """One property. Single-line stays inline; anything multi-line becomes a
    block scalar, which is the only multi-line form the classic parser takes."""
    text = str(value)
    if not text.startswith("="):
        text = "=" + text
    lines = text.rstrip("\n").split("\n")
    if len(lines) == 1:
        out.append(f"{indent}{name}: {lines[0]}")
        return
    out.append(f"{indent}{name}: |")
    body = indent + "    "
    for line in lines:
        # A truly empty line closes the block for the classic parser, and the
        # next line then reads as a property at the wrong indent. Blank lines
        # inside a formula keep the block open only if they carry the body
        # indent, so they are written as whitespace rather than dropped - some
        # of them sit inside multi-line string literals.
        out.append(body + line.rstrip() if line.strip() else body)


def resolve_template(control: str, variant, path: str):
    """SchemaV3 'Label@2.5.1' or 'cmp_Header' -> (type name, version, style)."""
    if control.startswith("cmp_"):
        return control, None, None  # component instance; style filled in later
    base = control.split("@")[0]
    spec = TEMPLATES.get(base)
    if spec is None:
        raise BuildError(f"{path}: no classic template mapping for '{control}'")
    type_name = spec["template"]
    if variant:
        mapped = spec.get("variants", {}).get(variant)
        if mapped is None:
            raise BuildError(f"{path}: unknown variant '{variant}' for '{base}'")
        type_name = f"{type_name}.{mapped}"
    return type_name, spec["version"], spec["style"]


class Builder:
    def __init__(self):
        self.states = {}          # top parent name -> {control name: state}
        self.templates = {}       # classic template name -> version
        self.unique_ids = {}      # control name -> int
        self.next_id = 1
        self.component_styles = {}  # cmp name -> style name

    def new_id(self, name: str) -> int:
        if name in self.unique_ids:
            raise BuildError(f"duplicate control name '{name}'")
        self.unique_ids[name] = self.next_id
        self.next_id += 1
        return self.unique_ids[name]

    def walk(self, name, body, top, out, depth, parent_index, path):
        """Emit one control and its subtree into `out`."""
        control = body.get("Control")
        if control is None:
            raise BuildError(f"{path}: control '{name}' has no Control:")
        type_name, version, style = resolve_template(control, body.get("Variant"), path)
        if version:
            self.templates[type_name.split(".")[0]] = version
        if style is None:  # component instance
            style = self.component_styles.get(control, "")

        indent = "    " * depth
        out.append(f"{indent}{name} As {type_name}:")
        props = body.get("Properties") or {}
        for prop, value in props.items():
            emit_property(prop, value, indent + "    ", out)
        out.append("")

        self.new_id(name)
        self.states.setdefault(top, {})[name] = {
            "Name": name,
            "ParentIndex": parent_index,
            "IsGroupControl": False,
            "StyleName": style,
            "ExtensionData": {},
            "Properties": [{"PropertyName": p, "RuleProviderType": "Unknown"} for p in props],
        }

        for i, (child_name, child_body) in enumerate(child_entries(body.get("Children")), 1):
            self.walk(child_name, child_body, top, out, depth + 1, i, path)

    # -- screens ------------------------------------------------------------
    def screen(self, name, body, path):
        out = [f"{name} As screen:"]
        props = body.get("Properties") or {}
        for prop, value in props.items():
            emit_property(prop, value, "    ", out)
        out.append("")
        self.new_id(name)
        self.states.setdefault(name, {})[name] = {
            "Name": name,
            "ParentIndex": 0,
            "IsGroupControl": False,
            "StyleName": "defaultScreenStyle",
            "ExtensionData": {},
            "Properties": [{"PropertyName": p, "RuleProviderType": "Unknown"} for p in props],
        }
        for i, (child_name, child_body) in enumerate(child_entries(body.get("Children")), 1):
            self.walk(child_name, child_body, name, out, 1, i, path)
        return "\n".join(out).rstrip() + "\n"

    # -- components ---------------------------------------------------------
    def component(self, name, body, path, guid):
        """Component definition yaml plus the sidecar template manifest.

        The template is keyed in source by the component's own name but carries
        a different Name, because the packer renames key -> Name on write and a
        rename onto an existing key is a no-op the packer treats as failure.
        """
        style = f"default{guid}Style"
        self.component_styles[name] = style

        out = [f"{name} As CanvasComponent:"]
        props = body.get("Properties") or {}
        for prop, value in props.items():
            emit_property(prop, value, "    ", out)
        out.append("")
        self.new_id(name)
        self.states.setdefault(name, {})[name] = {
            "Name": name,
            "ParentIndex": 0,
            "IsGroupControl": False,
            "IsComponentDefinition": True,
            "AllowAccessToGlobals": True,
            "StyleName": style,
            "ExtensionData": {},
            "Properties": [{"PropertyName": p, "RuleProviderType": "Unknown"} for p in props],
        }
        for i, (child_name, child_body) in enumerate(child_entries(body.get("Children")), 1):
            self.walk(child_name, child_body, name, out, 1, i, path)

        custom = []
        for prop_name, spec in (body.get("CustomProperties") or {}).items():
            data_type = (spec or {}).get("DataType", "Text")
            key = DATA_TYPE_KEYS.get(data_type)
            if key is None:
                raise BuildError(f"{path}: unmapped DataType '{data_type}' on {name}.{prop_name}")
            entry = {"Name": prop_name, "PropertyDataTypeKey": key, "Tooltip": ""}
            if (spec or {}).get("DisplayName"):
                entry["DisplayName"] = spec["DisplayName"]
            custom.append(entry)

        # AllowAccessToGlobals is true regardless of the SchemaV3 AccessAppScope
        # flag: every component here reads gblTheme, and a component denied app
        # scope cannot see it.
        manifest = {
            "ComponentAllowCustomization": bool(body.get("AllowCustomization", True)),
            "ComponentChangedSinceFileImport": True,
            "ComponentManifest": {
                "AllowAccessToGlobals": True,
                "Name": name,
                "TemplateGuid": guid,
            },
            "ComponentType": "CanvasComponent",
            "CustomProperties": custom,
            "FirstParty": False,
            "Id": "http://microsoft.com/appmagic/Component",
            "IsComponentLocked": False,
            "IsComponentTemplate": True,
            "IsPcfControl": False,
            "IsWidgetTemplate": False,
            "LastModifiedTimestamp": "0",
            "Name": guid,
            "TemplateOriginalName": guid,
            "Version": "1.0",
        }
        return "\n".join(out).rstrip() + "\n", manifest


# ---------------------------------------------------------------------------
# Assembling the source tree
# ---------------------------------------------------------------------------

def component_guid(index: int) -> str:
    """Stable, deterministic template ids - a rebuild must not churn the file."""
    return f"c0mp0nen7-0000-4000-8000-{index:012d}"


def default_theme(dest: str) -> None:
    """The packer needs a theme; its own default lives inside the CLI as an
    embedded resource, and the source layout requires it as Src/Themes.json."""
    local = os.path.join(ROOT, "tools", "DefaultTheme.json")
    if os.path.exists(local):
        shutil.copyfile(local, dest)
        return
    raise BuildError(
        "tools/DefaultTheme.json is missing - it is the canvas default theme "
        "and Src/Themes.json cannot be generated without it"
    )


def build_sources(src_dir: str, work: str, app_name: str) -> None:
    builder = Builder()

    os.makedirs(os.path.join(work, "Src", "EditorState"), exist_ok=True)
    os.makedirs(os.path.join(work, "Src", "Components"), exist_ok=True)
    os.makedirs(os.path.join(work, "Connections"), exist_ok=True)
    os.makedirs(os.path.join(work, "Entropy"), exist_ok=True)
    os.makedirs(os.path.join(work, "pkgs"), exist_ok=True)
    os.makedirs(os.path.join(work, "Assets"), exist_ok=True)

    # App -------------------------------------------------------------------
    app_doc = load_yaml(os.path.join(src_dir, "App.fx.yaml"))
    app_props = (app_doc.get("App") or {}).get("Properties") or {}
    out = ["App As appinfo:"]
    for prop, value in app_props.items():
        emit_property(prop, value, "    ", out)
    builder.unique_ids["App"] = 0  # placeholder, rewritten below
    with open(os.path.join(work, "Src", "App.fx.yaml"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out).rstrip() + "\n")
    builder.states["App"] = {
        "App": {
            "Name": "App",
            "ParentIndex": 0,
            "IsGroupControl": False,
            "StyleName": "defaultAppinfoStyle",
            "ExtensionData": {},
            "Properties": [{"PropertyName": p, "RuleProviderType": "Unknown"} for p in app_props],
        }
    }

    # Components ------------------------------------------------------------
    comp_dir = os.path.join(src_dir, "Components")
    comp_files = sorted(f for f in os.listdir(comp_dir) if f.endswith(".fx.yaml"))
    for index, fname in enumerate(comp_files, 1):
        path = os.path.join(comp_dir, fname)
        doc = load_yaml(path)
        defs = doc.get("ComponentDefinitions") or {}
        if len(defs) != 1:
            raise BuildError(f"{fname}: expected exactly one component definition")
        (name, body), = defs.items()
        text, manifest = builder.component(name, body, fname, component_guid(index))
        with open(os.path.join(work, "Src", "Components", f"{name}.fx.yaml"), "w", encoding="utf-8") as fh:
            fh.write(text)
        with open(os.path.join(work, "Src", "Components", f"{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2, sort_keys=True)

    # Screens ---------------------------------------------------------------
    screen_files = sorted(f for f in os.listdir(src_dir)
                          if f.startswith("scr_") and f.endswith(".fx.yaml"))
    screen_order = []
    for fname in screen_files:
        doc = load_yaml(os.path.join(src_dir, fname))
        screens = doc.get("Screens") or {}
        if len(screens) != 1:
            raise BuildError(f"{fname}: expected exactly one screen")
        (name, body), = screens.items()
        screen_order.append(name)
        with open(os.path.join(work, "Src", f"{name}.fx.yaml"), "w", encoding="utf-8") as fh:
            fh.write(builder.screen(name, body, fname))

    # Home first, so the app opens on it.
    if "scr_Home" in screen_order:
        screen_order.remove("scr_Home")
        screen_order.insert(0, "scr_Home")

    for top, states in builder.states.items():
        with open(os.path.join(work, "Src", "EditorState", f"{top}.editorstate.json"),
                  "w", encoding="utf-8") as fh:
            json.dump({"TopParentName": top, "ControlStates": states}, fh, indent=2)

    default_theme(os.path.join(work, "Src", "Themes.json"))
    with open(os.path.join(work, "pkgs", "galleryTemplate_2.15.0.xml"), "w", encoding="utf-8") as fh:
        fh.write(GALLERY_TEMPLATE_XML)

    # Templates for the first-party controls actually used. appinfo, screen and
    # groupContainer are added by the packer itself and must not be repeated.
    control_templates = {}
    for name, version in sorted(builder.templates.items()):
        if name in ("appinfo", "screen", "groupContainer"):
            continue
        control_templates[name] = {
            "FirstParty": True,
            "Id": f"http://microsoft.com/appmagic/{name}",
            "IsComponentTemplate": False,
            "IsPcfControl": False,
            "IsWidgetTemplate": False,
            "LastModifiedTimestamp": "0",
            "Name": name,
            "Version": version,
        }
    with open(os.path.join(work, "ControlTemplates.json"), "w", encoding="utf-8") as fh:
        json.dump(control_templates, fh, indent=2, sort_keys=True)

    # Control ids: App is pinned to 1, everything else numbered from 2 in the
    # order it was walked. Publish order puts screens first, then App.
    unique_ids = {"App": 1}
    n = 2
    for name in builder.unique_ids:
        if name == "App":
            continue
        unique_ids[name] = n
        n += 1
    publish = {name: i for i, name in enumerate(screen_order, 1)}
    publish["App"] = len(screen_order) + 1

    with open(os.path.join(work, "Entropy", "Entropy.json"), "w", encoding="utf-8") as fh:
        json.dump({"ControlUniqueIds": unique_ids, "PublishOrderIndices": publish},
                  fh, indent=2, sort_keys=True)
    with open(os.path.join(work, "Entropy", "Checksum.json"), "w", encoding="utf-8") as fh:
        json.dump({}, fh)
    with open(os.path.join(work, "Connections", "Connections.json"), "w", encoding="utf-8") as fh:
        json.dump({}, fh)
    with open(os.path.join(work, "ComponentReferences.json"), "w", encoding="utf-8") as fh:
        json.dump([], fh)

    manifest = {
        "FormatVersion": "0.30",
        "Header": {
            "DocVersion": "1.331",
            "MinVersionToLoad": "1.321",
            "MSAppStructureVersion": "2.0",
        },
        "Properties": {
            "AppCreationSource": "AppFromScratch",
            "AppDescription": "Syracuse University Office of Compliance and Enterprise "
                              "Risk Management - compliance matrix.",
            "Author": "",
            "DocumentAppType": "DesktopOrTablet",
            "DocumentLayoutHeight": 768,
            "DocumentLayoutOrientation": "landscape",
            "DocumentLayoutWidth": 1366,
            "DocumentType": "App",
            "FileID": "5e83f2c1-4f6a-4c0e-9d4f-5c0a2b6d7e81",
            "Id": "1c6f4a90-8b2d-4e35-9f77-2a1b3c4d5e6f",
            "LocalDatabaseReferences": "{}",
            "Name": app_name,
        },
        "PublishInfo": {
            "AppName": app_name,
            "BackgroundColor": "rgba(0, 14, 84, 1)",
            "PublishDataLocally": False,
            "PublishResourcesLocally": False,
        },
        "ScreenOrder": screen_order,
    }
    with open(os.path.join(work, "CanvasManifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    return len(screen_order), len(comp_files), builder.next_id - 1


def pack(work: str, out_path: str) -> None:
    if shutil.which("pac") is None:
        raise BuildError("the `pac` CLI is not on PATH")
    if os.path.exists(out_path):
        os.remove(out_path)
    result = subprocess.run(
        ["pac", "canvas", "pack", "--sources", work, "--msapp", out_path,
         "--layout", "Experimental"],
        capture_output=True, text=True,
    )
    noise = re.compile(r"^(The Experimental|Pack from|Microsoft PowerPlatform|Version:|"
                       r"Online documentation|Feedback,|\s*$|\s+source format)")
    for line in (result.stdout + result.stderr).splitlines():
        if not noise.match(line):
            print("  " + line)
    if result.returncode != 0 or not os.path.exists(out_path):
        raise BuildError("pac canvas pack failed")


def verify(out_path: str) -> None:
    """Round-trip through pac's own reader. Its unpack re-serialises the app and
    compares, so a clean unpack means the archive is internally consistent."""
    tmp = tempfile.mkdtemp(prefix="msapp-verify-")
    shutil.rmtree(tmp)
    result = subprocess.run(
        ["pac", "canvas", "unpack", "--msapp", out_path, "--sources", tmp],
        capture_output=True, text=True,
    )
    blob = result.stdout + result.stderr
    shutil.rmtree(tmp, ignore_errors=True)
    if result.returncode != 0 or re.search(r"\bError\b|Exception", blob):
        for line in blob.splitlines():
            if re.search(r"\bError\b|Exception", line):
                print("  " + line)
        raise BuildError("round-trip verification failed")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sources", default=os.path.join(ROOT, "mockup"))
    ap.add_argument("--out", default=os.path.join(ROOT, "ComplianceMatrix.msapp"))
    ap.add_argument("--name", default="Compliance Matrix")
    ap.add_argument("--keep", metavar="DIR",
                    help="also write the intermediate classic sources here")
    args = ap.parse_args()

    work = tempfile.mkdtemp(prefix="msapp-build-")
    try:
        screens, comps, controls = build_sources(args.sources, work, args.name)
        print(f"Converted {screens} screens, {comps} components, {controls} controls")
        if args.keep:
            if os.path.exists(args.keep):
                shutil.rmtree(args.keep)
            shutil.copytree(work, args.keep)
            print(f"Classic sources kept in {args.keep}")
        pack(work, args.out)
        verify(args.out)
        size = os.path.getsize(args.out)
        print(f"Wrote {os.path.relpath(args.out, ROOT)} ({size:,} bytes), round-trip verified")
    except BuildError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
