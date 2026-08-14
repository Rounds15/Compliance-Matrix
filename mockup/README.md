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

## Paste order

Studio pastes into an existing container, so order matters.

### 1. Components first

Insert → **New component** four times, naming them exactly:

`cmp_RiskPill` · `cmp_DuePill` · `cmp_PageHead` · `cmp_Header`

Then open `Components/cmp_Shared.fx.yaml`, and for each component copy its block
(from `cmp_X:` down to just before the next component) and paste into the
matching component in the tree view (right-click → **Paste code**).

The names must match — every screen references them by name.

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
