#!/usr/bin/env python3
"""
Generate Dataverse solution source from solution/schema/dataverse-schema.yaml.

Emits the unpacked layout that `pac solution pack` consumes, in the same shape
`pac solution unpack` produces from a real export:

    solution/src/
        Other/Solution.xml                 manifest, publisher, root components
        Other/Customizations.xml           section placeholders + <Languages>
        Other/Relationships.xml            index of relationship names
        Other/Relationships/<Table>.xml    relationships, grouped by the table
                                           the lookup points at
        OptionSets/<name>.xml              one per global choice
        Entities/<logical>/Entity.xml      one per table, with its primary key
                                           and system columns

The element order and the system columns follow a real solution export
(tools/solution_templates/). check_solution() re-reads the output and fails the
build on anything a Dataverse import is known to reject, including the
<Language> code, which must be element text.

Usage:
    python3 tools/build_solution.py [--schema PATH] [--out PATH]

Columns of type Rollup or Calculated are not written to the solution. They are
added by hand after import (docs/DATAVERSE-MIGRATION.md, section 2).
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import string
import sys
import xml.etree.ElementTree as ET
from xml.dom import minidom

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_flows  # noqa: E402 - the solution's cloud flows

LCID = "1033"
VERSION = "1.0"
XSI = "http://www.w3.org/2001/XMLSchema-instance"
TEMPLATES = pathlib.Path(__file__).resolve().parent / "solution_templates"

# Column types that are created by hand after import, never by the solution.
MANUAL_TYPES = ("Rollup", "Calculated")

TYPE_MAP = {
    "String": "nvarchar",
    "Memo": "ntext",
    "Integer": "int",
    "Decimal": "decimal",
    "Boolean": "bit",
    "DateTime": "datetime",
    "Lookup": "lookup",
    "Choice": "picklist",
}

STRING_FORMATS = {"Text": "text", "Email": "email", "Url": "url", "Phone": "phone"}

# Custom columns cannot be system required; the primary name column of a
# custom table is application required, as in an export.
REQUIRED_MAP = {
    "None": "none",
    "SystemRequired": "required",
    "ApplicationRequired": "required",
    "Recommended": "recommended",
}

# Schema names a solution export uses for the system tables we point at.
SYSTEM_TABLES = {"systemuser": "SystemUser", "contact": "Contact"}

# The SharePoint item ID a migrated row came from (docs/DATAVERSE-MIGRATION.md).
LEGACY_COLUMN = {
    "name": "su_legacyspid",
    "displayName": "Legacy SharePoint ID",
    "type": "Integer",
    "minValue": 0,
    "description": "The SharePoint list item ID this row was loaded from. "
                   "Alternate key; the dataflows upsert on it.",
}


def columns_of(table: dict) -> list[dict]:
    """The table's columns, with the legacy ID column added where asked."""
    cols = list(table["columns"])
    if table.get("legacyKey") and not any(c["name"] == LEGACY_COLUMN["name"] for c in cols):
        cols.append(dict(LEGACY_COLUMN))
    return cols


def solution_columns_of(table: dict) -> list[dict]:
    """The columns the solution creates (computed columns are added by hand)."""
    return [c for c in columns_of(table) if c["type"] not in MANUAL_TYPES]


def manual_columns(schema: dict) -> list[tuple[str, dict]]:
    return [(logical, c) for logical, t in schema["tables"].items()
            for c in columns_of(t) if c["type"] in MANUAL_TYPES]


def keys_of(table: dict) -> list[dict]:
    """Alternate keys: one per column marked alternateKey, the table's own
    alternateKeys list, and the legacy ID key."""
    keys = [{"name": f"su_key_{c['name'].removeprefix('su_')}", "columns": [c["name"]],
             "displayName": c["displayName"]}
            for c in columns_of(table) if c.get("alternateKey")]
    for k in table.get("alternateKeys", []) or []:
        keys.append({"name": k["name"], "columns": list(k["columns"]),
                     "displayName": k.get("displayName", k["name"])})
    if table.get("legacyKey"):
        keys.append({"name": "su_key_legacyspid", "columns": [LEGACY_COLUMN["name"]],
                     "displayName": LEGACY_COLUMN["displayName"]})
    return keys


def relationship_name(logical: str, col: dict) -> str:
    """The schema name: the publisher prefix, the table, then the column."""
    default = f"su_{logical.removeprefix('su_')}_{col['name'].removeprefix('su_')}"
    return col.get("relationshipName", default)


def referenced_name(target: str) -> str:
    return SYSTEM_TABLES.get(target, target)


# ---------------------------------------------------------------------------
# xml helpers
# ---------------------------------------------------------------------------
def _sub(parent: ET.Element, tag: str, text: str | None = None, **attrs) -> ET.Element:
    el = ET.SubElement(parent, tag, {k: str(v) for k, v in attrs.items()})
    if text is not None:
        el.text = str(text)
    return el


def _localized(parent: ET.Element, wrapper: str, item: str, description: str) -> None:
    w = _sub(parent, wrapper)
    _sub(w, item, description=description, languagecode=LCID)


def _flat(text: str | None) -> str:
    return " ".join((text or "").split())


def _root(tag: str, **attrs) -> ET.Element:
    root = ET.Element(tag, {k: str(v) for k, v in attrs.items()})
    root.set("xmlns:xsi", XSI)
    return root


def _pretty(root: ET.Element) -> str:
    raw = ET.tostring(root, encoding="unicode")
    out = minidom.parseString(raw).toprettyxml(indent="  ")
    lines = [ln for ln in out.split("\n") if ln.strip()]
    lines[0] = '<?xml version="1.0" encoding="utf-8"?>'
    return "\n".join(lines) + "\n"


def _template(name: str, **values) -> list[ET.Element]:
    text = string.Template((TEMPLATES / name).read_text(encoding="utf-8")).substitute(values)
    return list(ET.fromstring(text.split("?>", 1)[1]))


# ---------------------------------------------------------------------------
# attributes
# ---------------------------------------------------------------------------
def build_attribute(attrs_el: ET.Element, col: dict, table: dict, logical: str) -> None:
    name = col["name"]
    ctype = col["type"]
    primary = name == table["primaryName"]
    if ctype not in TYPE_MAP:
        raise SystemExit(f"error: {logical}.{name}: unsupported column type {ctype}")

    a = _sub(attrs_el, "attribute", PhysicalName=name)
    _sub(a, "Type", TYPE_MAP[ctype])
    _sub(a, "Name", name)
    _sub(a, "LogicalName", name)
    _sub(a, "RequiredLevel", "required" if primary else REQUIRED_MAP[col.get("required", "None")])
    _sub(a, "DisplayMask", "PrimaryName|ValidForAdvancedFind|ValidForForm|ValidForGrid|RequiredForForm"
         if primary else "ValidForAdvancedFind|ValidForForm|ValidForGrid")
    _sub(a, "ImeMode", "auto")
    _sub(a, "ValidForUpdateApi", "1")
    _sub(a, "ValidForReadApi", "1")
    _sub(a, "ValidForCreateApi", "1")
    _sub(a, "IsCustomField", "1")
    _sub(a, "IsAuditEnabled", "1")
    _sub(a, "IsSecured", "0")
    _sub(a, "IntroducedVersion", VERSION)
    _sub(a, "IsCustomizable", "1")
    _sub(a, "IsRenameable", "1")
    _sub(a, "CanModifySearchSettings", "1")
    _sub(a, "CanModifyRequirementLevelSettings", "1")
    _sub(a, "CanModifyAdditionalSettings", "1")
    _sub(a, "SourceType", "0")
    _sub(a, "IsGlobalFilterEnabled", "0")
    _sub(a, "IsSortableEnabled", "0")
    _sub(a, "CanModifyGlobalFilterSettings", "1")
    _sub(a, "CanModifyIsSortableSettings", "1")
    _sub(a, "IsDataSourceSecret", "0")
    _sub(a, "AutoNumberFormat", col.get("autoNumber") or "")
    _sub(a, "IsSearchable", "1" if ctype in ("String", "Memo") else "0")
    _sub(a, "IsFilterable", "0")
    _sub(a, "IsRetrievable", "1" if primary else "0")
    _sub(a, "IsLocalizable", "0")

    if ctype == "String":
        fmt = col.get("format", "Text")
        if fmt not in STRING_FORMATS:
            raise SystemExit(f"error: {logical}.{name}: unsupported text format {fmt}")
        length = int(col.get("maxLength", 100))
        _sub(a, "Format", STRING_FORMATS[fmt])
        _sub(a, "MaxLength", length)
        _sub(a, "Length", length * 2)
    elif ctype == "Memo":
        _sub(a, "Format", "")
        _sub(a, "MaxLength", col.get("maxLength", 2000))
    elif ctype == "Integer":
        _sub(a, "Format", "none")
        _sub(a, "MinValue", col.get("minValue", -2147483648))
        _sub(a, "MaxValue", col.get("maxValue", 2147483647))
    elif ctype == "Decimal":
        _sub(a, "MinValue", col.get("minValue", -100000000000))
        _sub(a, "MaxValue", col.get("maxValue", 100000000000))
        _sub(a, "Accuracy", col.get("precision", 2))
    elif ctype == "Boolean":
        _sub(a, "AppDefaultValue", "1" if col.get("default") else "0")
        o = _sub(a, "optionset", Name=f"{logical}_{name.removeprefix('su_')}")
        _sub(o, "OptionSetType", "bit")
        _sub(o, "IntroducedVersion", VERSION)
        _sub(o, "IsCustomizable", "1")
        _localized(o, "displaynames", "displayname", col["displayName"])
        _localized(o, "Descriptions", "Description", "")
        opts = _sub(o, "options")
        for value, label in (("1", "Yes"), ("0", "No")):
            oe = _sub(opts, "option", value=value, IsHidden="0")
            _localized(oe, "labels", "label", label)
    elif ctype == "DateTime":
        fmt = col.get("format", "DateOnly")
        if fmt not in ("DateOnly", "DateAndTime"):
            raise SystemExit(f"error: {logical}.{name}: unsupported date format {fmt}")
        _sub(a, "Format", "date" if fmt == "DateOnly" else "datetime")
        _sub(a, "CanChangeDateTimeBehavior", "1")
        # 1 User local, 2 Date only. Date-only values are stored without a
        # time zone, so a due date reads the same for every viewer.
        _sub(a, "Behavior", "2" if fmt == "DateOnly" else "1")
    elif ctype == "Lookup":
        _sub(a, "LookupStyle", "single")
        _sub(a, "LookupTypes")
    elif ctype == "Choice":
        _sub(a, "AppDefaultValue", "-1")
        _sub(a, "OptionSetName", col["choice"])

    _localized(a, "displaynames", "displayname", col["displayName"])
    _localized(a, "Descriptions", "Description", _flat(col.get("description")))


# ---------------------------------------------------------------------------
# entities
# ---------------------------------------------------------------------------
ENTITY_SETTINGS = [
    ("IsDuplicateCheckSupported", "1"), ("IsBusinessProcessEnabled", "0"),
    ("IsRequiredOffline", "0"), ("IsInteractionCentricEnabled", "0"),
    ("IsCollaboration", "0"), ("AutoRouteToOwnerQueue", "0"),
    ("IsConnectionsEnabled", "0"), ("EntityColor", ""),
    ("IsDocumentManagementEnabled", None), ("AutoCreateAccessTeams", "0"),
    ("IsOneNoteIntegrationEnabled", "0"), ("IsKnowledgeManagementEnabled", "0"),
    ("IsSLAEnabled", "0"), ("IsDocumentRecommendationsEnabled", "0"),
    ("IsBPFEntity", "0"), ("OwnershipTypeMask", "UserOwned"),
    ("IsAuditEnabled", "1"), ("IsRetrieveAuditEnabled", "0"),
    ("IsRetrieveMultipleAuditEnabled", "0"), ("IsActivity", "0"),
    ("ActivityTypeMask", "CommunicationActivity"), ("IsActivityParty", "0"),
    ("IsReplicated", "0"), ("IsReplicationUserFiltered", "0"),
    ("IsMailMergeEnabled", "1"), ("IsVisibleInMobile", "0"),
    ("IsVisibleInMobileClient", "0"), ("IsReadOnlyInMobileClient", "0"),
    ("IsOfflineInMobileClient", "0"), ("DaysSinceRecordLastModified", "0"),
    ("MobileOfflineFilters", ""), ("IsMapiGridEnabled", "1"),
    ("IsReadingPaneEnabled", "1"), ("IsQuickCreateEnabled", "0"),
    ("SyncToExternalSearchIndex", "0"), ("IntroducedVersion", VERSION),
    ("IsCustomizable", "1"), ("IsRenameable", "1"), ("IsMappable", "1"),
    ("CanModifyAuditSettings", "1"), ("CanModifyMobileVisibility", "1"),
    ("CanModifyMobileClientVisibility", "1"), ("CanModifyMobileClientReadOnly", "1"),
    ("CanModifyMobileClientOffline", "1"), ("CanModifyConnectionSettings", "1"),
    ("CanModifyDuplicateDetectionSettings", "1"), ("CanModifyMailMergeSettings", "1"),
    ("CanModifyQueueSettings", "1"), ("CanCreateAttributes", "1"),
    ("CanCreateForms", "1"), ("CanCreateCharts", "1"), ("CanCreateViews", "1"),
    ("CanModifyAdditionalSettings", "1"), ("CanEnableSyncToExternalSearchIndex", "1"),
    ("EnforceStateTransitions", "0"), ("CanChangeHierarchicalRelationship", "1"),
    ("EntityHelpUrlEnabled", "0"), ("EntityHelpUrl", ""),
    ("ChangeTrackingEnabled", "1"), ("CanChangeTrackingBeEnabled", "1"),
    ("IsEnabledForExternalChannels", "0"), ("IsMSTeamsIntegrationEnabled", "0"),
    ("IsSolutionAware", "0"),
]


def build_entity(logical: str, table: dict) -> ET.Element:
    display = table["displayName"]
    root = _root("Entity")
    _sub(root, "Name", logical, LocalizedName=display, OriginalName=display)

    info = _sub(root, "EntityInfo")
    ent = _sub(info, "entity", Name=logical)
    _localized(ent, "LocalizedNames", "LocalizedName", display)
    _localized(ent, "LocalizedCollectionNames", "LocalizedCollectionName",
               table["displayCollectionName"])
    _localized(ent, "Descriptions", "Description", _flat(table.get("description")))

    attrs = _sub(ent, "attributes")
    for col in solution_columns_of(table):
        build_attribute(attrs, col, table, logical)
    attrs.extend(_template("system-attributes.xml", entity=logical, display=display))

    keys = keys_of(table)
    if keys:
        ks = _sub(ent, "EntityKeys")
        for k in keys:
            ke = _sub(ks, "EntityKey")
            _sub(ke, "Name", k["name"])
            _sub(ke, "LogicalName", k["name"].lower())
            _sub(ke, "IntroducedVersion", VERSION)
            _sub(ke, "IsCustomizable", "1")
            ka = _sub(ke, "EntityKeyAttributes")
            for c in k["columns"]:
                _sub(ka, "AttributeName", c)
            _localized(ke, "displaynames", "displayname", k["displayName"])

    _sub(ent, "EntitySetName", logical + "s")
    for tag, value in ENTITY_SETTINGS:
        if tag == "IsDocumentManagementEnabled":
            value = "1" if table.get("documentManagement") else "0"
        _sub(ent, tag, value)

    _sub(root, "FormXml")
    _sub(root, "SavedQueries")
    _sub(root, "RibbonDiffXml")
    return root


# ---------------------------------------------------------------------------
# global choices
# ---------------------------------------------------------------------------
def build_optionset(name: str, choice: dict) -> ET.Element:
    o = _root("optionset", Name=name, localizedName=choice["displayName"])
    _sub(o, "OptionSetType", "picklist")
    _sub(o, "IsGlobal", "1")
    _sub(o, "IntroducedVersion", VERSION)
    _sub(o, "IsCustomizable", "1")
    _localized(o, "displaynames", "displayname", choice["displayName"])
    _localized(o, "Descriptions", "Description", _flat(choice.get("description")))
    options = _sub(o, "options")
    for opt in choice["options"]:
        oe = _sub(options, "option", value=str(opt["value"]), IsHidden="0")
        _localized(oe, "labels", "label", opt["label"])
    return o


# ---------------------------------------------------------------------------
# relationships
# ---------------------------------------------------------------------------
def build_relationship(logical: str, col: dict) -> ET.Element:
    cascade = col.get("cascade", {})
    r = ET.Element("EntityRelationship", Name=relationship_name(logical, col))
    _sub(r, "EntityRelationshipType", "OneToMany")
    _sub(r, "IsCustomizable", "1")
    _sub(r, "IntroducedVersion", VERSION)
    _sub(r, "IsHierarchical", "0")
    _sub(r, "ReferencingEntityName", logical)
    _sub(r, "ReferencedEntityName", referenced_name(col["target"]))
    _sub(r, "CascadeAssign", "NoCascade")
    _sub(r, "CascadeDelete", cascade.get("delete", "RemoveLink"))
    _sub(r, "CascadeArchive", "NoCascade")
    _sub(r, "CascadeReparent", "NoCascade")
    _sub(r, "CascadeShare", "NoCascade")
    _sub(r, "CascadeUnshare", "NoCascade")
    _sub(r, "CascadeRollupView", "NoCascade")
    _sub(r, "IsValidForAdvancedFind", "1")
    _sub(r, "ReferencingAttributeName", col["name"])
    desc = _sub(r, "RelationshipDescription")
    _localized(desc, "Descriptions", "Description", "")
    roles = _sub(r, "EntityRelationshipRoles")
    one = _sub(roles, "EntityRelationshipRole")
    _sub(one, "NavPaneDisplayOption", "UseCollectionName")
    _sub(one, "NavPaneArea", "Details")
    _sub(one, "NavPaneOrder", "10000")
    _sub(one, "NavigationPropertyName", col["name"])
    _sub(one, "RelationshipRoleType", "1")
    many = _sub(roles, "EntityRelationshipRole")
    _sub(many, "NavigationPropertyName", relationship_name(logical, col))
    _sub(many, "RelationshipRoleType", "0")
    return r


def relationships_by_file(schema: dict) -> dict[str, list[ET.Element]]:
    """Relationship elements grouped by referenced table, as an unpack does."""
    groups: dict[str, list[ET.Element]] = {}
    for logical, table in schema["tables"].items():
        for rel in _template("system-relationships.xml", entity=logical,
                             display=table["displayName"]):
            groups.setdefault(rel.findtext("ReferencedEntityName"), []).append(rel)
        for col in solution_columns_of(table):
            if col["type"] == "Lookup":
                groups.setdefault(referenced_name(col["target"]), []).append(
                    build_relationship(logical, col))
    return {k: sorted(v, key=lambda e: e.get("Name").lower()) for k, v in sorted(groups.items())}


# ---------------------------------------------------------------------------
# customizations + manifest
# ---------------------------------------------------------------------------
CUSTOMIZATION_SECTIONS = [
    "Entities", "Roles", "Workflows", "FieldSecurityProfiles", "Templates",
    "EntityMaps", "EntityRelationships", "OrganizationSettings", "optionsets",
    "CustomControls", "SolutionPluginAssemblies", "EntityDataProviders",
]


def build_customizations(flow_settings: dict) -> ET.Element:
    root = _root("ImportExportXml")
    for tag in CUSTOMIZATION_SECTIONS:
        _sub(root, tag)
    # connection references stay in Customizations.xml when unpacked
    refs = _sub(root, "connectionreferences")
    for ref in flow_settings["connectionReferences"].values():
        r = _sub(refs, "connectionreference", connectionreferencelogicalname=ref["logicalName"])
        _sub(r, "connectionreferencedisplayname", ref["displayName"])
        _sub(r, "connectorid", "/providers/Microsoft.PowerApps/apis/" + ref["api"])
        _sub(r, "description", ref["description"])
        _sub(r, "iscustomizable", "1")
        _sub(r, "promptingbehavior", "0")
        _sub(r, "statecode", "0")
        _sub(r, "statuscode", "1")
    _sub(_sub(root, "Languages"), "Language", LCID)
    return root


def build_workflow_data(flow: dict) -> ET.Element:
    """Workflows/<stem>.json.data.xml, as `pac solution unpack` writes it. The
    flow imports turned off (Draft); the post-import steps turn it on once its
    connection references are set."""
    w = _root("Workflow", WorkflowId="{" + flow["id"] + "}", Name=flow["name"])
    _sub(w, "JsonFileName", f"/Workflows/{flow['stem']}.json")
    for tag, value in [("Type", "1"), ("Subprocess", "0"), ("Category", "5"), ("Mode", "0"), ("Scope", "4"),
                       ("OnDemand", "0"), ("TriggerOnCreate", "0"), ("TriggerOnDelete", "0"),
                       ("AsyncAutodelete", "0"), ("SyncWorkflowLogOnFailure", "0"), ("StateCode", "0"),
                       ("StatusCode", "1"), ("RunAs", "1"), ("IsTransacted", "1"), ("IntroducedVersion", "1.0.0.0"),
                       ("IsCustomizable", "1"), ("BusinessProcessType", "0"),
                       ("IsCustomProcessingStepAllowedForOtherPublishers", "1"), ("PrimaryEntity", "none")]:
        _sub(w, tag, value)
    names = _sub(w, "LocalizedNames")
    _sub(names, "LocalizedName", languagecode=LCID, description=flow["name"])
    descs = _sub(w, "Descriptions")
    _sub(descs, "Description", languagecode=LCID, description=flow["description"])
    return w


ADDRESS_FIELDS = [
    "AddressNumber", "AddressTypeCode", "City", "County", "Country", "Fax",
    "FreightTermsCode", "ImportSequenceNumber", "Latitude", "Line1", "Line2",
    "Line3", "Longitude", "Name", "PostalCode", "PostOfficeBox",
    "PrimaryContactName", "ShippingMethodCode", "StateOrProvince", "Telephone1",
    "Telephone2", "Telephone3", "TimeZoneRuleVersionNumber", "UPSZone",
    "UTCOffset", "UTCConversionTimeZoneCode",
]
NIL = "{%s}nil" % XSI


def _nil(parent: ET.Element, tag: str) -> None:
    _sub(parent, tag).set("xsi:nil", "true")


def build_solution_xml(schema: dict, flows: list[dict]) -> ET.Element:
    pub = schema["publisher"]
    sol = schema["solution"]

    root = _root("ImportExportXml", version="9.2.0.0", SolutionPackageVersion="9.2",
                 languagecode=LCID, generatedBy="CrmLive")
    m = _sub(root, "SolutionManifest")
    _sub(m, "UniqueName", sol["uniqueName"])
    _localized(m, "LocalizedNames", "LocalizedName", sol["displayName"])
    _localized(m, "Descriptions", "Description", _flat(sol["description"]))
    _sub(m, "Version", sol["version"])
    _sub(m, "Managed", "1" if sol.get("managed") else "0")

    p = _sub(m, "Publisher")
    _sub(p, "UniqueName", pub["name"])
    _localized(p, "LocalizedNames", "LocalizedName", pub["displayName"])
    _localized(p, "Descriptions", "Description", pub["displayName"])
    _nil(p, "EMailAddress")
    _nil(p, "SupportingWebsiteUrl")
    _sub(p, "CustomizationPrefix", pub["prefix"])
    _sub(p, "CustomizationOptionValuePrefix", str(pub["optionValuePrefix"]))
    addresses = _sub(p, "Addresses")
    for number in ("1", "2"):
        ad = _sub(addresses, "Address")
        for field in ADDRESS_FIELDS:
            if field == "AddressNumber":
                _sub(ad, field, number)
            elif field in ("AddressTypeCode", "ShippingMethodCode"):
                _sub(ad, field, "1")
            else:
                _nil(ad, field)

    comps = _sub(m, "RootComponents")
    for logical in sorted(schema["tables"]):
        _sub(comps, "RootComponent", type="1", schemaName=logical, behavior="0")
    # pac orders root components by type as text: 1, 29, 9
    for flow in sorted(flows, key=lambda f: f["id"]):
        _sub(comps, "RootComponent", type="29", id="{" + flow["id"] + "}", behavior="0")
    for choice in sorted(schema["choices"]):
        _sub(comps, "RootComponent", type="9", schemaName=choice, behavior="0")
    _sub(m, "MissingDependencies")
    return root


# ---------------------------------------------------------------------------
# checks a Dataverse import is known to depend on
# ---------------------------------------------------------------------------
# The system columns' labels, as Dataverse names them on a new table. The
# template was copied from a table that had renamed some of them.
SYSTEM_LABELS = {
    "createdby": "Created By", "createdon": "Created On",
    "createdonbehalfby": "Created By (Delegate)", "importsequencenumber": "Import Sequence Number",
    "modifiedby": "Modified By", "modifiedon": "Modified On",
    "modifiedonbehalfby": "Modified By (Delegate)", "overriddencreatedon": "Record Created On",
    "ownerid": "Owner", "owningbusinessunit": "Owning Business Unit", "owningteam": "Owning Team",
    "owninguser": "Owning User", "statecode": "Status", "statuscode": "Status Reason",
    "timezoneruleversionnumber": "Time Zone Rule Version Number",
    "utcconversiontimezonecode": "UTC Conversion Time Zone Code",
}

# Dataverse adds a read-only virtual column beside each of these column types,
# named <column>name (and <column>yominame for people lookups). Names are
# case-insensitive, so a real column with one of those names fails the import
# ("An attribute with the specified name ... already exists").
VIRTUAL_SUFFIXES = {
    "lookup": ("name", "yominame"),
    "owner": ("name", "yominame"),
    "customer": ("name", "yominame"),
    "picklist": ("name",),
    "state": ("name",),
    "status": ("name",),
    "bit": ("name",),
}


def virtual_name_clashes(logical: str, attrs: dict, table: dict) -> list[str]:
    """Columns whose name collides, ignoring case, with another column or with
    a virtual name Dataverse reserves. Covers the hand-added computed columns
    too, since they are created in the same table."""
    names: dict[str, str] = {}
    errors = []
    for name in list(attrs) + [c["name"] for c in columns_of(table) if c["type"] in MANUAL_TYPES]:
        key = name.lower()
        if key in names:
            errors.append(f"{logical}: two columns named {name} (names ignore case)")
        names[key] = name
    for name, a in attrs.items():
        for suffix in VIRTUAL_SUFFIXES.get(a.findtext("Type"), ()):
            clash = names.get((name + suffix).lower())
            if clash:
                errors.append(f"{logical}.{clash}: Dataverse reserves this name for the virtual "
                              f"{suffix} column of {name} ({a.findtext('Type')}); rename it")
    return errors


def check_solution(out: pathlib.Path, schema: dict, flow_settings: dict) -> list[str]:
    errors = []

    def parse(path: pathlib.Path):
        try:
            return ET.parse(path).getroot()
        except (ET.ParseError, FileNotFoundError) as e:
            errors.append(f"{path}: {e}")
            return None

    cust = parse(out / "Other" / "Customizations.xml")
    if cust is not None:
        langs = cust.findall("Languages/Language")
        if not langs:
            errors.append("Customizations.xml: no <Languages><Language> element")
        for lang in langs:
            if lang.attrib or (lang.text or "").strip() != LCID:
                errors.append("Customizations.xml: <Language> must carry the code as element "
                              f"text, <Language>{LCID}</Language>, with no attributes")
        for tag in CUSTOMIZATION_SECTIONS:
            el = cust.find(tag)
            if el is None:
                errors.append(f"Customizations.xml: missing <{tag} />")
            elif len(el):
                errors.append(f"Customizations.xml: <{tag}> must be empty; its content "
                              "belongs in its own files")
        refs = {r.get("connectionreferencelogicalname"): r.findtext("connectorid")
                for r in cust.findall("connectionreferences/connectionreference")}
        for ref in flow_settings["connectionReferences"].values():
            if refs.get(ref["logicalName"]) != "/providers/Microsoft.PowerApps/apis/" + ref["api"]:
                errors.append(f"Customizations.xml: connection reference {ref['logicalName']} missing or wrong")

    # cloud flows: definition, data file and root component agree
    root_ids = set()
    sol_root = parse(out / "Other" / "Solution.xml")
    if sol_root is not None:
        root_ids = {c.get("id") for c in sol_root.iter("RootComponent") if c.get("type") == "29"}
    by_logical = {r["api"]: r["logicalName"] for r in flow_settings["connectionReferences"].values()}
    for data in sorted((out / "Workflows").glob("*.json.data.xml")):
        w = parse(data)
        if w is None:
            continue
        stem = data.name[:-len(".json.data.xml")]
        if w.findtext("JsonFileName") != f"/Workflows/{stem}.json":
            errors.append(f"{data.name}: JsonFileName does not name its own .json")
        if w.get("WorkflowId") not in root_ids:
            errors.append(f"{data.name}: flow is not a root component in Solution.xml")
        try:
            defn = json.loads((out / "Workflows" / f"{stem}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            errors.append(f"{stem}.json: {e}")
            continue
        for api, ref in defn["properties"]["connectionReferences"].items():
            if by_logical.get(api) != ref["connection"]["connectionReferenceLogicalName"]:
                errors.append(f"{stem}.json: {api} does not use the solution's connection reference")
        errors += [f"{stem}.json: {e}" for e in build_flows.lint(defn)]
    if len(list((out / "Workflows").glob("*.json"))) != len(build_flows.FLOWS):
        errors.append(f"Workflows: expected {len(build_flows.FLOWS)} flows")

    sol = parse(out / "Other" / "Solution.xml")
    if sol is not None:
        p = sol.find("SolutionManifest/Publisher")
        for tag in ("UniqueName", "LocalizedNames", "Descriptions", "EMailAddress",
                    "SupportingWebsiteUrl", "CustomizationPrefix",
                    "CustomizationOptionValuePrefix", "Addresses"):
            if p is None or p.find(tag) is None:
                errors.append(f"Solution.xml: publisher is missing <{tag}>")
        if p is not None and len(p.findall("Addresses/Address")) != 2:
            errors.append("Solution.xml: publisher needs two <Address> entries")
        if p is not None and p.findtext("CustomizationOptionValuePrefix") != str(
                schema["publisher"]["optionValuePrefix"]):
            errors.append("Solution.xml: option value prefix differs from the schema")
        for el in sol.iter():
            if el.get(NIL) is not None and (el.text or "").strip():
                errors.append(f"Solution.xml: <{el.tag}> is nil but has text")

    names = set()
    idx = parse(out / "Other" / "Relationships.xml")
    if idx is not None:
        names = {e.get("Name") for e in idx}
    found = set()
    for f in sorted((out / "Other" / "Relationships").glob("*.xml")):
        r = parse(f)
        for rel in (r if r is not None else []):
            found.add(rel.get("Name"))
            if rel.findtext("ReferencedEntityName") != f.stem:
                errors.append(f"{f.name}: {rel.get('Name')} belongs in "
                              f"{rel.findtext('ReferencedEntityName')}.xml")
    long = sorted(n for n in found if len(n) > 50)
    if long:
        errors.append(f"relationship names over 50 characters: {long}")
    if names != found:
        errors.append("Relationships.xml does not list exactly the relationships on disk: "
                      f"{sorted(names ^ found)}")

    for name, choice in schema["choices"].items():
        o = parse(out / "OptionSets" / f"{name}.xml")
        if o is not None and o.findtext("IsGlobal") != "1":
            errors.append(f"OptionSets/{name}.xml: not marked global")
        values = [o["value"] for o in choice["options"]]
        if len(set(values)) != len(values):
            errors.append(f"{name}: duplicate option values")

    for logical, table in schema["tables"].items():
        e = parse(out / "Entities" / logical / "Entity.xml")
        if e is None:
            continue
        attrs = {a.findtext("LogicalName"): a for a in e.iter("attribute")}
        for needed in (f"{logical}id", "ownerid", "statecode", "statuscode", "createdon"):
            if needed not in attrs:
                errors.append(f"{logical}: missing system column {needed}")
        pn = attrs.get(table["primaryName"])
        if pn is None or "PrimaryName" not in (pn.findtext("DisplayMask") or ""):
            errors.append(f"{logical}: primary name column is not marked PrimaryName")
        for a in attrs.values():
            t = a.findtext("Type")
            if t == "picklist" and a.findtext("OptionSetName") not in schema["choices"]:
                errors.append(f"{logical}.{a.findtext('Name')}: choice must name a global "
                              "choice in <OptionSetName>")
            if t == "bit" and a.findtext("optionset/OptionSetType") != "bit":
                errors.append(f"{logical}.{a.findtext('Name')}: yes/no option set must be type bit")
            if t == "lookup" and a.find("LookupTypes") is None:
                errors.append(f"{logical}.{a.findtext('Name')}: lookup without <LookupTypes />")
        for col, label in SYSTEM_LABELS.items():
            a = attrs.get(col)
            got = a.find("displaynames/displayname").get("description") if a is not None else None
            if got != label:
                errors.append(f"{logical}.{col}: label is {got!r}; Dataverse's own label is {label!r}")
        for err in virtual_name_clashes(logical, attrs, table):
            errors.append(err)
        for col in solution_columns_of(table):
            if col["type"] == "Lookup" and relationship_name(logical, col) not in found:
                errors.append(f"{logical}.{col['name']}: no relationship for this lookup")
        if e.findtext("EntityInfo/entity/OwnershipTypeMask") != "UserOwned":
            errors.append(f"{logical}: only user-owned tables are generated")
    return errors


def build_test_schema(schema: dict) -> dict:
    """The writable column set per table, for portal/test/mock-portal.mjs,
    which refuses any Web API write the real tables would refuse."""
    out = {}
    for logical, table in sorted(schema["tables"].items()):
        cols, labels, cascade = {}, {}, {}
        for col in solution_columns_of(table):
            cols[col["name"]] = "lookup:" + col["target"] if col["type"] == "Lookup" else col["type"]
            if col["type"] == "Choice":
                labels[col["name"]] = {str(o["value"]): o["label"] for o in schema["choices"][col["choice"]]["options"]}
            if col["type"] == "Lookup" and col.get("cascade", {}).get("delete") == "Cascade":
                cascade[col["name"]] = "Cascade"
        out[logical] = {"columns": dict(sorted(cols.items())), "id": logical + "id", "set": logical + "s",
                        "primaryName": table["primaryName"], "choiceLabels": labels, "cascadeDelete": cascade}
    return out


# ---------------------------------------------------------------------------
def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--schema", type=pathlib.Path,
                    default=pathlib.Path("solution/schema/dataverse-schema.yaml"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("solution/src"))
    ap.add_argument("--flows", type=pathlib.Path, default=pathlib.Path("solution/schema/flows.yaml"),
                    help="settings the cloud flows are generated with")
    ap.add_argument("--test-schema", type=pathlib.Path, default=pathlib.Path("portal/test/dv-schema.json"),
                    help="where to write the column set the portal's mock Web API checks against")
    args = ap.parse_args(argv)

    if not args.schema.is_file():
        print(f"error: schema not found: {args.schema}", file=sys.stderr)
        return 1

    schema = yaml.safe_load(args.schema.read_text(encoding="utf-8"))
    for logical, table in schema["tables"].items():
        if table.get("ownership", "UserOwned") != "UserOwned":
            print(f"error: {logical}: only UserOwned tables are supported", file=sys.stderr)
            return 1

    # Start clean so a renamed table or choice leaves nothing behind.
    if args.out.exists():
        shutil.rmtree(args.out)
    other = args.out / "Other"
    (other / "Relationships").mkdir(parents=True)
    (args.out / "OptionSets").mkdir()

    flow_settings = build_flows.load_settings(args.flows)
    flows = build_flows.build_all(flow_settings)
    (other / "Solution.xml").write_text(_pretty(build_solution_xml(schema, flows)), encoding="utf-8")
    (other / "Customizations.xml").write_text(_pretty(build_customizations(flow_settings)), encoding="utf-8")
    (args.out / "Workflows").mkdir()
    for flow in flows:
        (args.out / "Workflows" / f"{flow['stem']}.json").write_text(
            json.dumps(flow["definition"], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (args.out / "Workflows" / f"{flow['stem']}.json.data.xml").write_text(
            _pretty(build_workflow_data(flow)), encoding="utf-8")

    groups = relationships_by_file(schema)
    index = _root("EntityRelationships")
    for rels in groups.values():
        for rel in rels:
            _sub(index, "EntityRelationship", Name=rel.get("Name"))
    index[:] = sorted(index, key=lambda e: e.get("Name").lower())
    (other / "Relationships.xml").write_text(_pretty(index), encoding="utf-8")
    for referenced, rels in groups.items():
        f = _root("EntityRelationships")
        f.extend(rels)
        (other / "Relationships" / f"{referenced}.xml").write_text(_pretty(f), encoding="utf-8")

    for name, choice in schema["choices"].items():
        (args.out / "OptionSets" / f"{name}.xml").write_text(
            _pretty(build_optionset(name, choice)), encoding="utf-8")

    col_total = 0
    for logical, table in schema["tables"].items():
        d = args.out / "Entities" / logical
        d.mkdir(parents=True)
        (d / "Entity.xml").write_text(_pretty(build_entity(logical, table)), encoding="utf-8")
        col_total += len(solution_columns_of(table))

    if args.test_schema.parent.is_dir():
        args.test_schema.write_text(json.dumps(build_test_schema(schema), indent=1) + "\n", encoding="utf-8")

    errors = check_solution(args.out, schema, flow_settings)
    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        return 1

    n_rels = sum(len(v) for v in groups.values())
    print(f"{len(schema['tables'])} tables, {col_total} columns, {len(schema['choices'])} "
          f"global choices, {n_rels} relationships, {len(flows)} cloud flows written to {args.out}. "
          "Checks passed.")
    for logical, col in manual_columns(schema):
        print(f"  add after import: {logical}.{col['name']} ({col['type']})")
    print(f"Next: pac solution pack --zipfile ComplianceMatrix.zip --folder {args.out} "
          "--packagetype Unmanaged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
