# Handoff brief for `canvas-apps-ui-gen`

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

```
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
```
### Constraints that override the skill's defaults

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

The app has four canvas components. Every screen embeds `cmp_Header`, so a
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
  components.

---

## Screen blocks

One per run. Each is already in the skeleton format the skill expects.

### scr_AssessmentDetail  (32 controls)

**Purpose.** One assessment: date, overall risk, status, unit, owners, and the gaps it produced. Administrator only.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_AssessmentDetail
Paste target: b (new screen)

  ├── cmp_HeaderAsmtDetail [Component: cmp_Header]
  ├── btn_AdBack [Classic/Button]
  ├── rec_AdHead [Rectangle]
  ├── rec_AdHeadRule [Rectangle]
  ├── lbl_AdEyebrow [Label]
  ├── lbl_AdTitle [Label]
  ├── cmp_AdRisk [Component: cmp_RiskPill]
  ├── lbl_AdCode [Label]
  ├── lbl_AdGapBadge [Label]
  ├── btn_AdOpenFile [Classic/Button]
  ├── lbl_AdGapsHead [Label]
  ├── gal_AdGaps [Gallery, Vertical, items-cols: su_status|su_gapcode|su_targetquarter|su_targetfy|su_name|su_note|su_owner.su_name|su_function, active-var: CurrentAdGapsID, active-col: su_gapcode]
  │   ├── rec_AdGapCard [Rectangle, card, gallery-child]
  │   ├── rec_AdGapAccent [Rectangle, gallery-child]
  │   ├── lbl_AdGapStatus [Label, gallery-child]
  │   ├── lbl_AdGapMeta [Label, gallery-child]
  │   ├── lbl_AdGapTitle [Label, gallery-child]
  │   ├── lbl_AdGapNote [Label, gallery-child]
  │   ├── lbl_AdGapOwner [Label, gallery-child]
  │   └── btn_AdGapOverlay [Classic/Button, transparent overlay, gallery-child]
  ├── lbl_AdGapsEmpty [Label]
  └── cnt_AdRail [GroupContainer, AutoLayout, scrollable]
      ├── lbl_AdDetailHead [Label]
      ├── lbl_AdDetailBody [Label]
      ├── lbl_AdOwnersHead [Label]
      ├── gal_AdOwners [Gallery, Vertical, items-cols: su_person.su_name|su_person.su_jobtitle|su_role, active-var: CurrentAdOwnersID, active-col: su_person.su_name]
      │   ├── lbl_AdOwnerName [Label, gallery-child]
      │   ├── lbl_AdOwnerTitle [Label, gallery-child]
      │   └── lbl_AdOwnerRole [Label, gallery-child]
      ├── lbl_AdOwnersEmpty [Label]
      ├── lbl_AdApproversHead [Label]
      └── lbl_AdApprovers [Label]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                X                           Y    Width                       Height
---------------------  --------------------------  ---  --------------------------  -----------------------------------------------
cmp_HeaderAsmtDetail   0                           0    Parent.Width                104
btn_AdBack             64                          116  150                         32
rec_AdHead             0                           156  Parent.Width                150
rec_AdHeadRule         0                           303  Parent.Width                3
lbl_AdEyebrow          64                          174  800                         20
lbl_AdTitle            64                          198  Parent.Width - 460          56
cmp_AdRisk             64                          262  74                          24
lbl_AdCode             148                         262  110                         24
lbl_AdGapBadge         268                         262  120                         24
btn_AdOpenFile         Parent.Width - 260          252  196                         40
lbl_AdGapsHead         64                          330  600                         24
gal_AdGaps             64                          360  Parent.Width - 480          Parent.Height - 420
  rec_AdGapCard        0                           0    Parent.TemplateWidth        100
  rec_AdGapAccent      0                           0    4                           100
  lbl_AdGapStatus      16                          10   92                          22
  lbl_AdGapMeta        116                         10   Parent.TemplateWidth - 132  22
  lbl_AdGapTitle       16                          34   Parent.TemplateWidth - 32   22
  lbl_AdGapNote        16                          56   Parent.TemplateWidth - 220  38
  lbl_AdGapOwner       Parent.TemplateWidth - 196  58   180                         34
  btn_AdGapOverlay     0                           0    Parent.TemplateWidth        100
lbl_AdGapsEmpty        64                          420  Parent.Width - 480          70
cnt_AdRail             Parent.Width - 396          330  332                         Parent.Height - 390
  lbl_AdDetailHead                                      Parent.Width                24
  lbl_AdDetailBody                                      Parent.Width                154
  lbl_AdOwnersHead                                      Parent.Width                24
  gal_AdOwners                                          Parent.Width                Min(Max(CountRows(colAsmtOwners), 1) * 54, 216)
    lbl_AdOwnerName    4                           6    Parent.TemplateWidth - 90   20
    lbl_AdOwnerTitle   4                           26   Parent.TemplateWidth - 90   24
    lbl_AdOwnerRole    Parent.TemplateWidth - 84   14   80                          22
  lbl_AdOwnersEmpty                                     Parent.Width                40
  lbl_AdApproversHead                                   Parent.Width                24
  lbl_AdApprovers                                       Parent.Width                62
```

</details>

### scr_Assessments  (23 controls)

**Purpose.** List of conducted assessments. Administrator only.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Assessments
Paste target: b (new screen)

  ├── cmp_HeaderAsmt [Component: cmp_Header]
  ├── cmp_AsmtHead [Component: cmp_PageHead]
  ├── gal_AsmtStats [Gallery, Horizontal, items-cols: StatValue|StatTone|StatLabel|StatNote, active-var: CurrentAsmtStatsID, active-col: StatValue]
  │   ├── rec_AsmtStatCard [Rectangle, card, gallery-child]
  │   ├── lbl_AsmtStatValue [Label, gallery-child]
  │   ├── lbl_AsmtStatLabel [Label, gallery-child]
  │   └── lbl_AsmtStatNote [Label, gallery-child]
  ├── drp_AsmtStatus [Classic/DropDown]
  ├── lbl_AsmtCount [Label]
  ├── rec_AsmtTableHead [Rectangle]
  ├── gal_AsmtHeadCells [Gallery, Horizontal, items-cols: ColLabel, active-var: CurrentAsmtHeadCellsID, active-col: ColLabel]
  │   └── lbl_AsmtHeadCell [Label, gallery-child]
  ├── gal_Assessments [Gallery, Vertical, items-cols: su_name|su_assessmentcode|su_followupround|su_assessmentdate|su_unit|su_status|su_risk|su_assessmentid, active-var: CurrentAssessmentID, active-col: su_assessmentcode]
  │   ├── lbl_AsmtName [Label, gallery-child]
  │   ├── lbl_AsmtCode [Label, gallery-child]
  │   ├── lbl_AsmtDate [Label, gallery-child]
  │   ├── lbl_AsmtUnit [Label, gallery-child]
  │   ├── lbl_AsmtStatus [Label, gallery-child]
  │   ├── cmp_AsmtRisk [Component: cmp_RiskPill, gallery-child]
  │   ├── lbl_AsmtGapCount [Label, gallery-child]
  │   ├── rec_AsmtRowRule [Rectangle, gallery-child]
  │   └── btn_AsmtOverlay [Classic/Button, transparent overlay, gallery-child]
  └── lbl_AsmtEmpty [Label]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control              X                                  Y    Width                          Height
-------------------  ---------------------------------  ---  -----------------------------  -------------------
cmp_HeaderAsmt       0                                  0    Parent.Width                   104
cmp_AsmtHead         64                                 128  Parent.Width - 460             124
gal_AsmtStats        64                                 262  Parent.Width - 128             104
  rec_AsmtStatCard   0                                  0    Parent.TemplateWidth - 14      96
  lbl_AsmtStatValue  16                                 12   Parent.TemplateWidth - 40      40
  lbl_AsmtStatLabel  16                                 52   Parent.TemplateWidth - 40      20
  lbl_AsmtStatNote   16                                 70   Parent.TemplateWidth - 40      18
drp_AsmtStatus       64                                 386  240                            44
lbl_AsmtCount        320                                386  300                            44
rec_AsmtTableHead    64                                 446  Parent.Width - 128             40
gal_AsmtHeadCells    64                                 446  Parent.Width - 128             40
  lbl_AsmtHeadCell   14                                 0    Parent.TemplateWidth - 20      40
gal_Assessments      64                                 486  Parent.Width - 128             Parent.Height - 530
  lbl_AsmtName       14                                 10   Parent.TemplateWidth / 5 - 24  24
  lbl_AsmtCode       14                                 36   Parent.TemplateWidth / 5 - 24  20
  lbl_AsmtDate       Parent.TemplateWidth / 5 + 14      10   Parent.TemplateWidth / 5 - 24  46
  lbl_AsmtUnit       Parent.TemplateWidth * 2 / 5 + 14  10   Parent.TemplateWidth / 5 - 24  46
  lbl_AsmtStatus     Parent.TemplateWidth * 3 / 5 + 14  22   130                            24
  cmp_AsmtRisk       Parent.TemplateWidth * 4 / 5 + 14  22   74                             24
  lbl_AsmtGapCount   Parent.TemplateWidth * 4 / 5 + 96  22   70                             24
  rec_AsmtRowRule    0                                  69   Parent.TemplateWidth           1
  btn_AsmtOverlay    0                                  0    Parent.TemplateWidth           70
lbl_AsmtEmpty        64                                 560  Parent.Width - 128             70
```

</details>

### scr_Deadlines  (26 controls)

**Purpose.** Deadline register and calendar. Only Fixed Recurring rows carry a due date.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Deadlines
Paste target: b (new screen)

  ├── cmp_HeaderDl [Component: cmp_Header]
  ├── cmp_DlHead [Component: cmp_PageHead]
  ├── lbl_DlOverdueChip [Label]
  ├── lbl_DlDue30Chip [Label]
  ├── drp_DlScope [Classic/DropDown]
  ├── btn_DlCalendarView [Classic/Button]
  ├── btn_DlListView [Classic/Button]
  ├── btn_DlPrevMonth [Classic/Button]
  ├── lbl_DlMonth [Label]
  ├── btn_DlToday [Classic/Button]
  ├── btn_DlNextMonth [Classic/Button]
  ├── gal_DlDow [Gallery, Horizontal, items-cols: Dow, active-var: CurrentDlDowID, active-col: Dow]
  │   └── lbl_DlDow [Label, gallery-child]
  ├── gal_DlCalendar [Gallery, Horizontal, items-cols: CellDate|CellDay, active-var: CurrentDlCalendarID, active-col: CellDate]
  │   ├── rec_DlCell [Rectangle, gallery-child]
  │   ├── lbl_DlCellDay [Label, gallery-child]
  │   ├── lbl_DlCellCount [Label, gallery-child]
  │   └── btn_DlCellOverlay [Classic/Button, transparent overlay, gallery-child]
  └── gal_DlList [Gallery, Vertical, items-cols: su_deadlinetype|su_offsetvalue|su_offsetunit|su_duedate|su_name|su_function.su_name|su_cadence|su_owner.su_name|su_owner.su_unit|su_complete, active-var: CurrentDlListID, active-col: su_deadlinetype]
      ├── lbl_DlRowDate [Label, gallery-child]
      ├── lbl_DlRowTitle [Label, gallery-child]
      ├── lbl_DlRowCadence [Label, gallery-child]
      ├── lbl_DlRowOwner [Label, gallery-child]
      ├── cmp_DlRowPill [Component: cmp_DuePill, gallery-child]
      ├── rec_DlRowRule [Rectangle, gallery-child]
      └── btn_DlRowOverlay [Classic/Button, transparent overlay, gallery-child]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control              X                           Y                                 Width                       Height
-------------------  --------------------------  --------------------------------  --------------------------  ------------------------------------------------
cmp_HeaderDl         0                           0                                 Parent.Width                104
cmp_DlHead           64                          128                               Parent.Width - 500          124
lbl_DlOverdueChip    Parent.Width - 380          150                               150                         30
lbl_DlDue30Chip      Parent.Width - 220          150                               156                         30
drp_DlScope          64                          262                               200                         44
btn_DlCalendarView   Parent.Width - 244          262                               88                          44
btn_DlListView       Parent.Width - 152          262                               88                          44
btn_DlPrevMonth      64                          322                               100                         38
lbl_DlMonth          176                         322                               400                         38
btn_DlToday          Parent.Width - 244          322                               88                          38
btn_DlNextMonth      Parent.Width - 152          322                               88                          38
gal_DlDow            64                          372                               Parent.Width - 128          28
  lbl_DlDow          0                           0                                 Parent.TemplateWidth        28
gal_DlCalendar       64                          400                               Parent.Width - 128          414
  rec_DlCell         0                           0                                 Parent.TemplateWidth - 2    67
  lbl_DlCellDay      6                           4                                 32                          18
  lbl_DlCellCount    6                           24                                Parent.TemplateWidth - 14   38
  btn_DlCellOverlay  0                           0                                 Parent.TemplateWidth - 2    67
gal_DlList           64                          If(gblDlView = "list", 322, 826)  Parent.Width - 128          If(gblDlView = "list", Parent.Height - 350, 240)
  lbl_DlRowDate      14                          10                                140                         40
  lbl_DlRowTitle     170                         10                                Parent.TemplateWidth - 560  40
  lbl_DlRowCadence   Parent.TemplateWidth - 376  20                                104                         22
  lbl_DlRowOwner     Parent.TemplateWidth - 258  10                                140                         40
  cmp_DlRowPill      Parent.TemplateWidth - 110  19                                104                         24
  rec_DlRowRule      0                           61                                Parent.TemplateWidth        1
  btn_DlRowOverlay   0                           0                                 Parent.TemplateWidth        62
```

</details>

### scr_Directory  (32 controls)

**Purpose.** People and offices, with each person's portfolio.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Directory
Paste target: b (new screen)

  ├── cmp_HeaderDir [Component: cmp_Header]
  ├── cmp_DirHead [Component: cmp_PageHead]
  ├── txt_DirSearch [Classic/TextInput]
  ├── lbl_DirCount [Label]
  ├── gal_Directory [Gallery, Horizontal, items-cols: su_name|su_jobtitle|su_unit|su_email|su_compliancedirectoryid, active-var: CurrentPersonID, active-col: su_email]
  │   ├── rec_DirCard [Rectangle, card, gallery-child]
  │   ├── lbl_DirInitials [Label, gallery-child]
  │   ├── lbl_DirName [Label, gallery-child]
  │   ├── lbl_DirTitle [Label, gallery-child]
  │   ├── lbl_DirUnit [Label, gallery-child]
  │   ├── lbl_DirEmail [Label, gallery-child]
  │   ├── lbl_DirPortfolio [Label, gallery-child]
  │   └── btn_DirOverlay [Classic/Button, transparent overlay, gallery-child]
  ├── rec_DirScrim [Rectangle]
  └── cnt_DirDialog [GroupContainer, ManualLayout]
      ├── rec_DirDialogHead [Rectangle]
      ├── lbl_DirDialogName [Label]
      ├── lbl_DirDialogTitle [Label]
      ├── lbl_DirDialogContact [Label]
      ├── lbl_DirPortfolioHead [Label]
      ├── gal_DirPortfolio [Gallery, Vertical, items-cols: su_function.su_name|su_function.su_riskarea.su_name|su_role|su_subrole|su_function.su_risk, active-var: CurrentDirPortfolioID, active-col: su_function.su_name]
      │   ├── lbl_DpName [Label, gallery-child]
      │   ├── lbl_DpRole [Label, gallery-child]
      │   ├── cmp_DpRisk [Component: cmp_RiskPill, gallery-child]
      │   ├── rec_DpRule [Rectangle, gallery-child]
      │   └── btn_DpOverlay [Classic/Button, transparent overlay, gallery-child]
      ├── lbl_DirAsmtHead [Label]
      ├── gal_DirAssessments [Gallery, Horizontal, items-cols: su_assessment.su_assessmentcode|su_role, active-var: CurrentDirAssessmentsID, active-col: su_assessment.su_assessmentcode]
      │   ├── lbl_DirAsmtChip [Label, gallery-child]
      │   └── btn_DirAsmtOverlay [Classic/Button, transparent overlay, gallery-child]
      ├── btn_DirEmail [Classic/Button]
      └── btn_DirDialogClose [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                 X                          Y                          Width                       Height
----------------------  -------------------------  -------------------------  --------------------------  -------------------
cmp_HeaderDir           0                          0                          Parent.Width                104
cmp_DirHead             64                         128                        Parent.Width - 128          124
txt_DirSearch           64                         262                        420                         44
lbl_DirCount            500                        262                        200                         44
gal_Directory           64                         326                        Parent.Width - 128          Parent.Height - 370
  rec_DirCard           0                          0                          Parent.TemplateWidth        172
  lbl_DirInitials       16                         16                         44                          44
  lbl_DirName           70                         16                         Parent.TemplateWidth - 86   22
  lbl_DirTitle          70                         38                         Parent.TemplateWidth - 86   34
  lbl_DirUnit           16                         80                         Parent.TemplateWidth - 32   20
  lbl_DirEmail          16                         102                        Parent.TemplateWidth - 32   20
  lbl_DirPortfolio      16                         130                        Parent.TemplateWidth - 32   26
  btn_DirOverlay        0                          0                          Parent.TemplateWidth        172
rec_DirScrim            0                          0                          Parent.Width                Parent.Height
cnt_DirDialog           (Parent.Width - 760) / 2   (Parent.Height - 580) / 2  760                         580
  rec_DirDialogHead     0                          0                          760                         104
  lbl_DirDialogName     28                         22                         620                         32
  lbl_DirDialogTitle    28                         56                         620                         32
  lbl_DirDialogContact  28                         124                        704                         84
  lbl_DirPortfolioHead  28                         220                        704                         24
  gal_DirPortfolio      28                         248                        704                         250
    lbl_DpName          8                          8                          Parent.TemplateWidth - 210  22
    lbl_DpRole          8                          30                         Parent.TemplateWidth - 210  18
    cmp_DpRisk          Parent.TemplateWidth - 92  17                         74                          24
    rec_DpRule          0                          57                         Parent.TemplateWidth        1
    btn_DpOverlay       0                          0                          Parent.TemplateWidth        58
  lbl_DirAsmtHead       28                         512                        704                         22
  gal_DirAssessments    28                         536                        560                         46
    lbl_DirAsmtChip     0                          0                          178                         40
    btn_DirAsmtOverlay  0                          0                          178                         40
  btn_DirEmail          28                         520                        180                         40
  btn_DirDialogClose    622                        520                        110                         40
```

</details>

### scr_Domains  (20 controls)

**Purpose.** Sixty-one domains, including the ones with zero functions.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Domains
Paste target: b (new screen)

  ├── cmp_HeaderDomains [Component: cmp_Header]
  ├── btn_DomCrumbRoot [Classic/Button]
  ├── cmp_DomHead [Component: cmp_PageHead]
  ├── txt_DomSearch [Classic/TextInput]
  ├── lbl_DomEmptyCount [Label]
  ├── gal_Domains [Gallery, Horizontal, items-cols: su_riskarea.su_colorhex|su_riskarea.su_name|su_name|su_owner.su_name|su_domainid|su_domaincode, active-var: CurrentDomainID, active-col: su_domaincode]
  │   ├── rec_DomCard [Rectangle, card, gallery-child]
  │   ├── rec_DomCardBar [Rectangle, card, gallery-child]
  │   ├── lbl_DomCardArea [Label, gallery-child]
  │   ├── lbl_DomCardName [Label, gallery-child]
  │   ├── lbl_DomCardOwner [Label, gallery-child]
  │   ├── lbl_DomCardCount [Label, gallery-child]
  │   └── btn_DomCardOverlay [Classic/Button, transparent overlay, gallery-child]
  └── gal_DomFunctions [Gallery, Vertical, items-cols: su_name|su_functioncode|su_riskarea.su_name|su_complianceowner.su_name|su_complianceowner.su_unit|su_risk, active-var: CurrentDomFunctionsID, active-col: su_functioncode]
      ├── lbl_DfName [Label, gallery-child]
      ├── lbl_DfSub [Label, gallery-child]
      ├── lbl_DfOwner [Label, gallery-child]
      ├── cmp_DfRisk [Component: cmp_RiskPill, gallery-child]
      ├── rec_DfRule [Rectangle, gallery-child]
      └── btn_DfOverlay [Classic/Button, transparent overlay, gallery-child]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control               X                           Y    Width                       Height
--------------------  --------------------------  ---  --------------------------  -------------------
cmp_HeaderDomains     0                           0    Parent.Width                104
btn_DomCrumbRoot      64                          116  90                          30
cmp_DomHead           64                          152  Parent.Width - 128          124
txt_DomSearch         64                          286  420                         44
lbl_DomEmptyCount     500                         286  420                         44
gal_Domains           64                          346  Parent.Width - 128          Parent.Height - 390
  rec_DomCard         0                           0    Parent.TemplateWidth        146
  rec_DomCardBar      0                           0    Parent.TemplateWidth        5
  lbl_DomCardArea     16                          18   Parent.TemplateWidth - 32   18
  lbl_DomCardName     16                          38   Parent.TemplateWidth - 32   56
  lbl_DomCardOwner    16                          96   Parent.TemplateWidth - 32   20
  lbl_DomCardCount    16                          118  Parent.TemplateWidth - 32   22
  btn_DomCardOverlay  0                           0    Parent.TemplateWidth        146
gal_DomFunctions      64                          286  Parent.Width - 128          Parent.Height - 330
  lbl_DfName          14                          10   Parent.TemplateWidth - 320  22
  lbl_DfSub           14                          32   Parent.TemplateWidth - 320  18
  lbl_DfOwner         Parent.TemplateWidth - 290  10   180                         40
  cmp_DfRisk          Parent.TemplateWidth - 96   19   74                          24
  rec_DfRule          0                           61   Parent.TemplateWidth        1
  btn_DfOverlay       0                           0    Parent.TemplateWidth        62
```

</details>

### scr_ExecutiveTeam  (28 controls)

**Purpose.** Executive view of portfolios by owner.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_ExecutiveTeam
Paste target: b (new screen)

  ├── cmp_HeaderExec [Component: cmp_Header]
  ├── cmp_ExecHead [Component: cmp_PageHead]
  ├── gal_Executives [Gallery, Horizontal, items-cols: su_name|su_jobtitle|su_unit|su_compliancedirectoryid, active-var: CurrentExecutivesID, active-col: su_compliancedirectoryid]
  │   ├── rec_ExecCard [Rectangle, card, gallery-child]
  │   ├── rec_ExecCardBar [Rectangle, card, gallery-child]
  │   ├── lbl_ExecInitials [Label, gallery-child]
  │   ├── lbl_ExecName [Label, gallery-child]
  │   ├── lbl_ExecTitle [Label, gallery-child]
  │   ├── lbl_ExecUnit [Label, gallery-child]
  │   ├── lbl_ExecHighRisk [Label, gallery-child]
  │   ├── lbl_ExecPortfolio [Label, gallery-child]
  │   └── btn_ExecOverlay [Classic/Button, transparent overlay, gallery-child]
  ├── rec_ExecScrim [Rectangle]
  └── cnt_ExecDialog [GroupContainer, ManualLayout]
      ├── rec_ExecDialogHead [Rectangle]
      ├── lbl_ExecDialogEyebrow [Label]
      ├── lbl_ExecDialogName [Label]
      ├── lbl_ExecDialogTitle [Label]
      ├── lbl_ExecStats [Label]
      ├── lbl_ExecPortfolioHead [Label]
      ├── gal_ExecPortfolio [Gallery, Vertical, items-cols: su_name|su_domain.su_name|su_complianceowner.su_name|su_risk, active-var: CurrentExecPortfolioID, active-col: su_name]
      │   ├── lbl_EpName [Label, gallery-child]
      │   ├── lbl_EpSub [Label, gallery-child]
      │   ├── cmp_EpRisk [Component: cmp_RiskPill, gallery-child]
      │   ├── rec_EpRule [Rectangle, gallery-child]
      │   └── btn_EpOverlay [Classic/Button, transparent overlay, gallery-child]
      ├── btn_ExecEmail [Classic/Button]
      └── btn_ExecDialogClose [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                  X                           Y                          Width                       Height
-----------------------  --------------------------  -------------------------  --------------------------  -------------------
cmp_HeaderExec           0                           0                          Parent.Width                104
cmp_ExecHead             64                          128                        Parent.Width - 128          124
gal_Executives           64                          272                        Parent.Width - 128          Parent.Height - 316
  rec_ExecCard           0                           0                          Parent.TemplateWidth        188
  rec_ExecCardBar        0                           0                          Parent.TemplateWidth        5
  lbl_ExecInitials       16                          22                         52                          52
  lbl_ExecName           78                          22                         Parent.TemplateWidth - 94   24
  lbl_ExecTitle          78                          46                         Parent.TemplateWidth - 94   44
  lbl_ExecUnit           16                          100                        Parent.TemplateWidth - 32   20
  lbl_ExecHighRisk       16                          140                        110                         28
  lbl_ExecPortfolio      Parent.TemplateWidth - 146  140                        130                         28
  btn_ExecOverlay        0                           0                          Parent.TemplateWidth        188
rec_ExecScrim            0                           0                          Parent.Width                Parent.Height
cnt_ExecDialog           (Parent.Width - 800) / 2    (Parent.Height - 600) / 2  800                         600
  rec_ExecDialogHead     0                           0                          800                         112
  lbl_ExecDialogEyebrow  28                          18                         600                         18
  lbl_ExecDialogName     28                          38                         680                         32
  lbl_ExecDialogTitle    28                          72                         680                         30
  lbl_ExecStats          28                          132                        744                         74
  lbl_ExecPortfolioHead  28                          218                        744                         24
  gal_ExecPortfolio      28                          246                        744                         282
    lbl_EpName           8                           8                          Parent.TemplateWidth - 110  22
    lbl_EpSub            8                           30                         Parent.TemplateWidth - 110  18
    cmp_EpRisk           Parent.TemplateWidth - 92   17                         74                          24
    rec_EpRule           0                           57                         Parent.TemplateWidth        1
    btn_EpOverlay        0                           0                          Parent.TemplateWidth        58
  btn_ExecEmail          28                          542                        140                         40
  btn_ExecDialogClose    662                         542                        110                         40
```

</details>

### scr_FunctionDetail  (110 controls)

**Purpose.** Record detail and edit view for one function, plus its deadlines, ownership, and flags. The largest screen in the app.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_FunctionDetail
Paste target: b (new screen)

  ├── cmp_HeaderFd [Component: cmp_Header]
  ├── btn_FdBack [Classic/Button]
  ├── lbl_FdCrumb [Label]
  ├── rec_FdHead [Rectangle]
  ├── rec_FdHeadRule [Rectangle]
  ├── lbl_FdEyebrow [Label]
  ├── lbl_FdTitle [Label]
  ├── cmp_FdRisk [Component: cmp_RiskPill]
  ├── lbl_FdCode [Label]
  ├── lbl_FdGapCount [Label]
  ├── lbl_FdFlagged [Label]
  ├── btn_FdSave [Classic/Button]
  ├── btn_FdCancel [Classic/Button]
  ├── cnt_FlagPanel [GroupContainer, ManualLayout]
  │   ├── lbl_FlagPanelTitle [Label]
  │   ├── lbl_FlagPanelLabel [Label]
  │   ├── txt_FlagReason [Classic/TextInput]
  │   ├── lbl_FlagPanelNote [Label]
  │   ├── btn_FlagSubmit [Classic/Button]
  │   └── btn_FlagCancel [Classic/Button]
  ├── cnt_GapPanel [GroupContainer, ManualLayout]
  │   ├── lbl_GapPanelTitle [Label]
  │   ├── lbl_GapSummaryLabel [Label]
  │   ├── txt_GapTitle [Classic/TextInput]
  │   ├── lbl_GapSeverityLabel [Label]
  │   ├── drp_GapSeverity [Classic/DropDown]
  │   ├── lbl_GapDetailLabel [Label]
  │   ├── txt_GapNote [Classic/TextInput]
  │   ├── lbl_GapPanelNote [Label]
  │   ├── btn_GapSubmit [Classic/Button]
  │   └── btn_GapCancel [Classic/Button]
  ├── cnt_FdMain [GroupContainer, ManualLayout]
  │   ├── rec_FdFlagBanner [Rectangle]
  │   ├── lbl_FdFlagBannerText [Label]
  │   ├── btn_FdClearFlag [Classic/Button]
  │   ├── cnt_FdRead [GroupContainer, AutoLayout, scrollable]
  │   │   ├── lbl_FdStatuteHead [Label]
  │   │   ├── lbl_FdStatuteBody [Label]
  │   │   ├── btn_FdStatuteLink [Classic/Button]
  │   │   ├── lbl_FdObligationHead [Label]
  │   │   ├── lbl_FdObligationBody [Label]
  │   │   ├── lbl_FdReportingHead [Label]
  │   │   ├── lbl_FdReportingBody [Label]
  │   │   ├── lbl_FdCadenceHead [Label]
  │   │   ├── lbl_FdCadenceBody [Label]
  │   │   ├── gal_FdDeadlines [Gallery, Vertical, items-cols: su_complete|su_duedate|su_name|su_cadence, active-var: CurrentFdDeadlinesID, active-col: su_complete]
  │   │   │   ├── rec_FdDlBox [Rectangle, gallery-child]
  │   │   │   ├── lbl_FdDlTitle [Label, gallery-child]
  │   │   │   ├── lbl_FdDlSub [Label, gallery-child]
  │   │   │   └── cmp_FdDlPill [Component: cmp_DuePill, gallery-child]
  │   │   ├── lbl_FdOwnershipHead [Label]
  │   │   ├── gal_FdOwnership [Gallery, Horizontal, items-cols: RoleLabel|RoleNote|RoleKey|su_person.su_name|su_person.su_jobtitle|su_subrole, active-var: CurrentFdOwnershipID, active-col: RoleLabel]
  │   │   │   ├── rec_FdRoleCard [Rectangle, card, gallery-child]
  │   │   │   ├── lbl_FdRoleLabel [Label, gallery-child]
  │   │   │   ├── lbl_FdRoleNote [Label, gallery-child]
  │   │   │   ├── gal_FdRolePeople [Gallery, Vertical, items-cols: RoleKey|su_person.su_name|su_person.su_jobtitle|su_subrole, active-var: CurrentFdRolePeopleID, active-col: RoleKey, gallery-child]
  │   │   │   │   ├── lbl_FdPersonName [Label, gallery-child]
  │   │   │   │   ├── lbl_FdPersonTitle [Label, gallery-child]
  │   │   │   │   └── lbl_FdPersonSubrole [Label, gallery-child]
  │   │   │   └── lbl_FdRoleEmpty [Label, gallery-child]
  │   │   ├── lbl_FdGapHead [Label]
  │   │   ├── gal_FdGaps [Gallery, Vertical, items-cols: su_status|su_severity|su_gapcode|su_openeddate|su_daysopen|su_assessment.su_assessmentcode|su_name|su_closenote|su_note, active-var: CurrentFdGapsID, active-col: su_gapcode]
  │   │   │   ├── rec_FdGapBox [Rectangle, gallery-child]
  │   │   │   ├── rec_FdGapAccent [Rectangle, gallery-child]
  │   │   │   ├── lbl_FdGapStatus [Label, gallery-child]
  │   │   │   ├── lbl_FdGapMeta [Label, gallery-child]
  │   │   │   ├── lbl_FdGapTitle [Label, gallery-child]
  │   │   │   └── lbl_FdGapNote [Label, gallery-child]
  │   │   ├── lbl_FdGapEmpty [Label]
  │   │   ├── lbl_FdResourceHead [Label]
  │   │   └── btn_FdResourceLink [Classic/Button]
  │   └── cnt_FdEdit [GroupContainer, AutoLayout, scrollable]
  │       ├── lbl_FdEditNote [Label]
  │       ├── lbl_FdNameLabel [Label]
  │       ├── txt_FdName [Classic/TextInput]
  │       ├── lbl_FdRiskLabel [Label]
  │       ├── drp_FdRisk [Classic/DropDown]
  │       ├── lbl_FdAreaLabel [Label]
  │       ├── drp_FdDomain [Classic/ComboBox]
  │       ├── lbl_FdRiskAreaEcho [Label]
  │       ├── lbl_FdStatuteLabel [Label]
  │       ├── txt_FdStatute [Classic/TextInput]
  │       ├── lbl_FdCitationLabel [Label]
  │       ├── txt_FdCitation [Classic/TextInput]
  │       ├── lbl_FdStatuteUrlLabel [Label]
  │       ├── txt_FdStatuteUrl [Classic/TextInput]
  │       ├── lbl_FdDescLabel [Label]
  │       ├── txt_FdDescription [Classic/TextInput]
  │       ├── lbl_FdReportingLabel [Label]
  │       ├── txt_FdReporting [Classic/TextInput]
  │       ├── lbl_FdCadenceLabel [Label]
  │       ├── txt_FdDeadlineNarrative [Classic/TextInput]
  │       ├── lbl_FdResourceLabelLabel [Label]
  │       ├── txt_FdResourceLabel [Classic/TextInput]
  │       ├── lbl_FdResourceUrlLabel [Label]
  │       └── txt_FdResourceUrl [Classic/TextInput]
  ├── cnt_FdRail [GroupContainer, AutoLayout, scrollable]
  │   ├── lbl_RailStatusHead [Label]
  │   ├── lbl_RailStatusBody [Label]
  │   ├── lbl_RailActionHead [Label]
  │   ├── btn_RailEdit [Classic/Button]
  │   ├── btn_RailFlag [Classic/Button]
  │   ├── btn_RailLogGap [Classic/Button]
  │   ├── lbl_RailCounselHead [Label]
  │   ├── lbl_RailCounselBody [Label]
  │   └── btn_RailCounselEmail [Classic/Button]
  ├── rec_FdToast [Rectangle]
  ├── rec_FdToastAccent [Rectangle]
  ├── lbl_FdToast [Label]
  └── btn_FdToastDismiss [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                       X                               Y                                                                    Width                       Height
----------------------------  ------------------------------  -------------------------------------------------------------------  --------------------------  ---------------------------------------------
cmp_HeaderFd                  0                               0                                                                    Parent.Width                104
btn_FdBack                    64                              116                                                                  130                         32
lbl_FdCrumb                   200                             116                                                                  700                         32
rec_FdHead                    0                               156                                                                  Parent.Width                150
rec_FdHeadRule                0                               303                                                                  Parent.Width                3
lbl_FdEyebrow                 64                              174                                                                  800                         20
lbl_FdTitle                   64                              198                                                                  Parent.Width - 460          56
cmp_FdRisk                    64                              262                                                                  74                          24
lbl_FdCode                    148                             262                                                                  90                          24
lbl_FdGapCount                248                             262                                                                  104                         24
lbl_FdFlagged                 362                             262                                                                  140                         24
btn_FdSave                    Parent.Width - 360              252                                                                  150                         40
btn_FdCancel                  Parent.Width - 198              252                                                                  110                         40
cnt_FlagPanel                 0                               306                                                                  Parent.Width                222
  lbl_FlagPanelTitle          64                              18                                                                   600                         26
  lbl_FlagPanelLabel          64                              50                                                                   600                         20
  txt_FlagReason              64                              72                                                                   Parent.Width - 460          70
  lbl_FlagPanelNote           64                              148                                                                  Parent.Width - 460          20
  btn_FlagSubmit              64                              174                                                                  130                         38
  btn_FlagCancel              206                             174                                                                  100                         38
cnt_GapPanel                  0                               306                                                                  Parent.Width                270
  lbl_GapPanelTitle           64                              18                                                                   600                         26
  lbl_GapSummaryLabel         64                              50                                                                   400                         20
  txt_GapTitle                64                              72                                                                   Parent.Width - 640          42
  lbl_GapSeverityLabel        Parent.Width - 560              50                                                                   180                         20
  drp_GapSeverity             Parent.Width - 560              72                                                                   180                         42
  lbl_GapDetailLabel          64                              122                                                                  400                         20
  txt_GapNote                 64                              144                                                                  Parent.Width - 460          62
  lbl_GapPanelNote            64                              212                                                                  Parent.Width - 460          18
  btn_GapSubmit               64                              236                                                                  120                         38
  btn_GapCancel               196                             236                                                                  100                         38
cnt_FdMain                    64                              306 + If(gblFdPanel = "flag", 222, gblFdPanel = "gap", 270, 0) + 24  Parent.Width - 480          Parent.Height - 400
  rec_FdFlagBanner            0                               0                                                                    Parent.Width                78
  lbl_FdFlagBannerText        16                              10                                                                   Parent.Width - 180          58
  btn_FdClearFlag             Parent.Width - 150              22                                                                   134                         34
  cnt_FdRead                  0                               If(IsBlank(gblFdFlag), 0, 94)                                        Parent.Width                Parent.Height - If(IsBlank(gblFdFlag), 0, 94)
    lbl_FdStatuteHead                                                                                                              Parent.Width                26
    lbl_FdStatuteBody                                                                                                              Parent.Width                74
    btn_FdStatuteLink                                                                                                              200                         32
    lbl_FdObligationHead                                                                                                           Parent.Width                26
    lbl_FdObligationBody                                                                                                           Parent.Width                96
    lbl_FdReportingHead                                                                                                            Parent.Width                26
    lbl_FdReportingBody                                                                                                            Parent.Width                64
    lbl_FdCadenceHead                                                                                                              Parent.Width                26
    lbl_FdCadenceBody                                                                                                              Parent.Width                44
    gal_FdDeadlines                                                                                                                Parent.Width                Min(CountRows(colFdDeadlines) * 54, 216)
      rec_FdDlBox             0                               0                                                                    Parent.TemplateWidth        48
      lbl_FdDlTitle           14                              5                                                                    Parent.TemplateWidth - 140  20
      lbl_FdDlSub             14                              25                                                                   Parent.TemplateWidth - 140  18
      cmp_FdDlPill            Parent.TemplateWidth - 118      12                                                                   104                         24
    lbl_FdOwnershipHead                                                                                                            Parent.Width                26
    gal_FdOwnership                                                                                                                Parent.Width                230
      rec_FdRoleCard          0                               0                                                                    Parent.TemplateWidth        220
      lbl_FdRoleLabel         14                              12                                                                   Parent.TemplateWidth - 28   22
      lbl_FdRoleNote          14                              34                                                                   Parent.TemplateWidth - 28   20
      gal_FdRolePeople        10                              58                                                                   Parent.TemplateWidth - 20   154
        lbl_FdPersonName      4                               4                                                                    Parent.TemplateWidth - 78   18
        lbl_FdPersonTitle     4                               22                                                                   Parent.TemplateWidth - 78   26
        lbl_FdPersonSubrole   Parent.TemplateWidth - 72       12                                                                   68                          22
      lbl_FdRoleEmpty         14                              100                                                                  Parent.TemplateWidth - 28   40
    lbl_FdGapHead                                                                                                                  Parent.Width                26
    gal_FdGaps                                                                                                                     Parent.Width                Min(Max(CountRows(colFdGaps), 1) * 96, 300)
      rec_FdGapBox            0                               0                                                                    Parent.TemplateWidth        88
      rec_FdGapAccent         0                               0                                                                    3                           88
      lbl_FdGapStatus         14                              8                                                                    70                          20
      lbl_FdGapMeta           92                              8                                                                    Parent.TemplateWidth - 110  20
      lbl_FdGapTitle          14                              30                                                                   Parent.TemplateWidth - 28   20
      lbl_FdGapNote           14                              50                                                                   Parent.TemplateWidth - 28   34
    lbl_FdGapEmpty                                                                                                                 Parent.Width                60
    lbl_FdResourceHead                                                                                                             Parent.Width                26
    btn_FdResourceLink                                                                                                             Parent.Width                34
  cnt_FdEdit                  0                               If(IsBlank(gblFdFlag), 0, 94)                                        Parent.Width                Parent.Height - If(IsBlank(gblFdFlag), 0, 94)
    lbl_FdEditNote                                                                                                                 Parent.Width                44
    lbl_FdNameLabel                                                                                                                Parent.Width                20
    txt_FdName                                                                                                                     Parent.Width                42
    lbl_FdRiskLabel                                                                                                                Parent.Width                20
    drp_FdRisk                                                                                                                     260                         42
    lbl_FdAreaLabel                                                                                                                Parent.Width                20
    drp_FdDomain                                                                                                                   Parent.Width                42
    lbl_FdRiskAreaEcho                                                                                                             Parent.Width                22
    lbl_FdStatuteLabel                                                                                                             Parent.Width                20
    txt_FdStatute                                                                                                                  Parent.Width                42
    lbl_FdCitationLabel                                                                                                            Parent.Width                20
    txt_FdCitation                                                                                                                 Parent.Width                42
    lbl_FdStatuteUrlLabel                                                                                                          Parent.Width                20
    txt_FdStatuteUrl                                                                                                               Parent.Width                42
    lbl_FdDescLabel                                                                                                                Parent.Width                20
    txt_FdDescription                                                                                                              Parent.Width                110
    lbl_FdReportingLabel                                                                                                           Parent.Width                20
    txt_FdReporting                                                                                                                Parent.Width                90
    lbl_FdCadenceLabel                                                                                                             Parent.Width                20
    txt_FdDeadlineNarrative                                                                                                        Parent.Width                70
    lbl_FdResourceLabelLabel                                                                                                       Parent.Width                20
    txt_FdResourceLabel                                                                                                            Parent.Width                42
    lbl_FdResourceUrlLabel                                                                                                         Parent.Width                20
    txt_FdResourceUrl                                                                                                              Parent.Width                42
cnt_FdRail                    Parent.Width - 396              306 + If(gblFdPanel = "flag", 222, gblFdPanel = "gap", 270, 0) + 24  332                         Parent.Height - 400
  lbl_RailStatusHead                                                                                                               Parent.Width                24
  lbl_RailStatusBody                                                                                                               Parent.Width                126
  lbl_RailActionHead                                                                                                               Parent.Width                24
  btn_RailEdit                                                                                                                     Parent.Width                38
  btn_RailFlag                                                                                                                     Parent.Width                38
  btn_RailLogGap                                                                                                                   Parent.Width                38
  lbl_RailCounselHead                                                                                                              Parent.Width                24
  lbl_RailCounselBody                                                                                                              Parent.Width                134
  btn_RailCounselEmail                                                                                                             Parent.Width                38
rec_FdToast                   (Parent.Width - 560) / 2        Parent.Height - 84                                                   560                         52
rec_FdToastAccent             (Parent.Width - 560) / 2        Parent.Height - 84                                                   4                           52
lbl_FdToast                   (Parent.Width - 560) / 2 + 18   Parent.Height - 84                                                   500                         52
btn_FdToastDismiss            (Parent.Width - 560) / 2 + 510  Parent.Height - 84                                                   46                          52
```

</details>

### scr_Functions  (26 controls)

**Purpose.** Searchable register of all compliance functions, with a card view and a table view.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Functions
Paste target: b (new screen)

  ├── cmp_HeaderFn [Component: cmp_Header]
  ├── cmp_FnHead [Component: cmp_PageHead]
  ├── txt_FnSearch [Classic/TextInput]
  ├── drp_FnRiskArea [Classic/DropDown]
  ├── drp_FnRisk [Classic/DropDown]
  ├── btn_FnViewTable [Classic/Button]
  ├── btn_FnViewCards [Classic/Button]
  ├── rec_FnTableHead [Rectangle]
  ├── gal_FnHeadCells [Gallery, Horizontal, items-cols: ColLabel, active-var: CurrentFnHeadCellsID, active-col: ColLabel]
  │   └── lbl_FnHeadCell [Label, gallery-child]
  ├── gal_Functions [Gallery, Vertical, items-cols: su_name|su_functioncode|su_opengapcount|su_isflagged|su_riskarea.su_name|su_domain.su_name|su_statute|su_citation|su_complianceowner.su_name|su_complianceowner.su_unit|su_risk, active-var: CurrentFunctionID, active-col: su_functioncode]
  │   ├── lbl_FnName [Label, gallery-child]
  │   ├── lbl_FnCode [Label, gallery-child]
  │   ├── lbl_FnGapBadge [Label, gallery-child]
  │   ├── lbl_FnFlagged [Label, gallery-child]
  │   ├── lbl_FnTopic [Label, gallery-child]
  │   ├── lbl_FnStatute [Label, gallery-child]
  │   ├── lbl_FnOwner [Label, gallery-child]
  │   ├── cmp_FnRisk [Component: cmp_RiskPill, gallery-child]
  │   ├── rec_FnRowRule [Rectangle, gallery-child]
  │   ├── rec_FnCardBorder [Rectangle, card, gallery-child]
  │   └── btn_FnOverlay [Classic/Button, transparent overlay, gallery-child]
  ├── lbl_FnEmpty [Label]
  ├── btn_FnPrev [Classic/Button]
  ├── lbl_FnPageCount [Label]
  └── btn_FnNext [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control             X                                                                                              Y                   Width                                                                                       Height
------------------  ---------------------------------------------------------------------------------------------  ------------------  ------------------------------------------------------------------------------------------  --------------------------------
cmp_HeaderFn        0                                                                                              0                   Parent.Width                                                                                104
cmp_FnHead          64                                                                                             128                 Parent.Width - 128                                                                          124
txt_FnSearch        64                                                                                             262                 380                                                                                         44
drp_FnRiskArea      456                                                                                            262                 250                                                                                         44
drp_FnRisk          718                                                                                            262                 190                                                                                         44
btn_FnViewTable     Parent.Width - 244                                                                             262                 88                                                                                          44
btn_FnViewCards     Parent.Width - 152                                                                             262                 88                                                                                          44
rec_FnTableHead     64                                                                                             326                 Parent.Width - 128                                                                          40
gal_FnHeadCells     64                                                                                             326                 Parent.Width - 128                                                                          40
  lbl_FnHeadCell    14                                                                                             0                   Parent.TemplateWidth - 20                                                                   40
gal_Functions       64                                                                                             366                 Parent.Width - 128                                                                          Parent.Height - 440
  lbl_FnName        14                                                                                             10                  If(gblFnView = "table",     Parent.TemplateWidth / 5 - 24,     Parent.TemplateWidth - 110)  22
  lbl_FnCode        14                                                                                             32                  90                                                                                          18
  lbl_FnGapBadge    78                                                                                             32                  52                                                                                          18
  lbl_FnFlagged     136                                                                                            32                  62                                                                                          18
  lbl_FnTopic       Parent.TemplateWidth / 5 + 14                                                                  10                  Parent.TemplateWidth / 5 - 24                                                               42
  lbl_FnStatute     Parent.TemplateWidth * 2 / 5 + 14                                                              10                  Parent.TemplateWidth / 5 - 24                                                               42
  lbl_FnOwner       Parent.TemplateWidth * 3 / 5 + 14                                                              10                  Parent.TemplateWidth / 5 - 24                                                               42
  cmp_FnRisk        If(gblFnView = "table",     Parent.TemplateWidth * 4 / 5 + 14,     Parent.TemplateWidth - 92)  18                  74                                                                                          24
  rec_FnRowRule     0                                                                                              61                  Parent.TemplateWidth                                                                        1
  rec_FnCardBorder  0                                                                                              0                   Parent.TemplateWidth                                                                        174
  btn_FnOverlay     0                                                                                              0                   Parent.TemplateWidth                                                                        If(gblFnView = "table", 62, 174)
lbl_FnEmpty         64                                                                                             440                 Parent.Width - 128                                                                          80
btn_FnPrev          64                                                                                             Parent.Height - 64  110                                                                                         40
lbl_FnPageCount     186                                                                                            Parent.Height - 64  340                                                                                         40
btn_FnNext          538                                                                                            Parent.Height - 64  110                                                                                         40
```

</details>

### scr_GapTracker  (41 controls)

**Purpose.** Open and closed gaps with aging. Administrator only.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_GapTracker
Paste target: b (new screen)

  ├── cmp_HeaderGap [Component: cmp_Header]
  ├── cmp_GapHead [Component: cmp_PageHead]
  ├── gal_GapStats [Gallery, Horizontal, items-cols: StatValue|StatTone|StatLabel|StatNote, active-var: CurrentGapStatsID, active-col: StatValue]
  │   ├── rec_GapStatCard [Rectangle, card, gallery-child]
  │   ├── lbl_GapStatValue [Label, gallery-child]
  │   ├── lbl_GapStatLabel [Label, gallery-child]
  │   └── lbl_GapStatNote [Label, gallery-child]
  ├── btn_GapTabOpen [Classic/Button]
  ├── btn_GapTabInProgress [Classic/Button]
  ├── btn_GapTabClosed [Classic/Button]
  ├── btn_GapTabFlags [Classic/Button]
  ├── rec_GapTabRule [Rectangle]
  ├── drp_GapSeverityFilter [Classic/DropDown]
  ├── gal_Gaps [Gallery, Horizontal, items-cols: su_status|su_severity|su_gapcode|su_daysopen|su_name|su_closenote|su_note|su_owner.su_name|su_function.su_name, active-var: CurrentGapID, active-col: su_gapcode]
  │   ├── rec_GapCard [Rectangle, card, gallery-child]
  │   ├── rec_GapCardAccent [Rectangle, card, gallery-child]
  │   ├── cmp_GapSeverityPill [Component: cmp_RiskPill, gallery-child]
  │   ├── lbl_GapCardMeta [Label, gallery-child]
  │   ├── lbl_GapCardTitle [Label, gallery-child]
  │   ├── lbl_GapCardNote [Label, gallery-child]
  │   ├── lbl_GapCardOwner [Label, gallery-child]
  │   ├── btn_GapCardFunction [Classic/Button, gallery-child]
  │   └── btn_GapCardClose [Classic/Button, gallery-child]
  ├── gal_GapFlags [Gallery, Vertical, items-cols: su_function.su_name|su_function.su_riskarea.su_name|su_flaggedby.su_name|su_flaggedon|su_reason, active-var: CurrentGapFlagsID, active-col: su_function.su_name]
  │   ├── lbl_FlagRowFn [Label, gallery-child]
  │   ├── lbl_FlagRowMeta [Label, gallery-child]
  │   ├── lbl_FlagRowReason [Label, gallery-child]
  │   ├── btn_FlagRowReview [Classic/Button, gallery-child]
  │   ├── btn_FlagRowClear [Classic/Button, gallery-child]
  │   └── rec_FlagRowRule [Rectangle, gallery-child]
  ├── rec_CloseScrim [Rectangle]
  └── cnt_CloseDialog [GroupContainer, ManualLayout]
      ├── rec_CloseHeader [Rectangle]
      ├── lbl_CloseTitle [Label]
      ├── lbl_CloseSub [Label]
      ├── lbl_CloseGapName [Label]
      ├── lbl_CloseNoteLabel [Label]
      ├── txt_CloseNote [Classic/TextInput]
      ├── lbl_CloseHint [Label]
      ├── btn_CloseConfirm [Classic/Button]
      └── btn_CloseCancel [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                X                           Y                          Width                       Height
---------------------  --------------------------  -------------------------  --------------------------  -------------------
cmp_HeaderGap          0                           0                          Parent.Width                104
cmp_GapHead            64                          128                        Parent.Width - 460          124
gal_GapStats           64                          262                        Parent.Width - 128          104
  rec_GapStatCard      0                           0                          Parent.TemplateWidth - 14   96
  lbl_GapStatValue     16                          12                         Parent.TemplateWidth - 40   40
  lbl_GapStatLabel     16                          52                         Parent.TemplateWidth - 40   20
  lbl_GapStatNote      16                          70                         Parent.TemplateWidth - 40   18
btn_GapTabOpen         64                          386                        190                         42
btn_GapTabInProgress   258                         386                        180                         42
btn_GapTabClosed       442                         386                        150                         42
btn_GapTabFlags        596                         386                        230                         42
rec_GapTabRule         64                          428                        Parent.Width - 128          1
drp_GapSeverityFilter  Parent.Width - 264          386                        200                         42
gal_Gaps               64                          446                        Parent.Width - 128          Parent.Height - 490
  rec_GapCard          0                           0                          Parent.TemplateWidth        244
  rec_GapCardAccent    0                           0                          4                           244
  cmp_GapSeverityPill  16                          14                         74                          24
  lbl_GapCardMeta      98                          14                         Parent.TemplateWidth - 114  24
  lbl_GapCardTitle     16                          44                         Parent.TemplateWidth - 32   44
  lbl_GapCardNote      16                          90                         Parent.TemplateWidth - 32   62
  lbl_GapCardOwner     16                          158                        Parent.TemplateWidth - 32   38
  btn_GapCardFunction  16                          200                        104                         32
  btn_GapCardClose     130                         200                        90                          32
gal_GapFlags           64                          446                        Parent.Width - 128          Parent.Height - 490
  lbl_FlagRowFn        14                          12                         Parent.TemplateWidth - 300  22
  lbl_FlagRowMeta      14                          34                         Parent.TemplateWidth - 300  18
  lbl_FlagRowReason    14                          54                         Parent.TemplateWidth - 300  42
  btn_FlagRowReview    Parent.TemplateWidth - 264  36                         110                         36
  btn_FlagRowClear     Parent.TemplateWidth - 144  36                         110                         36
  rec_FlagRowRule      0                           107                        Parent.TemplateWidth        1
rec_CloseScrim         0                           0                          Parent.Width                Parent.Height
cnt_CloseDialog        (Parent.Width - 620) / 2    (Parent.Height - 430) / 2  620                         430
  rec_CloseHeader      0                           0                          620                         84
  lbl_CloseTitle       24                          16                         520                         30
  lbl_CloseSub         24                          48                         520                         22
  lbl_CloseGapName     24                          104                        572                         44
  lbl_CloseNoteLabel   24                          158                        572                         22
  txt_CloseNote        24                          182                        572                         116
  lbl_CloseHint        24                          304                        572                         40
  btn_CloseConfirm     24                          360                        150                         42
  btn_CloseCancel      186                         360                        110                         42
```

</details>

### scr_Home  (40 controls)

**Purpose.** Landing page. Hero with search, a figures band, destination cards, and two rails: functions assigned to you and your upcoming deadlines.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Home
Paste target: b (new screen)

  ├── cmp_HeaderHome [Component: cmp_Header]
  └── cnt_HomeScroll [GroupContainer, ManualLayout, scrollable]
      ├── rec_HeroBg [Rectangle]
      ├── lbl_HeroEyebrow [Label]
      ├── lbl_HeroTitle [Label]
      ├── lbl_HeroLede [Label]
      ├── txt_HeroSearch [Classic/TextInput]
      ├── btn_HeroSearch [Classic/Button]
      ├── img_HeroBlockS [Image, inline SVG panel]
      ├── rec_BandBg [Rectangle]
      ├── gal_Figures [Gallery, Horizontal, items-cols: FigValue|FigAlert|FigLabel, active-var: CurrentFigureID, active-col: FigValue]
      │   ├── lbl_FigValue [Label, gallery-child]
      │   └── lbl_FigLabel [Label, gallery-child]
      ├── lbl_AsOf [Label]
      ├── lbl_StartHere [Label]
      ├── gal_Destinations [Gallery, Horizontal, items-cols: DestTitle|DestBody|DestMeta|DestKey, active-var: CurrentDestinationID, active-col: DestTitle]
      │   ├── rec_DestCard [Rectangle, card, gallery-child]
      │   ├── rec_DestAccent [Rectangle, gallery-child]
      │   ├── lbl_DestTitle [Label, gallery-child]
      │   ├── lbl_DestBody [Label, gallery-child]
      │   ├── lbl_DestMeta [Label, gallery-child]
      │   └── btn_DestOverlay [Classic/Button, transparent overlay, gallery-child]
      ├── lbl_AssignedHead [Label]
      ├── lbl_AssignedWho [Label]
      ├── gal_MyFunctions [Gallery, Vertical, items-cols: Value.su_name|Value.su_riskarea.su_name|Value.su_domain.su_name|Value.su_risk|Value.su_opengapcount|su_functioncode, active-var: CurrentFunctionID, active-col: su_functioncode]
      │   ├── lbl_MyFnName [Label, gallery-child]
      │   ├── lbl_MyFnSub [Label, gallery-child]
      │   ├── cmp_MyFnRisk [Component: cmp_RiskPill, gallery-child]
      │   ├── lbl_MyFnGapBadge [Label, gallery-child]
      │   ├── rec_MyFnRule [Rectangle, gallery-child]
      │   └── btn_MyFnOverlay [Classic/Button, transparent overlay, gallery-child]
      ├── lbl_NothingAssigned [Label]
      ├── rec_DeadlineRail [Rectangle]
      ├── lbl_RailHead [Label]
      ├── gal_MyDeadlines [Gallery, Vertical, items-cols: su_name|su_duedate|su_function.su_name|su_complete|su_deadlinecode, active-var: CurrentDeadlineID, active-col: su_deadlinecode]
      │   ├── lbl_DlTitle [Label, gallery-child]
      │   ├── lbl_DlSub [Label, gallery-child]
      │   ├── cmp_DlPill [Component: cmp_DuePill, gallery-child]
      │   └── btn_DlOverlay [Classic/Button, transparent overlay, gallery-child]
      └── lbl_RailNote [Label]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                X                                     Y     Width                            Height
---------------------  ------------------------------------  ----  -------------------------------  -------------------
cmp_HeaderHome         0                                     0     Parent.Width                     104
cnt_HomeScroll         0                                     104   Parent.Width                     Parent.Height - 104
  rec_HeroBg           0                                     0     Parent.Width                     352
  lbl_HeroEyebrow      64                                    40    700                              20
  lbl_HeroTitle        64                                    68    620                              136
  lbl_HeroLede         64                                    210   600                              56
  txt_HeroSearch       64                                    278   470                              46
  btn_HeroSearch       542                                   278   120                              46
  img_HeroBlockS       Parent.Width - 330                    46    260                              260
  rec_BandBg           0                                     352   Parent.Width                     104
  gal_Figures          64                                    352   Parent.Width - 400               104
    lbl_FigValue       0                                     20    Parent.TemplateWidth - 20        44
    lbl_FigLabel       0                                     64    Parent.TemplateWidth - 20        20
  lbl_AsOf             Parent.Width - 300                    374   236                              60
  lbl_StartHere        64                                    492   400                              24
  gal_Destinations     64                                    524   Parent.Width - 128               340
    rec_DestCard       0                                     0     Parent.TemplateWidth             150
    rec_DestAccent     0                                     0     4                                150
    lbl_DestTitle      20                                    18    Parent.TemplateWidth - 40        26
    lbl_DestBody       20                                    48    Parent.TemplateWidth - 40        58
    lbl_DestMeta       20                                    112   Parent.TemplateWidth - 40        22
    btn_DestOverlay    0                                     0     Parent.TemplateWidth             150
  lbl_AssignedHead     64                                    900   500                              24
  lbl_AssignedWho      Parent.Width - 500                    900   436                              24
  gal_MyFunctions      64                                    932   (Parent.Width - 144) * 0.6       290
    lbl_MyFnName       14                                    8     Parent.TemplateWidth - 200       22
    lbl_MyFnSub        14                                    30    Parent.TemplateWidth - 200       18
    cmp_MyFnRisk       Parent.TemplateWidth - 96             17    74                               24
    lbl_MyFnGapBadge   Parent.TemplateWidth - 132            17    28                               24
    rec_MyFnRule       0                                     57    Parent.TemplateWidth             1
    btn_MyFnOverlay    0                                     0     Parent.TemplateWidth             58
  lbl_NothingAssigned  64                                    990   (Parent.Width - 144) * 0.6       60
  rec_DeadlineRail     64 + (Parent.Width - 144) * 0.6 + 16  932   (Parent.Width - 144) * 0.4 - 16  290
  lbl_RailHead         80 + (Parent.Width - 144) * 0.6 + 16  948   260                              20
  gal_MyDeadlines      80 + (Parent.Width - 144) * 0.6 + 16  976   (Parent.Width - 144) * 0.4 - 48  176
    lbl_DlTitle        0                                     6     Parent.TemplateWidth - 116       20
    lbl_DlSub          0                                     26    Parent.TemplateWidth - 116       28
    cmp_DlPill         Parent.TemplateWidth - 108            16    104                              24
    btn_DlOverlay      0                                     0     Parent.TemplateWidth             58
  lbl_RailNote         80 + (Parent.Width - 144) * 0.6 + 16  1158  (Parent.Width - 144) * 0.4 - 48  48
```

</details>

### scr_NoAccess  (6 controls)

**Purpose.** Courtesy message for non-administrators. Smallest screen - a good first run.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_NoAccess
Paste target: b (new screen)

  ├── cmp_HeaderNoAccess [Component: cmp_Header]
  ├── rec_NoAccessCard [Rectangle, card]
  ├── img_NoAccessShield [Image, icon]
  ├── lbl_NoAccessTitle [Label]
  ├── lbl_NoAccessBody [Label]
  └── btn_NoAccessHome [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control             X                         Y    Width         Height
------------------  ------------------------  ---  ------------  ------
cmp_HeaderNoAccess  0                         0    Parent.Width  104
rec_NoAccessCard    (Parent.Width - 640) / 2  240  640           300
img_NoAccessShield  (Parent.Width - 48) / 2   286  48            48
lbl_NoAccessTitle   (Parent.Width - 560) / 2  348  560           36
lbl_NoAccessBody    (Parent.Width - 520) / 2  390  520           62
btn_NoAccessHome    (Parent.Width - 180) / 2  468  180           44
```

</details>

### scr_Reporting  (21 controls)

**Purpose.** Embedded Power BI reports. Administrator only. In the mockup this is a placeholder panel.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_Reporting
Paste target: b (new screen)

  ├── cmp_HeaderRpt [Component: cmp_Header]
  ├── cmp_RptHead [Component: cmp_PageHead]
  ├── btn_RptOpenPbi [Classic/Button]
  ├── btn_RptTabEmbed [Classic/Button]
  ├── btn_RptTabData [Classic/Button]
  ├── rec_RptTabRule [Rectangle]
  ├── rec_PbiPlaceholder [Rectangle]
  ├── lbl_PbiPlaceholder [Label]
  ├── lbl_PbiNote [Label]
  ├── gal_RptCatalogue [Gallery, Horizontal, items-cols: RptTitle|RptBody|RptId, active-var: CurrentRptCatalogueID, active-col: RptId]
  │   ├── rec_RptCard [Rectangle, card, gallery-child]
  │   ├── lbl_RptCardTitle [Label, gallery-child]
  │   ├── lbl_RptCardBody [Label, gallery-child]
  │   └── btn_RptCardOpen [Classic/Button, gallery-child]
  ├── lbl_RptConnNote [Label]
  ├── gal_RptDatasets [Gallery, Vertical, items-cols: DsName|DsLogical|DsBody, active-var: CurrentRptDatasetsID, active-col: DsName]
  │   ├── lbl_DsName [Label, gallery-child]
  │   ├── lbl_DsLogical [Label, gallery-child]
  │   ├── lbl_DsBody [Label, gallery-child]
  │   └── rec_DsRule [Rectangle, gallery-child]
  └── lbl_RptModelNote [Label]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control             X                   Y                                Width                       Height
------------------  ------------------  -------------------------------  --------------------------  -------------------
cmp_HeaderRpt       0                   0                                Parent.Width                104
cmp_RptHead         64                  128                              Parent.Width - 420          124
btn_RptOpenPbi      Parent.Width - 260  150                              196                         44
btn_RptTabEmbed     64                  262                              190                         42
btn_RptTabData      258                 262                              230                         42
rec_RptTabRule      64                  304                              Parent.Width - 128          1
rec_PbiPlaceholder  64                  324                              Parent.Width - 128          Parent.Height - 500
lbl_PbiPlaceholder  64                  (Parent.Height - 500) / 2 + 250  Parent.Width - 128          60
lbl_PbiNote         64                  Parent.Height - 168              Parent.Width - 128          40
gal_RptCatalogue    64                  Parent.Height - 120              Parent.Width - 128          100
  rec_RptCard       0                   0                                Parent.TemplateWidth        92
  lbl_RptCardTitle  14                  10                               Parent.TemplateWidth - 28   22
  lbl_RptCardBody   14                  32                               Parent.TemplateWidth - 28   34
  btn_RptCardOpen   14                  62                               140                         24
lbl_RptConnNote     64                  324                              Parent.Width - 128          56
gal_RptDatasets     64                  396                              Parent.Width - 128          260
  lbl_DsName        8                   8                                240                         20
  lbl_DsLogical     8                   28                               240                         18
  lbl_DsBody        264                 8                                Parent.TemplateWidth - 280  40
  rec_DsRule        0                   55                               Parent.TemplateWidth        1
lbl_RptModelNote    64                  672                              Parent.Width - 128          130
```

</details>

### scr_RiskAreas  (27 controls)

**Purpose.** Thirteen risk areas with counts and risk distribution.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_RiskAreas
Paste target: b (new screen)

  ├── cmp_HeaderRiskAreas [Component: cmp_Header]
  ├── btn_RaCrumbRoot [Classic/Button]
  ├── btn_RaCrumbArea [Classic/Button]
  ├── cmp_RaHead [Component: cmp_PageHead]
  ├── gal_RiskAreaTiles [Gallery, Horizontal, items-cols: su_colorhex|su_name|su_riskareaid, active-var: CurrentRiskAreaTilesID, active-col: su_riskareaid]
  │   ├── rec_RaTile [Rectangle, gallery-child]
  │   ├── rec_RaTileBar [Rectangle, gallery-child]
  │   ├── lbl_RaTileName [Label, gallery-child]
  │   ├── lbl_RaTileDomains [Label, gallery-child]
  │   ├── lbl_RaTileCount [Label, gallery-child]
  │   └── btn_RaTileOverlay [Classic/Button, transparent overlay, gallery-child]
  ├── rec_RaUnassigned [Rectangle]
  ├── btn_RaUnassigned [Classic/Button]
  ├── gal_RaDomains [Gallery, Horizontal, items-cols: su_name|su_owner.su_name|su_domainid, active-var: CurrentRaDomainsID, active-col: su_domainid]
  │   ├── rec_RaDomainTile [Rectangle, gallery-child]
  │   ├── rec_RaDomainBar [Rectangle, gallery-child]
  │   ├── lbl_RaDomainName [Label, gallery-child]
  │   ├── lbl_RaDomainOwner [Label, gallery-child]
  │   ├── lbl_RaDomainCount [Label, gallery-child]
  │   └── btn_RaDomainOverlay [Classic/Button, transparent overlay, gallery-child]
  └── gal_RaFunctions [Gallery, Vertical, items-cols: su_name|su_functioncode|su_statute|su_complianceowner.su_name|su_complianceowner.su_unit|su_risk, active-var: CurrentRaFunctionsID, active-col: su_functioncode]
      ├── lbl_RaFnName [Label, gallery-child]
      ├── lbl_RaFnSub [Label, gallery-child]
      ├── lbl_RaFnOwner [Label, gallery-child]
      ├── cmp_RaFnRisk [Component: cmp_RiskPill, gallery-child]
      ├── rec_RaFnRule [Rectangle, gallery-child]
      └── btn_RaFnOverlay [Classic/Button, transparent overlay, gallery-child]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                X                           Y                   Width                       Height
---------------------  --------------------------  ------------------  --------------------------  -------------------
cmp_HeaderRiskAreas    0                           0                   Parent.Width                104
btn_RaCrumbRoot        64                          116                 100                         30
btn_RaCrumbArea        170                         116                 300                         30
cmp_RaHead             64                          152                 Parent.Width - 128          124
gal_RiskAreaTiles      64                          286                 Parent.Width - 128          Parent.Height - 330
  rec_RaTile           0                           0                   Parent.TemplateWidth        148
  rec_RaTileBar        0                           0                   Parent.TemplateWidth        5
  lbl_RaTileName       16                          22                  Parent.TemplateWidth - 32   58
  lbl_RaTileDomains    16                          104                 Parent.TemplateWidth - 100  28
  lbl_RaTileCount      Parent.TemplateWidth - 84   98                  68                          38
  btn_RaTileOverlay    0                           0                   Parent.TemplateWidth        148
rec_RaUnassigned       64                          Parent.Height - 84  Parent.Width - 128          44
btn_RaUnassigned       64                          Parent.Height - 84  Parent.Width - 128          44
gal_RaDomains          64                          286                 Parent.Width - 128          Parent.Height - 330
  rec_RaDomainTile     0                           0                   Parent.TemplateWidth        134
  rec_RaDomainBar      0                           0                   Parent.TemplateWidth        5
  lbl_RaDomainName     16                          22                  Parent.TemplateWidth - 32   54
  lbl_RaDomainOwner    16                          78                  Parent.TemplateWidth - 32   20
  lbl_RaDomainCount    16                          100                 Parent.TemplateWidth - 32   24
  btn_RaDomainOverlay  0                           0                   Parent.TemplateWidth        134
gal_RaFunctions        64                          286                 Parent.Width - 128          Parent.Height - 330
  lbl_RaFnName         14                          10                  Parent.TemplateWidth - 320  22
  lbl_RaFnSub          14                          32                  Parent.TemplateWidth - 320  18
  lbl_RaFnOwner        Parent.TemplateWidth - 290  10                  180                         40
  cmp_RaFnRisk         Parent.TemplateWidth - 96   19                  74                          24
  rec_RaFnRule         0                           61                  Parent.TemplateWidth        1
  btn_RaFnOverlay      0                           0                   Parent.TemplateWidth        62
```

</details>

### scr_RiskDashboard  (29 controls)

**Purpose.** Risk distribution, heat map, and coverage. Administrator only.

**Screen `Fill`:** `=gblTheme.White`

```
Screen: scr_RiskDashboard
Paste target: b (new screen)

  ├── cmp_HeaderRisk [Component: cmp_Header]
  ├── cmp_RiskHead [Component: cmp_PageHead]
  ├── gal_RiskStats [Gallery, Horizontal, items-cols: RiskLabel|RiskKey, active-var: CurrentRiskStatsID, active-col: RiskLabel]
  │   ├── rec_RiskStatCard [Rectangle, card, gallery-child]
  │   ├── lbl_RiskStatValue [Label, gallery-child]
  │   ├── lbl_RiskStatLabel [Label, gallery-child]
  │   └── lbl_RiskStatPct [Label, gallery-child]
  ├── lbl_HeatHead [Label]
  ├── lbl_HeatHint [Label]
  ├── gal_HeatRows [Gallery, Vertical, items-cols: su_name|CellLabel|CellRisk|su_riskareaid, active-var: CurrentHeatRowsID, active-col: su_riskareaid]
  │   ├── lbl_HeatRowLabel [Label, gallery-child]
  │   ├── gal_HeatCells [Gallery, Horizontal, items-cols: CellLabel|CellRisk, active-var: CurrentHeatCellsID, active-col: CellLabel, gallery-child]
  │   │   ├── rec_HeatCell [Rectangle, gallery-child]
  │   │   ├── lbl_HeatCellValue [Label, gallery-child]
  │   │   └── btn_HeatCellOverlay [Classic/Button, transparent overlay, gallery-child]
  │   └── lbl_HeatRowTotal [Label, gallery-child]
  ├── lbl_SignalsHead [Label]
  ├── lbl_SignalsBody [Label]
  ├── rec_HeatScrim [Rectangle]
  └── cnt_HeatDialog [GroupContainer, ManualLayout]
      ├── rec_HeatDialogHead [Rectangle]
      ├── lbl_HeatDialogEyebrow [Label]
      ├── lbl_HeatDialogTitle [Label]
      ├── gal_HeatDrill [Gallery, Vertical, items-cols: su_name|su_domain.su_name|su_complianceowner.su_name, active-var: CurrentHeatDrillID, active-col: su_name]
      │   ├── lbl_HeatDrillName [Label, gallery-child]
      │   ├── lbl_HeatDrillSub [Label, gallery-child]
      │   ├── rec_HeatDrillRule [Rectangle, gallery-child]
      │   └── btn_HeatDrillOverlay [Classic/Button, transparent overlay, gallery-child]
      └── btn_HeatDialogClose [Classic/Button]
```

<details><summary>Geometry - use these values, do not re-derive them</summary>

```
control                   X                          Y                          Width                       Height
------------------------  -------------------------  -------------------------  --------------------------  -------------------
cmp_HeaderRisk            0                          0                          Parent.Width                104
cmp_RiskHead              64                         128                        Parent.Width - 128          124
gal_RiskStats             64                         258                        Parent.Width - 128          104
  rec_RiskStatCard        0                          0                          Parent.TemplateWidth - 14   96
  lbl_RiskStatValue       16                         12                         Parent.TemplateWidth - 40   40
  lbl_RiskStatLabel       16                         52                         Parent.TemplateWidth - 40   20
  lbl_RiskStatPct         16                         70                         Parent.TemplateWidth - 40   18
lbl_HeatHead              64                         382                        600                         24
lbl_HeatHint              Parent.Width - 360         382                        296                         24
gal_HeatRows              64                         412                        Parent.Width - 128          Parent.Height - 470
  lbl_HeatRowLabel        0                          0                          260                         36
  gal_HeatCells           264                        0                          Parent.TemplateWidth - 364  36
    rec_HeatCell          1                          1                          Parent.TemplateWidth - 2    34
    lbl_HeatCellValue     1                          1                          Parent.TemplateWidth - 2    34
    btn_HeatCellOverlay   1                          1                          Parent.TemplateWidth - 2    34
  lbl_HeatRowTotal        Parent.TemplateWidth - 96  0                          92                          36
lbl_SignalsHead           Parent.Width - 400         Parent.Height - 250        336                         24
lbl_SignalsBody           Parent.Width - 400         Parent.Height - 222        336                         220
rec_HeatScrim             0                          0                          Parent.Width                Parent.Height
cnt_HeatDialog            (Parent.Width - 720) / 2   (Parent.Height - 520) / 2  720                         520
  rec_HeatDialogHead      0                          0                          720                         92
  lbl_HeatDialogEyebrow   24                         16                         600                         20
  lbl_HeatDialogTitle     24                         38                         600                         32
  gal_HeatDrill           24                         110                        672                         340
    lbl_HeatDrillName     8                          8                          Parent.TemplateWidth - 120  22
    lbl_HeatDrillSub      8                          30                         Parent.TemplateWidth - 120  18
    rec_HeatDrillRule     0                          57                         Parent.TemplateWidth        1
    btn_HeatDrillOverlay  0                          0                          Parent.TemplateWidth        58
  btn_HeatDialogClose     586                        464                        110                         40
```

</details>

---

## Variable rename map

The skill's format requires a `Current<Noun>` variable on every gallery. This app uses different names, and in two cases a whole record rather than a code. Rename after generating, or leave the `Current*` names and wire them up later:

| Skill variable | This app |
|---|---|
| `CurrentAssessmentID` | gblSelectedAssessment (a whole record) |
| `CurrentColumnID` | no equivalent - the table header gallery is display only |
| `CurrentDeadlineID` | no equivalent - deadlines are opened through their function |
| `CurrentDestinationID` | no equivalent - destination cards navigate on tap |
| `CurrentFigureID` | no equivalent - the figures band is display only |
| `CurrentFunctionID` | gblSelectedFunction (a whole record, not a code) |
| `CurrentGapID` | gblSelectedGap |

---

## What not to ask the skill for

`ComplianceMatrix.msapp` in the repository root already opens in Studio with all 14 screens. Use this brief to regenerate or redesign a screen, not to rebuild what already works.
