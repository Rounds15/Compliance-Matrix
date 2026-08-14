#!/usr/bin/env python3
"""
Generate Dataverse solution source from solution/schema/dataverse-schema.yaml.

Emits the unpacked solution layout that `pac solution pack` consumes:

    solution/src/
        Other/Solution.xml
        Other/Customizations.xml          global choice sets + relationships
        Entities/<logical>/Entity.xml     one per table

Usage:
    python3 tools/build_solution.py [--schema PATH] [--out PATH]

Note on validation: this script produces well-formed solution source, but the
only authoritative check is `pac solution pack` followed by an import into a
development environment. Run that before promoting anything.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import xml.etree.ElementTree as ET
from xml.dom import minidom

import yaml

LCID = "1033"
VERSION = "1.0.0.0"

# Dataverse attribute type -> (xml <Type>, extra element emitter)
TYPE_MAP = {
    "String": "nvarchar",
    "Memo": "ntext",
    "Integer": "int",
    "Boolean": "bit",
    "DateTime": "datetime",
    "Lookup": "lookup",
    "Choice": "picklist",
    "Rollup": "int",
    "Calculated": "int",
}

FORMAT_MAP = {
    "Email": "email",
    "Url": "url",
    "Phone": "phone",
    "Text": "text",
    "DateOnly": "dateonly",
}

REQUIRED_MAP = {
    "None": "none",
    "SystemRequired": "systemrequired",
    "ApplicationRequired": "required",
    "Recommended": "recommended",
}


def _sub(parent: ET.Element, tag: str, text: str | None = None, **attrs) -> ET.Element:
    el = ET.SubElement(parent, tag, {k: str(v) for k, v in attrs.items()})
    if text is not None:
        el.text = str(text)
    return el


def _localized(parent: ET.Element, wrapper: str, item: str, description: str) -> None:
    w = _sub(parent, wrapper)
    _sub(w, item, description=description, languagecode=LCID)


def _pretty(root: ET.Element) -> str:
    raw = ET.tostring(root, encoding="unicode")
    dom = minidom.parseString(raw)
    out = dom.toprettyxml(indent="  ")
    # minidom emits a bare declaration; Dataverse expects utf-8 declared.
    lines = [ln for ln in out.split("\n") if ln.strip()]
    lines[0] = '<?xml version="1.0" encoding="utf-8"?>'
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# attributes
# ---------------------------------------------------------------------------
def build_attribute(attrs_el: ET.Element, col: dict, table: dict, prefix: str) -> None:
    name = col["name"]
    ctype = col["type"]
    a = _sub(attrs_el, "attribute", PhysicalName=name)

    _sub(a, "Type", TYPE_MAP.get(ctype, "nvarchar"))
    _sub(a, "Name", name)
    _sub(a, "LogicalName", name)
    _sub(a, "RequiredLevel", REQUIRED_MAP.get(col.get("required", "None"), "none"))
    _sub(a, "DisplayMask", "ValidForAdvancedFind|ValidForForm|ValidForGrid")
    _sub(a, "ImeMode", "auto")
    _sub(a, "ValidForCreateApi", "1")
    _sub(a, "ValidForReadApi", "1")
    # Rollup and calculated columns are computed by the platform.
    editable = ctype not in ("Rollup", "Calculated")
    _sub(a, "ValidForUpdateApi", "1" if editable else "0")
    _sub(a, "IsCustomField", "1")
    _sub(a, "IsAuditEnabled", "1")
    _sub(a, "IsSecured", "0")
    _sub(a, "IntroducedVersion", VERSION)
    _sub(a, "IsCustomizable", "1")
    _sub(a, "IsRenameable", "1")
    _sub(a, "CanModifySearchSettings", "1")
    _sub(a, "CanModifyRequirementLevelSettings", "1")
    _sub(a, "CanModifyAdditionalSettings", "1")
    _sub(a, "IsGlobalFilterEnabled", "0")
    _sub(a, "IsSortableEnabled", "0")
    _sub(a, "IsDataSourceSecret", "0")
    _sub(a, "IsSearchable", "1" if ctype in ("String", "Memo") else "0")

    if ctype == "String":
        _sub(a, "MaxLength", col.get("maxLength", 100))
        _sub(a, "Format", FORMAT_MAP.get(col.get("format", "Text"), "text"))
    elif ctype == "Memo":
        _sub(a, "MaxLength", col.get("maxLength", 2000))
        _sub(a, "Format", "textarea")
    elif ctype == "Integer":
        _sub(a, "MinValue", col.get("minValue", -2147483648))
        _sub(a, "MaxValue", col.get("maxValue", 2147483647))
        _sub(a, "Format", "none")
    elif ctype == "Boolean":
        opts = _sub(a, "optionset", Name=f"{name}_optionset")
        _localized(opts, "displaynames", "displayname", col["displayName"])
        _sub(opts, "IsGlobal", "0")
        _sub(opts, "OptionSetType", "boolean")
        for value, label in ((0, "No"), (1, "Yes")):
            o = _sub(opts, "option", value=str(value))
            _localized(o, "labels", "label", label)
        _sub(a, "DefaultValue", "1" if col.get("default") else "0")
    elif ctype == "DateTime":
        fmt = col.get("format", "DateOnly")
        _sub(a, "Format", "dateonly" if fmt == "DateOnly" else "datetime")
        _sub(a, "Behavior", "1" if fmt == "DateOnly" else "0")
        _sub(a, "CanChangeDateTimeBehavior", "0")
    elif ctype == "Lookup":
        _sub(a, "LookupStyle", "single")
        lookups = _sub(a, "lookupTypes")
        _sub(lookups, "lookupType", id="{00000000-0000-0000-0000-000000000000}",
             name=col["target"])
    elif ctype == "Choice":
        # Reference to a global option set defined in Customizations.xml.
        opts = _sub(a, "optionset", Name=col["choice"])
        _sub(opts, "IsGlobal", "1")
        _sub(opts, "OptionSetType", "picklist")
    elif ctype == "Rollup":
        r = col["rollup"]
        _sub(a, "IsRollupAttribute", "1")
        _sub(a, "RollupAggregate", r["aggregate"])
        _sub(a, "RollupRelatedEntity", r["relatedTable"])
        _sub(a, "RollupRelationship", r["relationship"])
        if r.get("aggregateColumn"):
            _sub(a, "RollupAggregateAttribute", r["aggregateColumn"])
        _sub(a, "MinValue", -2147483648)
        _sub(a, "MaxValue", 2147483647)
        _sub(a, "Format", "none")
    elif ctype == "Calculated":
        c = col["calculated"]
        _sub(a, "IsCalculatedAttribute", "1")
        _sub(a, "CalculatedFieldFormula", " ".join(c["formula"].split()))
        _sub(a, "MinValue", -2147483648)
        _sub(a, "MaxValue", 2147483647)
        _sub(a, "Format", "none")

    _localized(a, "displaynames", "displayname", col["displayName"])
    if col.get("description"):
        _localized(a, "Descriptions", "Description",
                   " ".join(col["description"].split()))


# ---------------------------------------------------------------------------
# entities
# ---------------------------------------------------------------------------
def build_entity(logical: str, table: dict, prefix: str) -> ET.Element:
    root = ET.Element("Entity")
    _sub(root, "Name", logical,
         LocalizedName=table["displayName"],
         OriginalName=table["displayName"])

    info = _sub(root, "EntityInfo")
    ent = _sub(info, "entity", Name=logical)

    _localized(ent, "LocalizedNames", "LocalizedName", table["displayName"])
    _localized(ent, "LocalizedCollectionNames", "LocalizedCollectionName",
               table["displayCollectionName"])
    if table.get("description"):
        _localized(ent, "Descriptions", "Description",
                   " ".join(table["description"].split()))

    attrs = _sub(ent, "attributes")
    for col in table["columns"]:
        build_attribute(attrs, col, table, prefix)

    # Entity-level settings
    _sub(ent, "EntitySetName", logical + "s")
    _sub(ent, "IsDuplicateCheckSupported", "1")
    _sub(ent, "IsBusinessProcessEnabled", "0")
    _sub(ent, "IsRenameable", "1")
    _sub(ent, "IsCustomizable", "1")
    _sub(ent, "IsMappable", "1")
    _sub(ent, "IsAuditEnabled", "1")
    _sub(ent, "IsActivity", "0")
    _sub(ent, "IsAvailableOffline", "1")
    _sub(ent, "IsVisibleInMobile", "1")
    _sub(ent, "IsVisibleInMobileClient", "1")
    _sub(ent, "IsConnectionsEnabled", "0")
    _sub(ent, "IsDocumentManagementEnabled", "0")
    _sub(ent, "IsMailMergeEnabled", "0")
    _sub(ent, "IsCustomEntity", "1")
    _sub(ent, "IsQuickCreateEnabled", "1")
    _sub(ent, "IntroducedVersion", VERSION)
    _sub(ent, "OwnershipTypeMask", table.get("ownership", "UserOwned"))
    _sub(ent, "PrimaryNameAttribute", table["primaryName"])
    _sub(ent, "HasNotes", "1" if table.get("hasNotes") else "0")
    _sub(ent, "HasActivities", "1" if table.get("hasActivities") else "0")
    _sub(ent, "IsChildEntity", "0")

    return root


# ---------------------------------------------------------------------------
# customizations (global choices + relationships)
# ---------------------------------------------------------------------------
def build_customizations(schema: dict) -> ET.Element:
    root = ET.Element("ImportExportXml", {
        "version": VERSION,
        "SolutionPackageVersion": "9.2",
        "languagecode": LCID,
        "generatedBy": "ComplianceMatrix build_solution.py",
    })

    _sub(root, "Entities")
    _sub(root, "Roles")
    _sub(root, "Workflows")
    _sub(root, "FieldSecurityProfiles")
    _sub(root, "Templates")
    _sub(root, "EntityMaps")

    # -- global option sets --------------------------------------------------
    osets = _sub(root, "optionsets")
    for name, choice in schema["choices"].items():
        o = _sub(osets, "optionset", Name=name, localizedName=choice["displayName"],
                 OptionSetType="picklist", IsCustomizable="1", IntroducedVersion=VERSION)
        _localized(o, "displaynames", "displayname", choice["displayName"])
        if choice.get("description"):
            _localized(o, "Descriptions", "Description",
                       " ".join(choice["description"].split()))
        options = _sub(o, "options")
        for opt in choice["options"]:
            oe = _sub(options, "option", value=str(opt["value"]))
            if opt.get("color"):
                oe.set("Color", opt["color"])
            _localized(oe, "labels", "label", opt["label"])

    # -- relationships -------------------------------------------------------
    rels = _sub(root, "EntityRelationships")
    for logical, table in schema["tables"].items():
        for col in table["columns"]:
            if col["type"] != "Lookup" or col["target"] == "systemuser":
                continue
            rel_name = col.get(
                "relationshipName",
                f"{col['target']}_{logical}_{col['name']}",
            )
            r = _sub(rels, "EntityRelationship", Name=rel_name)
            _sub(r, "EntityRelationshipType", "OneToMany")
            _sub(r, "IsCustomizable", "1")
            _sub(r, "IntroducedVersion", VERSION)
            _sub(r, "ReferencingEntityName", logical)
            _sub(r, "ReferencedEntityName", col["target"])
            _sub(r, "ReferencingAttributeName", col["name"])
            _sub(r, "RelationshipDescription")
            cascade = col.get("cascade", {})
            c = _sub(r, "CascadeLinks")
            _sub(c, "CascadeAssign", "NoCascade")
            _sub(c, "CascadeDelete", cascade.get("delete", "RemoveLink"))
            _sub(c, "CascadeReparent", "NoCascade")
            _sub(c, "CascadeShare", "NoCascade")
            _sub(c, "CascadeUnshare", "NoCascade")
            _sub(c, "CascadeMerge", "NoCascade")

    _sub(root, "Languages").append(ET.Element("Language", {"code": LCID}))
    return root


def build_solution_xml(schema: dict) -> ET.Element:
    pub = schema["publisher"]
    sol = schema["solution"]

    root = ET.Element("ImportExportXml", {
        "version": VERSION,
        "SolutionPackageVersion": "9.2",
        "languagecode": LCID,
        "generatedBy": "ComplianceMatrix build_solution.py",
    })
    m = _sub(root, "SolutionManifest")
    _sub(m, "UniqueName", sol["uniqueName"])
    _localized(m, "LocalizedNames", "LocalizedName", sol["displayName"])
    _localized(m, "Descriptions", "Description", " ".join(sol["description"].split()))
    _sub(m, "Version", sol["version"])
    _sub(m, "Managed", "1" if sol.get("managed") else "0")

    p = _sub(m, "Publisher")
    _sub(p, "UniqueName", pub["name"])
    _localized(p, "LocalizedNames", "LocalizedName", pub["displayName"])
    _sub(p, "CustomizationPrefix", pub["prefix"])
    _sub(p, "CustomizationOptionValuePrefix", str(pub["optionValuePrefix"]))

    comps = _sub(m, "RootComponents")
    for logical in schema["tables"]:
        _sub(comps, "RootComponent", type="1", schemaName=logical, behavior="0")
    for choice in schema["choices"]:
        _sub(comps, "RootComponent", type="9", schemaName=choice, behavior="0")

    _sub(m, "MissingDependencies")
    return root


# ---------------------------------------------------------------------------
def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--schema", type=pathlib.Path,
                    default=pathlib.Path("solution/schema/dataverse-schema.yaml"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("solution/src"))
    args = ap.parse_args(argv)

    if not args.schema.is_file():
        print(f"error: schema not found: {args.schema}", file=sys.stderr)
        return 1

    schema = yaml.safe_load(args.schema.read_text(encoding="utf-8"))
    prefix = schema["publisher"]["prefix"]

    other = args.out / "Other"
    other.mkdir(parents=True, exist_ok=True)

    (other / "Solution.xml").write_text(_pretty(build_solution_xml(schema)), encoding="utf-8")
    print(f"  {other / 'Solution.xml'}")

    (other / "Customizations.xml").write_text(
        _pretty(build_customizations(schema)), encoding="utf-8"
    )
    print(f"  {other / 'Customizations.xml'}")

    col_total = 0
    for logical, table in schema["tables"].items():
        d = args.out / "Entities" / logical
        d.mkdir(parents=True, exist_ok=True)
        (d / "Entity.xml").write_text(
            _pretty(build_entity(logical, table, prefix)), encoding="utf-8"
        )
        n = len(table["columns"])
        col_total += n
        print(f"  {d / 'Entity.xml'}  ({n} columns)")

    print(
        f"\n{len(schema['tables'])} tables, {col_total} columns, "
        f"{len(schema['choices'])} global choice sets."
    )
    print("Next: pac solution pack --zipfile ComplianceMatrix.zip "
          f"--folder {args.out} --packagetype Unmanaged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
