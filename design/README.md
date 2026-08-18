# Design source of record

`Compliance_Matrix_standalone.html` is the HTML prototype this Power Platform
solution was converted from. Open it in a browser and it runs — React, the
Syracuse Digital Design System, the brand fonts and the sample data are all
inlined into the one file.

It is here so the canvas app has a reviewable origin. A 3 MB file with two
300 KB lines is not something a diff can show you, so the parts a human reads
are extracted flat:

```
design/
  Compliance_Matrix_standalone.html   the runnable prototype, as exported
  src/01-design-system-manifest.jsx   DDS bundle header
  src/02-data.jsx                     sample data; shape mirrors the intended tables
  src/03-ui-kit.jsx                   Icon, Avatar, Risk, Header, Modal, PageHead, Stat
  src/04-screens-browse.jsx           Home, Functions, Topics, Areas, Deadlines,
                                      Directory, Executive Team, + the detail overlay
  src/05-ownership.jsx                ownership chain and person picker
  src/06-screen-function-detail.jsx   the full-screen function record
  src/07-screens-admin.jsx            Gap Tracker, Risk Dashboard, Reporting, NoAccess
  src/08-app.jsx                      routing, role switch, write handlers, toast
  css/01-tokens.css                   SU palette, type families, scale, spacing, radii
  css/02-fonts.css                    @font-face for the brand faces
  css/03-app.css                      the app layer on top of the DDS
  css/04-function-detail.css          function detail screen
  assets/*.svg                        wordmark and marks
```

Regenerate with `python3 tools/extract_design.py`. `tools/validate.py`
re-extracts and compares, so an edit to a generated file — or a re-exported
bundle nobody re-extracted — fails validation instead of quietly becoming the
design of record. **Edit the prototype, not the extracted files.**

Not extracted: React, ReactDOM and Babel (3 vendor scripts, 4.3 MB), the
Syracuse Digital Design System stylesheet (`dds.min.css` v1.10.0, 283 KB), and
the brand fonts — Sherman Sans, Sherman Serif and Syracuse Block, 15 faces plus
44 unlabelled payloads. The fonts are licensed brand assets, they are already
inside the standalone file, and a canvas app cannot load a custom face anyway.

---

## Vintage

**This prototype predates the schema reconciliation.** It is the input to the
conversion, not a description of the current app. Where the two disagree, the
solution is right and this file is history:

| Prototype | Solution | Why |
|---|---|---|
| `topic` free text, `TOPICS` array | `su_riskarea` table, 13 rows | leadership wanted a coverage map |
| `area` free text | `su_domain` table, 61 rows | the text values were drifting |
| risk `Critical` / `High` / `Medium` / `Low` | `High` / `Moderate` / `Low` / blank = **Unrated** | matches the live data; most rows have no rating |
| no concept of an assessment | `su_assessment`, `su_assessmentowner`, plus the Assessments and Assessment Detail screens | closes the loop from review to gap |
| 404 functions, sample data | 392 functions, seeded from the live exports | 39 rows rejected with a reason, see `seed/_rejected.yaml` |

---

## Screen mapping

| Prototype | Canvas screen |
|---|---|
| `Home` | `scr_Home` |
| `FunctionsScreen` | `scr_Functions` |
| `FunctionDetailScreen` | `scr_FunctionDetail` |
| `FunctionOverlay` (modal variant of the same record) | folded into `scr_FunctionDetail` — canvas navigates, it does not stack modals |
| `Topics` | `scr_RiskAreas`, risk areas tab |
| `StatuteView` | `scr_RiskAreas`, statutes tab |
| `Areas` | `scr_Domains` |
| `OwnershipChain`, `PersonPicker` | manage mode on `scr_FunctionDetail` |
| `Deadlines` + `DeadlineCalendar` | `scr_Deadlines` |
| `Directory` | `scr_Directory` |
| `ExecutiveTeam` | `scr_ExecutiveTeam` |
| `GapTracker` | `scr_GapTracker` |
| `RiskDashboard` | `scr_RiskDashboard` |
| `Reporting` | `scr_Reporting` |
| `NoAccess` | `scr_NoAccess` |
| `Header` / `Dropdown` / drawer | `cmp_Header` |
| `PageHead`, `Risk`, `dueState` | `cmp_PageHead`, `cmp_RiskPill`, `cmp_DuePill` |
| — | `scr_Assessments`, `scr_AssessmentDetail` (new) |

## What did not carry over

Recorded so the difference is a decision rather than a discovery.

Closed since:

- **`OwnershipChain` manage mode and `PersonPicker`** → manage mode on
  `scr_FunctionDetail`. Add and remove people on a role, change a sub-role
  weight, and record someone who is not in the directory yet. Two deliberate
  differences from the prototype. It writes on every action rather than holding
  a local `chain` in state, because a canvas screen has no unmount to save on.
  And the prototype's Active Directory lookup is not here: that is
  `Office365Users.SearchUserV2` on `btn_PersonNewAdd`, and adding it would put a
  connection dependency on an app that otherwise needs only Dataverse and would
  break the connector-free mockup. The directory is the authority either way, so
  the panel writes the `su_compliancedirectory` row directly — reusing an
  existing row when the email already matches, since `su_email` is an alternate
  key.
- **`StatuteView`** → the Statutes tab on `scr_RiskAreas`, deduplicated and
  most-cited first. Master/detail rather than the prototype's accordion: one
  gallery has one `TemplateSize` for every row, so a row cannot grow to hold its
  children.

Still open:

- **The brand fonts.** `App.fx.yaml` sets `FontDisplay` and `FontBody` to
  Verdana, which is the fallback the prototype's own `--font-display` stack
  names. Sherman Sans, Sherman Serif and Syracuse Block cannot load in a canvas
  app. `Syracuse Block` hero numerals lose the most.
- **CSS effects.** `--shadow-sm` / `--shadow-md`, the 2 px and 4 px radii, and
  hover transitions. Rectangle has no `BorderRadius` property (PA2108) and no
  shadow property; the app is drawn square and flat.
- **Responsive behaviour.** `useMedia`, the hamburger drawer's breakpoint, and
  the `minmax()` grids become fixed coordinates and `Parent.Width` formulas.
