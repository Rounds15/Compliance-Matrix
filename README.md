# Compliance Matrix

Power Platform solution for the Syracuse University Office of Compliance and
Enterprise Risk Management. One place to answer two questions: **who is
responsible for what**, and **are we on top of it**.

Converted from the standalone HTML prototype (`Compliance Matrix (standalone).html`),
which already declared its intended Dataverse mapping in comments. Those
mappings are honoured exactly: `su_compliancefunction`, `su_compliancedeadline`,
`su_compliancegap`, `su_compliancedirectory`, `su_functionownership`,
`su_counselassignment`, `su_appadmin`.

---

## Architecture

Data lives in Dataverse. The interface is a hybrid, split along the line where
each tool is actually better:

| Layer | Carries | Why |
|---|---|---|
| **Canvas app** | Current state, drill-through to the record, all write actions (edit, flag, log gap, close gap, manage ownership) | Interactive, always live, writes back |
| **Power BI** | Aggregation over time, gap-aging curves, deadline-health trends, executive distribution | Canvas cannot do historical analysis well |

The Power BI report is embedded on the Reporting screen and filtered by the
signed-in user, so the embedded view matches the app's own "assigned to you".

---

## Repository layout

```
solution/
  schema/
    dataverse-schema.yaml      Single source of truth: 9 tables, 74 columns,
                               7 global choice sets, relationships, rollups
    seed/                      Seed data extracted from the prototype
      topics.yaml      (13)    functions.yaml   (42)   deadlines.yaml (28)
      directory.yaml   (39)    ownership.yaml  (125)   gaps.yaml      (17)
      counsel.yaml     (11)    flags.yaml        (2)
  canvas/Src/
    App.fx.yaml                Theme, startup, role resolution
    Components/cmp_Shared.fx.yaml   Risk pill, due pill, page head, header nav
    scr_*.fx.yaml              12 screens
  src/                         Generated solution source (pac solution pack)
tools/
  build_solution.py            schema YAML  ->  solution source XML
  build_seed.py                prototype JS ->  seed YAML
  fix_yaml_comments.py         Normalizes // vs # comment syntax
```

### Screens

`Home` `Functions` `FunctionDetail` `Topics` `Areas` `Deadlines` `Directory`
`ExecutiveTeam` `GapTracker`\* `RiskDashboard`\* `Reporting`\* `NoAccess`

\* Administrator only.

---

## Data model

Nine tables. The one that matters most is the junction:

**`su_functionownership`** — `(function, person, role, subrole)`

The prototype's three fixed lookups (`exec`, `unitOwner`, `owner`) cannot express
what the ownership-chain UI already supported: **many people per role**, each
weighted Primary / Advisory / Support. Both representations are kept —

- the three lookups on `su_compliancefunction` stay, for fast list rendering and
  the copied-owner denormalization onto deadline rows
- the junction is the authority for "who is in charge of what", and is what
  Directory portfolios, "Assigned to you", and Power BI row-level security read

An alternate key on `(su_function, su_person, su_role)` enforces the "already
holds this role" guard the prototype did in script.

Other notable choices, and why:

- **`su_compliancedirectory` is a table, not just Dataverse users.** University
  responsibility sits with a role or office; people leave, obligations do not. A
  `su_systemuser` lookup links a directory row to a real user where one exists.
- **`su_area` is text, not a lookup.** Areas are a grouping users think in, not a
  governed list. The Areas screen derives its tiles from distinct values.
- **`su_opengapcount` and `su_nextduedate` are rollups**, so the count badge is
  correct everywhere without a per-row query.
- **`su_daysopen` is calculated**, feeding gap-aging reporting.
- **Deadline `su_owner` and `su_risk` are deliberately denormalized** from the
  parent function. Reassigning a function rewrites them on every child row —
  that is what the save confirmation reports back.

Full column dictionary with descriptions: `solution/schema/dataverse-schema.yaml`.

---

## Deploy

Requires the [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction).

```bash
# 1. Generate solution source from the schema
python3 tools/build_solution.py

# 2. Pack and import
pac solution pack --zipfile ComplianceMatrix.zip \
                  --folder solution/src --packagetype Unmanaged
pac auth create --environment <your-environment-url>
pac solution import --path ComplianceMatrix.zip --publish-changes

# 3. Pack the canvas app
pac canvas pack --sources solution/canvas --msapp ComplianceMatrix.msapp
```

Then, in the target environment:

1. Import seed data from `solution/schema/seed/` (matched on the alternate keys
   `su_email` and `su_functioncode`, so re-running updates rather than
   duplicates). Deadline and gap dates are stored as **offsets from the import
   date**, so a fresh environment always shows a live spread of overdue,
   upcoming, and completed work.
2. Create the environment variables the Reporting screen reads:
   `su_PowerBIWorkspaceId`, `su_PowerBIExecutiveReportId`,
   `su_PowerBIDeadlineReportId`, `su_PowerBIGapAgingReportId`.
3. Grant at least one person an `Administrator` row in **App Role Assignments**,
   or nobody can reach Gap Tracker, Risk Dashboard, or Reporting.
4. Build the reminder flow: 90 days, 30 days, due date, then weekly once
   overdue (declared under `reminders` in the schema).

---

## Security

Screen gating in the app is convenience, not control. Non-administrators are
redirected from gated screens and the nav items are hidden, but the actual
protection is Dataverse security roles — those prevent reading the rows
regardless of which screen someone reaches. Configure roles before go-live.

Power BI row-level security filters on `su_functionownership`, so an executive
sees only their portfolio without a separate report.

---

## Verified / not verified

Verified here:

- All 23 YAML files parse (`yaml.safe_load`)
- All 11 generated XML files are well-formed; 17 relationships and 7 global
  choice sets emitted as expected
- Seed extraction round-trips the prototype's data: 42 functions, 28 deadlines,
  17 gaps, 39 directory rows, 125 ownership assignments

**Not verified — needs a real environment.** No Power Platform CLI was available
in the build environment (the npm package name 404s; `pac` ships via .NET tool
or MSI). That means:

- `pac solution pack` and the import have not been run. Solution source is
  well-formed but unvalidated against the packager.
- Control `@version` strings (`Label@2.5.1`, `Gallery@2.15.0`,
  `Classic/Button@2.2.0`, `PowerBI@1.4.0`, `GroupContainer@1.5.0`,
  `Rectangle@2.3.0`, `Classic/TextInput@2.3.2`, `Classic/DropDown@2.3.1`,
  `Image@2.2.3`) may need bumping to whatever the target tenant reports. A
  mismatch raises **PA2105**, which is a warning Studio can auto-correct.
- Delegation was designed for but not measured. Search uses `StartsWith` on
  indexed columns rather than a substring `in`, so it stays delegable past the
  2,000-row limit as the matrix grows toward its full 404 functions.

Run the import into a development environment first and fix forward from there.

---

## Brand

Colours are the approved Syracuse University palette (Brand Guidelines p.23),
carried across from the prototype's CSS custom properties: Orange `#F76900`
(PMS 158C), Primary Blue `#000E54` (PMS 281C), with `#D74100` (PMS 1665C) for
links because it meets WCAG AA on white. Classic controls were chosen over
Fluent specifically so these values render exactly rather than being overridden
by the Fluent theme.
