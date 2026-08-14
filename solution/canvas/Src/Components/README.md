# Shared components — design notes

One file per component, each with its own `ComponentDefinitions:` root, so each
pastes into Studio standalone. The files carry **no YAML comments**: Studio's
"Paste code" parser rejects `#` with **PA1001**. The rationale that used to live
inline is here instead.

If you edit a component, keep it comment-free. `tools/build_mockup.py` strips
comments on the way out anyway, but the source should paste cleanly too.

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
