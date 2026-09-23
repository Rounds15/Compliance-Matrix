# Compliance Matrix on Power Pages

The Claude design prototype, rebuilt as a working Power Pages page that does
what the Compliance Matrix 2.0 canvas app does, reading and writing the same
data. One page, one URL (`/compliance-matrix/`), eleven screens:

Home · Definitions · Compliance Functions (risk area / domain / statute lenses)
· Function detail · Deadlines (calendar and list) · Directory · Executive Team ·
Gap Tracker · Flagged Items · Risk Dashboard · Reporting

**Look at it first:** open [`dist/preview.html`](dist/preview.html) in a
browser. It is the real page running on the design's sample records, in memory.
Every screen and every button works; nothing is saved.

---

## What it does

Everything the design shows, plus everything the canvas app does that the
design did not:

| | Design | Canvas app | This page |
|---|:-:|:-:|:-:|
| Browse, filter, search, lenses, calendar, heat map | ✓ | ✓ | ✓ |
| Flag a function / clear a flag (with Archive record) | ✓ | ✓ | ✓ |
| Log a gap / close a gap with closure notes | ✓ | ✓ | ✓ |
| Edit a function | ✓ | ✓ | ✓ |
| Manage the ownership chain, sub-roles, General Counsel | shown, never saved | ✓ | ✓ |
| Create and delete a function (delete cascades, archived) | | ✓ | ✓ |
| Mark a deadline complete / reverse it, with reason | | ✓ | ✓ |
| Recurring deadlines roll forward; 30-day completion hold | | ✓ | ✓ same rules |
| Directory: add (Entra lookup or by hand), edit, remove, replace everywhere | add only | ✓ | ✓ |
| Manage risk areas and domains | | ✓ | ✓ |
| Administrators "view as" another person | role switch | ✓ | ✓ |
| Owners see only their functions' deadlines | | ✓ | ✓ |
| CSV / calendar exports | placeholders | | ✓ |
| Browser Back, shareable links to any record | | | ✓ |

The deadline logic is a line-for-line port of the canvas app's
`RefreshDeadlines()` and `CadenceMonths()`, so both show the same next date and
status for every row. Risk uses the live vocabulary (High / Moderate / Low,
blank as Unrated) and still draws legacy Critical / Medium values.

---

## Choosing a backend

The page has one UI and three interchangeable data sources, chosen by the site
setting `ComplianceMatrix/Backend`:

| Backend | Reads and writes | Security enforced by | Setup |
|---|---|---|---|
| `sharepoint` | The live Compliance Matrix 2.0 lists, through Power Automate | Which web roles may run each flow | Four flows, [docs/SHAREPOINT-FLOWS.md](../docs/SHAREPOINT-FLOWS.md) |
| `dataverse` | This repo's `su_*` tables, through the Power Pages Web API | Table permissions | Solution import + table permissions |
| `sample` | The design's records, in memory | n/a | none |

**Start with `sharepoint`.** It is where the data lives today, and it is the
same lists the canvas app uses, so the two run side by side during the
switch-over. Moving to Dataverse later is a site setting change once the
solution is imported and seeded.

Why flows for SharePoint: a Power Pages page cannot call SharePoint directly.
The Power Pages Web API only speaks Dataverse, and the browser will not send a
SharePoint session to another origin. A flow that starts with *When Power
Pages calls a flow* is the supported bridge.

---

## Deploy

What you upload: two web files and one template. Fonts and images are
embedded, so there is nothing else.

```
dist/cm-matrix.js                          web file   ~390 KB
dist/cm-matrix.css                         web file   ~240 KB
dist/compliance-matrix.webtemplate.liquid  web template source
```

### 1. Let the site serve a JavaScript web file

New Power Platform environments block `.js` uploads. Power Platform admin
center › the environment › **Settings** › **Product** › **Privacy + Security**
› **Blocked attachments**: remove `js`, save.

### 2. Web files

Portal Management app › **Web Files** › **New**, once per file:

| Name | Partial URL | Parent page | File |
|---|---|---|---|
| `cm-matrix.js` | `cm-matrix.js` | Home | `dist/cm-matrix.js` |
| `cm-matrix.css` | `cm-matrix.css` | Home | `dist/cm-matrix.css` |

Publishing state **Published**. Attach the file and save. They are served at
`/cm-matrix.js` and `/cm-matrix.css`; if you place them elsewhere, set
`ComplianceMatrix/JsUrl` and `ComplianceMatrix/CssUrl`.

### 3. Web template and page template

1. **Web Templates** › **New**: name `Compliance Matrix`, MIME type
   `text/html`, Source = the whole of
   `dist/compliance-matrix.webtemplate.liquid`.
2. **Page Templates** › **New**: name `Compliance Matrix`, Type **Web
   Template**, Web Template `Compliance Matrix`, **Use Website Header and
   Footer: No**.

   Header and footer off is required. The page draws the design's own
   header, navigation and footer, and the site's Bootstrap theme would restyle
   the design if it loaded alongside.

### 4. The page

Design Studio › **Pages** › **+ Page** › name `Compliance Matrix`, partial URL
`compliance-matrix`. Then in Portal Management open that web page and set
**Page Template** to `Compliance Matrix`. Give the page **Authenticated
Users** permission (Design Studio › page › **Permissions**); signed-out
visitors get a sign-in prompt.

### 5. Administrators

Portal Management › **Web Roles** › **New**: `Compliance Matrix
Administrators`. Add the compliance office staff as contacts in it; a contact
exists once the person has signed in to the site with their Syracuse account.

The canvas app treats the owners of the Matrix group
(`701cc143-edd1-4abc-9bee-9e974589dd8e`) as administrators. Power Pages
cannot read group ownership, so the web role stands in for it. Keep the two in
step by hand, or with a scheduled flow that syncs group owners into the role.

### 6. Site settings

Portal Management › **Site Settings**. All optional except the backend and,
for SharePoint, the flow URLs.

| Setting | Value | Default |
|---|---|---|
| `ComplianceMatrix/Backend` | `sharepoint` or `dataverse` | `sharepoint` |
| `ComplianceMatrix/Flow/Read` | URL Power Pages shows for **CM - Read list** | |
| `ComplianceMatrix/Flow/Write` | … for **CM - Write (members)** | |
| `ComplianceMatrix/Flow/AdminWrite` | … for **CM - Write (administrators)** | |
| `ComplianceMatrix/Flow/FindPerson` | … for **CM - Find person** | Entra lookup hidden |
| `ComplianceMatrix/AdminWebRole` | web role name | `Compliance Matrix Administrators` |
| `ComplianceMatrix/CacheMinutes` | how long a browser reuses what it read | `5` |
| `ComplianceMatrix/TimeZone` | zone SharePoint date-only columns are stored in | `America/New_York` |
| `ComplianceMatrix/PowerBIEmbedUrl` | a report's *Secure embed* link | placeholder frame |
| `ComplianceMatrix/PowerBIUrl` | "Open in Power BI" target | `https://app.powerbi.com` |
| `ComplianceMatrix/PowerAppUrl` | canvas app link, shown in the footer | hidden |
| `ComplianceMatrix/ReportConcernUrl` | | `/report-a-concern` |
| `ComplianceMatrix/HomeUrl` | "Portal home" link | `/` |
| `ComplianceMatrix/Dataverse/EntitySets` | JSON, only if an entity set name differs | logical name + `s` |

### 7a. SharePoint backend

Build the flows in [docs/SHAREPOINT-FLOWS.md](../docs/SHAREPOINT-FLOWS.md),
add them to the site under **Set up › Cloud flows** with their web roles, and
paste their URLs into the settings above.

### 7b. Dataverse backend

Import and seed the solution (root README, *Deploy*). Then:

**Web API site settings**, for each of `su_riskarea`, `su_domain`,
`su_compliancedirectory`, `su_compliancefunction`, `su_functionownership`,
`su_compliancedeadline`, `su_compliancegap`, `su_functionflag`,
`su_counselassignment`:

- `Webapi/<table>/enable` = `true`
- `Webapi/<table>/fields` = `*`

**Table permissions** (Design Studio › Set up › Table permissions), Global
access:

| Role | Tables | Privileges |
|---|---|---|
| Authenticated Users | all nine | Read |
| Authenticated Users | `su_functionflag`, `su_compliancegap` | Create, Append |
| Authenticated Users | `su_compliancedeadline` | Write |
| Authenticated Users | `su_compliancefunction`, `su_compliancedirectory` | Append To |
| Compliance Matrix Administrators | all nine | Read, Create, Write, Delete, Append, Append To |

Owners completing deadlines need Write on the deadline table. Global scope
means any signed-in user could, with a crafted request, write any deadline; if
that matters, scope the Write permission through the function to the owner's
contact (a parent-relationship permission) instead.

### 8. Point the home page at it

`webpages/home/` in this repo now links **Open the Compliance Matrix** to
`/compliance-matrix/` and **View deadlines** to `/compliance-matrix/#/deadlines`.
Rebuild it with `python3 tools/build_webpage.py` and paste
`webpages/home/dist/home.webtemplate.html` as before.

---

## Security, plainly

- **What the page hides is convenience.** Administrator screens and buttons are
  hidden from non-administrators, and an administrator's "view as" preview
  hides them too, but a hidden button is not a control.
- **What stops a write:** on SharePoint, Power Pages refuses to run the
  administrators' flow for anyone without the role, and the members' flow only
  accepts its four operations, with deadline updates cut down to the completion
  columns. On Dataverse, the table permissions above.
- **Audit fields are sent by the page.** Flagged By, Resolved By and Completed
  By Name come from the signed-in user's details as the page knows them. Power
  Pages authenticates the user, but a determined signed-in user could send a
  crafted request naming someone else. SharePoint's own Created By shows the
  flow's connection account; Dataverse's audit log shows the real contact.
- **No email from the browser.** Notifications come from list-triggered flows
  (docs/SHAREPOINT-FLOWS.md §6), so the page cannot be used to send mail.

---

## Working on it

```bash
cd portal
npm install
npm run build     # writes dist/
npm test          # unit tests, then end-to-end against a mock Power Pages site
npm run check     # fails if dist/ is out of date with src/
```

```
src/
  main.jsx               mounts on #cm-root, reads the template's data- attributes
  config.js              those attributes, documented
  lib/                   dates (fiscal year, site time zone), risk, deadline roll-forward
  data/
    model.js             one model for every backend
    store.js             load, cache, "view as", every write
    transport.js         anti-forgery token, Web API, cloud flow calls
    adapters/            sample.js · sharepoint.js · dataverse.js
  ui/                    the design's screens, ported; class names unchanged
  styles/                the design's CSS, split by layer; Sherman fonts as woff2
power-pages/             the web template source
test/
  data.test.mjs          roll-forward parity, both adapters, the model
  mock-portal.mjs        a strict stand-in for Power Pages, SharePoint flows, Web API
  e2e.mjs                every write, both backends, admin and owner
  shots.mjs              screenshots of each screen, optionally beside the design
```

The screens are the design's own components with window globals replaced by
imports, and its class names and markup unchanged, so its stylesheet applies
as-is. Rendered side by side at 1280 px, every screen matches the design's
layout to the pixel height. The one layout change is at phone widths, where
the design scrolls sideways on three screens and this page does not.

`dist/` is committed, so deploying needs no Node. Change `src/`, run
`npm run build`, commit both.
