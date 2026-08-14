# Shared components — design notes

One file per component, each with its own `ComponentDefinitions:` root, so each
pastes into Studio standalone.

## Schema rules these files satisfy

From the [pa.yaml v3.0 schema](https://raw.githubusercontent.com/microsoft/PowerApps-Tooling/refs/heads/master/schemas/pa-yaml/v3.0/pa.schema.yaml):

- **Root must be `ComponentDefinitions:`.** Component names are keys beneath it.
  A file starting at `cmp_RiskPill:` fails with *"Property 'cmp_RiskPill' not
  found on type 'PaModule'"* — `PaModule` is the app root, and its only
  properties are `App`, `Screens`, `ComponentDefinitions`, `DataSources`, and
  `EditorState`.
- **A `CanvasComponent` requires all seven of** `DefinitionType`, `Description`,
  `AllowCustomization`, `AccessAppScope`, `CustomProperties`, `Properties`,
  `Children`. The last three are the obvious ones; the first four are easy to
  omit and are not optional.
- **No YAML `#` comments** — Studio's paste parser raises **PA1001**. The
  rationale that used to live inline is in this file instead.
- **Quote any `Description` containing a colon.** `Description: Page heading
  block: eyebrow` is a nested mapping, not a string, and stops the parse.

If you edit a component, keep it comment-free. `tools/build_mockup.py` strips
comments on the way out anyway, but the source should paste cleanly too.

## Control property rules

**No corner radius anywhere — every surface is square.** All cards, pills, and
tiles are plain `Rectangle@2.3.0`, which is the lightest control for the job.

If you ever do want a rounded corner, `BorderRadius` is **not** the property.
It raises **PA2108** on `Rectangle` *and* on `Classic/Button`. The current
controls expose four separate corner properties instead:

```yaml
RadiusTopLeft: =8
RadiusTopRight: =8
RadiusBottomLeft: =8
RadiusBottomRight: =8
```

These replaced the older single `BorderRadius`, which is why every example
written against the old property fails. Check the specific control supports them
before relying on it — Studio reports an unsupported property as PA2108 with a
line number, so a paste tells you immediately.

**`DataType` and `PropertyKind` are closed enums.**

```
DataType      Text  Number  Boolean  DateAndTime  Screen  Record
              Table  Image  VideoOrAudio  Color  Currency
PropertyKind  Input  Output  InputFunction  OutputFunction  Event  Action
```

There is no `Date` — a date property is `DateAndTime`. Studio reports a bad
value only as **PA1001 "Exception during deserialization"** with a line and
column and no explanation, which is expensive to diagnose by pasting. Run
`python3 tools/validate.py` instead; it checks both enums and the seven required
properties, and names the offending property.

**`AllowCustomization` raises PA1017 ("ignored in this context").** That warning
is expected and is left in place deliberately: the v3.0 schema lists it as
required on a `CanvasComponent`, so removing it to silence a Studio warning
risks failing `pac canvas pack`. A warning that says "ignored" costs nothing.

## Pasting these into Studio

Paste the **whole file**, first line included, into the Components tab
(right-click the empty area → **Paste code**). Do not create a component first
and paste into it — the file declares the component, so that nests a definition
inside a definition.

If your Studio build will not accept a single-component file, use
`mockup/ComplianceMatrix.pa.yaml`: one complete app document with `App`,
`ComponentDefinitions`, and `Screens` together, which is unambiguously a
`PaModule`. Step-by-step instructions and troubleshooting are in
[`mockup/README.md`](../../../../mockup/README.md).

| File | Component |
|---|---|
| `cmp_RiskPill.fx.yaml` | Risk / severity chip |
| `cmp_DuePill.fx.yaml` | Deadline status chip |
| `cmp_PageHead.fx.yaml` | Eyebrow + title + supporting copy |
| `cmp_Header.fx.yaml` | Utility bar, lockup, primary navigation |

---

## cmp_RiskPill

**Four visual states, not three.** `su_risk` is Recommended, not Required, and is
empty on 390 of 392 live functions. Blank is therefore a first-class **Unrated**
state in its own grey, never a fall-through to Low — reporting hundreds of
unrated obligations as low-risk would be a bad failure mode for a register whose
whole job is to be trusted.

**`RiskColor` and `RiskLabel` are output properties**, resolved once on the
component and read by all three child controls. The children previously each ran
their own `Switch`, which is three places to forget when the palette changes.

## cmp_DuePill

**`HasDueDate` guards everything.** Only `Fixed Recurring` deadlines carry
`su_duedate`; Event-Relative, Ongoing, and Conditional rows leave it blank.
`DateDiff` against a blank returns a nonsense figure, and before the guard the
pill rendered **"Overdue 46000d"** on those rows. They now read "No fixed date",
and the caller renders trigger and offset instead.

The same rule drives the reminder flow — see `docs/REMINDER-FLOW.md`. A deadline
with no date cannot be reminded on a schedule, and must not be.

Band logic mirrors the prototype's `dueState()`: no date, then complete, then
overdue, then the 30 and 90 day warning bands.

## cmp_PageHead

Layout only. `Subtitle` hides itself when blank so the title does not float above
dead space.

## cmp_Header

**The Block S is inline SVG**, not a media asset, so the component carries no
binary dependency and the solution stays diffable.

**No role switcher.** The prototype had a "Viewing as" dropdown; that was a demo
affordance and is deliberately not carried over. The role comes from
`su_appadmin` via `gblRole`, and the header only displays it.

**Nav hiding is convenience, not security.** `NavAdmin` hides Risk and Reporting
items for non-administrators, and the gated screens also redirect on
`OnVisible`. Neither is protection — Dataverse security roles are, because they
stop the rows being read regardless of which screen someone reaches.

`NavKey` drives the active underline; the `OnSelect` switch drives `Navigate()`.
Keep the two lists in step when adding a screen.
