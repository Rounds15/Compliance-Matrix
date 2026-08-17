# scr_Home - component instances to paste in afterwards

The generated screen (`scr_Home-1-generated.yaml`) contains no component
instances. Three slots are left open for you. Paste the component
definitions from `mockup/Components/` into the app first, then paste each
block below into the target named above it.

Property names come from the component definitions themselves, not from
`docs/CANVAS-UI-GEN-BRIEF.md`: `cmp_DuePill`'s boolean input is
`IsComplete`, and the brief's table calls it `Complete`. The definition
wins.

---

## 1 of 3 - target: `scr_Home` (the screen root, in tree view)

`Y = 0` to `104` on the screen is empty and reserved. `cnt_HomeScroll`
starts at `Y = 104`, so the header drops straight into the gap.

```yaml
- cmp_HeaderHome:
    Control: cmp_Header
    Properties:
        X: =0
        Y: =0
        Width: =Parent.Width
        Height: =104
        ActiveScreen: ="Home"
        OpenGapCount: =gblOpenGapCount
```

---

## 2 of 3 - target: `gal_MyFunctions`

Path: `cnt_HomeScroll > cnt_Assigned > gal_MyFunctions`.

The slot sits between `lbl_MyFnGapBadge` (which ends at
`TemplateWidth - 104`) and the row's right edge. Row labels are already
cut to `TemplateWidth - 200`, so nothing needs resizing.

```yaml
- cmp_MyFnRisk:
    Control: cmp_RiskPill
    Properties:
        X: =Parent.TemplateWidth - 96
        Y: =17
        Width: =74
        Height: =24
        Risk: |
            =Switch(
                ThisItem.Value.su_risk,
                "High",     "High",
                "Moderate", "Moderate",
                "Low",      "Low",
                ""
            )
```

---

## 3 of 3 - target: `gal_MyDeadlines`

Path: `cnt_HomeScroll > cnt_Assigned > gal_MyDeadlines`.

Row labels are cut to `TemplateWidth - 116`, leaving the pill clear.

```yaml
- cmp_DlPill:
    Control: cmp_DuePill
    Properties:
        X: =Parent.TemplateWidth - 108
        Y: =16
        Width: =104
        Height: =24
        DueDate: =ThisItem.su_duedate
        IsComplete: =ThisItem.su_complete
```

---

## Z-order, after blocks 2 and 3

A pasted control is appended as the last child, which puts the pill on top
of `btn_MyFnOverlay` / `btn_DlOverlay`. The pill's 74x24 (or 104x24) area
would then swallow the row click. After pasting, select the pill in the
tree view and send it backward until it sits below the overlay button. The
pills are display-only; the overlay should stay on top and own the whole
row.
