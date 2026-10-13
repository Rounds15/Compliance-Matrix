#!/usr/bin/env python3
"""
Power Query M for the five dataflows that copy the SharePoint lists into
Dataverse (docs/DATAVERSE-MIGRATION.md, sections 3 and 4).

Writes one self-contained query per target table to solution/dataflows/, and
docs/DATAFLOWS.md, which holds the same queries in load order with the
settings for each. Each query reads its list with the SharePoint Online list
connector's 1.0 implementation and outputs columns named exactly as the
Dataverse columns, with lookups named <lookup>.su_legacyspid so the Map
tables step binds them through the parent table's legacy-ID key.

Checks, before anything is written: every output column exists on its
Dataverse table with a matching type; every lookup's parent has the
su_legacyspid key; every SharePoint column read is one the canvas app's
metadata lists for that list (portal/test/sp-schema.json), except the few
named in NOT_IN_METADATA. tools/check_m.mjs then parses each query with
Microsoft's Power Query parser.

Usage: python3 tools/build_dataflows.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "solution" / "schema" / "dataverse-schema.yaml"
SP_SCHEMA = ROOT / "portal" / "test" / "sp-schema.json"
OUT = ROOT / "solution" / "dataflows"
DOC = ROOT / "docs" / "DATAFLOWS.md"
SITE = "https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix"

# Columns SharePoint adds to every list, or that the canvas app does not read.
STANDARD = {"Id", "Title", "Created", "Modified"}
NOT_IN_METADATA = {("Assessments", "OData__FormSourceId_0")}

HELPERS = '''    // ---- helpers (the same in every query) ----
    // Choice: label to option value; null when blank or not in the map
    Choice = (map as record, v as any) as any =>
        let t = if v = null then null else Text.Trim(Text.From(if v is record then Record.FieldOrDefault(v, "Value", null) else v))
        in if t = null or t = "" then null else Record.FieldOrDefault(map, t, null),
    // Multi-choice: the values joined with ", "
    Multi = (v as any) as nullable text =>
        if v = null then null
        else if v is list then (if List.IsEmpty(v) then null else Text.Combine(List.Transform(v, Text.From), ", "))
        else if v is record and Record.HasFields(v, "results") then Text.Combine(List.Transform(v[results], Text.From), ", ")
        else Text.From(v),
    // Text as stored; a choice record gives its value; blank stays blank
    Txt = (v as any) as nullable text =>
        if v = null then null else if v is record then Record.FieldOrDefault(v, "Value", null) else Text.From(v),
    // Text cut to the Dataverse column's length
    Cap = (v as any, n as number) as nullable text => let t = Txt(v) in if t = null then null else Text.Start(t, n),
    // Text that must not be blank
    OrElse = (v as any, fallback as text) as text => let t = Text.Trim(Txt(v) ?? "") in if t = "" then fallback else t,
    // Hyperlink: the URL part
    Link = (v as any) as nullable text => if v = null then null else if v is record then Record.FieldOrDefault(v, "Url", null) else Text.From(v),
    // Date only: SharePoint stores Eastern midnight (04:00 or 05:00 UTC), so the UTC date is the right day
    Day = (v as any) as nullable date => if v = null then null else Date.From(DateTimeZone.ToUtc(DateTimeZone.From(v))),
    // Date and time, in UTC
    Stamp = (v as any) as nullable datetimezone => if v = null then null else DateTimeZone.ToUtc(DateTimeZone.From(v)),
    // A date or a date and time, as text the way the action flow writes it
    DayText = (v as any) as nullable text => let d = Day(v) in if d = null then null else Date.ToText(d, [Format = "yyyy-MM-dd", Culture = "en-US"]),
    StampText = (v as any) as nullable text => let d = Stamp(v) in if d = null then null else DateTimeZone.ToText(d, [Format = "yyyy-MM-ddTHH:mm:ssZ", Culture = "en-US"]),
    // Numbers
    Int = (v as any) as nullable number => if v = null then null else Int64.From(Number.Round(Number.From(v))),
    Num = (v as any) as nullable number => if v = null then null else Number.From(v),
    // ---- choice maps (option values from the solution) ----
    RiskMap = [High = 100000001, Moderate = 100000002, Low = 100000003],
    RoleMap = Record.FromList({100000030, 100000031, 100000032, 100000033, 100000034},
        {"Executive Owner", "Unit Owner", "Compliance Owner", "General Counsel", "Support"}),
    SubRoleMap = [Primary = 100000040, Advisory = 100000041, Support = 100000042],
    CadenceMap = Record.FromList({100000010, 100000010, 100000011, 100000011, 100000012, 100000013, 100000014, 100000015, 100000016, 100000016},
        {"Annual", "Annually", "Semi-Annual", "Semiannual", "Quarterly", "Monthly", "Biennial", "Ongoing", "One-time", "One-Time"}),
    GapStatusMap = Record.FromList({100000020, 100000022, 100000021}, {"Open", "In Progress", "Closed"}),
    FlagSourceMap = [Manual = 100000110, Survey = 100000111],
    AssessmentStatusMap = Record.FromList({100000090, 100000091, 100000092, 100000093, 100000094},
        {"Drafting", "Report Complete", "Finalized", "Closed", "Accepted"}),'''

# Each role's Primary person, else its first row: the rule the portal uses.
OWNERS = '''    // ---- owners from the Accountability Structure ----
    Own = Table.Buffer(Table.SelectColumns(Source{[Title = "Accountability Structure"]}[Items], {"Id", "FunctionId", "PersonId", "field_3", "field_4"})),
    PickFor = (fid as any, role as text) as nullable number =>
        let
            rows = Table.SelectRows(Own, each [FunctionId] = fid and Txt([field_3]) = role and [PersonId] <> null),
            prim = Table.SelectRows(rows, each Txt([field_4]) = "Primary"),
            pick = Table.Sort(if Table.RowCount(prim) > 0 then prim else rows, {"Id"})
        in if Table.RowCount(pick) = 0 then null else Int(pick{0}[PersonId]),'''

FUNCTION_IDS = '''    // ---- the functions that exist, so a lookup to a deleted one loads blank instead of failing ----
    FunctionIds = List.Buffer(List.Transform(Source{[Title = "Compliance Functions"]}[Items][Id], Int64.From)),
    LiveFunction = (v as any) as nullable number => let id = Int(v) in if id <> null and List.Contains(FunctionIds, id) then id else null,'''

DEADLINE_TYPE = '''    // ---- deadline type from the cadence: One-time, Ongoing, else Fixed Recurring ----
    Kind = (v as any) as number =>
        let t = Text.Lower(Text.Trim(Txt(v) ?? ""))
        in if t = "one-time" then 100000074 else if t = "ongoing" then 100000072 else 100000070,'''

# SharePoint navigation columns left out of the JSON copy
SOURCE_JSON = '''    // ---- the whole item as JSON, without SharePoint's navigation columns ----
    Nav = {"FirstUniqueAncestorSecurableObject", "RoleAssignments", "AttachmentFiles", "ContentType", "GetDlpPolicyTip",
        "FieldValuesAsHtml", "FieldValuesAsText", "FieldValuesForEdit", "File", "Folder", "LikedByInformation",
        "ParentList", "Properties", "Versions"},
    Plain = (v as any) as any =>
        if v is table or v is function or v is binary or v is type then null
        else if v is list then List.Transform(v, @Plain)
        else if v is record then
            let names = List.Select(Record.FieldNames(v), (n) => let x = Record.Field(v, n) in not (x is table or x is function or x is binary or x is type))
            in Record.FromList(List.Transform(names, (n) => @Plain(Record.Field(v, n))), names)
        else v,
    AsJson = (r as record) as text => Text.FromBinary(Json.FromValue(Plain(Record.RemoveFields(r, Nav, MissingField.Ignore))), TextEncoding.Utf8),'''

T, I, N, D, Z, B = "nullable text", "Int64.Type", "nullable number", "nullable date", "nullable datetimezone", "nullable logical"

DATAFLOWS = [
    ("CM Load 1 - People and areas", "nothing"),
    ("CM Load 2 - Domains", "CM Load 1"),
    ("CM Load 3 - Functions", "CM Load 1 and 2"),
    ("CM Load 4 - Assessments", "CM Load 1 and 3"),
    ("CM Load 5 - Records", "CM Load 1, 3 and 4"),
]

# (dataflow index, query name, SharePoint list, Dataverse table, expected rows, extra steps, columns)
# columns: (output column, M expression over r, M type)
QUERIES = [
    (0, "Risk Areas", "Risk Areas", "su_riskarea", "13", [], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Risk area " & Text.From(r[Id])), 255)', T),
        ("su_riskareacode", "Text.From(r[Id])", T),
        ("su_colorhex", "Cap(r[field_1], 4000)", T),
    ]),
    (0, "Compliance Directory", "Compliance Directory", "su_compliancedirectory", "137", [], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Person " & Text.From(r[Id])), 255)', T),
        ("su_email", "let e = Txt(r[field_1]) in if e = null or Text.Trim(e) = \"\" then null else Text.Lower(Text.Trim(e))", T),
        ("su_active", "true", B),
    ]),
    (1, "Domains", "Domains", "su_domain", "61", [], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Domain " & Text.From(r[Id])), 255)', T),
        ("su_domaincode", "Text.From(r[Id])", T),
        ("su_riskarea.su_legacyspid", "Int(r[RiskAreaId])", I),
    ]),
    (2, "Compliance Functions", "Compliance Functions", "su_compliancefunction", "392", [OWNERS], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_functioncode", "Text.From(r[Id])", T),
        ("su_name", 'Cap(OrElse(r[Title], "Function " & Text.From(r[Id])), 300)', T),
        ("su_riskarea.su_legacyspid", "Int(r[RiskAreaId])", I),
        ("su_domain.su_legacyspid", "Int(r[DomainId])", I),
        ("su_statute", "Cap(r[field_3], 4000)", T),
        ("su_citation", "Cap(r[field_4], 4000)", T),
        ("su_statuteurl", "Cap(Link(r[field_5]), 500)", T),
        ("su_description", "Txt(r[field_6])", T),
        ("su_reporting", "Txt(r[field_7])", T),
        ("su_deadlinenarrative", "Txt(r[field_8])", T),
        ("su_resourcelabel", "Cap(r[field_9], 4000)", T),
        ("su_resourceurl", "Cap(Link(r[field_10]), 500)", T),
        ("su_risk", "Choice(RiskMap, r[field_11])", I),
        ("su_lastreviewed", "Day(r[LastAssessedDate])", D),
        ("su_executiveowner.su_legacyspid", 'PickFor(r[Id], "Executive Owner")', I),
        ("su_unitowner.su_legacyspid", 'PickFor(r[Id], "Unit Owner")', I),
        ("su_complianceowner.su_legacyspid", 'PickFor(r[Id], "Compliance Owner")', I),
    ]),
    (3, "Assessments", "Assessments", "su_assessment", "9", [], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_assessmentcode", "Text.From(r[Id])", T),
        ("su_name", 'Cap(OrElse(r[Title], "Assessment " & Text.From(r[Id])), 300)', T),
        ("su_function.su_legacyspid", "Int(r[FunctionId])", I),
        ("su_respondent.su_legacyspid", "Int(r[RespondentId])", I),
        ("su_respondentemail", "Cap(r[RespondentEmail], 320)", T),
        ("su_unit", "Cap(r[field_6], 4000)", T),
        ("su_assessmentdate", "Day(r[field_2])", D),
        ("su_fiscalyear", "Cap(r[field_3], 4000)", T),
        ("su_method", "Cap(r[field_4], 4000)", T),
        ("su_assessedby", "Cap(r[field_7], 4000)", T),
        ("su_keycontrolsmissing", "Int(r[field_8])", I),
        ("su_opencontrolgaps", "Num(r[field_9])", N),
        ("su_frequencyband", "Cap(r[field_10], 4000)", T),
        ("su_impactanswer", "Cap(r[field_11], 4000)", T),
        ("su_pressureanswer", "Cap(r[field_12], 4000)", T),
        ("su_internalriskasassessed", "Num(r[field_13])", N),
        ("su_externalrisk", "Num(r[field_14])", N),
        ("su_universityriskasassessed", "Cap(r[field_15], 4000)", T),
        ("su_internalriskcurrent", "Num(r[field_16])", N),
        ("su_universityriskcurrent", "Cap(r[field_17], 4000)", T),
        ("su_risk", "Choice(RiskMap, r[field_17])", I),
        ("su_statustext", "Cap(Multi(r[field_18]), 4000)", T),
        ("su_status", "Choice(AssessmentStatusMap, Multi(r[field_18]))", I),
        ("su_questionnaireversion", "Cap(r[field_19], 4000)", T),
        ("su_sourcefile", "Cap(r[field_20], 4000)", T),
        ("su_notes", "Txt(r[field_21])", T),
        ("su_referencecode", "Cap(r[ReferenceCode], 4000)", T),
        ("su_formsresponseid", "Num(r[FormsResponseId])", N),
        ("su_submittedon", "Stamp(r[SubmittedOn])", Z),
        ("su_createdvia", 'Cap(Record.FieldOrDefault(r, "OData__FormSourceId_0", null), 4000)', T),
    ]),
    (4, "Accountability Structure", "Accountability Structure", "su_functionownership", "1,172", [], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], Text.Combine(List.RemoveNulls({Txt(r[FunctionId]), Txt(r[PersonId]), Txt(r[field_3])}), " | ")), 400)', T),
        ("su_function.su_legacyspid", "Int(r[FunctionId])", I),
        ("su_person.su_legacyspid", "Int(r[PersonId])", I),
        ("su_role", "Choice(RoleMap, r[field_3])", I),
        ("su_subrole", "Choice(SubRoleMap, r[field_4]) ?? 100000040", I),
    ]),
    (4, "Deadlines", "Deadlines", "su_compliancedeadline", "146", [OWNERS, DEADLINE_TYPE], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Deadline " & Text.From(r[Id])), 300)', T),
        ("su_function.su_legacyspid", "Int(r[FunctionId])", I),
        ("su_duedate", "Day(r[field_1])", D),
        ("su_cadence", "Choice(CadenceMap, r[field_2])", I),
        ("su_cadencetext", "Cap(r[field_2], 4000)", T),
        ("su_deadlinetype", "Kind(r[field_2])", I),
        ("su_narrative", "Txt(r[field_3])", T),
        ("su_completeddate", "Day(r[field_4])", D),
        ("su_complete", "Kind(r[field_2]) = 100000074 and r[field_4] <> null", B),
        ("su_completedreason", "Txt(r[field_5])", T),
        ("su_completedbydisplayname", "Cap(r[field_6], 4000)", T),
        ("su_completedon", "Stamp(r[field_7])", Z),
        ("su_completedby.su_legacyspid", "Int(r[CompletedById])", I),
        ("su_owner.su_legacyspid", 'PickFor(r[FunctionId], "Compliance Owner")', I),
    ]),
    (4, "Flags List", "Flags List", "su_functionflag", "60 (59 if you deleted flag 89)", [FUNCTION_IDS], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], Text.Start(OrElse(r[field_1], "Flag"), 120)), 400)', T),
        ("su_function.su_legacyspid", "LiveFunction(r[FunctionId])", I),
        ("su_flaggedby.su_legacyspid", "Int(r[FlaggedById])", I),
        ("su_reason", 'OrElse(r[field_1], "(no text)")', T),
        ("su_source", "Choice(FlagSourceMap, r[field_2])", I),
        ("su_status", "if r[field_3] = true then 100000051 else 100000050", I),
        ("su_flaggedon", "Day(r[field_4] ?? r[Created])", D),
        ("su_respondentemail", "Cap(r[RespondentEmail], 320)", T),
    ]),
    (4, "Gap List", "Gap List", "su_compliancegap", "22", [], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Gap " & Text.From(r[Id])), 400)', T),
        ("su_gapcode", 'Cap(Multi(r[field_1]) ?? ("GAP-" & Text.From(r[Id])), 4000)', T),
        ("su_status", "Choice(GapStatusMap, r[field_2]) ?? 100000020", I),
        ("su_gapsource", "Cap(r[field_3], 4000)", T),
        ("su_note", "Txt(r[field_6])", T),
        ("su_responsibleunit", "Cap(r[field_7], 4000)", T),
        ("su_targetquarter", "Cap(Multi(r[field_9]), 4000)", T),
        ("su_targetfy", "Cap(r[field_10], 4000)", T),
        ("su_openeddate", "Day(r[field_11] ?? r[Created])", D),
        ("su_closeddate", "Day(r[field_13])", D),
        ("su_closenote", "Txt(r[field_14])", T),
        ("su_needsremediationplan", "Cap(r[field_20], 4000)", T),
        ("su_sourcefile", "Cap(r[field_21], 4000)", T),
        ("su_function.su_legacyspid", "Int(r[FunctionId])", I),
        ("su_assessment.su_legacyspid", "Int(r[AssessmentId])", I),
        ("su_owner.su_legacyspid", "Int(r[ResponsiblePersonId])", I),
        ("su_closedby.su_legacyspid", "Int(r[ClosedById])", I),
    ]),
    (4, "Assessment Responses", "Assessment Responses", "su_assessmentresponse", "4", [SOURCE_JSON], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Item " & Text.From(r[Id])), 255)', T),
        ("su_sourcedata", "AsJson(r)", T),
        ("su_sourcecreated", "Stamp(r[Created])", Z),
        ("su_sourcemodified", "Stamp(r[Modified])", Z),
    ]),
    (4, "Assessment Schedule", "Assessment Schedule", "su_assessmentschedule", "1", [SOURCE_JSON], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Item " & Text.From(r[Id])), 255)', T),
        ("su_sourcedata", "AsJson(r)", T),
        ("su_sourcecreated", "Stamp(r[Created])", Z),
        ("su_sourcemodified", "Stamp(r[Modified])", Z),
    ]),
    (4, "Archive", "Archive", "su_archive", "103", [FUNCTION_IDS], [
        ("su_legacyspid", "Int(r[Id])", I),
        ("su_name", 'Cap(OrElse(r[Title], "Archive " & Text.From(r[Id])), 255)', T),
        ("su_recordtype", "Cap(r[field_1], 4000)", T),
        ("su_eventtype", "Cap(r[field_2], 4000)", T),
        ("su_archivedfunctionname", "Cap(r[field_3], 4000)", T),
        ("su_functionnumber", "Int(r[field_4])", I),
        ("su_function.su_legacyspid", "LiveFunction(r[field_4])", I),
        ("su_resolvedby", "Cap(r[field_5], 4000)", T),
        ("su_resolvedat", "StampText(r[field_6])", T),
        ("su_sourceitemid", "Num(r[field_7])", N),
        ("su_reason", "Txt(r[field_8])", T),
        ("su_completedoccurrence", "DayText(r[field_9])", T),
        ("su_cadence", "Cap(r[field_10], 4000)", T),
        ("su_flaggedby", "Cap(r[field_11], 4000)", T),
        ("su_flaggeddate", "DayText(r[field_12])", T),
        ("su_flagsource", "Cap(r[field_13], 4000)", T),
    ]),
]

EXPECTED_TYPE = {"String": T, "Memo": T, "Integer": I, "Decimal": N, "Boolean": B, "Choice": I, "Lookup": I}


def m_name(col: str) -> str:
    return col if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", col) else '#"' + col + '"'


def render(q) -> str:
    df, name, sp_list, table, count, extra, cols = q
    lines = [
        f"// {name} -> {table}, in dataflow \"{DATAFLOWS[df][0]}\". Generated by tools/build_dataflows.py.",
        f"// Paste into Get data > Blank query > Advanced editor, replacing everything, and name the query \"{name}\".",
        "let",
        f'    Source = SharePoint.Tables("{SITE}", [ApiVersion = 15]),',
        f'    Items = Source{{[Title = "{sp_list}"]}}[Items],',
        HELPERS,
        *extra,
        "    // ---- one row per item, named as the Dataverse columns ----",
        "    Rows = List.Transform(Table.ToRecords(Items), (r) => [",
        ",\n".join(f"        {m_name(c)} = {e}" for c, e, _ in cols),
        "    ]),",
        "    Result = Table.FromRecords(Rows, type table [",
        ",\n".join(f"        {m_name(c)} = {t}" for c, _, t in cols),
        "    ])",
        "in",
        "    Result",
    ]
    return "\n".join(lines) + "\n"


def check(schema: dict, sp: dict) -> list[str]:
    errors = []
    tables = schema["tables"]
    for df, name, sp_list, table, count, extra, cols in QUERIES:
        t = tables[table]
        dv = {c["name"]: c for c in t["columns"]}
        seen = set()
        for col, expr, mtype in cols:
            if col in seen:
                errors.append(f"{name}: {col} twice")
            seen.add(col)
            if col == "su_legacyspid":
                if not t.get("legacyKey"):
                    errors.append(f"{name}: {table} has no legacy key")
                if mtype != I:
                    errors.append(f"{name}: su_legacyspid must be Int64.Type")
                continue
            base, _, key = col.partition(".")
            c = dv.get(base)
            if c is None:
                errors.append(f"{name}: {table} has no column {base}")
                continue
            if c["type"] in ("Rollup", "Calculated"):
                errors.append(f"{name}: {base} is computed and cannot be loaded")
            if c["type"] == "Lookup":
                if key != "su_legacyspid":
                    errors.append(f"{name}: lookup {base} must be named {base}.su_legacyspid")
                elif not tables.get(c["target"], {}).get("legacyKey"):
                    errors.append(f"{name}: {base} points at {c['target']}, which has no legacy key")
            elif key:
                errors.append(f"{name}: {col} is not a lookup")
            want = EXPECTED_TYPE.get(c["type"])
            if c["type"] == "DateTime":
                want = D if c.get("format", "DateOnly") == "DateOnly" else Z
            if mtype != want:
                errors.append(f"{name}: {col} is {c['type']} in Dataverse, so its M type should be {want}, not {mtype}")
        # the SharePoint columns each query reads
        known = set(sp.get(sp_list, {})) | STANDARD
        src = "\n".join(e for _, e, _ in cols) + "\n".join(extra)
        for f in sorted(set(re.findall(r"r\[([A-Za-z_0-9]+)\]", src))):
            if sp_list in sp and f not in known and (sp_list, f) not in NOT_IN_METADATA:
                errors.append(f"{name}: reads {f}, which the canvas app's metadata does not list on {sp_list}")
        for f in re.findall(r'Record\.FieldOrDefault\(r, "([^"]+)"', src):
            if (sp_list, f) not in NOT_IN_METADATA:
                errors.append(f"{name}: {f} read leniently but not listed in NOT_IN_METADATA")
    return errors


SETTINGS_NOTE = """For every query, on the **Map tables** step:

- **Load to existing table**: the table named in the query's heading.
- **Select key**: **Legacy SharePoint ID** (su_key_legacyspid).
- **Delete rows that no longer exist in the query output**: **on**, so the
  copy stays a mirror of SharePoint (section 3 of the migration guide).
- **Auto map**. Each output column has the Dataverse column's logical name,
  and each lookup is named `<lookup>.su_legacyspid`, which is how the Map
  tables step lists a lookup bound through the parent's Legacy SharePoint ID
  key. If a lookup stays unmapped after Auto map, pick it by hand: the source
  and destination names are the same.
- Leave every destination column that has no source column unmapped (among
  them su_contact, so the Portal Contact links survive each refresh)."""


def doc(queries_by_df) -> str:
    out = ["# The five dataflows, ready to paste", "",
           "Generated by `tools/build_dataflows.py` from the column mapping in",
           "`docs/DATAVERSE-MIGRATION.md` (section 4); the same queries are in",
           "`solution/dataflows/`. Do not edit the queries here; change the generator and rebuild.", "",
           "## How to build each dataflow", "",
           "1. make.powerapps.com > SU Compliance Office > **Dataflows** > **New dataflow** > name it as below > **Create**.",
           "2. For each query of that dataflow: **Get data** > **Blank query**, paste the query over everything in the",
           "   editor, **Next**, then rename the query (right-click > Rename) to the name in its heading.",
           "3. The first query asks for a connection: **SharePoint Online list**, organizational account, signed in",
           "   as the account that will own the dataflows. The other queries reuse it.",
           "4. Check each preview: no column shows Error. A cell error names the item and the column.",
           "5. **Next** to **Map tables**, set each query as below, then **Next** > **Publish**.", "",
           SETTINGS_NOTE, "",
           "## Order, and what to check before the next one", "",
           "Run each dataflow (Dataflows > the dataflow > **Refresh**), wait for it to finish, and check before",
           "starting the next. A lookup to a row the same refresh creates can fail, so the order matters.", "",
           "To count rows, open this in the browser, signed in (Power Platform admin center > the environment >",
           "Environment URL):", "",
           "```", "https://<environment URL>/api/data/v9.2/<entity set>/$count", "```", "",
           "For example `https://<environment URL>/api/data/v9.2/su_riskareas/$count`. The entity set is the table's",
           "logical name plus s.", "",
           "| Order | Dataflow | Needs | Tables and expected rows | Check before the next |",
           "|---|---|---|---|---|"]
    checks = {
        0: "su_riskareas 13, su_compliancedirectorys 137; refresh history shows no failed rows",
        1: "su_domains 61; `su_domains?$filter=_su_riskarea_value eq null&$select=su_domainid&$count=true` (its @odata.count) equals the number of Domains with no Risk Area in SharePoint",
        2: "su_compliancefunctions 392; `su_compliancefunctions?$filter=_su_domain_value eq null&$select=su_compliancefunctionid&$count=true` (its @odata.count) equals the number of functions with no Domain in SharePoint; spot-check one function's Risk Area, Domain and three owners",
        3: "su_assessments 9, each with Status Accepted",
        4: "each table's count; `su_compliancegaps?$filter=_su_function_value eq null&$select=su_compliancegapid&$count=true` gives @odata.count 14",
    }
    for i, (dfname, needs) in enumerate(DATAFLOWS):
        tables = "; ".join(f"{q[3]} {q[4]}" for q in queries_by_df[i])
        out.append(f"| {i + 1} | {dfname} | {needs} | {tables} | {checks[i]} |")
    out += ["", "If a count is short, open the refresh history: each failed row is listed with its SharePoint ID",
            "and the reason. Fix it in SharePoint and refresh that dataflow again; rows already loaded are",
            "updated, not duplicated, because the key is the SharePoint ID.", "",
            "After the first full load, refresh them in the same order, an hour apart, or on a schedule.", "",
            "## Can this be imported instead of pasted?", "",
            "Pasting is the route these queries are checked for: each table is one self-contained paste, with",
            "the helpers built in, so no query depends on another. Power Query Online can import a Power Query",
            "template (.pqt) in some places, but I have not generated one, because I cannot check that format",
            "here. Once a dataflow is built and refreshed, its queries stay in it; nothing needs pasting again",
            "unless a query changes.", ""]
    for i, (dfname, needs) in enumerate(DATAFLOWS):
        out += [f"## {i + 1}. {dfname}", "", f"Needs: {needs}.", ""]
        for q in queries_by_df[i]:
            df, name, sp_list, table, count, extra, cols = q
            out += [f"### {name} -> {table}", "",
                    f"Load to existing table **{table}**, key **Legacy SharePoint ID**, delete rows that no longer exist **on**. "
                    f"Expected rows: **{count}**.", "",
                    "```powerquery", render(q).rstrip(), "```", ""]
    out += ["## Notes on particular columns", "",
            "- **Flags List, su_function.** A flag whose function was deleted in SharePoint (flag 89 points at",
            "  deleted function 407) loads with no function instead of failing the row, the same rule the",
            "  Archive uses. The portal does not show a flag that has no function.",
            "- **Deadlines, su_owner.** The function's Compliance Owner (Primary, else the first), for the",
            "  reminder flow.",
            "- **Assessments, su_createdvia.** Created Via is not in the canvas app's metadata, so it is read only",
            "  if the list returns it (`OData__FormSourceId_0`); otherwise it loads blank.",
            "- **Assessment Responses and Assessment Schedule.** The whole item loads as JSON in su_sourcedata",
            "  until their columns are mapped one by one (migration guide, section 4).",
            "- **Dates.** Date-only columns take the UTC date of SharePoint's stored value, which is the Eastern",
            "  calendar day; date-and-time columns load in UTC.", ""]
    return "\n".join(out)


def main() -> int:
    schema = yaml.safe_load(SCHEMA.read_text(encoding="utf-8"))
    sp = json.loads(SP_SCHEMA.read_text(encoding="utf-8"))
    errors = check(schema, sp)
    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        return 1
    if OUT.exists():
        for f in OUT.rglob("*.pq"):
            f.unlink()
    by_df = {i: [q for q in QUERIES if q[0] == i] for i in range(len(DATAFLOWS))}
    for i, (dfname, _) in enumerate(DATAFLOWS):
        d = OUT / f"{i + 1} {dfname}"
        d.mkdir(parents=True, exist_ok=True)
        for q in by_df[i]:
            (d / f"{q[1]}.pq").write_text(render(q), encoding="utf-8")
    DOC.write_text(doc(by_df), encoding="utf-8")
    print(f"{len(QUERIES)} queries in {len(DATAFLOWS)} dataflows written to {OUT} and {DOC}. Checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
