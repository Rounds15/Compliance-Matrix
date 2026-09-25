# Compliance Matrix on Power Pages

The Compliance Matrix 2.0 canvas app, rebuilt as a working Power Pages page
that reads and writes the same data. One page, one URL (`/compliance-matrix/`).
It looks like the Claude design; it is structured like the app:

Home · Definitions · Compliance Functions · Function Detail · Deadlines ·
Compliance Directory · Executive Team · Gap Tracker · Compliance Risk
Dashboard · Reporting · Flagged for Review · No Access

**Look at it first:** open [`dist/preview.html`](dist/preview.html) in a
browser. It is the real page running on sample records, in memory. Every
screen and every button works; nothing is saved. The preview signs you in as
an administrator, so the **Viewing as** select in the navy strip switches
between Admin view, User view and any person in the directory.

---

## Two sources, two jobs

- **The Claude design is the look.** Its stylesheets are used as they are:
  brand tokens, the SU Digital Design System (purged to what the page uses),
  the design's app and detail layers, and the Sherman Sans and Sherman Serif
  faces, embedded. Every screen is drawn in the design's markup: the navy
  hero and orange figures band on Home, the facet rail and lenses on
  Compliance Functions, the record layout with its rail on Function Detail,
  the month calendar, the directory table with its profile rail, cards,
  dialogs, heat map and tabs.
- **The canvas app is the structure.** The source of truth is the app export
  (`Src/*.pa.yaml` inside the `.msapp`) and the parity spec written from it.
  It decides which screens exist and where they sit in the navigation, what
  each one shows and for whom (view modes, scoping, access), how every write
  reaches the data, and the wording, which is the app's wherever the spec or
  the `.pa.yaml` gives it.

Where the two disagreed, the page follows the app on substance and the design
on presentation. A few things are this build's own, noted below.

### What comes from where

| | From the app | From the design |
|---|---|---|
| Header | Utility links (Compliance Home Page, Policies, Definitions, Report a Concern); Home, Browse, Risk and Reporting, Executive Team; the administrators' view switch | Navy strip, white masthead with the Block S lockup, orange underline on the current section, dropdown menus with descriptions, phone drawer |
| Home | Figures and lists are the viewer's own functions; "Assigned to you" with role, gaps and flags; deadlines due in 90 days, each with Complete | Hero with search, orange figures band, the four Start here cards, help section |
| Compliance Functions | Every risk area listed, even an empty one; the owner shown is the first Compliance Owner (+n); administrators add functions and manage risk areas and domains | Facet rail (risk area and domain, rating, record status), lenses (Functions, Risk Areas, Domains, Statutes), filter chips, accordion groups, cards on a phone |
| Function Detail | Rating shown only in Admin view or to the function's own people; Edit, Delete and Manage people for administrators; Flag, Log a gap, See all deadlines, Add to my calendar, Mark complete for this cycle; the app's validation and delete wording | Breadcrumb with Previous and Next, navy header, inline flag and gap panels, sections, rail with status, actions, legal questions, related |
| Accountability Structure | The data source's roles (Support where the lists have it; General Counsel per function on SharePoint, per risk area on Dataverse); Primary and Advisory sub-roles | The ownership chain: one container per role, Manage people, a person picker that also searches the university directory |
| Deadlines | Admin view sees every deadline, everyone else their own; Open, Overdue only, Completed, All; complete or reverse with a reason | Month calendar with names in the day cells, list view, pills, phone cards |
| Directory | Role order (Executive, Compliance, Unit, Counsel, Support); a person who owns functions cannot be removed until reassigned; reassign moves chosen functions without duplicating a role | Filters, table or cards, profile rail with the portfolio |
| Executive Team | Derived from the Executive Owner role, sorted by last name or portfolio size; All functions and Due 90d | Cards and the portfolio dialog |
| Gap Tracker | Scoped like the app; Open, Closed, Not rated, Avg days open | Stat row, open gaps by risk area, gap cards, close dialog |
| Risk Dashboard, Reporting | Computed from live data (the app hardcodes them); backend-aware wording; the app's model notes | Stats, shaded heat map, bars, signals; tabs for the embedded report, datasets and exports |
| Flagged for Review | Administrators only; age in business days against a five-day target | Panels, master and detail |
| Definitions | The app's terms, verbatim | The reading layout with the "On this page" rail |

### This build's own

- **Quick jump**: the Search button, Ctrl K (Cmd K on a Mac) or "/" opens one
  box that finds a screen, a function (name, statute, citation, ID), a person,
  or a page elsewhere on the site. Arrow keys move, Enter opens, Esc closes.
- **Site header and footer** on every other Power Pages page, in the same
  look, built from the site's web links (see *Deploy*, step 9).
- Clickable figures and stats (Home figures open the filtered list), a Back
  bar under the header, "Coming up" under an empty calendar day, back to top
  on long pages, and short motion that switches off for anyone whose system
  asks for reduced motion.
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
| Edit, create, delete a function; Manage people; the risk area and domain manager; add, edit, reassign and remove people in the directory | administrators |
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

What you upload: two web files and one template. Fonts and images are
embedded, so there is nothing else.

```
dist/cm-matrix.js                          web file   ~350 KB
dist/cm-matrix.css                         web file   ~140 KB
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

### 9. Site header and footer (every other page)

The matrix page draws its own header. Every other page on the site gets the
Power Pages default header and footer, until you swap them for these two,
which match the matrix and are built from the site's own navigation:

```
dist/cm-site.css                        web file   ~75 KB (Sherman Sans and the Block S embedded)
dist/cm-site.js                         web file   ~5 KB
dist/site-header.webtemplate.liquid     web template source
dist/site-footer.webtemplate.liquid     web template source
dist/site-preview.html                  both, rendered over a mock portal page
```

1. **Web files**: `cm-site.css` and `cm-site.js`, as in step 2 (partial URLs
   `cm-site.css`, `cm-site.js`, parent page Home, Published).
2. **Web templates**: Portal Management › **Web Templates** › **New**, twice:
   `CM Site Header` with the whole of `site-header.webtemplate.liquid` as
   Source, and `CM Site Footer` with `site-footer.webtemplate.liquid`.
3. **Point the site at them**: Portal Management › **Websites** › this site ›
   **Header Template** = `CM Site Header`, **Footer Template** =
   `CM Site Footer`. Save, then **Sync** in Design Studio (or clear the cache
   from `/_services/about`).

To go back, set the two fields to the original `Header` and `Footer`
templates. Nothing else on the site changes.

**What drives it.** The top-level links are the web link set named by
`ComplianceMatrix/SiteNavigation` (default `Default`, the set Design Studio's
**Pages** workspace edits), so a page added there shows up here. A link with
child links, or with **Display page child links** on, becomes a dropdown. The
header does not repeat Home or the matrix; it has its own **Compliance
Matrix** menu that deep-links to the screens, and shows Risk Dashboard,
Reporting and Flagged Items only to holders of the administrator web role.
The current page's section is underlined. Signed in, the utility bar shows
your name with Profile and Sign out; signed out, Sign in. Search, Ctrl K or
"/" on any page finds a link in the header or searches the matrix, landing on
Compliance Functions already filtered (`/compliance-matrix/#/functions?q=`).
The footer lists the same web link set, plus a `Footer` set if the site has
one (`ComplianceMatrix/FooterNavigation`).

The matrix page reads the same web link set, so its utility bar has a
**Portal Home** link and its footer and quick jump list the site's pages.

| Setting | Value | Default |
|---|---|---|
| `ComplianceMatrix/PageUrl` | where the matrix page lives | `/compliance-matrix/` |
| `ComplianceMatrix/SiteNavigation` | web link set for the header, footer and matrix | `Default` |
| `ComplianceMatrix/FooterNavigation` | extra web link set for the footer | `Footer` |
| `ComplianceMatrix/ProfileUrl` | the Profile link | `/profile` |
| `ComplianceMatrix/SiteCssUrl`, `ComplianceMatrix/SiteJsUrl` | if the web files live elsewhere | `/cm-site.css`, `/cm-site.js` |

**Things to know.** The styles are scoped to the header and footer, so the
theme and the pages are untouched, and the header works with any page
template that keeps the website header and footer. Design Studio's header
settings (site logo, site name, header colours) no longer apply, because the
default header is what used them. The default header's language picker is
not carried over; add it back if the site becomes multilingual.

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
  ui/                    one file per screen, named for the app's screens;
                         Palette.jsx is the quick jump
  styles/                the Claude design's stylesheets, in its order: tokens.css,
                         dds.css (purged by the build), app.css, detail.css,
                         portal.css; then extras.css (this build's additions);
                         fonts.css and fonts/ (Sherman, embedded by the build)
power-pages/             web template sources: the matrix page, the site header
                         and the site footer
test/
  data.test.mjs          roll-forward parity, both adapters, the model
  mock-portal.mjs        a strict stand-in for Power Pages, SharePoint flows, Web API
  e2e.mjs                every write, both backends, admin and owner
  shots.mjs              screenshots of each screen, User and Admin view (WIDTH=390 for a phone)
src/site/                the site header and footer: site.css, site.js
```

`dist/` is committed, so deploying needs no Node. Change `src/`, run
`npm run build`, commit both.
