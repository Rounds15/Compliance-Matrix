# Building `ComplianceMatrix.msapp`

`ComplianceMatrix.msapp` in the repository root is a real binary canvas app.
Power Apps Studio opens it with **File → Open → Browse**. There is no pack step
and nothing to paste.

This note records how it is produced, because the obvious route does not work.

---

## The route that does not work

```
pac canvas pack --sources mockup --msapp ComplianceMatrix.msapp --layout SourceCode
```

fails with `System.FormatException`, reported as:

> Canvas apps packed using yaml SourceCode must be validated first by opening
> the app for edit within the Power Apps studio.

**This is not a version problem.** It reproduces identically on pac 2.9.3 and on
pac 2.11.2. The cause is visible in `bolt.module.canvas.dll`:

> Call to ValidateSources should've ensured the sources directory contains
> exactly one `.msapr` file.

The SourceCode packer requires a `.msapr` companion alongside the `.pa.yaml`
files. Only Studio emits a `.msapr` — you get one from `pac canvas unpack
--layout SourceCode` on an app that already exists. So SourceCode can round-trip
an app, but it cannot originate one. Upgrading `pac` will not change this.

---

## The route that works

```
pac canvas pack --sources <classic tree> --msapp ComplianceMatrix.msapp --layout Experimental
```

`Experimental` is the older source layout. It is deprecated and prints a warning,
but it packs from nothing but files on disk. `tools/build_msapp.py` generates
that tree from `mockup/**` and shells out to `pac`:

```bash
python3 tools/build_mockup.py     # canvas source -> mockup/  (.pa.yaml, SchemaV3)
python3 tools/build_msapp.py      # mockup/       -> ComplianceMatrix.msapp
```

The script reports what it converted and verifies the result:

```
Converted 14 screens, 4 components, 503 controls
Wrote ComplianceMatrix.msapp (145,414 bytes), round-trip verified
```

"Round-trip verified" means `pac canvas unpack` reads the archive back without
error. Unpack re-serialises the app and compares, so a clean unpack is Microsoft's
own reader confirming the archive is internally consistent.

---

## What the conversion has to do

The Experimental layout is a different dialect from SchemaV3, and it wants a
number of files that SchemaV3 keeps implicit.

**Dialect**

| SchemaV3 | Experimental |
|---|---|
| `- lbl_Title:` / `Control: Label@2.5.1` / `Properties:` | `lbl_Title As label:` |
| `Control: Gallery@2.15.0` + `Variant: Vertical` | `As gallery.galleryVertical` |
| `Control: Classic/Button@2.2.0` | `As button` |
| `Control: cmp_Header` | `As cmp_Header` |
| `ComponentDefinitions: cmp_X:` | `cmp_X As CanvasComponent:` + `Src/Components/cmp_X.json` |
| `#` comments | not supported; `//` inside a property value is |
| any multi-line value | `|` block scalar, first line starting `=` |

**Files the packer requires**

| File | Why |
|---|---|
| `CanvasManifest.json` | `FormatVersion` must be exactly `0.30`; carries Header, Properties, PublishInfo, ScreenOrder |
| `Src/Themes.json` | the full canvas default theme. At the tree root instead it is ignored and the packer throws on a null theme |
| `Src/EditorState/*.editorstate.json` | style name per control, and `ExtensionData` — a control state without it makes the component writer throw |
| `Entropy/Entropy.json` | control unique ids and publish order |
| `ControlTemplates.json` | version per first-party template. `appinfo`, `screen` and `groupContainer` are added by the packer and must not be repeated |
| `pkgs/galleryTemplate_2.15.0.xml` | see below |
| `Connections/Connections.json`, `ComponentReferences.json` | empty, but read unconditionally |

**Three traps worth writing down**

- **Galleries need a `galleryTemplate` template on disk.** The gallery transform
  dereferences it without a null check, so any gallery in the source throws
  `NullReferenceException` unless `pkgs/galleryTemplate_<version>.xml` parses. A
  bare `<widget>` envelope is enough — the template's `InputDefaults` only
  selects which gallery properties migrate onto the template child, and none of
  ours do. Gallery children are written flat under the gallery; the packer
  inserts the template child itself.

- **A component template's key and its `Name` must differ.** On write the packer
  renames the store key to the template's `Name`, and a rename onto a key that
  already exists is treated as failure. So the source keys each component by its
  own name and gives the template a separate GUID as `Name`, with
  `ComponentManifest.Name` = the component name and `ComponentManifest.TemplateGuid`
  = the GUID. Get this wrong and you get either *Unable to find template for
  component* or *Component Metadata contains template not present in the app*.

- **A blank line ends a block scalar.** The classic parser closes the property at
  the first empty line and then reads the next line as a property at the wrong
  indent. Blank lines inside formulas are written as whitespace at the body
  indent rather than dropped, because some of them sit inside multi-line string
  literals (the inline SVGs).

---

## `tools/DefaultTheme.json`

The canvas default theme, 148 KB, extracted from the embedded resource
`Microsoft.PowerPlatform.Formulas.Tools.Themes.DefaultTheme.json` inside the
`pac` CLI. It is vendored so the build does not depend on a particular `pac`
version's internals. It defines the `default*Style` names every control state
references; a control whose style the theme does not define makes the packer
throw on lookup, which is why `groupContainer` and the component definitions
carry an empty style name.

---

## Known limits

- Control `@version` strings are the ones the SchemaV3 source declares. Studio
  may offer to upgrade them on open; accept — your tenant's versions are
  authoritative.
- Components are packed with `AllowAccessToGlobals: true` regardless of the
  SchemaV3 `AccessAppScope: false` flag. Every component here reads `gblTheme`,
  and a component denied app scope cannot see it.
- Custom component properties are written with name, type key and display name.
  Input and output properties are not distinguished in the manifest; it makes no
  difference here, because the component's children read `cmp_X.Prop` either way
  and instances only ever set the genuine inputs.
- The mockup runs on in-memory collections, so this msapp has no data sources and
  no connections. It is for visual work. The Dataverse-backed app is
  `solution/canvas/Src/**`.
