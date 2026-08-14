# Compliance Matrix

Power Platform solution for the Syracuse University Office of Compliance and
Enterprise Risk Management. One place to answer two questions: **who is
responsible for what**, and **are we on top of it**.

Converted from the standalone HTML prototype (`Compliance Matrix (standalone).html`),
which already declared its intended Dataverse mapping in comments. Those
Since reconciled against the live SharePoint exports: topics became risk areas,
free-text areas became a domain table, and assessments were added.

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
    dataverse-schema.yaml      Single source of truth: 12 tables, 108 columns,
                               12 choice sets, 25 relationships, rollups
    seed/                      Regenerated from the dataverse_import CSVs
                               (pending - see Status below)
  canvas/Src/
    App.fx.yaml                Theme, startup, role resolution
    Components/cmp_Shared.fx.yaml   Risk pill, due pill, page head, header nav
    scr_*.fx.yaml              14 screens
  src/                         Generated solution source (pac solution pack)
tools/
  build_solution.py            schema YAML  ->  solution source XML
  build_seed.py                source data  ->  seed YAML
  validate.py                  Static checks across every source file
  fix_yaml_comments.py         Normalizes // vs # comment syntax
```

### Screens

`Home` `Functions` `FunctionDetail` `RiskAreas` `Domains` `Deadlines`
`Directory` `ExecutiveTeam` `Assessments`\* `AssessmentDetail`\* `GapTracker`\*
`RiskDashboard`\* `Reporting`\* `NoAccess`

\* Administrator only.

---

## Data model

Twelve tables. The ones that carry the most weight:

**`su_functionownership`** — `(function, person, role, subrole)`

Many people per role, each weighted Primary / Advisory / Support. The three
fixed lookups on the function row stay for fast list rendering; the junction is
the authority for "who is in charge of what", and is what Directory portfolios,
"Assigned to you", and Power BI row-level security read.

**`su_riskarea` and `su_domain`** — 13 risk areas, 61 domains

The prototype's free-text `su_area` is gone. Domain is a table because the text
values were drifting and leadership wants a coverage map. The practical payoff:
a domain with zero functions still appears, and both the Risk Areas and Domains
screens call it out. The old text-derived approach could only ever show domains
that already had work in them.

**`su_assessment` and `su_assessmentowner`** — new

An assessment is one conducted review: date, overall risk, status, unit, owners,
and the gaps it produced. Gaps link back via `su_assessment`, which closes the
loop that previously lived in a spreadsheet — an assessment is not finished
until its gaps are closed.

**Non-required by design.** `su_riskarea`, `su_domain`, and `su_risk` are
Recommended, not Required, because the live data has gaps: risk rating is empty
on most rows and one function has no grouping. Making them required would fail
those rows on import. The app treats blank risk as a first-class **Unrated**
state rather than letting it fall through to Low.

**`su_compliancedeadline` is typed.** Only `Fixed Recurring` rows carry a due
date; Event-Relative rows carry a trigger and offset. This drives the calendar,
the due pill, and — critically — the reminder flow. See
[`docs/REMINDER-FLOW.md`](docs/REMINDER-FLOW.md).

Other choices carried over from the first build: the directory is a table rather
than plain Dataverse users (responsibility sits with a role or office, and
people leave); rollups drive the open-gap badge and next due date; deadline
`su_owner` and `su_risk` stay denormalized from the parent function.

Full column dictionary with descriptions: `solution/schema/dataverse-schema.yaml`.

---

## Deploy

**Working in VS Code? Start with [`docs/LOCAL-SETUP.md`](docs/LOCAL-SETUP.md)** —
it covers the extension install (which bundles the `pac` CLI), auth, the wired-up
build tasks, and the first-import issues worth expecting.

The commands below are the same steps without the walkthrough. They require the
[Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction).

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

1. Import seed data from `solution/schema/seed/`, in this order: risk areas,
   domains, directory, functions, ownership, deadlines, flags, assessments,
   assessment owners, gaps. Rows match on the alternate keys (`su_riskareacode`,
   `su_domaincode`, `su_email`, `su_functioncode`, `su_assessmentcode`,
   `su_gapcode`), so re-running updates rather than duplicates. Dates are real
   calendar dates, not offsets — a compliance register needs true dates.
2. Create the environment variables the Reporting screen reads:
   `su_PowerBIWorkspaceId`, `su_PowerBIExecutiveReportId`,
   `su_PowerBIDeadlineReportId`, `su_PowerBIGapAgingReportId`.
3. Grant at least one person an `Administrator` row in **App Role Assignments**,
   or nobody can reach Gap Tracker, Risk Dashboard, or Reporting.
4. Build the reminder flow per [`docs/REMINDER-FLOW.md`](docs/REMINDER-FLOW.md).
   It must filter to `su_deadlinetype` = Fixed Recurring; the other three types
   have no due date and must never trigger reminders.

---

## Security

Screen gating in the app is convenience, not control. Non-administrators are
redirected from gated screens and the nav items are hidden, but the actual
protection is Dataverse security roles — those prevent reading the rows
regardless of which screen someone reaches. Configure roles before go-live.

Power BI row-level security filters on `su_functionownership`, so an executive
sees only their portfolio without a separate report.

---

## Status

**Schema and canvas app: done and verified statically.**

- `tools/build_solution.py` reports **12 tables, 108 columns, 12 choice sets**,
  and emits **25 relationships** — matching the reconciliation target exactly
- `tools/validate.py` passes: all YAML parses, all schema lookup/choice/rollup
  references resolve, all 14 screens and 4 components resolve every
  `Navigate()` target and `ComponentName`, all 13 XML files well-formed
- No remaining references to `su_topic`, `su_area`, `su_compliancetopic`, or a
  Critical / Medium risk value anywhere in canvas source

**Seed data: blocked.** The `dataverse_import/` CSVs have not been supplied to
this repository. The prototype-derived seed was deleted rather than left in
place, because it referenced the topics table, `su_area`, and Critical, and
would have failed import against the reconciled schema. Regenerating it needs
the ten CSVs; expected totals are ~13 risk areas, 61 domains, 127 directory,
392 functions, 1,175 ownership, 148 deadlines, 89 flags, 9 assessments,
21 assessment owners, 4 gaps.

**Not verified — needs a real environment.** No Power Platform CLI is available
where this was built, so `pac solution pack` and the import have not been run.
Control `@version` strings (`Label@2.5.1`, `Gallery@2.15.0`,
`Classic/Button@2.2.0`, `Classic/ComboBox@2.4.0`, `PowerBI@1.4.0`,
`GroupContainer@1.5.0`, `Rectangle@2.3.0`, `Classic/TextInput@2.3.2`,
`Classic/DropDown@2.3.1`, `Image@2.2.3`) may need bumping to whatever the target
tenant reports; that raises PA2105, a warning Studio auto-corrects. See
[`docs/LOCAL-SETUP.md`](docs/LOCAL-SETUP.md) for the other first-import risks.


---

## Brand

Colours are the approved Syracuse University palette (Brand Guidelines p.23),
carried across from the prototype's CSS custom properties: Orange `#F76900`
(PMS 158C), Primary Blue `#000E54` (PMS 281C), with `#D74100` (PMS 1665C) for
links because it meets WCAG AA on white. Classic controls were chosen over
Fluent specifically so these values render exactly rather than being overridden
by the Fluent theme.
