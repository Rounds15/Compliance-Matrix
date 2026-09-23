/* Page configuration.

   The Power Pages web template renders a single <div id="cm-root"> and puts
   everything the page needs to know on it as data- attributes: who is signed
   in, whether they hold the administrator web role, which backend to use, and
   the flow endpoints. Attributes rather than an inline JSON block, because
   Liquid's escape filter is HTML-attribute escaping, which is exactly right
   here and wrong inside <script>.

   Nothing here is trusted for security. isAdmin only decides what the screens
   offer; the table permissions (Dataverse) and the flow web-role assignments
   (SharePoint) decide what actually succeeds. */

const truthy = v => /^(true|1|yes)$/i.test(String(v || "").trim());

function json(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

export function readConfig(el) {
  const d = (el && el.dataset) || {};
  const qs = new URLSearchParams(window.location.search);
  let backend = String(d.backend || "sample").trim().toLowerCase();
  /* ?backend=sample lets an administrator preview the page with the sample
     records on a live site. It only swaps what is read; it cannot reach any
     other backend than the one the site is configured for. */
  if (qs.get("backend") === "sample") backend = "sample";
  if (!["sample", "sharepoint", "dataverse"].includes(backend)) backend = "sample";

  const sample = backend === "sample";
  const cfg = {
    backend,
    user: {
      email: sample ? "cruiz@syr.edu" : (d.userEmail || ""),
      name: sample ? "Camila Ruiz" : (d.userName || ""),
      contactId: d.userId || ""
    },
    isAdmin: sample ? true : truthy(d.isAdmin),
    flows: {
      read: d.flowRead || "",
      write: d.flowWrite || "",
      adminWrite: d.flowAdminWrite || "",
      findPerson: d.flowFindPerson || ""
    },
    dataverseSets: json(d.dataverseSets, {}),
    timeZone: d.timeZone || "America/New_York",
    cacheMinutes: d.cacheMinutes !== undefined && d.cacheMinutes !== "" ? Number(d.cacheMinutes) : 5,
    links: {
      home: d.homeUrl || "/",
      signOut: d.signOutUrl || "/Account/Login/LogOff",
      reportConcern: d.reportConcernUrl || "https://compliance.syr.edu",
      policies: "https://policies.syr.edu",
      syracuse: "https://www.syracuse.edu",
      powerBi: d.powerBiUrl || "https://app.powerbi.com",
      powerBiEmbed: d.powerBiEmbedUrl || "",
      powerApp: d.powerAppUrl || ""
    },
    /* the prototype's "Viewing as" presets, so the sample reads like the design */
    viewPresets: sample
      ? [{ label: "Compliance Owner", email: "mhollis@syr.edu" }, { label: "Executive", email: "bpadgett@syr.edu" }]
      : []
  };
  return cfg;
}
