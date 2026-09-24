# Compliance Matrix on Power Pages

The Compliance Matrix 2.0 canvas app, rebuilt as a working Power Pages page
that reads and writes the same data. One page, one URL (`/compliance-matrix/`),
the app's screens with the app's headers, navigation, wording and access rules:

Home · Definitions · Compliance Functions · Function Detail · Deadlines ·
Compliance Directory · Executive Team · Gap Tracker · Compliance Risk
Dashboard · Reporting · Flagged for Review · No Access

**Look at it first:** open [`dist/preview.html`](dist/preview.html) in a
browser. It is the real page running on sample records, in memory. Every
screen and every button works; nothing is saved. The preview signs you in as
an administrator, so the **View:** menu is there to switch between Admin view,
User view and View as specific user.

---

## Parity with the canvas app

The source of truth is the canvas app export (`Src/*.pa.yaml` inside the
`.msapp`) and the parity spec written from it. Where the spec gives copy, the
page uses it exactly; where it is silent, the copy comes from the `.pa.yaml`.

- **Header on every screen**: a 30 px Navy utility bar (Compliance Home Page,
  Policies, Definitions; then the administrators' **View:** button and Report a
  Concern) over a 72 px white bar (Block S, Syracuse University / Compliance
  Matrix, **Home**, **Browse**, **Risk and Reporting**, **Executive Team**).
  Every screen but Home has **← Back**. No Power Pages site header or footer.
- **Type and colour**: Verdana throughout, Georgia for hero ledes only, the
  app's `varSU` colours, 1320 px content width with a 24 px minimum gutter.
- **View mode** (administrators): User view on load; Admin view; View as
  specific user, which points every "me" figure at that person's email.
- **Build**: every `<script` inside `cm-matrix.js` is written as `\x3Cscript`,
  because Power Pages injects a CSP nonce into any `<script` text in page
  script. The build checks the file still parses and fails if one is left.

### Access, as built

| Screen or action | Who |
|---|---|
| Home, Definitions, Compliance Functions, Function Detail, Deadlines, Directory, Executive Team | everyone |
| Gap Tracker | everyone; Admin view sees every gap, everyone else the gaps on their own functions |
| Deadlines | Admin view sees every deadline; User view and View as, their own functions' only |
| Risk rating on Function Detail | Admin view, or an owner of the function |
| Compliance Risk Dashboard, Reporting | administrators in Admin view (see *Open questions*) |
| Flagged for Review | administrators; everyone else gets No Access |
| Edit, create, delete a function; the "+" risk area and domain manager; Manage Directory | administrators |
| Flag, log a gap, close a gap, complete or reverse a deadline | everyone, on what they can see |

"Own functions" means every function where the person appears anywhere in the
Accountability Structure, General Counsel and Support included, as the app's
`colMyFunctions` does. Home's figures are always the viewer's own.

### What the page deliberately does differently from the app

These are leftovers or known issues in the canvas app (parity spec section 3):

- No debug labels (Home `Text6`, Gap Tracker `Text2` / `Text3`) and no
  `TestComplete` "UDF fired" notification.
- The Risk Dashboard computes every figure, heat map cell, percentage and
  signal from live data; the app hardcodes them.
- **Last reviewed** is the function's `LastAssessedDate`; the app shows today.
- Directory rename note: "Renaming is safe now, because ownership is by
  reference." (no em dash).
- Executive Team empty state: "No executive owners found. Executive owners
  come from the Accountability Structure list."
- Gap Tracker note: "How long it typically takes to close a gap".
- Reporting subtitle names the backend the site is configured for
  ("SharePoint lists" or "Dataverse tables") until the wording is confirmed.
- "Add to my calendar" downloads an `.ics` file, since a web page cannot write
  to the viewer's Outlook calendar.

### Open questions (parity spec section 4)

Not decided here. Until they are, the page does this:

1. **Access to Risk and Reporting.** Risk Dashboard and Reporting open only
   for administrators in Admin view, matching the Home card and the No Access
   copy; the Risk and Reporting menu shows all four items to everyone, and
   Gap Tracker stays open to everyone with its scoping.
2. **Absolute wording** ("every obligation", "Every open compliance gap"):
   kept as in the app.
3. **Home figures in Admin view**: the viewer's own counts, as in the app.

---

## Choosing a backend

The page has one UI and three interchangeable data sources, chosen by the site
setting `ComplianceMatrix/Backend`:

| Backend | Reads and writes | Security enforced by | Setup |
|---|---|---|---|
| `sharepoint` | The live Compliance Matrix 2.0 lists, through Power Automate | Which web roles may run each flow | Four flows, [docs/SHAREPOINT-FLOWS.md](../docs/SHAREPOINT-FLOWS.md) |
| `dataverse` | This repo's `su_*` tables, through the Power Pages Web API | Table permissions | Solution import + table permissions |
| `sample` | Sample records, in memory | n/a | none |

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

What you upload: two web files and one template. The one image is embedded
and the fonts are system fonts, so there is nothing else.

```
dist/cm-matrix.js                          web file   ~335 KB
dist/cm-matrix.css                         web file   ~37 KB
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

   Header and footer off is required. The page draws the app's own header
   and navigation, and the Power Pages site header and footer must not show.

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
| `ComplianceMatrix/ComplianceHomeUrl` | "Compliance Home Page" | `https://finance.syr.edu/office-of-compliance/` |
| `ComplianceMatrix/PoliciesUrl` | "Policies" | `https://policies.syr.edu/policies/` |
| `ComplianceMatrix/ReportConcernUrl` | "Report a Concern" | `https://finance.syr.edu/office-of-compliance/confidential-hotline/` |
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
| Authenticated Users | `su_compliancedeadline`, `su_compliancegap` | Write |
| Authenticated Users | `su_compliancefunction`, `su_compliancedirectory` | Append To |
| Compliance Matrix Administrators | all nine | Read, Create, Write, Delete, Append, Append To |

Owners completing deadlines and closing gaps need Write on those two tables.
Global scope means any signed-in user could, with a crafted request, write any
deadline or gap; if that matters, scope the Write permission through the
function to the owner's contact (a parent-relationship permission) instead.

### 8. Point the home page at it

`webpages/home/` in this repo now links **Open the Compliance Matrix** to
`/compliance-matrix/` and **View deadlines** to `/compliance-matrix/#/deadlines`.
Rebuild it with `python3 tools/build_webpage.py` and paste
`webpages/home/dist/home.webtemplate.html` as before.

---

## Security, plainly

- **What the page hides is convenience.** Administrator screens and buttons are
  hidden from non-administrators, but a hidden button is not a control.
- **What stops a write:** on SharePoint, Power Pages refuses to run the
  administrators' flow for anyone without the role, and the members' flow only
  accepts its five operations, with deadline updates cut down to the
  completion columns and gap updates to a closure. On Dataverse, the table
  permissions above.
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
  ui/                    one file per screen, named for the app's screens
  styles/cm.css          the stylesheet: Verdana, Georgia, the varSU colours
power-pages/             the web template source
test/
  data.test.mjs          roll-forward parity, both adapters, the model
  mock-portal.mjs        a strict stand-in for Power Pages, SharePoint flows, Web API
  e2e.mjs                every write, both backends, admin and owner
  shots.mjs              screenshots of each screen, User and Admin view
```

`dist/` is committed, so deploying needs no Node. Change `src/`, run
`npm run build`, commit both.
