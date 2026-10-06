# Local setup (VS Code on Windows)

Gets you from a fresh VS Code install to a solution imported into a Dataverse
development environment.

---

## 1. Clone the repo

VS Code: **Ctrl+Shift+P** → `Git: Clone` → paste

```
https://github.com/Rounds15/Compliance-Matrix.git
```

Pick a folder, open it when prompted, then switch to the working branch:
**Ctrl+Shift+P** → `Git: Checkout to...` → `claude/compliance-matrix-power-platform-5fvkrp`

---

## 2. Install the extensions

VS Code will prompt "This workspace has extension recommendations": click
**Install All**. If you miss the prompt, open the Extensions panel and filter by
`@recommended`.

The one that matters is **Power Platform Tools**
(`microsoft-IsvExpTools.powerplatform-vscode`). It bundles the `pac` CLI, so
there is no separate CLI install. Verify after it activates: open a terminal
(**Ctrl+`**) and run:

```powershell
pac
```

You should get the command banner. If PowerShell reports "not recognized",
restart VS Code so the extension's PATH entry is picked up.

> Standalone alternative, if you would rather not rely on the extension:
> `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`
> (needs the .NET 6+ SDK), or the MSI from Microsoft's install page.

---

## 3. Install Python

The build scripts need Python 3.10+ and PyYAML.

```powershell
python --version          # if this fails, install from python.org or the Microsoft Store
pip install pyyaml
```

Tick **"Add python.exe to PATH"** if you use the python.org installer.

---

## 4. Connect to your environment

```powershell
pac auth create --environment https://<yourorg>.crm.dynamics.com
pac auth list
```

A browser window opens for sign-in. The environment URL is in the Power Platform
admin center under **Environments** → your environment → **Environment URL**.

Use a **development** environment for the first import, not production.

---

## 5. Build and import

Everything is wired to VS Code tasks. **Ctrl+Shift+P** → `Tasks: Run Task`:

| Task | Does |
|---|---|
| `1. Generate solution source` | schema YAML → `solution/src/**/Entity.xml` |
| `2. Validate YAML and XML` | Static checks across every source file |
| `3. Pack solution` | `solution/src` → `ComplianceMatrix.zip` |
| `4. Pack canvas app` | `solution/canvas` → `ComplianceMatrix.msapp` |
| `5. Import solution to environment` | Pushes the zip and publishes |

Tasks 3 and 5 depend on task 1, so running **5** alone does the whole chain.
**Ctrl+Shift+B** runs task 1 on its own.

Run **task 2 first**. It catches structural problems in seconds that would
otherwise surface as an opaque packer error.

---

## 6. What the build checks before you import

`tools/build_solution.py` writes `solution/src` in the layout `pac solution
unpack` produces from a real export, and re-reads it: the build fails if
`<Language>` does not carry the code as element text, if a Customizations.xml
section has content of its own, if the publisher block is incomplete, if a
lookup has no relationship, or if a column takes a name Dataverse reserves
(`<column>name` or `<column>yominame` beside a lookup, owner, choice, status
or yes/no column; names ignore case). `tools/validate.py` runs the same checks and
confirms `solution/src` matches a fresh build. `pac solution pack` of this
folder finishes with no warnings.

Only an import proves the rest. What to expect:

**Control version mismatch (PA2105).** Studio reports a control's `@version` is
not current. It is a warning, not an error, and Studio usually auto-corrects on
open. To fix at source, update the version string in the relevant `.fx.yaml` and
re-pack. Controls used: `Label@2.5.1`, `Gallery@2.15.0`, `Classic/Button@2.2.0`,
`Classic/TextInput@2.3.2`, `Classic/DropDown@2.3.1`, `GroupContainer@1.5.0`,
`Rectangle@2.3.0`, `Image@2.2.3`, `PowerBI@1.4.0`.

**Computed columns.** `su_opengapcount`, `su_nextduedate`, and `su_daysopen`
are not in the solution. Add them by hand after the import, as in
`docs/DATAVERSE-MIGRATION.md`, section 2.

**Alternate key timing.** Keys on `su_email`, `su_functioncode`, `su_gapcode`,
and the `(function, person, role)` triple are created asynchronously. If a
dataflow runs immediately after solution import and complains about a missing key,
wait for key creation to finish (Power Apps → Tables → Keys → status **Active**)
and retry.

---

## 7. After a successful import

1. **Load the data** from the SharePoint lists with the dataflows in
   `docs/DATAVERSE-MIGRATION.md`, section 3.
2. **Create the environment variables** the Reporting screen reads:
   `su_PowerBIWorkspaceId`, `su_PowerBIExecutiveReportId`,
   `su_PowerBIDeadlineReportId`, `su_PowerBIGapAgingReportId`.
   Until these exist, the Reporting screen renders empty: nothing else breaks.
3. **Give yourself an Administrator row** in **App Role Assignments**, or Gap
   Tracker, Risk Dashboard, and Reporting stay locked for everyone.
4. **Open the canvas app in Studio** and check the screens render. This is where
   any remaining PA2105 warnings surface.

---

## Editing conventions

- **`.fx.yaml` files are 4-space indented.** `pac canvas pack` is strict about
  it. `.vscode/settings.json` pins this and disables trailing-whitespace
  trimming for YAML so multi-line formulas survive a save.
- **Comments differ by level.** YAML structure uses `#`; Power Fx formula bodies
  use `//`. Getting this wrong breaks the parse in a confusing way: a `//` at
  structural level is read as a value, not a comment. Run the
  `Normalize YAML comments` task if in doubt; it only touches structural-level
  lines and leaves formula bodies alone.
- **Never hand-edit `solution/src/`.** It is generated. Change
  `solution/schema/dataverse-schema.yaml` and re-run task 1.
- **Schema changes flow one way:** schema YAML → generator → solution source →
  packed zip → environment. Round-tripping edits back from an environment is a
  separate exercise (`pac solution export` then unpack) and will overwrite the
  hand-written descriptions in the schema file.
