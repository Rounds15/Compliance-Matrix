---
name: run-compliance-matrix
description: Build, render, and screenshot the Compliance Matrix Power Apps canvas app. Use when asked to run, start, build, preview, screenshot, or verify a change to this app or its screens; to pack the .msapp or solution; to check canvas YAML layout, colour, contrast, or clipped text; or to see what a screen looks like without Power Apps Studio.
---

# Run: Compliance Matrix

A Power Platform solution: a Dataverse schema plus a 14-screen Power Apps
canvas app, both generated from YAML by Python scripts in `tools/`.

**There is no way to launch this app in a container.** Power Apps Studio is a
hosted web IDE behind a Microsoft Entra tenant, and `.msapp` is a zip archive,
not an executable. So the agent path is not "launch it" - it is
**`.claude/skills/run-compliance-matrix/driver.py`**, which reads the canvas
YAML, resolves its Power Fx geometry and colour against the theme and the
mockup's own data, lays each screen out at the app's real 1366x768, and
screenshots it with headless Chromium. Change a `Y:` in the YAML, re-run
`render`, look at the PNG.

All paths below are relative to the repo root. Nothing here needs a Microsoft
tenant except `pac auth`/`pac solution import`, which are not covered because
they were not run.

## Prerequisites

Python 3.11 with PyYAML is all the driver and every `tools/` script need, and
both were already present:

```bash
python3 -c "import yaml; print('pyyaml', yaml.__version__)"
```

Chromium was already present too, from Playwright's browser cache. The driver
finds it automatically; this is the path it uses:

```bash
ls /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

No `apt-get`, no `xvfb`, no display. The driver runs Chromium headless with
`--screenshot` and never opens a window.

**Only if you need to pack `.msapp` or the solution** (`tools/build_msapp.py`),
install the `pac` CLI. This needs .NET **10** - see Gotchas, the version matters:

```bash
apt-get update -qq && apt-get install -y -qq dotnet-sdk-10.0
DOTNET_CLI_TELEMETRY_OPTOUT=1 dotnet tool install --global Microsoft.PowerApps.CLI.Tool
export PATH="$PATH:/root/.dotnet/tools"
pac --version        # Version: 2.11.2+g47bc199 (.NET 10.0.10)
```

## Run (agent path): render and screenshot a screen

```bash
# Every screen, with control counts and how much of each resolved.
# 1,353 controls across 14 screens; 1,268 labels draw real text.
python3 .claude/skills/run-compliance-matrix/driver.py screens

# One screen -> out/screens/scr_Home.html + out/screens/scr_Home.png
python3 .claude/skills/run-compliance-matrix/driver.py --today 2026-08-17 \
    render scr_Home

# All 14 (about 29s)
python3 .claude/skills/run-compliance-matrix/driver.py --today 2026-08-17 \
    render all
```

PNGs land in `out/screens/` (gitignored), exactly 1366x768. **Open the PNG and
look at it.** Red dashed hatching marks a formula the evaluator could not read;
an orange dotted outline marks text that resolved but with a guess inside it.

Screen names match loosely, so `render home` and `render Home` both work.

Other subcommands, all verified:

```bash
# Resolved control tree with real pixel boxes - the fastest way to see why
# something is in the wrong place
python3 .claude/skills/run-compliance-matrix/driver.py tree scr_Functions

# Off-canvas, zero-size, unresolved geometry, and WCAG contrast
python3 .claude/skills/run-compliance-matrix/driver.py audit all

# Text clipped by its control box, measured by the browser, not estimated
python3 .claude/skills/run-compliance-matrix/driver.py fit all

# The Navigate() graph, and any screen nothing navigates to
python3 .claude/skills/run-compliance-matrix/driver.py nav

# Resolved gblTheme, with luminance for contrast work
python3 .claude/skills/run-compliance-matrix/driver.py theme

# The mockup's in-memory collections
python3 .claude/skills/run-compliance-matrix/driver.py data
python3 .claude/skills/run-compliance-matrix/driver.py data dsFunctions --limit 1
```

### Detail screens need a selection

`scr_FunctionDetail` and `scr_AssessmentDetail` read a record that the
*previous* screen's `OnSelect` puts in a global. Rendered cold they show an
empty record, correctly. Drive them into the navigated state with `--set`:

```bash
python3 .claude/skills/run-compliance-matrix/driver.py --today 2026-08-17 \
    --set 'gblSelectedAssessment=First(dsAssessments)' \
    render scr_AssessmentDetail
```

That render fills in the title, the code chip, the risk pill, and reveals the
"Open assessment file" button that is hidden while the file URL is blank.

### Which source to render

`--source` defaults to `mockup/`, which is the right choice: it runs on
in-memory collections, so galleries bind to real rows and text resolves.

```bash
# Production source: same geometry, but bound to Dataverse, so a lot more text
# has nothing to resolve against - 213 of 1,350 labels blank versus 85 of 1,353
# from mockup/. Use it to check layout only.
python3 .claude/skills/run-compliance-matrix/driver.py \
    --source solution/canvas/Src screens
```

`screens` reports **drawn** vs **blank** per screen (labels rendered vs shown as
a `{placeholder}`) and the count of **distinct** unresolved references, which is
the same number `audit -v` lists. It is not an occurrence count - a gallery
repeats one unreadable formula on every row.

`mockup/` is **generated** - edit `solution/canvas/Src/` and regenerate, or your
change is overwritten (see Gotchas).

## Build

In order. Every one of these was run; all are idempotent - a second run leaves
`git status` clean.

```bash
# 1. Dataverse schema YAML -> solution source XML
python3 tools/build_solution.py
#    -> 12 tables, 108 columns, 12 global choice sets.

# 2. Canvas source -> mockup/ (rewrites Dataverse binds to collections,
#    strips '#' comments)
python3 tools/build_mockup.py

# 3. Static checks across every YAML and XML file
python3 tools/validate.py
#    -> "All checks passed." 2,000 seeded rows, 14 screens, 4 components.

# 4. Studio paste contract, Rules 1-6. Run this on mockup/, NOT on
#    solution/canvas - see Gotchas.
python3 tools/paste_check.py mockup
#    -> "ok    19 file(s) paste-ready"

# 5. Regenerate the canvas-apps-ui-gen handoff brief
python3 tools/build_skill_brief.py
#    -> docs/CANVAS-UI-GEN-BRIEF.md, 14 screen blocks, 461 controls

# 6. Binary canvas app. Needs pac on PATH (see Prerequisites).
export PATH="$PATH:/root/.dotnet/tools"
python3 tools/build_msapp.py --out /tmp/ComplianceMatrix.msapp
#    -> "Wrote ... (151,321 bytes), round-trip verified"
```

Comment-syntax check (`//` at YAML structural level breaks the parser):

```bash
python3 tools/fix_yaml_comments.py solution/canvas --check
#    -> "No structural-level // comments found."
```

## Run (human path)

Open `ComplianceMatrix.msapp` in Power Apps Studio: **File -> Open -> Browse**,
pick the file, then **App -> Run OnStart**. Requires a browser and a Microsoft
tenant, so it is not available here. `README.md` and `docs/LOCAL-SETUP.md` cover
it. Nothing in this section was verified in this container.

## Gotchas

- **`paste_check.py` fails on `solution/canvas` by design.** 307 Rule 2
  errors, all "YAML '#' comment". The production source is documented with `#`
  comments and `build_mockup.py` strips them; `mockup/` is what gets pasted
  into Studio, and that passes clean. Running the check on the production tree
  and treating the failure as a regression is the trap.
- **`mockup/` is generated.** Edit `solution/canvas/Src/**`, then
  `python3 tools/build_mockup.py`. Editing `mockup/` directly gets silently
  reverted on the next build - and the driver renders `mockup/` by default, so
  a change that "shows up in the render" may still be about to vanish.
- **`pac` needs .NET 10, and `dotnet tool install` fails confusingly if you
  guess wrong.** Current `pac` (2.11.2) ships only a `tools/net10.0/` folder,
  so on a .NET 8 SDK the install dies with *"The settings file in the tool's
  NuGet package is invalid: Settings file 'DotnetToolSettings.xml' was not
  found in the package"* - which sounds like a broken package and is really a
  framework mismatch. `apt-get install dotnet-sdk-10.0` fixes it. Pinning an
  old net8-targeting `pac` (1.43.6) installs fine but is a dead end:
  `pac canvas pack` there has no `--layout` flag, and `build_msapp.py` needs
  `--layout Experimental`.
- **`apt-get update` first.** The image's package index is stale enough that
  `apt-get install dotnet-sdk-10.0` 404s on every `.deb` without it.
- **`https://dot.net` is blocked by the outbound proxy** (`CONNECT tunnel
  failed, response 403`), so the usual `dotnet-install.sh` bootstrap does not
  work. `api.nuget.org` and the Ubuntu archives are reachable. Use apt.
- **The .msapp you build will not be byte-identical to the committed one.**
  151,321 bytes here vs 145,414 committed - different `pac` version. The build
  reports `Warning PA2001: Checksum mismatch`, which is expected for
  hand-authored sources and not a failure; `build_msapp.py` round-trips the
  result through `pac canvas unpack` and that is the real check.
- **`README.md` says 504 controls; the build reports 503.** Minor drift, not a
  regression.
- **Chromium's `--window-size` is the *window*, not the viewport.** The
  viewport comes out 87px shorter, and `--screenshot` captures the window, so a
  naive `--window-size=1366,768` silently loses the bottom 87px of every screen
  to page background. The driver renders into a deliberately oversized window
  and crops the PNG back to 1366x768 itself. If Chromium is upgraded and
  screens come back short, raise `WINDOW_SLACK_Y` in `driver.py`.
- **Several screens stack two mutually exclusive layouts** gated on a mode
  global (`gblFdMode = "read"` vs `"edit"`). The driver reads each screen's
  `OnVisible` for those `Set()` calls, so the right one renders. If you add a
  mode variable and set it somewhere other than `OnVisible`, both layouts will
  draw on top of each other in the render.
- **`Home` and the detail screens are taller than the viewport.** Content runs
  to y≈1222 inside a 664px scroll container, so the render clips exactly as
  Studio would. Content below the fold is not a rendering bug.

## Fidelity limits

The driver resolves layout, not behaviour. Known gaps, all visible in the
output rather than hidden:

- `OnSelect` does nothing. Nothing is clickable.
- Galleries show **unfiltered** rows: `Filter(...)` returns its source
  collection, so row *shape* is right and the row *set* is not. Empty-state
  labels gated on a row count can therefore render on top of a populated list.
- `scr_Deadlines`' calendar is built from `ForAll(Sequence(42, 0) As idx, ...)`,
  which this evaluator does not model. The month grid renders as a single row of
  placeholder cells. It is the least faithful screen in the app.
- Aggregates (`Sum`, `Average`, `CountRows` over an implicit `ThisRecord`
  scope) resolve to placeholders. `driver.py audit -v <screen>` lists exactly
  which references failed.
- Text metrics are Chromium's Verdana, not Studio's. Treat `fit` findings under
  about 4px as noise - that is what `--min` defaults to - and confirm anything
  larger in Studio before moving a control.

## What the audit currently reports

Both of these are real and were confirmed by reading the resolved colours, not
guessed. They are longstanding, not something a recent change introduced:

- **White on brand orange `#F76900` is 3.01:1.** That passes WCAG AA for large
  text and fails it for normal text. It is the fill on primary buttons
  (`btn_HeroSearch`, `btn_RptOpenPbi`, the gap-card `Close` buttons). Note
  `README.md` explains that links use `#D74100` *because* it meets AA on white;
  the button treatment did not get the same scrutiny.
- **The risk pills fail AA.** `cmp_RiskPill` puts the risk colour on a
  `ColorFade(..., 0.88)` tint of itself: Low is 2.89:1, Unrated 1.96:1,
  Moderate 2.81:1, High 4.01:1.
- **`fit` finds 9 clipped labels**, the clearest being `lbl_RiskText` in
  `cmp_RiskPill`: "Moderate" needs 11px more width than the 52px it has, so it
  renders as "Moderat". `lbl_HeroTitle` on Home overflows its 136px box by
  40px at 36pt Verdana.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `error: the pac CLI is not on PATH` from `build_msapp.py` | `export PATH="$PATH:/root/.dotnet/tools"`, or install per Prerequisites. |
| `Tool 'microsoft.powerapps.cli.tool' failed to install` / `DotnetToolSettings.xml was not found` | .NET SDK too old for current `pac`. Install `dotnet-sdk-10.0`. |
| `Error: An unknown argument --layout was passed` | `pac` too old (1.4x). Install current `pac` on .NET 10. |
| `E: Failed to fetch ... 404 Not Found` on apt install | Stale index. `apt-get update -qq` first. |
| `curl: (56) CONNECT tunnel failed, response 403` | The proxy blocks that host - `dot.net` is blocked, nuget and the Ubuntu archives are not. |
| `error: no chromium binary found` | Playwright's Chromium moved. Add its path to `CHROME_CANDIDATES` in `driver.py`. |
| `error: chromium viewport WxH is smaller than the app` | Raise `WINDOW_SLACK_X`/`WINDOW_SLACK_Y` in `driver.py`. |
| Bottom of every render is flat dark grey | The viewport/window mismatch above; the crop step regressed. |
| A screen renders mostly red hatching | Rendering `--source solution/canvas/Src` instead of `mockup/`. The production source binds to Dataverse and has no data to resolve. |
| `error: --set gblX did not resolve` | The formula referenced something outside `App.OnStart` scope. Check `driver.py data` for the collection name. |
| `error: no screen matches 'x'` | The error lists all 14 names. |

## Files

```
.claude/skills/run-compliance-matrix/
  SKILL.md      this file
  driver.py     screen renderer, screenshotter, and auditor (the harness)
  powerfx.py    the Power Fx subset evaluator driver.py resolves formulas with
```
