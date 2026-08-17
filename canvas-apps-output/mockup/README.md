# Mockup replica: Canvas YAML for all 12 screens

Generated from `Compliance_Matrix_standalone.html` with the
`canvas-apps-ui-gen` skill, in replicate mode.

Geometry is not estimated. The HTML artifact was unpacked (its React
modules are gzipped inside the bundler manifest), rendered in headless
Chromium at 1366 wide, and every element's computed box and style was
dumped from the DOM. The X/Y/Width/Height values in these files are those
measurements, converted to Power Apps units. CSS pixel font sizes are
converted at `pt = px * 0.75`.

Every file passes `python3 tools/paste_check.py <file> --strict`.

## Files

| File | Contents |
|---|---|
| `_chrome-components.yaml` | `cmp_ChromeHeader`, `cmp_NavMenus`, `cmp_ChromeFooter` |
| `scr_Home.yaml` | Landing page |
| `scr_Functions.yaml` | Register, table and card views |
| `scr_FunctionDetail.yaml` | Record detail |
| `scr_Topics.yaml` | Topics and Statutes tabs |
| `scr_Areas.yaml` | Compliance areas |
| `scr_Deadlines.yaml` | Calendar and list views |
| `scr_Directory.yaml` | People, with person dialog |
| `scr_ExecutiveTeam.yaml` | Executive portfolios, with dialog |
| `scr_GapTracker.yaml` | Open and closed gaps |
| `scr_RiskDashboard.yaml` | Heat map and exposure |
| `scr_Reporting.yaml` | Power BI embed, datasets, exports |
| `scr_NoAccess.yaml` | Non-administrator message |

## Paste order

1. Paste `_app-onstart.pfx` into **App > OnStart**. Do this first. Every
   screen reads `gblTheme`, so without it every `gblTheme.White` resolves
   to `Blank()` and renders **black**. Then run OnStart once (App > right
   click > **Run OnStart**) or reload the app; setting the property alone
   does not execute it.
2. Paste `_chrome-components.yaml` into the app: Components tab,
   right-click, **Paste code**. Nothing else resolves until these exist.
3. Paste each screen file: right-click in the screen list, **Paste code**.
4. Add the chrome instances to each screen (below).

### What OnStart supplies

The screens set their own state in `OnVisible`. These ten come from
OnStart and nowhere else:

`gblTheme`, `gblToday`, `gblFiscalStartMonth`, `gblMe`, `gblIsAdmin`,
`dsFunctions`, `dsDeadlines`, `dsGaps`, `dsOwnership`, `dsDirectory`.

`gblRole` and `gblMenu` are also seeded there: the header's role dropdown
takes `gblRole` as its `Default`, and `cmp_NavMenus` reads `gblMenu` for
its `Visible`, both before any screen `OnVisible` has run.

`_app-onstart.pfx` is the app's existing OnStart from `mockup/App.fx.yaml`
with two changes:

- `gblMenu` added.
- `gblFilter` reseeded as `{Query, Topic, Risk, Area}`. The original shape
  was `{Query, RiskArea, Risk, Domain}`. These screens read `.Topic` and
  `.Area`, and `scr_Functions` only seeds `gblFilter` when it is blank, so
  the old shape would survive OnStart and then fail on first read. If you
  are keeping the earlier generation of screens in the same app, they read
  the old field names and will need reconciling.

## Chrome instances

Screens carry no component instances, per the same convention used for the
improved `scr_Home` earlier. Each screen reserves `Y = 0..113` at the top,
and ends its scroll container with an empty `cnt_FooterSlot` 220 tall.

Paste this at the **screen root** of every screen, and set `ActiveScreen`
to the value from the table:

```yaml
- cmp_Header:
    Control: cmp_ChromeHeader
    Properties:
        X: =0
        Y: =0
        Width: =Parent.Width
        Height: =113
        ActiveScreen: ="Home"
        IsAdmin: =gblIsAdmin

- cmp_Menus:
    Control: cmp_NavMenus
    Properties:
        X: =0
        Y: =0
        Width: =Parent.Width
        Height: =Parent.Height
        Visible: =gblMenu <> ""
        OpenGapCount: =gblOpenGapCount
```

The `Visible` on `cmp_Menus` belongs on the **instance**, as written above.
Putting it on the component definition raises PA2108: `Visible` is an
instance property, not a definition one. The scrim inside the component
carries the same condition as a second line of defence, so the menu still
cannot swallow clicks if the instance-level `Visible` is left off.

Paste this **inside `cnt_FooterSlot`** on every screen:

```yaml
- cmp_Footer:
    Control: cmp_ChromeFooter
    Properties:
        X: =0
        Y: =0
        Width: =Parent.Width
        Height: =220
```

`ActiveScreen` values, which drive the orange underline in the nav:

| Screen | ActiveScreen |
|---|---|
| scr_Home | `"Home"` |
| scr_Functions | `"Functions"` |
| scr_Topics | `"Topics"` |
| scr_Areas | `"Areas"` |
| scr_Deadlines | `"Deadlines"` |
| scr_Directory | `"Directory"` |
| scr_ExecutiveTeam | `"Executive Team"` |
| scr_GapTracker | `"Gap Tracker"` |
| scr_RiskDashboard | `"Risk Dashboard"` |
| scr_Reporting | `"Reporting"` |
| scr_FunctionDetail | `"Functions"` |
| scr_NoAccess | `"Home"` |

`cmp_Menus` must sit **last** in the screen's tree so the dropdown panels
render above the content. It is invisible while `gblMenu` is empty, so it
does not intercept clicks the rest of the time.

## Decisions taken during generation

**Risk stays on the app's three bands plus Unrated.** The mockup uses four
levels (Critical `#B91C1C`, High `#DC2626`, Medium `#B45309`, Low
`#15803D`) and has no Unrated state. These files use High / Moderate / Low
/ Unrated from `gblTheme`, so `su_risklevel` and `cmp_RiskPill` do not have
to change. The mockup's Critical rows fold into High. On the Risk Dashboard
heat map, Unrated is a real column rather than being merged into Low.

**Dropdown menus are an overlay gallery.** `cmp_NavMenus` is a separate,
full-screen component rather than a child of `cmp_ChromeHeader`. A canvas
component clips its children, and the Browse panel runs to `y = 451`
against a 113px header, so nesting it would cut the menu off. A transparent
full-screen scrim button closes the menu on an outside click.

**The scroll container follows the pattern already proven in this app.**
`GroupContainer@1.5.0` with `Variant: AutoLayout`,
`LayoutDirection.Vertical` and `LayoutOverflowY: =LayoutOverflow.Scroll`,
holding fixed-height `ManualLayout` sections that each declare `Width` and
`Height`. This mirrors `cnt_FdRead` and `cnt_FdRail` in
`mockup/scr_FunctionDetail.fx.yaml`. `FillPortions` and `AlignInContainer`
are deliberately not used: neither is in the verified inventory in
`tools/control_properties.json`.

**Colors.** Brand values come from `gblTheme` (Navy, Orange, OrangeDark,
OrangeLight, White, High, Moderate, Low, Unrated). The mockup's own
neutrals have no `gblTheme` equivalent and are written as literals:
page `RGBA(247, 247, 248, 1)`, wash `RGBA(237, 238, 241, 1)`,
line `RGBA(221, 222, 226, 1)`, line-strong `RGBA(196, 199, 206, 1)`,
ink-soft `RGBA(59, 67, 88, 1)`, muted `RGBA(107, 114, 128, 1)`. Add them to
`gblTheme` in `App.OnStart` if you would rather centralize them.

## PA1017 on AllowCustomization is expected

Studio reports `PA1017: The schema keyword 'AllowCustomization' is ignored
in this context` once per component definition. It is a warning, not an
error, and it is not worth acting on: `AllowCustomization` is listed under
`component_required` in `tools/control_properties.json`, taken from the
PowerApps-Tooling v3.0 schema, and all four existing components in
`mockup/Components/` carry it and raise the same warning. Removing it would
trip `paste_check`'s schema check for no gain. The keyword is meaningful in
a component library and ignored inside an app.

## Known gaps

- **Fonts.** The mockup loads Sherman Sans, Sherman Serif, and Syracuse
  Block. Power Apps cannot embed these, so `gblTheme.FontDisplay` and
  `FontBody` (Verdana) are used throughout. Type sizes are converted from
  the mockup, so line breaks will differ from the HTML.
- **Icons in nav buttons.** `Classic/Button@2.2.0` has no icon slot, so nav
  labels are padded with leading spaces and a separate `Image` control is
  positioned over the button. Adjust the X values if the glyph drifts.
- **Role selector.** `Classic/DropDown@2.3.1` has no `Fill` or `Color` in
  the verified inventory, so the "Viewing as" control in the utility bar
  renders with default styling on the navy bar rather than the mockup's
  knocked-out look.
- **Accessibility.** Overlay buttons carry `Tooltip` but no
  `AccessibleLabel` or `TabIndex`; neither is in the verified inventory for
  `Classic/Button@2.2.0`. If a paste confirms they are accepted, add them
  to `tools/control_properties.json` and they can be applied everywhere.
- **No box shadows.** The mockup's `--shadow-sm` / `--shadow-md` become 1px
  `line` borders. Canvas has no shadow property on `Rectangle` or
  `GroupContainer`.
- **Sub-views not generated.** `OwnershipChain` and `PersonPicker` are
  modal editors inside FunctionDetail in the mockup; the ownership cards
  here are read-only and "Manage people" raises a `Notify`. The mockup's
  Topics drill-down state and the Deadlines day-detail popover are also
  not reproduced.
- **Data.** Screens bind to the `ds*` collections that `App.OnStart`
  already builds. Column names are the real Dataverse logical names, so
  swapping the collections for the tables should not require edits.
