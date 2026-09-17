# Compliance Matrix home page

The approved home page design, with every figure on it read from live data
instead of typed into the markup.

Nothing about the layout changes: same sections, same classes, same inline
styles, same portal theme. The only edit to the design is that `391`, `13`,
`148`, `320`, `209`, and `16` became queries.

```
metrics.yaml          what each number means, in both backends' terms
src/home.source.html  the design, with [[metric:key]] where a number goes
src/runtime.js        the client-side counter
src/styles.css        optional supplemental CSS
dist/                 generated - never edit anything in here
```

Rebuild after any edit to `metrics.yaml` or `src/`:

```bash
python3 tools/build_webpage.py
```

`python3 tools/validate.py` fails if `dist/` has drifted from its source, or if
a figure on the page has no query behind it in either output.

Look at it first: open [`dist/preview.html`](dist/preview.html) in a browser. It
runs on the `mock` backend, needs no network, and approximates the portal theme.

---

## The figures

| On the page | Means | Dataverse | SharePoint list |
|---|---|---|---|
| Compliance Functions | Rows in the register | count of `su_compliancefunction` | `Functions` |
| Risk Areas | Top-level risk areas | count of `su_riskarea` | `RiskAreas` |
| Named Owners | Distinct people holding at least one assignment | distinct `su_person` on `su_functionownership` | `FunctionOwners` |
| Deadlines tracked | Due events on the calendar | count of `su_compliancedeadline` | `Deadlines` |
| Governing statutes mapped | Distinct statutes cited | distinct `su_statute` on `su_compliancefunction` | `Functions` |
| Executive owners | Distinct people at the Executive Owner tier | distinct `su_person` where `su_role` is Executive Owner | `FunctionOwners` |

Two of these are judgment calls, and they are worth agreeing on before the page
goes live:

- **Named Owners** counts the ownership junction, not the directory. The
  directory holds 127 people; the junction is who actually carries something.
  Counting the directory instead would answer a different question.
- **Executive owners** counts people holding the Executive Owner tier on at
  least one obligation. The alternative is `su_compliancedirectory` where
  `su_isexecutive` is true, which is the standing executive team. Both are
  defensible; they are not the same number.

Change either in `metrics.yaml` and rebuild - both backends follow.

**The live numbers will not match the numbers in the current copy.** The seed
data carries 392 functions and 144 deadlines against the 391 and 320 on the
page. That gap is the point of wiring it up: the page has been drifting since
the day it was written. Expect the figures to move on first publish, and tell
whoever approved the copy before they notice it themselves.

---

## Choosing a backend

**Use the Liquid web template.** It is the shortest path and the fewest moving
parts: counts are computed by Dataverse, rendered into the HTML before it
leaves the server, and cost no JavaScript, no Web API configuration, and no
second request from the visitor's browser. It also does the one thing the
client-side path cannot - a true aggregate, rather than fetching rows and
counting them in the browser.

Take the client-side path only if you cannot create a web template on this
site, or the page has to live somewhere that is not Power Pages.

The `sharepoint` backend is real but narrow: a browser will not let a page
served from `*.powerappsportals.com` call `syr.sharepoint.com`, so it only
works where the page itself is served from the SharePoint tenant (an SPFx web
part, or a page in the same site collection). On Power Pages, use Dataverse.

---

## Option A - Liquid web template (recommended)

1. **Table permissions.** In Power Pages Design Studio, **Set up** >
   **Table permissions**, create one Read permission with Global scope for each
   of `su_compliancefunction`, `su_riskarea`, `su_functionownership`,
   `su_compliancedeadline`, and grant it to the web role that reaches this page.
   Read [`dist/SETUP-VALUES.md`](dist/SETUP-VALUES.md) before you grant anything
   to Anonymous Users.
2. **Web template.** Portal Management app > **Web Templates** > New. Name it
   `Compliance Matrix Home`, paste all of
   [`dist/home.webtemplate.html`](dist/home.webtemplate.html) into Source, save.
3. **Page template.** **Page Templates** > New. Type `Web Template`, point it at
   the template from step 2, tick **Is Default** off, save.
4. **Point the home page at it.** Open the home web page record, set its Page
   Template to the one from step 3, save, and **Sync** in Design Studio.

If a permission is missing the query returns nothing, the `{% if ... == blank %}`
guard fires, and the page shows the figure that is in the markup. A visitor sees
a correct page either way; only the "as of" date tells you it went live.

## Option B - page copy plus JavaScript

1. Do step 1 above, then add the Web API site settings listed in
   [`dist/SETUP-VALUES.md`](dist/SETUP-VALUES.md).
2. Design Studio > the home page > **Edit code**. Paste
   [`dist/home.pagecopy.html`](dist/home.pagecopy.html) into the HTML, and all of
   [`dist/cm-metrics.js`](dist/cm-metrics.js) into the JavaScript.
3. Optional: paste [`dist/cm-metrics.css`](dist/cm-metrics.css) into the site's
   custom CSS. The page renders correctly without it.
4. For SharePoint instead of Dataverse, set `backend: "sharepoint"` and
   `sharePointSite` at the top of the script, and check the list titles and
   internal field names in `metrics.yaml` against the real lists. Same-origin
   caveat above applies.

Every figure ships in the markup as its own text, so the page is right before
the script runs and stays right if the script is blocked, the API is down, or
the visitor's role cannot read the table. There is no spinner and no flash of
zero. A failed metric logs one console warning and leaves the number alone.

Counts are cached in `sessionStorage` for 30 minutes (`cacheMinutes`), so
browsing the site does not re-run six queries per page view.

---

## Public page without public data

If the home page has to be anonymous, do not hand the Anonymous Users role
Global Read on the register. Publish a snapshot instead:

1. Make a small table, `su_sitestat`, with `su_key` (text) and `su_value`
   (whole number). One row per figure.
2. Schedule a Power Automate flow - nightly is plenty for figures that move a
   few times a month - that runs the same six counts and updates those rows.
3. Point `metrics.yaml` at `su_sitestat` and grant Anonymous Read on that table
   only. It contains six numbers and nothing else.

That keeps the page live without exposing a single obligation, owner, or
deadline to the internet.

---

## Things that will bite

- **Entity set names.** The Web API path uses `su_compliancefunctions`,
  `su_riskareas`, `su_functionownerships`, `su_compliancedeadlines`. Dataverse
  generates these by pluralization and occasionally differs. Check
  `/_api/$metadata` in the target environment before blaming the script.
- **`$count` is capped at 5000** in Dataverse. The runtime treats a result of
  exactly 5000 as suspect and re-counts by paging. No figure here is near that,
  but the guard matters if someone points a metric at ownership rows.
- **No aggregates over the Web API.** Neither Power Pages nor Dataverse OData
  supports `$apply`, which is why distinct counts page through rows and count in
  the browser. It is a few hundred rows today. If a distinct metric ever spans
  tens of thousands, move that figure to the Liquid path or to a snapshot.
- **`statecode` must be readable** for the client-side path, because every query
  filters to active rows. It is in the generated field lists; if you narrow
  them by hand, keep it, or set `activeonly: false` on the metric.
- **The page-copy editor strips `<style>` and rewrites some markup.** Keep CSS
  in the theme, and if the editor mangles a paste, use the web template.
