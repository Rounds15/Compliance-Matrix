# Mockup build — paste-ready, no Dataverse

A standalone copy of the canvas app that runs entirely on in-memory collections.
Open it in Power Apps Studio with nothing connected, and tune layout, colours,
spacing, and states before any data work happens.

**Generated — do not hand-edit.** Change `solution/canvas/Src/**` and re-run:

```bash
python3 tools/build_mockup.py
```

When you have finished tuning here, port the property values back to
`solution/canvas/Src/**`. That is the version that ships.

---

## Try the whole app first

**`ComplianceMatrix.pa.yaml`** is one complete app document — `App`,
`ComponentDefinitions`, and `Screens` in a single file, 8,400 lines. This is the
Source Code schema the parser validates against (`PaModule`), so there is no
question about what a fragment is being pasted into.

Use it wherever Studio accepts a full app source file. The per-file versions
below exist for pasting one piece at a time, which is convenient while tuning but
depends on Studio's paste target accepting a fragment.

---

## Per-file paste

### 1. Components first

Screens reference components by name, so all four must exist before any screen
will paste cleanly.

**Steps, per component:**

1. In the Studio tree view, switch to the **Components** tab.
2. Right-click in the empty area of the tree → **Paste code**.
3. Open one file from `Components/` — `cmp_RiskPill.fx.yaml`,
   `cmp_DuePill.fx.yaml`, `cmp_PageHead.fx.yaml`, `cmp_Header.fx.yaml` — select
   all (**Ctrl+A**), copy (**Ctrl+C**), and paste the **entire file including
   the first line**.
4. Repeat for the other three.

Do not create the component first and paste into it. The file declares the
component, so pasting into an existing one nests a definition inside a
definition. If your Studio build only offers **Paste code** on an existing node,
use `ComplianceMatrix.pa.yaml` instead.

Names must match exactly. Paste order among the four does not matter — they do
not reference each other.

**What a valid file looks like.** Every file starts like this, and the first
line is not optional:

```yaml
ComponentDefinitions:

    cmp_RiskPill:
        DefinitionType: CanvasComponent
        Description: "Risk or severity chip..."
        AllowCustomization: true
        AccessAppScope: false
        CustomProperties:
            ...
        Properties:
            ...
        Children:
            - ...
```

**Three things the parser is strict about**, all already correct in these files —
worth knowing because a hand edit can reintroduce any of them:

- **The `ComponentDefinitions:` root.** Pasting a block that starts at
  `cmp_RiskPill:` gives *"Property 'cmp_RiskPill' not found on type
  'PaModule'"*. `PaModule` is the app root; its only properties are `App`,
  `Screens`, `ComponentDefinitions`, `DataSources`, `EditorState`. Without the
  wrapper the parser reads your component name as one of those.
- **All seven required properties.** The v3.0 schema requires `DefinitionType`,
  `Description`, `AllowCustomization`, `AccessAppScope`, `CustomProperties`,
  `Properties`, `Children` on every `CanvasComponent`. The last three are
  obvious; the first four are easy to drop and are not optional.
- **No `#` comments** — they raise **PA1001**. Also quote any `Description`
  containing a colon: `Description: Page heading: eyebrow` parses as a nested
  mapping, not a string, and kills the file.

If you edit a component while tuning, re-run `python3 tools/build_mockup.py`
before re-pasting; it strips comments and keeps the four files in step with the
production source.

**Two control rules worth knowing before you retune anything:**

- **No corner radius anywhere** — every card, pill, and tile is a square
  `Rectangle@2.3.0`. `BorderRadius` is not a valid property on `Rectangle` or on
  `Classic/Button`; it raises **PA2108** on both. Current controls use four
  separate corner properties (`RadiusTopLeft`, `RadiusTopRight`,
  `RadiusBottomLeft`, `RadiusBottomRight`) which replaced the old single
  `BorderRadius`. Verify the control supports them before adding one.
- **`AllowCustomization` raises PA1017**, "ignored in this context". Expected
  and harmless — the v3.0 schema requires the property on a `CanvasComponent`,
  so it stays. Warnings do not block the paste.

**Fastest way to find remaining property errors:** paste
`ComplianceMatrix.pa.yaml` rather than one file at a time. PA2108 is reported
per property with a line number, so the whole app surfaces every one in a single
pass instead of one component per round trip.

### 2. App OnStart

Open `App.fx.yaml`, copy everything under `OnStart:` (the `=Set(gblTheme…`
block through the end), and paste it into the **App** object's `OnStart`
property. Then **App → Run OnStart** so the collections populate.

Nothing renders correctly until OnStart has run once.

### 3. Screens

For each `scr_*.fx.yaml`: right-click in the screen list → **Paste code**.

If your Studio build only offers paste on an existing screen, create a blank
screen first, rename it to match the file (`scr_Home`, `scr_Functions`, …), then
paste the content under `Children:` into it and copy `OnVisible` across by hand.

Screen names must match — `Navigate()` calls reference them directly.

---

## What was rewritten

| Production | Mockup |
|---|---|
| `'Compliance Functions'` and 11 other tables | `dsFunctions`, `dsGaps`, … collections |
| `'Risk Level'.High` and 11 other choice sets | plain text `"High"` |
| `Patch(X, Defaults(X), {…})` | `Collect(X, {…})` |
| `PowerBI@1.4.0` control | placeholder panel |
| Dataverse user lookup | `gblMe` pinned to a seeded person |
| `gblIsAdmin` from `su_appadmin` | forced `true`, so gated screens are reachable |
| YAML `#` comments | stripped — Studio's paste parser raises PA1001 |

The comment stripper is quote-aware. Hex colours (`"#DC2626"`) and the inline
SVG fills (`fill='#F76900'`) are inside quotes and survive; only real comments
are removed. Power Fx `//` comments inside formulas are left alone.

The `ds` prefix avoids a trap: the screens already declare `colFunctions`,
`colDeadlines` and so on, and reusing those names would produce
`ClearCollect(colDeadlines, …colDeadlines…)` — self-referential, silently empty.

---

## Mock data

A slice of the real seed: 6 risk areas, 14 domains, 12 people, 16 functions,
6 assessments, 9 deadlines, 32 ownership rows, 4 gaps.

**Edge cases are deliberately included, because you cannot tune a state you
cannot see:**

- **All four risk bands.** The first three functions are forced to High /
  Moderate / Low; the rest keep their real value, which is blank — so 12 rows
  render as **Unrated** grey. That matches production, where 390 of 392
  functions have no rating.
- **An Event-Relative deadline** with no due date, so the "No fixed date" pill
  and the trigger/offset rendering are both visible. The live export has none
  yet — this row is synthesised.
- **All three gap statuses**, including In Progress.
- **A function with no domain**, so the amber unassigned tile shows.
- **Domains with zero functions**, so the amber coverage warning shows.

One more trap avoided: a column that is `Blank()` in *every* row has no inferred
type in Power Fx, and dereferencing it (`ThisItem.su_owner.su_name`) throws
rather than returning blank. Every nullable column that a screen dereferences —
domain owner, counsel risk area, gap closed date, flag cleared-by — carries a
typed empty record on at least some rows.

---

## Known differences from production

- **Delegation warnings are absent.** Collections are always in memory, so
  Studio will not warn where the real app would. Do not use the mockup to judge
  whether a query is delegable.
- **Writes are local.** Flag, log gap, and close gap write to the collection and
  vanish on reload. The formulas are the real ones, so the interaction is
  faithful; only the persistence is not.
- **Reporting** shows a placeholder where the Power BI report embeds.
- **Row counts are small**, so galleries will not scroll the way they do at 392
  functions. Check paging and scroll behaviour against the real data later.
