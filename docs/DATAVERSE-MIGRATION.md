# Moving the Compliance Matrix to Dataverse

SharePoint stays the system of record until cutover. The canvas app keeps
running on the SharePoint lists; Power Query dataflows copy those lists into
this solution's Dataverse tables, one way only, as often as you like; the
Power Pages portal runs on Dataverse for a small group of testers until it is
ready to replace the canvas app.

```
SharePoint lists  --(dataflows, upsert on the legacy SharePoint ID)-->  Dataverse  <--  Power Pages portal (testers)
   (canvas app)                         one way                                         CM - Process portal action
```

Every refresh makes Dataverse match SharePoint again, including undoing what
testers changed. That is intended while SharePoint is the system of record.

Contents

1. [Before the first load: data checks](#1-before-the-first-load-data-checks)
2. [Tables and keys](#2-tables-and-keys)
3. [Dataflows: load order and settings](#3-dataflows-load-order-and-settings)
4. [Column mapping, list by list](#4-column-mapping-list-by-list)
5. [Web roles and permissions](#5-web-roles-and-permissions)
6. [People and Contact records](#6-people-and-contact-records)
7. [Evidence files](#7-evidence-files)
8. [CM - Process portal action](#8-cm---process-portal-action)
9. [Auditing](#9-auditing)
10. [What breaks at cutover](#10-what-breaks-at-cutover)
11. [Cutover checklist (one environment)](#11-cutover-checklist-one-environment)

Site: `https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix`

---

## 1. Before the first load: data checks

A dataflow row fails when a lookup points at nothing, or when two rows break
the (function, person, role) key on Function Ownership. Fix these in
SharePoint first, so the first load reconciles cleanly.

Run the queries below in **Excel**: Data > Get Data > From Other Sources >
Blank Query > Advanced Editor, paste, Done. Sign in with your Syracuse account
when asked (Organizational account). Each query becomes a sheet; refresh it
after fixing items to see the list shrink. The ID column is the SharePoint
item ID, so `.../Lists/<list>/DispForm.aspx?ID=<id>` opens the item.

**Shared source** (name this query `Lists`; the others refer to it):

```
let
    Site = "https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix",
    Lists = SharePoint.Tables(Site, [ApiVersion = 15])
in
    Lists
```

**Orphaned owner rows** (person or function missing):

```
let
    Own = Lists{[Title = "Accountability Structure"]}[Items],
    People = List.Buffer(Lists{[Title = "Compliance Directory"]}[Items][Id]),
    Fns = List.Buffer(Lists{[Title = "Compliance Functions"]}[Items][Id]),
    Rows = Table.SelectColumns(Own, {"Id", "Title", "FunctionId", "PersonId", "field_3", "field_4"}),
    Bad = Table.SelectRows(Rows, each [PersonId] = null or not List.Contains(People, [PersonId])
                                   or [FunctionId] = null or not List.Contains(Fns, [FunctionId])),
    Out = Table.AddColumn(Bad, "Problem", each
        if [FunctionId] = null or not List.Contains(Fns, [FunctionId]) then "Function missing" else "Person missing")
in
    Table.RenameColumns(Out, {{"field_3", "Role"}, {"field_4", "SubRole"}})
```

**Duplicate owner rows** (same function, person and role more than once):

```
let
    Own = Lists{[Title = "Accountability Structure"]}[Items],
    Rows = Table.SelectColumns(Own, {"Id", "FunctionId", "PersonId", "field_3"}),
    G = Table.Group(Rows, {"FunctionId", "PersonId", "field_3"}, {
        {"Count", each Table.RowCount(_), Int64.Type},
        {"Item IDs", each Text.Combine(List.Transform([Id], Text.From), ", "), type text}})
in
    Table.RenameColumns(Table.SelectRows(G, each [Count] > 1), {{"field_3", "Role"}})
```

Keep the lowest ID in each group and delete or correct the rest.

**Directory emails** (blank, or used by more than one person; Dataverse
compares email without regard to case):

```
let
    P = Table.SelectColumns(Lists{[Title = "Compliance Directory"]}[Items], {"Id", "Title", "field_1"}),
    Low = Table.AddColumn(P, "Email", each Text.Lower(Text.Trim(Text.From([field_1] ?? "")))),
    G = Table.Group(Low, {"Email"}, {{"Count", each Table.RowCount(_)}, {"People", each Text.Combine([Title], "; ")},
        {"Item IDs", each Text.Combine(List.Transform([Id], Text.From), ", ")}})
in
    Table.SelectRows(G, each [Email] = "" or [Count] > 1)
```

**Child rows pointing at a missing function** (deadlines, flags, gaps):

```
let
    Fns = List.Buffer(Lists{[Title = "Compliance Functions"]}[Items][Id]),
    One = (list) => Table.AddColumn(Table.SelectColumns(
            Table.SelectRows(Lists{[Title = list]}[Items], each [FunctionId] = null or not List.Contains(Fns, [FunctionId])),
            {"Id", "Title", "FunctionId"}), "List", each list)
in
    Table.Combine({One("Deadlines"), One("Flags List"), One("Gap List")})
```

A flag or gap with no function cannot load, because Compliance Function is
required on those tables.

**Choice values in use** (confirms the value maps in section 4):

```
let
    V = (list, col) => Table.FromColumns({List.Distinct(List.Transform(Table.Column(Lists{[Title = list]}[Items], col),
            each if _ is list then Text.Combine(List.Transform(_, Text.From), ", ") else _))}, {list & " / " & col})
in
    V("Deadlines", "field_2")
```

Change the two arguments for each choice column: `"Compliance Functions",
"field_11"`; `"Accountability Structure", "field_3"` and `"field_4"`;
`"Gap List", "field_2"`; `"Flags List", "field_2"`; `"Assessments", "field_17"`
and `"field_18"`. Send me any value the maps do not cover.

**The 23 orphans from the earlier export.** A check of the October CSV
export (`tools/build_seed.py`, run here, never loaded into Dataverse) found 23
owner rows whose person was not in the directory. Those
rows carry the export's own keys (FO numbers), not SharePoint IDs, so use the
Orphaned owner rows query above for the current list; these names show where
to look:

| Person (as written in the export) | Rows |
|---|---|
| Sheila Johnson-Willis | 4 (FO0309, FO0485, FO0486, FO0751) |
| Katie Scanlon | 3 (FO0218, FO0221, FO0225) |
| Jason D. Tripp | 2 (FO0201, FO0204) |
| Director of Sports Medicine | 2 (FO0253, FO0255) |
| Advancement Services Telefund Manager | 1 (FO0269) |
| Anne Lombard, Heather Pallone, Jamie Mullin, Jennifer Zalewski, Karen Spear, Kevin Turi, Kristen Jones-Kolod, Mike Paparo, Renee Briggs, Sean McCarthy, Simone Adams | 1 each |

Two of them are job titles, not people; they need a named person in the
directory.

**What writes to Assessment Responses and Assessment Schedule.** These lists
are not in the canvas app, so something else fills them. To find it:

1. Open the list > Settings (gear) > List settings > Columns. A column named
   **Created Via** means the list has a Microsoft Lists form; Assessments and
   Compliance Directory already have one. Open the list and choose **Forms**
   in the command bar to see it.
2. Open the list > **Integrate** > **Power Automate** > **See your flows**.
   This only shows flows you own or that are shared with you.
3. Look at **Created By** on the items. A person means someone typed it; a
   service account, "SharePoint App", or the owner of a flow connection means
   a flow wrote it.
4. In Microsoft Forms, open the office's assessment forms > Responses >
   **Automate** (or "Open in Excel"); a connected flow shows there.
5. Ask IT (Power Platform administrator) for a list of flows in the tenant
   that use the SharePoint connector against `SyracuseComplianceMatrix`. The
   admin center's flow inventory, or the PowerShell cmdlet `Get-AdminFlow`,
   can filter by connector; a flow owned by someone else will not show in
   your own Power Automate list.

Whatever you find goes on the cutover list in section 10.

---

## 2. Tables and keys

### Installing the solution (first install)

SU Compliance Office has never had this solution, its publisher, or any su_
table, so the first import creates them:

- the publisher **Syracuse University** (`syracuseuniversity`), prefix `su`,
  option value prefix 10000, so choice values start at 100000000;
- the solution **Compliance Matrix** (`ComplianceMatrix`);
- 16 tables and 14 global choices, all empty.

1. Extract `ComplianceMatrix-solution-src.zip`. You get a `src` folder holding
   `Entities`, `OptionSets` and `Other`.
2. In a terminal in the folder that holds `src`:
   ```
   pac solution pack --zipfile ComplianceMatrix.zip --folder src --packagetype Unmanaged
   ```
   It ends with "Unmanaged Pack complete." and lists no warnings. A warning
   about unexpected children, or about root components not defined, means the
   folder is not this version; stop and tell me.
3. make.powerapps.com > SU Compliance Office > **Solutions** > **Import
   solution** > choose `ComplianceMatrix.zip` > Next > Import. When it
   finishes, choose **Publish all customizations**.
4. Check: Solutions lists Compliance Matrix, published by Syracuse
   University; Tables (filter: Custom) lists the 16 su_ tables; each table >
   **Keys** shows **Active**. Keys are built after the import and can take a
   few minutes.
5. **Clear the site's configuration.** Sign in to the site as an
   administrator, open `/_services/about`, and choose **Clear config**. The
   site reads table and relationship metadata into its configuration, so it
   does not see what an import added until this is done; **Clear cache**
   alone is not enough. Do this after every solution import, the first and
   each one after.

The tables are user-owned: a row belongs to whoever created it (you, or the
connection a dataflow or flow runs as). Ownership does not decide what the
portal shows; table permissions do (section 5).

**Three columns to add by hand.** The canvas app reads three computed
columns; the portal does not use them. A solution file cannot carry their
definitions reliably, so add them after the import: Tables > the table >
Columns > **New column**, with these names (the `su_` prefix is added for
you):

| Table | Display name | Name | Data type | Definition |
|---|---|---|---|---|
| Compliance Function | Open Gaps | su_opengapcount | Whole number, behavior **Rollup** | Related table: Compliance Gaps (su_compliancefunction_su_compliancegap). Filter: Status does not equal Closed. Aggregation: Count of Compliance Gap |
| Compliance Function | Next Due Date | su_nextduedate | Date only, behavior **Rollup** | Related table: Compliance Deadlines (su_compliancefunction_su_compliancedeadline). Filter: Complete equals No. Aggregation: Min of Next Due Date (su_duedate) |
| Compliance Gap | Days Open | su_daysopen | **Formula** | `If(IsBlank(Closed), DateDiff(Opened, UTCToday()), DateDiff(Opened, Closed))` (Opened and Closed are su_openeddate and su_closeddate) |

Rollups recalculate about once an hour; a rollup's **Recalculate** link
updates one row at once.

### Keys

`legacyKey: true` in `solution/schema/dataverse-schema.yaml` adds a Whole
Number column **su_legacyspid** (Legacy SharePoint ID) and an alternate key
**su_key_legacyspid** on it. Dataflows upsert on that key, and lookups from
child rows resolve through the parent's key.

| SharePoint list (items today) | Dataverse table | Keys |
|---|---|---|
| Risk Areas (13) | su_riskarea | su_legacyspid; su_riskareacode |
| Domains (61) | su_domain | su_legacyspid; su_domaincode |
| Compliance Directory (138) | su_compliancedirectory | su_legacyspid; su_email |
| Compliance Functions (392) | su_compliancefunction | su_legacyspid; su_functioncode |
| Accountability Structure (1,174) | su_functionownership | su_legacyspid; (su_function, su_person, su_role) |
| Deadlines (146) | su_compliancedeadline | su_legacyspid |
| Flags List (60) | su_functionflag | su_legacyspid |
| Gap List (22) | su_compliancegap | su_legacyspid (su_gapcode is no longer a key: it is multi-choice and repeats) |
| Assessments (9) | su_assessment | su_legacyspid; su_assessmentcode |
| Assessment Responses (4) | su_assessmentresponse | su_legacyspid |
| Assessment Schedule (1) | su_assessmentschedule | su_legacyspid |
| Archive (103) | su_archive | su_legacyspid |

Four tables have no SharePoint list behind them, so the dataflows do not load
them and they start empty: **su_portalaction** (section 8),
su_counselassignment, su_assessmentowner and su_appadmin.

**Function ID.** su_functioncode is loaded with the SharePoint ID, so the
portal shows the same number people know. It is an autonumber column
(`{SEQNUM:1}`): a value the dataflow writes is kept, and a function created in
the portal gets the next number. Set the seed (Tables > Compliance Function >
Columns > Function ID > Seed value) to **90000** during testing, so a test
function can never take a number SharePoint will use next, and to **the
highest SharePoint ID plus one** at cutover.

**Blank key values.** Rows created in the portal have no legacy ID. Before the
first load, confirm the environment accepts more than one blank value under
a key: add two risk areas in the maker portal with no Legacy SharePoint ID,
then delete them. If the second is refused, tell me before going further;
the fix is to remove the legacy keys at cutover, which section 11 already
does.

---

## 3. Dataflows: load order and settings

Create them in make.powerapps.com > Dataflows > New dataflow > Start from
blank, one per tier, **in this order**. A lookup to a row created in the same
refresh can fail, so each tier loads only after the one before it.

| Dataflow | Lists | Needs |
|---|---|---|
| CM Load 1 - People and areas | Risk Areas, Compliance Directory | nothing |
| CM Load 2 - Domains | Domains | 1 |
| CM Load 3 - Functions | Compliance Functions (merged with Accountability Structure for the three owner lookups) | 1, 2 |
| CM Load 4 - Assessments | Assessments | 1, 3 |
| CM Load 5 - Records | Accountability Structure, Deadlines, Flags List, Gap List, Assessment Responses, Assessment Schedule, Archive | 1, 3, 4 |

For every query, on the **Map tables** step:

- **Load to existing table**, the table in section 2.
- **Select key: su_key_legacyspid** (Legacy SharePoint ID).
- Map each column as in section 4. Lookups show as
  `su_riskarea.su_legacyspid` and so on: map the source column that holds the
  parent's SharePoint ID.
- **Delete rows that no longer exist in the query output: on.** This is what
  makes the copy a mirror: items deleted in SharePoint go, and so do rows
  testers created in the portal.
- Leave **su_contact** and every column section 4 does not list unmapped, so
  links and portal-only values are not cleared.

**Source.** Use the SharePoint Online list connector's **1.0 implementation**,
or paste the `Source` step below. It returns internal names (`field_3`) and
lookup IDs (`RiskAreaId`), which is what section 4 uses; the 2.0
implementation returns display names instead.

```
Source = SharePoint.Tables("https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix", [ApiVersion = 15]),
Items = Source{[Title = "Compliance Functions"]}[Items]
```

**Shared helpers** (add as queries in each dataflow; untick **Enable load**):

```
// Choice: label to option value, null when blank or not in the map
Choice = (map as record, v) as any =>
    let t = if v = null then null else Text.Trim(Text.From(if v is record then v[Value] else v))
    in if t = null or t = "" then null else Record.FieldOrDefault(map, t, null),

// Multi-choice: the values joined with ", "
Multi = (v) as nullable text =>
    if v = null then null
    else if v is list then Text.Combine(List.Transform(v, Text.From), ", ")
    else if v is record and Record.HasFields(v, "results") then Text.Combine(List.Transform(v[results], Text.From), ", ")
    else Text.From(v),

// Hyperlink: the URL part
Link = (v) as nullable text => if v = null then null else if v is record then v[Url] else Text.From(v),

// Date-only: SharePoint stores Eastern midnight (04:00 or 05:00 UTC), so the UTC date is the right day
Day = (v) as nullable date => if v = null then null else Date.From(DateTimeZone.ToUtc(DateTimeZone.From(v))),

// Text that must not be blank
OrElse = (v, fallback as text) as text => let t = Text.Trim(Text.From(v ?? "")) in if t = "" then fallback else t
```

Choice maps (also helper queries):

```
RiskMap     = [High = 100000001, Moderate = 100000002, Low = 100000003],
RoleMap     = Record.FromList({100000030, 100000031, 100000032, 100000033, 100000034},
                              {"Executive Owner", "Unit Owner", "Compliance Owner", "General Counsel", "Support"}),
SubRoleMap  = [Primary = 100000040, Advisory = 100000041, Support = 100000042],
CadenceMap  = Record.FromList({100000010, 100000010, 100000011, 100000011, 100000012, 100000013, 100000014, 100000015, 100000016, 100000016},
                              {"Annual", "Annually", "Semi-Annual", "Semiannual", "Quarterly", "Monthly", "Biennial", "Ongoing", "One-time", "One-Time"}),
GapStatusMap = Record.FromList({100000020, 100000022, 100000021}, {"Open", "In Progress", "Closed"}),
FlagSourceMap = [Manual = 100000110, Survey = 100000111]
```

**Refreshing.** Run the five in order from the Dataflows page (Refresh now),
or schedule them an hour apart. A refresh's history shows each failed row
and why.

**Reconciling the first load.** Compare Dataverse row counts (Tables > the
table > Data, or Advanced Find) with these baselines from SharePoint. A
shortfall is a failed row; the refresh history names it.

| List | SharePoint today | Dataverse after load |
|---|---|---|
| Risk Areas | 13 | 13 |
| Domains | 61 | 61 |
| Compliance Directory | 138 | 138 |
| Compliance Functions | 392 | 392 |
| Accountability Structure | 1,174 | 1,174 less orphans and duplicates (section 1) |
| Deadlines | 146 | 146 less rows with a missing function |
| Flags List | 60 | 60 less rows with a missing function |
| Gap List | 22 | 22 less rows with a missing function |
| Assessments | 9 | 9 |
| Assessment Responses | 4 | 4 |
| Assessment Schedule | 1 | 1 |
| Archive | 103 | 103 |

The tables start empty, so the first refresh creates each row and later
refreshes update them in place.

---

## 4. Column mapping, list by list

Every list: **`Id` maps to `su_legacyspid`**. "Lookup" means: map the source
column to the parent table's `su_legacyspid`. Columns SharePoint adds to every
list (Created, Modified, Author, Editor, Attachments, Compliance Asset Id,
Color Tag) are not loaded, except where noted.

### Risk Areas → su_riskarea

| SharePoint | Dataverse | Transform |
|---|---|---|
| Id | su_riskareacode | `Text.From([Id])` |
| Title | su_name | |
| field_1 (ColorHex) | su_colorhex | |

### Domains → su_domain

| SharePoint | Dataverse | Transform |
|---|---|---|
| Id | su_domaincode | `Text.From([Id])` |
| Title | su_name | |
| RiskAreaId | su_riskarea | lookup |

### Compliance Directory → su_compliancedirectory

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | |
| field_1 (Email) | su_email | `Text.Lower(Text.Trim([field_1]))` |
| (none) | su_active | `true` |

Not in SharePoint, so not mapped: title, unit, phone, location, NetID,
su_contact (section 6). The list's Created Via column is not loaded.

### Compliance Functions → su_compliancefunction

| SharePoint | Dataverse | Transform |
|---|---|---|
| Id | su_functioncode | `Text.From([Id])` |
| Title | su_name | |
| RiskAreaId | su_riskarea | lookup |
| DomainId | su_domain | lookup |
| field_3 (Statute) | su_statute | |
| field_4 (StatuteCitation) | su_citation | |
| field_5 (StatuteURL) | su_statuteurl | `Link([field_5])` |
| field_6 (Description) | su_description | |
| field_7 (ReportingRequirement) | su_reporting | |
| field_8 (DeadlineNarrative) | su_deadlinenarrative | |
| field_9 (ResourceLabel) | su_resourcelabel | |
| field_10 (ResourceURL) | su_resourceurl | `Link([field_10])` |
| field_11 (ComplianceRiskRating) | su_risk | `Choice(RiskMap, [field_11])`; blank and "Not Scored" give null |
| LastAssessedDate | su_lastreviewed | `Day([LastAssessedDate])` |
| NextDueDate | not loaded | su_nextduedate is a rollup over the deadlines |
| (from Accountability Structure) | su_executiveowner, su_unitowner, su_complianceowner | lookups; see below |

The three owner lookups are each role's Primary person, else its first row,
the same rule the portal uses:

```
Own = Table.Buffer(Table.SelectColumns(Source{[Title = "Accountability Structure"]}[Items], {"Id", "FunctionId", "PersonId", "field_3", "field_4"})),
PickFor = (fid, role) => let
        rows = Table.SelectRows(Own, each [FunctionId] = fid and [field_3] = role and [PersonId] <> null),
        prim = Table.SelectRows(rows, each [field_4] = "Primary"),
        pick = Table.Sort(if Table.RowCount(prim) > 0 then prim else rows, {"Id"})
    in if Table.RowCount(pick) = 0 then null else pick{0}[PersonId],
WithOwners = Table.AddColumn(Table.AddColumn(Table.AddColumn(Items,
    "ExecLegacyId", each PickFor([Id], "Executive Owner")),
    "UnitLegacyId", each PickFor([Id], "Unit Owner")),
    "ComplianceLegacyId", each PickFor([Id], "Compliance Owner"))
```

Text limits are now at least SharePoint's (4000 for single-line text, the
Dataverse maximum for multiline), so nothing is truncated.

### Accountability Structure → su_functionownership

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | `OrElse([Title], Text.From([FunctionId]) & " | " & Text.From([PersonId]) & " | " & [field_3])` |
| FunctionId | su_function | lookup |
| PersonId | su_person | lookup |
| field_3 (Role) | su_role | `Choice(RoleMap, [field_3])` |
| field_4 (SubRole) | su_subrole | `Choice(SubRoleMap, [field_4]) ?? 100000040` (blank is Primary; General Counsel rows have none) |

General Counsel (100000033) and Support (100000034) are new options. The
(function, person, role) key stays: a duplicate fails until it is fixed in
SharePoint (section 1).

### Deadlines → su_compliancedeadline

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | `OrElse([Title], "Deadline " & Text.From([Id]))` |
| FunctionId | su_function | lookup |
| field_1 (DueDate) | su_duedate | `Day([field_1])` |
| field_2 (Cadence) | su_cadence | `Choice(CadenceMap, [field_2])` |
| field_2 (Cadence) | su_cadencetext | the value as entered, so Bi-monthly, Triennial, Daily and the like are kept |
| field_2 (Cadence) | su_deadlinetype | One-time gives 100000074 (One-time, new); Ongoing gives 100000072; anything else 100000070 (Fixed Recurring) |
| field_3 (DeadlineNarrative) | su_narrative | new column |
| field_4 (LastCompletedDate) | su_completeddate | `Day([field_4])` |
| field_4, field_2 | su_complete | `true` only when cadence is One-time and field_4 has a date |
| field_5 (CompletedReason) | su_completedreason | new column |
| field_6 (CompletedByName) | su_completedbydisplayname | new column (not su_completedbyname, which Dataverse reserves for the su_completedby lookup) |
| field_7 (CompletedDateTime) | su_completedon | new column |
| CompletedById | su_completedby | lookup, new column |
| (parent function) | su_owner | optional: the function's ComplianceLegacyId, for the reminder flow |

Not loaded: su_risk (a copy of the function's rating; the rating lives in one
place, section 5).

Option 100000071 is **Event-Relative**: a deadline whose clock starts at an
event (a trigger and an offset, no calendar date). No SharePoint cadence maps
to it today.

### Flags List → su_functionflag

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | `OrElse([Title], Text.Start(OrElse([field_1], "Flag"), 120))` |
| FunctionId | su_function | lookup |
| FlaggedById | su_flaggedby | lookup |
| field_1 (EntryText) | su_reason | `OrElse([field_1], "(no text)")` (required) |
| field_2 (Source) | su_source | `Choice(FlagSourceMap, [field_2])` |
| field_3 (Completed) | su_status | `if [field_3] = true then 100000051 else 100000050` (Cleared, Active) |
| field_4 (CreatedDate) | su_flaggedon | `Day([field_4] ?? [Created])` |
| RespondentEmail | su_respondentemail | new column |

Cleared By and Cleared On are not on the list; the matching Archive rows
(Record Type "Flag Resolution", Source Item ID = the flag's ID) carry them.

### Gap List → su_compliancegap

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | |
| field_1 (GapCode, multi-choice) | su_gapcode | `Multi([field_1]) ?? "GAP-" & Text.From([Id])` |
| field_2 (Status) | su_status | `Choice(GapStatusMap, [field_2]) ?? 100000020` |
| field_3 (GapSource) | su_gapsource | new column |
| field_6 (CorrectiveMeasure) | su_note | |
| field_7 (ResponsibleUnit) | su_responsibleunit | new column (the portal shows it) |
| field_9 (TargetQuarter, multi-choice) | su_targetquarter | `Multi([field_9])` |
| field_10 (TargetFY) | su_targetfy | |
| field_11 (AssessedDate) | su_openeddate | `Day([field_11] ?? [Created])` |
| field_13 (ClosedDate) | su_closeddate | `Day([field_13])` |
| field_14 (ClosureNote) | su_closenote | |
| field_20 (NeedsRemediationPlan) | su_needsremediationplan | new column |
| field_21 (SourceFile) | su_sourcefile | new column |
| FunctionId | su_function | lookup |
| AssessmentId | su_assessment | lookup |
| ResponsiblePersonId | su_owner | lookup |
| ClosedById | su_closedby | lookup |

su_severity has no SharePoint source and stays blank; the portal shows the
function's rating instead.

### Assessments → su_assessment

Every column is kept. Choice columns whose values are not confirmed load as
text, so no value is forced into the wrong option.

| SharePoint | Dataverse | Transform |
|---|---|---|
| Id | su_assessmentcode | `Text.From([Id])` |
| Title | su_name | |
| FunctionId | su_function | lookup, new column |
| RespondentId | su_respondent | lookup to the directory, new column |
| RespondentEmail | su_respondentemail | new |
| field_6 (RespondentUnit) | su_unit | |
| field_2 (AssessmentDate) | su_assessmentdate | `Day([field_2])` |
| field_3 (FiscalYear) | su_fiscalyear | new |
| field_4 (Method) | su_method | new, text |
| field_7 (AssessedBy) | su_assessedby | new |
| field_8 (MissingControlCount) | su_keycontrolsmissing | `Number.Round([field_8])` |
| field_9 (OpenControlGapsNow) | su_opencontrolgaps | new, decimal |
| field_10 (FrequencyBand) | su_frequencyband | new, text |
| field_11 (ImpactAnswer) | su_impactanswer | new, text |
| field_12 (PressureAnswer) | su_pressureanswer | new, text |
| field_13 (InternalRisk_AsAssessed) | su_internalriskasassessed | new, decimal |
| field_14 (ExternalRisk) | su_externalrisk | new, decimal |
| field_15 (UniversityRisk_AsAssessed) | su_universityriskasassessed | new, text |
| field_16 (InternalRisk_Current) | su_internalriskcurrent | new, decimal |
| field_17 (UniversityRisk_Current) | su_universityriskcurrent | new, text |
| field_17 | su_risk | `Choice(RiskMap, [field_17])`, when the value is High, Moderate or Low |
| field_18 (Status, multi-choice) | su_statustext | `Multi([field_18])`, new |
| field_18 | su_status | only when the single value matches Drafting, Report Complete, Finalized or Closed |
| field_19 (QuestionnaireVersion) | su_questionnaireversion | new |
| field_20 (SourceFile) | su_sourcefile | new |
| field_21 (Notes) | su_notes | new, multiline |
| ReferenceCode | su_referencecode | new |
| FormsResponseId | su_formsresponseid | new |
| SubmittedOn | su_submittedon | new, date and time |
| OData__FormSourceId_0 (Created Via) | su_createdvia | new |

### Assessment Responses → su_assessmentresponse, Assessment Schedule → su_assessmentschedule

Their columns are not in the canvas app's metadata, so they are not yet
mapped one by one. Until they are, the whole item loads as JSON, so nothing
is lost:

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | `OrElse([Title], "Item " & Text.From([Id]))` |
| (the whole item) | su_sourcedata | `Text.FromBinary(Json.FromValue(Record.RemoveFields(_, {"FirstUniqueAncestorSecurableObject", "RoleAssignments", "AttachmentFiles", "ContentType", "GetDlpPolicyTip", "FieldValuesAsHtml", "FieldValuesAsText", "FieldValuesForEdit", "File", "Folder", "LikedByInformation", "ParentList", "Properties", "Versions"}, MissingField.Ignore)))` |
| Created | su_sourcecreated | |
| Modified | su_sourcemodified | |

To map them properly, open each of these signed in, and send me what comes
back:

```
https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix/_api/web/lists/getbytitle('Assessment Responses')/fields?$select=Title,InternalName,TypeAsString,Choices,LookupList&$filter=Hidden eq false and ReadOnlyField eq false
https://sumailsyr.sharepoint.com/sites/SyracuseComplianceMatrix/_api/web/lists/getbytitle('Assessment Schedule')/fields?$select=Title,InternalName,TypeAsString,Choices,LookupList&$filter=Hidden eq false and ReadOnlyField eq false
```

### Archive → su_archive

| SharePoint | Dataverse | Transform |
|---|---|---|
| Title | su_name | `OrElse([Title], "Archive " & Text.From([Id]))` |
| field_1 (RecordType) | su_recordtype | |
| field_2 (EventType) | su_eventtype | |
| field_3 (FunctionName) | su_archivedfunctionname | not su_functionname, which Dataverse reserves for the su_function lookup |
| field_4 (FunctionID) | su_functionnumber | `Number.Round([field_4])` |
| field_4 | su_function | lookup to su_compliancefunction.su_legacyspid, only while the function exists (blank the column otherwise, or the row fails) |
| field_5 (ResolvedBy) | su_resolvedby | |
| field_6 (ResolvedDateTime) | su_resolvedat | as text, as stored |
| field_7 (SourceItemID) | su_sourceitemid | |
| field_8 (Reason) | su_reason | |
| field_9 (CompletedOccurrence) | su_completedoccurrence | |
| field_10 (Cadence) | su_cadence | |
| field_11 (FlaggedBy) | su_flaggedby | |
| field_12 (FlaggedDate) | su_flaggeddate | |
| field_13 (FlagSource) | su_flagsource | |

For the su_function lookup, merge against the Compliance Functions IDs:
`if List.Contains(FunctionIds, [field_4]) then [field_4] else null`.

---

## 5. Web roles and permissions

**Web roles**

| Role | Who | When |
|---|---|---|
| Compliance Matrix Testers | the small test group | until cutover |
| Compliance Matrix Administrators | compliance office staff (`ComplianceMatrix/AdminWebRole`) | always |
| Authenticated Users | every signed-in person | takes over the Testers rows at cutover |

The matrix page's permissions (Design Studio > Pages > Compliance Matrix >
Permissions) are Testers and Administrators until cutover. Administrators also
need the Testers' table permissions below, or should hold both roles.

**Table permissions** (Design Studio > Set up > Table permissions). Read is
app-faithful: everyone who can open the page can browse every function,
person, deadline and gap, as in the canvas app; what they can change is
narrow, and who did it is written server-side.

| Name | Table | Access | Privileges | Roles |
|---|---|---|---|---|
| CM Read | su_riskarea, su_domain, su_compliancefunction, su_compliancedirectory, su_functionownership, su_counselassignment, su_compliancedeadline, su_compliancegap, su_functionflag | Global | Read | Testers, Administrators |
| CM Log a gap | su_compliancegap | Global | Create, Append | Testers |
| CM Gap lookups | su_compliancefunction, su_compliancedirectory | Global | Append To | Testers |
| CM Portal action form | su_portalaction | Global | Create, Append | Testers, Administrators |
| CM Action targets | su_compliancefunction, su_compliancedeadline, su_compliancegap, su_functionflag | Global | Append To | Testers, Administrators |
| CM Self | contact | Self | Read, Append To | Testers, Administrators |
| CM Administer | su_riskarea, su_domain, su_compliancefunction, su_compliancedirectory, su_functionownership, su_counselassignment, su_compliancedeadline, su_compliancegap, su_functionflag | Global | Create, Read, Write, Delete, Append, Append To | Administrators |
| CM Assessments (read) | su_assessment, su_assessmentresponse, su_assessmentschedule | Global | Read | Administrators |

Nobody gets a permission on **su_archive**, and its Web API site setting stays
off: only the action flow (section 8) and the dataflow write it.

Owners have no Write on deadlines, gaps or flags at all: completing,
reversing, closing, raising and resolving go through su_portalaction. A
Portal Action is created only by the CM Portal Action basic form, which sets
Requested By to the signed-in contact on the server (section 8). CM Portal
action form has no Read and the Web API is off for su_portalaction, so the
browser cannot create, list or change an action row any other way.

Do not scope this permission by Contact: the section 8 scope test showed
Power Pages does not use a Contact scope to refuse a new row that names
another contact, and it refuses the link to contact unless Append To on
contact is Global.

**Column permissions** (Design Studio > Set up > Column permissions; enhanced
data model). Make these read-only for Testers and Administrators, so a crafted
request cannot set them directly:

| Table | Columns |
|---|---|
| su_compliancedeadline | su_completedby, su_completedbydisplayname, su_completedon, su_completedreason, su_completeddate, su_complete |
| su_compliancegap | su_closedby, su_closeddate |
| su_functionflag | su_flaggedby, su_clearedby, su_clearedon |
| su_compliancefunction | su_functioncode |

**Web API site settings** (Portal Management > Site Settings), each `true`
and `*`: `Webapi/<table>/enable` and `Webapi/<table>/fields` for su_riskarea,
su_domain, su_compliancedirectory, su_compliancefunction,
su_functionownership, su_compliancedeadline, su_compliancegap,
su_functionflag, su_counselassignment. **Not su_archive, su_portalaction or
contact.** If `Webapi/su_portalaction/*` or `Webapi/contact/*` settings were
added for the scope test, delete them: with them off, the Web API refuses any
request to create a Portal Action, whoever it names.

**If risk ratings may not be visible to everyone.** The rating lives in one
column, su_compliancefunction.su_risk, with no copies (the deadline's su_risk
is not loaded and gaps no longer copy it), so it can move without hunting for
duplicates:

1. Add a table **su_functionrating**: su_function (lookup, key), su_risk
   (choice su_risklevel), su_legacyspid (the function's ID).
2. Load it in dataflow 3 from Compliance Functions field_11; stop mapping
   su_risk on the function and clear it.
3. List the function's Web API fields explicitly (`Webapi/su_compliancefunction/fields`
   = every column except su_risk).
4. Permissions on su_functionrating: Read through the ownership chain for
   owners (parent permissions from CM Self > directory via su_contact >
   ownership via su_person > function > rating), and Global for
   administrators.
5. The portal reads ratings from the new table and shows none where the
   viewer cannot read one. That is one change in the Dataverse adapter
   (`src/data/adapters/dataverse.js`, the functions' `risk`), which I can make
   once Christine decides.

---

## 6. People and Contact records

Power Pages knows a signed-in person as a **Contact**. The matrix knows them as
a **Compliance Directory** row, which Function Ownership points at. The lookup
**su_compliancedirectory.su_contact** (Portal Contact) joins the two. The
action flow (section 8) uses it to tell who acted, and the matrix page uses
it to tell who is signed in ("Assigned to you", and the actions an owner is
offered).

**The link does not use the contact's email.** On SU Compliance Office a
contact can have no email at all (the site does not capture it at first
sign-in, and the claims-mapping settings had no effect). The link is made
from the person's **Microsoft Entra account** instead:

1. At sign-in, Power Pages writes an **External Identity** row
   (adx_externalidentity) for the contact. Its **Username** (adx_username)
   is the identifier the Entra provider sent. Microsoft's FAQ on OpenID
   Connect in Power Pages
   (https://learn.microsoft.com/en-us/power-pages/security/authentication/openid-faqs)
   says this is the value of the **sub** claim or of the **object ID (oid)**
   claim. Only the object ID can be looked up in Entra, so check which one
   your site stores first (below).
2. A flow looks that object ID up in Entra with the **Office 365 Users**
   connector and gets the account's user principal name (NetID@syr.edu) and
   mail address.
3. It links the contact to the one active Compliance Directory row whose
   email is that UPN or mail address.

A signed-in person cannot choose these values. No web role has a permission on External
Identity, so a signed-in person cannot write their own Username. Only
administrators set UPN and mail in Entra, and only administrators can write
su_contact (it is in no tester's table permission, and the dataflows leave
it unmapped).

**First, check what Username holds.** make.powerapps.com > Tables > External
Identity > Data. Find your own row (Contact = you) and note its **Username**
and **Identity Provider** (adx_identityprovidername). Then Entra admin
center > Users > you > Overview > **Object ID**.

- **They match:** go on. Copy the Identity Provider value exactly; the flows
  filter on it.
- **They differ:** Username is the sub claim. Stop and tell me; do not change
  the provider's settings to fix it, because existing sign-ins are matched
  on the value already stored.

**Connector and permissions**

- **Office 365 Users**, action **Get user profile (V2)**. Its **User (UPN)**
  input takes a user principal name or an object ID. Set **Select fields** to
  `id,userPrincipalName,mail,accountEnabled,userType` so nothing else is
  read.
- The connector reads Entra as the account its connection signs in with.
  That is ordinary directory read access for a member account, and it
  normally needs no admin consent or app registration. Use a licensed member account
  that owns the solution's flows (a service account if you have one, not a
  guest), and make the connection through a **connection reference** in the
  solution.
- The environment's data loss prevention policy must put **Office 365
  Users** in the same group as **Microsoft Dataverse**, or the flow cannot be
  saved. Ask IT if it is in another group.
- If the tenant restricts members from reading other users' profiles, Get
  user profile (V2) returns 403 for other people; IT can grant the
  connection account directory read access, or exempt it.

**CM - Link directory to contact** (automated cloud flow, in the solution)

1. Trigger: Dataverse, **When a row is added, modified or deleted**, change
   type **Added**, table **External Identities**. Trigger condition:
   `@equals(triggerOutputs()?['body/adx_identityprovidername'], '<the Identity Provider value you copied>')`.
2. **Get user profile (V2)**, User (UPN) = the row's **Username**, Select
   fields as above. On failure (no such user): stop and email the compliance
   office with the contact's name. If **userType** is not `Member` or
   **accountEnabled** is false, stop.
3. List rows, **Compliance Directory**, filter
   `(su_email eq '<userPrincipalName>' or su_email eq '<mail>') and su_active eq true`
   (leave out the mail clause when mail is empty; Dataverse compares text
   without regard to case).
4. Continue only when exactly one row comes back, **its Portal Contact is
   empty**, and no other directory row already has this contact (List rows,
   `_su_contact_value eq <the row's Contact>`). Otherwise stop and email the
   compliance office: two directory rows share the address, the person is
   not in the directory, or the link would move. An administrator sets or
   changes a link by hand.
5. Update a row, Compliance Directory, that row's ID, **Portal Contact** =
   `contacts(<the External Identity's Contact>)`.

**CM - Link contact to directory** (automated cloud flow, in the solution):
the same from the other side, for someone who signed in before they were
added to the directory, or whose directory email was corrected.

1. Trigger: **When a row is added or modified**, Compliance Directory,
   select columns `su_email`.
2. Get user profile (V2), User (UPN) = **su_email**. No such user: stop
   (the person may not have an Entra account yet).
3. List rows, External Identities, filter
   `adx_username eq '<id>' and adx_identityprovidername eq '<the Identity Provider value>'`.
   None: stop (they have not signed in yet; the first flow links them when
   they do).
4. Link under the same three conditions as step 4 above.

**For people who signed in before these flows existed** (you included): save a
copy of CM - Link directory to contact, replace its trigger with **Manually
trigger a flow** plus List rows on External Identities filtered on the
Identity Provider value, put steps 2 to 5 inside an **Apply to each**, and run
it once. Then delete the copy.

**Test it.** After the one-off run, open your own Compliance Directory row:
Portal Contact is your contact (9d4cbc03-...). Then sign in as a tester whose
contact has no email and open the matrix: Home's "Assigned to you" lists
their functions.

**The claims-mapping settings.** Delete
`Authentication/OpenIdConnect/AzureAD/LoginClaimsMapping` and
`Authentication/OpenIdConnect/AzureAD/RegistrationClaimsMapping`. They had no
effect, and nothing in this design reads the contact's email. Set
`Authentication/LoginTrackingEnabled` back to false, or delete it; nothing
depends on it.

**The profile email.** Keep Email read-only on the profile page. On this site
the profile page is Power Pages' built-in one (`/profile`), and its fields
come from the Dataverse form **Profile Web Form (Enhanced)** on Contact:
make.powerapps.com > Tables > Contact > Forms > Profile Web Form (Enhanced) >
Email > Properties > **Read-only**, then save and publish. The link no
longer depends on it, but it stops a contact's email being edited to look
like someone else's.

**On the SharePoint backend** the page has no Portal Contact link and still
finds the signed-in person by the contact's email, so a contact with no
email sees "Nothing assigned" there.

---

## 7. Evidence files

su_compliancefunction and su_assessment are created with **document
management enabled**, so Power Pages' SharePoint document management can be
added later without changing the tables. Nothing is bound yet. When you are
ready:

1. Power Platform admin center > the environment > Settings > Integration >
   Document management settings: point it at the Compliance Matrix site.
2. Choose the two tables. Dataverse creates a library per table by default; to
   use the existing **Compliance Evidence** library instead, create a Document
   Location for that library under the site, and one per record (a folder such
   as `Function 201`) under it.
3. Power Pages: Set up > SharePoint integration > Enable.
4. Table permissions: on su_compliancefunction (and su_assessment) add a child
   permission on **Document Location** (sharepointdocumentlocation) with Read,
   Create, Append, and Append To on the parent; on the records the person may
   see.
5. Add the documents to the page with a basic form subgrid or the Web API.

---

## 8. CM - Process portal action

The browser never writes who did something or an archive entry. It records a
**Portal Action** row through a Power Pages basic form, then calls this flow
with the row's ID. The flow reads everything it acts on from Dataverse,
starting from that row; it ignores anything else the request carries.

**Who made the request.** Requested By (su_requestedby) is set by Power
Pages on the server, never by the browser. The CM Portal Action basic form
has **Associate Current Portal User on Insert** turned on with Requested By
as the portal user lookup column. Microsoft's description of that setting
(About basic forms, Additional settings,
https://learn.microsoft.com/en-us/power-pages/configure/basic-forms): it
"indicates the currently logged in user's record should be associated with
the target table record", in the lookup column named in the next setting.
The signed-in user is the session's, not a value in the post. Requested By
is not a field on the form, and a basic form saves only its own fields, so a
value added to the request is ignored. The test below proves that on your
site.

Nobody has Read or Write on the table and the Web API is off for it, so a
row cannot be re-pointed after it is made, and the flow processes a row only
while its Status is empty or Pending, so it cannot be replayed. The person is
then the Compliance Directory row whose Portal Contact is that contact
(section 6). That link comes from the person's Entra account, not the
contact's email, so it works for a contact with no email.

Why not the other two ways:

- **The Web API with a Contact-scoped permission** (the earlier design). The
  scope test showed it cannot be both usable and safe: with Self-scoped
  Append To on contact the link is refused for everyone (error 90040106,
  EntityPermissionAppendToIsMissingDuringAssociationChange), and with Global
  Append To the Contact scope does not refuse a row naming another contact.
- **The contact the cloud flow trigger passes.** Community posts say the
  "When Power Pages calls a flow" trigger carries the caller's contact ID,
  but I could not find that in Microsoft's documentation, so the design does
  not depend on it.

**Set up the form** (by hand; nothing here is in the solution):

1. **A main form.** make.powerapps.com > Tables > Portal Action > Forms > New
   form > Main form, named **CM Portal Action**. Fields: Action (su_name),
   Action Type, Reason, Compliance Function, Deadline, Gap, Flag. Remove
   Owner. Leave Requested By, Status, Result and Processed On off the form.
   Save and publish.
2. **Two pages.** Design Studio > Pages > + Page, blank:
   - **CM Action**, partial URL **`cm-action`**, directly under Home.
   - **CM Action Done**, partial URL **`cm-action-done`**, directly under
     Home, with any short text such as "Recorded."
   For both: hide from navigation, and Permissions = Testers and
   Administrators. The matrix opens `/cm-action/` itself, so the partial
   URLs must be exactly these.
3. **The basic form.** On the CM Action page, + Form > New form: table
   Portal Action, form **CM Portal Action**, mode **Create a new record**, On
   submit **Redirect to a webpage** > CM Action Done. Turn on table
   permissions for the form.
4. **Its server-side settings.** Portal Management > Basic Forms > the form
   from step 3:
   - **On Success Settings:** Append Record ID To Query String = Yes; Record
     ID Query String Parameter Name = **`id`**.
   - **Additional Settings:** Associate Current Portal User on Insert = Yes;
     the portal user lookup column (Target Lookup Attribute Name) =
     **`su_requestedby`**.
5. **Permissions:** CM Portal action form and CM Self in section 5. CM Self
   (contact, Self, Read and Append To) is what the form should need to link
   the new row to you; the test shows whether it is enough.
6. **Clear config** (`/_services/about`), as after an import.

The page loads `/cm-action/` in a hidden frame, fills in the fields by their
IDs, presses the form's Submit, and reads the new row's ID from
`/cm-action-done/?id=...`. The site's default `HTTP/X-Frame-Options` site
setting (SAMEORIGIN) allows this; if the setting is DENY, change it to
SAMEORIGIN.

**Prove it cannot be spoofed.** Sign in as a tester (not an administrator).

1. **The Web API refuses a Portal Action.** On the matrix page, open the
   developer tools (F12) > Console, and paste this once with your own contact
   ID and once with the dummy's:
   ```
   fetch("/_layout/tokenhtml").then(r => r.text()).then(t => fetch("/_api/su_portalactions", {
     method: "POST",
     headers: { "Content-Type": "application/json", "__RequestVerificationToken": t.match(/value="([^"]+)"/)[1] },
     body: JSON.stringify({ su_name: "web api test", su_action: 100000124,
       "su_requestedby@odata.bind": "/contacts(PASTE-CONTACT-ID)" })
   })).then(r => console.log(r.status))
   ```
   **Both must print an error status (403 or 404), not 204.** Tables >
   Portal Actions has no "web api test" row.
2. **The form ignores a planted Requested By.** Open `/cm-action/` directly
   (the form shows). In the Console, paste this with the dummy's contact ID.
   It adds Requested By to the form as if it were one of its fields, then
   submits:
   ```
   (() => {
     const name = document.getElementById("su_name"), form = name.form;
     const prefix = name.name.replace(/su_name$/, "");
     for (const [k, v] of [["su_requestedby", "PASTE-DUMMY-CONTACT-ID"], ["su_requestedby_entityname", "contact"], ["su_requestedby_name", "Dummy"]]) {
       const i = document.createElement("input");
       i.type = "hidden"; i.name = prefix + k; i.id = k; i.value = v; form.appendChild(i);
     }
     name.value = "spoof test";
     document.getElementById("su_action").value = "100000124";
     document.getElementById("InsertButton").click();
   })()
   ```
   The page moves to `/cm-action-done/?id=...`. Open Tables > Portal Actions >
   **spoof test**: **Requested By must be you, not the dummy.**
3. **The matrix's own path.** On the matrix page, flag a function for review.
   The new Portal Action row has Requested By = you and, once this flow is
   built, Status Done.

If step 1 prints 204, or step 2 saves the dummy, stop and tell me. If step 2
does not save at all and the form shows a permission message about the link
to contact (Append To), tell me the message: the next step is Global Append
To on contact, which is safe here only because no table a tester can write
through the Web API has a contact lookup. I would rather confirm that with
you than assume it. Delete the test rows afterwards.

**Build** (instant cloud flow, in the solution):

1. Trigger: **Power Pages > When Power Pages calls a flow**, one Text input
   `request`. The page sends `{"actionId":"<the row's ID>"}` in it; read the
   ID with `json(triggerBody()?['text'])?['actionId']` (the input's key may
   show as `text` or `request` in the trigger's outputs; use the one there).
2. **Get a row by ID**, Portal Actions, that ID. The form leaves Status
   empty: if Status is Done or Failed, go to Fail with "That action has
   already been processed." If Requested By is empty, go to Fail with "This
   action has no requester."
3. **List rows**, Compliance Directory, filter
   `_su_contact_value eq @{outputs('Get_action')?['body/_su_requestedby_value']} and su_active eq true`,
   top 1. None: Fail with "Your sign-in is not linked to a Compliance
   Directory record yet. Ask the compliance office to check your directory
   email." For the office, that means: the person's directory email must be
   their Entra user principal name (NetID@syr.edu) or mail address, and the
   CM - Link directory to contact run for their sign-in says why it stopped
   (section 6).
4. **The target and its function, from Dataverse.** For a deadline, gap or
   flag action, Get a row by ID on that table (the action's Deadline, Gap or
   Flag) and take **its own** Compliance Function; if the action also names a
   function and it differs, Fail. For Raise flag and Delete function, use the
   action's Compliance Function. Get that function row; missing: Fail.
5. **Administrator?** List the contact's web roles and look for "Compliance
   Matrix Administrators". On the enhanced data model, web roles are the
   **Web Role** table (mspp_webrole) with a many-to-many relationship to
   Contact; check its name under Tables > Contact > Relationships (it is
   usually `powerpagecomponent_mspp_webrole_contact`).
6. **Owner?** List rows, Function Ownership, filter
   `_su_function_value eq <the function from step 4> and _su_person_value eq <the person from step 3>`,
   top 1. Any role counts (Executive, Unit, Compliance, General Counsel,
   Support), as in the canvas app's "own functions". This is checked on every
   action, at the moment it runs, so someone removed from a function cannot act
   on it afterwards even if the page they have open still offers the button.
7. **Allowed:** an administrator may do any action; anyone may Raise flag; an
   owner (step 6) may Complete deadline, Reverse completion and Close gap.
   Otherwise Fail with "You are not allowed to do that on this function."
8. **Switch** on Action Type:

| Action | Update | Archive entry |
|---|---|---|
| Complete deadline | Deadline: Last Completed Date = today, Completed Date And Time = now, Completed Reason = Reason, Completed By Name (su_completedbydisplayname) = person's name, Completed By = person, Complete = true only for a One-time cadence | Entry "Deadline Completed - <function>", Record Type "Deadline Completion", Event Type "Completed", Reason, Completed Occurrence = the deadline's due date, Cadence |
| Reverse completion | Deadline: clear those six columns, Complete = false | "Deadline Reversed - <function>", "Deadline Completion", "Reversed", Reason |
| Close gap | Gap: Status Closed, Closed = today, Closure Notes = Reason, Closed By = person | none (the canvas app writes none) |
| Raise flag | Add a Function Flag: Name = function name, Reason, Status Active, Source Manual, Flagged On = today, Flagged By = person | none |
| Resolve flag | Flag: Status Cleared, Cleared On = today, Cleared By = person | "Flag Resolved - <function>", "Flag Resolution", "Resolved", Reason = the flag's reason, Source Item ID, Flagged By (name), Flagged Date, Flag Source |
| Delete function | first an archive entry per gap ("Gap: <name>"), deadline ("Deadline: MM/DD/YYYY <cadence>"), flag ("Flag: <reason>") and owner row ("Owner: <name> (<role>)"), then "Function record deleted"; then delete the function (the schema cascades to its children) | Record Type "Function Deleted", Event Type "Deleted" |

   Every archive entry also sets Function Name (su_archivedfunctionname), Function ID (the function's
   su_legacyspid, or its Function ID as a number), Compliance Function
   (lookup, cleared when the function is deleted), Resolved By = person's
   name, Resolved Date And Time = now.
9. **Done:** update the action row, Status Done, Processed On = now; Return
   value(s) to Power Pages, Text `result` = `{"ok":true}`.
10. **Fail** (and a scope with *run after: has failed*): update the action
    row, Status Failed, Result = the message; return
    `{"ok":false,"error":"<message>"}`.

**Add to the site:** Set up > Cloud flows > + Add cloud flow, roles Testers and
Administrators. Copy its URL (`/_api/cloudflow/v1.0/trigger/<id>`) into the
site setting **`ComplianceMatrix/Flow/Action`**.

`portal/test/mock-portal.mjs` implements this flow step for step, and the
end-to-end tests drive the portal against it, so a flow built to this table
behaves the way the tests expect.

---

## 9. Auditing

Every su_ table and column is created with auditing on (`IsAuditEnabled` in
the solution). The environment must have auditing switched on too, or nothing
is recorded: Power Platform admin center > the environment > Settings > Audit
and logs > **Audit settings** > Start Auditing (and set the retention). This
needs a System Administrator; ask IT if you are not one.

Audit history records the change and the Power Pages application user that
made it, not the contact. The person is on the Portal Action row and in the
Completed By / Closed By / Flagged By / Cleared By columns.

---

## 10. What breaks at cutover

At cutover SharePoint stops being written, so everything that reads or writes
the lists needs to move or stop:

| What | Reads or writes | Action |
|---|---|---|
| Compliance Matrix 2.0 canvas app | all 10 lists it uses, Office 365 email, group-owner admin check | retire, or leave read-only with a banner |
| Deadline Reminders flow (live, not in this repo) | Deadlines and the function owners | rebuild on Dataverse from `docs/REMINDER-FLOW.md`; send me the live flow's export to compare |
| Power BI reports | SharePoint list connector | repoint to Dataverse (field_N becomes su_*), redo row-level security |
| Microsoft Lists forms on Assessments and Compliance Directory (the Created Via column) | create items | replace with the portal or a Dataverse-backed form |
| Whatever writes Assessment Responses and Assessment Schedule (probably Microsoft Forms through a flow; section 1 shows how to find it) | create items | repoint the flow to Dataverse, or retire it |
| Survey intake into Flags List (Source = Survey, RespondentEmail) | create items | repoint to Dataverse |
| The portal's SharePoint flows and notification flows (`docs/SHAREPOINT-FLOWS.md`), if built | read and write | turn off once the portal is on Dataverse |
| **The five dataflows** | write Dataverse from SharePoint | **turn off**, or they overwrite Dataverse with a stale copy |
| `tools/build_seed.py` and the seed files | offline checks of the CSV export, never loaded | retire |
| Bookmarked list views and alerts | read | tell people where the portal is |

---

## 11. Cutover checklist (one environment)

You may have only **SU Compliance Office**, which also hosts the live site.
Everything below works there: the new tables are not used by the canvas app,
and the portal page stays limited to Testers until the last step. The cost is
that a mistake is made in production, so back up before each import and keep
the Testers restriction until the end.

**If you can get a separate environment, ask IT for:**

- A **Sandbox** environment with a Dataverse database, same tenant and region
  as SU Compliance Office (for example "SU Compliance Office - Dev").
- You as **System Administrator** there (or System Customizer plus
  Environment Maker), able to create a Power Pages site, dataflows and cloud
  flows.
- The same data loss prevention policy as production, with SharePoint,
  Dataverse, Power Pages and Office 365 connectors in the same group.
- `.js` removed from Blocked attachments (Settings > Product > Privacy +
  Security), as on production.
- Auditing on, and about 1 GB of Dataverse capacity.
- Optionally, a copy of production (admin center > Copy, "Customizations and
  schemas only") so the solution and site start the same.

With one, do steps 1 to 6 there first, then repeat 1 to 4 in production.

**Before (test phase)**

1. Back up the environment (admin center > Backups > Create).
2. Pack and import the solution for the first time, then add the three
   computed columns and Clear config (section 2, Installing the solution). Check Tables > each
   su_ table > Keys: each key shows Active. Run the blank-key test in
   section 2.
3. Switch on environment auditing (section 9). Set the Function ID seed to
   90000 (section 2).
4. Run the section 1 checks in Excel; fix the orphans, duplicates and emails
   in SharePoint.
5. Build the five dataflows (section 3), run them in order, and reconcile
   against the baseline counts.
6. Check what External Identity Username holds, then build CM - Link
   directory to contact, CM - Link contact to directory and its one-off copy
   (section 6), and CM - Process portal action; add
   the action flow to the site, set `ComplianceMatrix/Flow/Action`. Set up
   the CM Portal Action form and its two pages, and run the spoof test
   (section 8).
7. Create the Testers web role; set the page's permissions to Testers and
   Administrators; add the table permissions, column permissions and Web API
   site settings (section 5); set `ComplianceMatrix/Backend` to `dataverse`.
8. Rebuild the reminder, notification and intake flows on Dataverse with
   sending off (compose instead of send); point a copy of the Power BI report
   at Dataverse.
9. Test: testers complete and reverse a deadline, close a gap, raise and
   resolve a flag; administrators edit, add and delete a function; check the
   Portal Action rows, Completed By / Closed By, and Archive entries. Refresh
   the dataflows and confirm the test changes are undone.
10. Parity check against the canvas app on the same day's refresh, screen by
    screen.

**Cutover day**

1. Announce a freeze. Make the SharePoint lists read-only (remove edit from
   the site members group, or stop the canvas app).
2. Run the five dataflows a final time and reconcile.
3. **Turn off the dataflows' schedules** and do not refresh them again.
4. Set the Function ID seed to the highest SharePoint ID plus one.
5. Move each Testers table permission to Authenticated Users; set the page's
   permissions to Authenticated Users; add the matrix link to the site
   navigation.
6. Turn on the Dataverse reminder, notification and intake flows; turn off the
   SharePoint ones.
7. Publish the repointed Power BI report.
8. Retire the canvas app, or leave it read-only with a banner pointing to the
   portal.

**After**

1. Watch flow run history and the portal for permission errors for a week.
2. Keep the SharePoint lists read-only as the record of what was migrated.
3. Once nothing reloads from SharePoint, the legacy keys can go (Tables > Keys
   > delete su_key_legacyspid); keep the column.
