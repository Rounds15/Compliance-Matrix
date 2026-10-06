/* A stand-in Power Pages site for end-to-end tests.

   Serves what a real site would, strictly enough to catch mistakes:
     GET  /matrix                  the real web template, rendered with Liquid
     GET  /cm-matrix.{js,css}      the built web files
     GET  /_layout/tokenhtml       an anti-forgery token
     POST /_api/cloudflow/v1.0/trigger/<read|write|admin|find>
                                   the three SharePoint flows, implemented to the
                                   contract in docs/SHAREPOINT-FLOWS.md
     POST /_api/cloudflow/v1.0/trigger/action
                                   CM - Process portal action, the Dataverse
                                   flow that writes who-did-it and the archive
                                   (docs/DATAVERSE-MIGRATION.md, section 8)
     *    /_api/<entityset>...     the Power Pages Web API over Dataverse

   Every write is checked against the real column set - the SharePoint lists'
   internal names from the canvas app's metadata (sp-schema.json) and the
   Dataverse schema (dv-schema.json) - with value types, lookup targets, the
   token header, and the member flow's allow-list. A write the real backend
   would reject fails here too. */

import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Liquid } from "liquidjs";
import { sharepointLists, dataverseTables, CONTACTS } from "./fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist");
const SP_SCHEMA = JSON.parse(readFileSync(join(HERE, "sp-schema.json"), "utf8"));
const DV_SCHEMA = JSON.parse(readFileSync(join(HERE, "dv-schema.json"), "utf8"));
const TOKEN = "mock-antiforgery-token";

const READ_LISTS = ["Risk Areas", "Domains", "Compliance Directory", "Compliance Functions", "Accountability Structure", "Deadlines", "Flags List", "Gap List"];
const MEMBER_OPS = ["create|Flags List", "create|Gap List", "create|Archive", "update|Deadlines", "update|Gap List"];
const MEMBER_DEADLINE_FIELDS = ["field_4", "field_5", "field_6", "field_7"];
const MEMBER_GAP_FIELDS = ["field_13", "field_14", "ClosedById"];

const liquid = new Liquid();
liquid.registerFilter("url_escape", v => encodeURIComponent(String(v ?? "")));

export async function startPortal({ backend = "sharepoint", admin = true, user = { email: "cruiz@syr.edu", name: "Camila Ruiz" }, settings: extra = {} } = {}) {
  const sp = sharepointLists();
  const dv = dataverseTables();
  const log = [];
  const fail = (res, status, msg) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: msg } })); };
  const body = req => new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); });

  const settings = {
    "ComplianceMatrix/Backend": backend,
    "ComplianceMatrix/Flow/Read": "/_api/cloudflow/v1.0/trigger/read",
    "ComplianceMatrix/Flow/Write": "/_api/cloudflow/v1.0/trigger/write",
    "ComplianceMatrix/Flow/AdminWrite": "/_api/cloudflow/v1.0/trigger/admin",
    "ComplianceMatrix/Flow/FindPerson": "/_api/cloudflow/v1.0/trigger/find",
    "ComplianceMatrix/Flow/Action": "/_api/cloudflow/v1.0/trigger/action",
    "ComplianceMatrix/CacheMinutes": "0",
    "ComplianceMatrix/PageUrl": "/matrix/",
    ...extra
  };
  const template = readFileSync(join(DIST, "compliance-matrix.webtemplate.liquid"), "utf8");
  const siteHeader = readFileSync(join(DIST, "site-header.webtemplate.liquid"), "utf8");
  const siteFooter = readFileSync(join(DIST, "site-footer.webtemplate.liquid"), "utf8");
  /* the site's navigation, as Design Studio's Pages workspace keeps it: a web
     link set with a link that has child links, one that shows its child
     pages, and the matrix itself (which the header does not repeat) */
  const weblinks = { Default: { weblinks: [
    { name: "Home", url: "/", weblinks: [] },
    { name: "Compliance Matrix", url: "/matrix/", weblinks: [] },
    { name: "Policies and Training", url: "/policies/", description: "Required training", weblinks: [
      { name: "Annual training", url: "/policies/annual/", description: "Who must complete it" },
      { name: "Conflict of interest", url: "/policies/coi/" }] },
    { name: "Resources", url: "/resources/", display_page_child_links: true, weblinks: [] },
    { name: "Contact", url: "/contact/", weblinks: [] }] } };
  const sitemap = { "/resources/": { children: [{ title: "Forms", url: "/resources/forms/", description: "<p>Every form the office uses</p>" }] } };
  const contactId = user ? (CONTACTS[String(user.email).toLowerCase()] || "c0ffee00-0000-4000-8000-000000000001") : null;
  const userCtx = () => (user ? { emailaddress1: user.email, fullname: user.name, id: contactId, roles: admin ? ["Authenticated Users", "Compliance Matrix Administrators"] : ["Authenticated Users"] } : null);

  /* ---------------- SharePoint: value checks per column kind ---------------- */
  const checkSpFields = (list, fields, op) => {
    const cols = SP_SCHEMA[list];
    if (!cols) return `No list named '${list}'`;
    for (const [k, v] of Object.entries(fields || {})) {
      if (k === "__metadata") continue;
      const kind = cols[k];
      if (!kind) return `Column '${k}' does not exist on '${list}'`;
      const ok = v === null
        || (kind === "text" && typeof v === "string")
        || (kind === "choice" && typeof v === "string")
        || (kind === "lookup" && Number.isInteger(v))
        || (kind === "number" && typeof v === "number")
        || (kind === "bool" && typeof v === "boolean")
        || (kind === "date" && typeof v === "string" && !isNaN(Date.parse(v)))
        || (kind === "url" && typeof v === "object" && v.__metadata && v.__metadata.type === "SP.FieldUrlValue" && typeof v.Url === "string");
      if (!ok) return `'${list}'.${k} is ${kind}; got ${JSON.stringify(v)}`;
      if (kind === "lookup" && v !== null) {
        const target = { FunctionId: "Compliance Functions", PersonId: "Compliance Directory", RiskAreaId: "Risk Areas", DomainId: "Domains",
          FlaggedById: "Compliance Directory", ResponsiblePersonId: "Compliance Directory", ClosedById: "Compliance Directory", CompletedById: "Compliance Directory" }[k];
        if (target && !sp[target].some(r => r.Id === v)) return `'${list}'.${k} points at missing ${target} item ${v}`;
      }
    }
    if (op === "create" && list !== "Archive" && !fields.Title) return `'${list}' needs a Title`;
    return null;
  };

  function runOps(ops, member) {
    const results = [];
    for (const o of ops) {
      if (member) {
        if (!MEMBER_OPS.includes(o.op + "|" + o.list)) throw new Error(`Not allowed for members: ${o.op} on ${o.list}`);
        /* the member flow rebuilds a deadline update from the four completion
           columns only (docs/SHAREPOINT-FLOWS.md, section 3) */
        if (o.list === "Deadlines") o.fields = Object.fromEntries(MEMBER_DEADLINE_FIELDS.map(k => [k, (o.fields || {})[k] ?? null]));
        /* and a gap update as a closure: status Closed plus the closure columns */
        if (o.op === "update" && o.list === "Gap List") o.fields = { field_2: "Closed", ...Object.fromEntries(MEMBER_GAP_FIELDS.map(k => [k, (o.fields || {})[k] ?? null])) };
      }
      const rows = sp[o.list];
      if (!rows) throw new Error(`No list named '${o.list}'`);
      if (o.op !== "delete") { const e = checkSpFields(o.list, o.fields, o.op); if (e) throw new Error(e); }
      if (o.op === "create") {
        const Id = Math.max(0, ...rows.map(r => r.Id)) + 1;
        rows.push({ Id, ...unwrap(o.fields), Created: new Date().toISOString() });
        results.push({ id: Id });
      } else {
        const row = rows.find(r => r.Id === o.id);
        if (!row) throw new Error(`Item ${o.id} does not exist in '${o.list}'`);
        if (o.op === "update") Object.assign(row, unwrap(o.fields));
        else rows.splice(rows.indexOf(row), 1);
        results.push({ id: o.id });
      }
    }
    return results;
  }
  /* SharePoint returns a hyperlink as {Description, Url} without the metadata */
  const unwrap = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v && v.__metadata ? { Description: v.Description, Url: v.Url } : v]));

  /* ---------------- CM - Process portal action ----------------
     The Dataverse flow in docs/DATAVERSE-MIGRATION.md, section 8, as the
     tests run it: it trusts only the action row (whose Requested By the
     Contact-scoped permission fixed), resolves the person through
     su_contact, checks they may act, does the work, writes who did it and
     the archive entry, and records the outcome on the action row. */
  const ACTIONS = { 100000120: "complete", 100000121: "reverse", 100000122: "close", 100000123: "resolve", 100000124: "flag", 100000125: "delete" };
  const CADENCE_LABEL = { 100000010: "Annually", 100000011: "Semiannual", 100000012: "Quarterly", 100000013: "Monthly", 100000014: "Biennial", 100000015: "Ongoing", 100000016: "One-time" };
  const ROLE_LABEL = { 100000030: "Executive Owner", 100000031: "Unit Owner", 100000032: "Compliance Owner", 100000033: "General Counsel", 100000034: "Support" };
  const isoDay = () => new Date().toISOString().slice(0, 10);
  const mdY = s => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : "");
  function processAction(actionId) {
    const a = dv.su_portalactions.find(r => r.su_portalactionid === actionId);
    if (!a) return { ok: false, error: "That action does not exist." };
    const done = (ok, msg) => { a.su_status = ok ? 100000131 : 100000132; a.su_result = msg || ""; a.su_processedon = new Date().toISOString(); return ok ? { ok: true } : { ok: false, error: msg }; };
    if (a.su_status !== 100000130) return { ok: false, error: "That action has already been processed." };
    const person = dv.su_compliancedirectorys.find(p => p._su_contact_value === a._su_requestedby_value && p.su_active !== false);
    if (!person) return done(false, "Your sign-in is not linked to a Compliance Directory record yet. Ask the compliance office to check your directory email.");
    const kind = ACTIONS[a.su_action];
    /* the function comes from the target row itself; a different function
       named on the action is refused */
    const target = { complete: ["su_compliancedeadlines", "su_compliancedeadlineid", a._su_deadline_value],
      reverse: ["su_compliancedeadlines", "su_compliancedeadlineid", a._su_deadline_value],
      close: ["su_compliancegaps", "su_compliancegapid", a._su_gap_value],
      resolve: ["su_functionflags", "su_functionflagid", a._su_flag_value] }[kind];
    const row = target && dv[target[0]].find(r => r[target[1]] === target[2]);
    if (target && !row) return done(false, "That record no longer exists.");
    if (row && a._su_function_value && a._su_function_value !== row._su_function_value) return done(false, "That record is not on this function.");
    const fnId = row ? row._su_function_value : a._su_function_value;
    const fn = dv.su_compliancefunctions.find(f => f.su_compliancefunctionid === fnId);
    const owns = fn && dv.su_functionownerships.some(o => o._su_function_value === fn.su_compliancefunctionid && o._su_person_value === person.su_compliancedirectoryid);
    const allowed = admin || kind === "flag" || ((kind === "complete" || kind === "reverse" || kind === "close") && owns);
    if (!fn || !allowed) return done(false, "You are not allowed to do that on this function.");
    const now = new Date().toISOString();
    const archive = (title, recordType, eventType, extra = {}) => dv.su_archives.push({
      su_archiveid: randomUUID(), su_name: (title + " - " + fn.su_name).slice(0, 255), su_recordtype: recordType, su_eventtype: eventType,
      su_functionname: fn.su_name, su_functionnumber: fn.su_legacyspid ?? (Number(fn.su_functioncode) || null),
      _su_function_value: fn.su_compliancefunctionid, su_resolvedby: person.su_name, su_resolvedat: now, ...extra });
    if (kind === "complete" || kind === "reverse") {
      const dl = row;
      if (kind === "complete") Object.assign(dl, { su_completeddate: isoDay(), su_completedon: now, su_completedreason: a.su_reason, su_completedbyname: person.su_name, _su_completedby_value: person.su_compliancedirectoryid, su_complete: dl.su_cadence === 100000016 });
      else Object.assign(dl, { su_completeddate: null, su_completedon: null, su_completedreason: null, su_completedbyname: null, _su_completedby_value: null, su_complete: false });
      archive(kind === "complete" ? "Deadline Completed" : "Deadline Reversed", "Deadline Completion", kind === "complete" ? "Completed" : "Reversed",
        { su_reason: a.su_reason, su_completedoccurrence: dl.su_duedate || "", su_cadence: CADENCE_LABEL[dl.su_cadence] || "", su_sourceitemid: dl.su_legacyspid ?? null });
    } else if (kind === "close") {
      const g = row;
      Object.assign(g, { su_status: 100000021, su_closeddate: isoDay(), su_closenote: a.su_reason || null, _su_closedby_value: person.su_compliancedirectoryid });
    } else if (kind === "resolve") {
      const x = row;
      Object.assign(x, { su_status: 100000051, su_clearedon: isoDay(), _su_clearedby_value: person.su_compliancedirectoryid });
      const by = dv.su_compliancedirectorys.find(p => p.su_compliancedirectoryid === x._su_flaggedby_value);
      archive("Flag Resolved", "Flag Resolution", "Resolved", { su_reason: x.su_reason, su_sourceitemid: x.su_legacyspid ?? null,
        su_flaggedby: by ? by.su_name : "", su_flaggeddate: x.su_flaggedon || "", su_flagsource: x.su_source === 100000111 ? "Survey" : "Manual" });
    } else if (kind === "flag") {
      if (!String(a.su_reason || "").trim()) return done(false, "A flag needs a reason.");
      dv.su_functionflags.push({ su_functionflagid: randomUUID(), su_name: fn.su_name.slice(0, 400), _su_function_value: fn.su_compliancefunctionid,
        su_reason: a.su_reason, su_status: 100000050, su_source: 100000110, su_flaggedon: isoDay(), _su_flaggedby_value: person.su_compliancedirectoryid });
    } else if (kind === "delete") {
      const id = fn.su_compliancefunctionid, mine = r => r._su_function_value === id;
      const name = pid => (dv.su_compliancedirectorys.find(p => p.su_compliancedirectoryid === pid) || {}).su_name || "";
      const copy = (reason, item) => archive("Function Deleted", "Function Deleted", "Deleted", { su_reason: reason, su_sourceitemid: item ?? null });
      dv.su_compliancegaps.filter(mine).forEach(g => copy("Gap: " + (g.su_name || ""), g.su_legacyspid));
      dv.su_compliancedeadlines.filter(mine).forEach(d => copy("Deadline: " + mdY(d.su_duedate) + " " + (CADENCE_LABEL[d.su_cadence] || ""), d.su_legacyspid));
      dv.su_functionflags.filter(mine).forEach(x => copy("Flag: " + (x.su_reason || ""), x.su_legacyspid));
      dv.su_functionownerships.filter(mine).forEach(o => copy(`Owner: ${name(o._su_person_value)} (${ROLE_LABEL[o.su_role] || ""})`, o.su_legacyspid));
      copy("Function record deleted", fn.su_legacyspid);
      dv.su_compliancefunctions.splice(dv.su_compliancefunctions.indexOf(fn), 1);
      for (const s of ["su_compliancedeadlines", "su_compliancegaps", "su_functionownerships", "su_functionflags"]) dv[s] = dv[s].filter(r => !mine(r));
      a._su_function_value = null; // the lookup is cleared, not cascaded
    }
    return done(true, "Done");
  }

  async function flow(name, req, res) {
    const raw = await body(req);
    let request;
    try { request = JSON.parse(JSON.parse(raw).eventData).request; request = JSON.parse(request); }
    catch (e) { return fail(res, 400, "Body must be {eventData: '{\"request\": \"<json>\"}'}"); }
    log.push({ flow: name, request });
    const reply = obj => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ result: JSON.stringify(obj) })); };
    if (name === "admin" && !admin) return fail(res, 403, "This flow is not available to your web role.");
    try {
      if (name === "read") {
        if (!READ_LISTS.includes(request.list)) return reply({ ok: false, error: "List not allowed: " + request.list });
        const rows = sp[request.list];
        // page Accountability Structure two rows at a time, to prove the client follows `next`
        const size = request.list === "Accountability Structure" ? 2 : 5000;
        const start = request.next ? Number(String(request.next).split(":")[1]) : 0;
        const next = start + size < rows.length ? "page:" + (start + size) : "";
        return reply({ ok: true, items: rows.slice(start, start + size), next });
      }
      if (name === "find") {
        const q = String(request.q || "").toLowerCase();
        const users = [{ displayName: "Priya Raghavan", mail: "praghavan@syr.edu", jobTitle: "Director of Export Control", department: "Office of Research" }];
        return reply({ ok: true, users: users.filter(u => (u.displayName + u.mail).toLowerCase().includes(q)) });
      }
      if (name === "action") return reply(processAction(request.actionId));
      return reply({ ok: true, results: runOps(request.ops || [], name === "write") });
    } catch (e) {
      return reply({ ok: false, error: e.message });
    }
  }

  /* ---------------- Dataverse Web API ---------------- */
  const tableOfSet = set => Object.entries(DV_SCHEMA).find(([, t]) => t.set === set);
  const idOf = s => (/\(([0-9a-f-]{36})\)/i.exec(s) || [])[1];

  function checkDvBody(tableName, b) {
    const t = DV_SCHEMA[tableName];
    for (const [k, v] of Object.entries(b)) {
      if (k.endsWith("@odata.bind")) {
        const nav = k.replace("@odata.bind", "");
        const col = t.columns[nav];
        if (!col || !col.startsWith("lookup:")) return `${tableName} has no lookup named ${nav}`;
        const target = col.slice(7);
        const m = /^\/([a-z_]+)\(([0-9a-f-]{36})\)$/i.exec(String(v));
        if (!m) return `${k} must be /<entityset>(<guid>), got ${v}`;
        if (target === "contact") {
          if (m[1] !== "contacts") return `${k} must bind to contacts, got ${m[1]}`;
          if (!Object.values(CONTACTS).includes(m[2]) && m[2] !== contactId) return `${k} points at a missing contact`;
          continue;
        }
        if (target !== "systemuser" && m[1] !== DV_SCHEMA[target].set) return `${k} must bind to ${DV_SCHEMA[target].set}, got ${m[1]}`;
        if (target !== "systemuser" && !dv[m[1]].some(r => r[target + "id"] === m[2])) return `${k} points at a missing ${target}`;
        continue;
      }
      const col = t.columns[k];
      if (!col) return `${tableName} has no column ${k}`;
      if (col.startsWith("lookup:")) return `${k} is a lookup; set it with ${k}@odata.bind`;
      if (v !== null && col === "Choice" && !Number.isInteger(v)) return `${k} is a choice; send the integer code`;
      if (v !== null && col === "Boolean" && typeof v !== "boolean") return `${k} is a yes/no column`;
      if (v !== null && col === "DateTime" && !/^\d{4}-\d{2}-\d{2}/.test(v)) return `${k} needs an ISO date`;
    }
    return null;
  }
  const applyDv = (tableName, row, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (k.endsWith("@odata.bind")) row["_" + k.replace("@odata.bind", "") + "_value"] = idOf(v);
      else row[k] = v;
    }
  };

  async function webApi(req, res, url) {
    const m = /^\/_api\/([a-z_]+)(?:\(([0-9a-f-]{36})\))?(?:\/([a-z_]+)\/\$ref)?$/i.exec(url.pathname);
    if (!m) return fail(res, 404, "Unknown Web API path " + url.pathname);
    const [, set, id, nav] = m;
    const entry = tableOfSet(set);
    if (!entry) return fail(res, 404, `Resource not found for the segment '${set}'.`);
    const [tableName, t] = entry;
    const rows = dv[set];
    if (req.method !== "GET" && req.headers["__requestverificationtoken"] !== TOKEN) return fail(res, 403, "Missing or invalid anti-forgery token");
    log.push({ api: req.method + " " + url.pathname + url.search });
    if (req.method === "GET") {
      const select = (url.searchParams.get("$select") || "").split(",").filter(Boolean);
      for (const c of select) {
        const lk = /^_([a-z_]+)_value$/.exec(c);
        if (c !== t.id && !t.columns[c] && !(lk && String(t.columns[lk[1]] || "").startsWith("lookup:")) && c !== "statecode")
          return fail(res, 400, `Could not find a property named '${c}' on type 'Microsoft.Dynamics.CRM.${tableName}'.`);
      }
      const size = set === "su_functionownerships" ? 1 : 5000;
      const skip = Number(url.searchParams.get("$skiptoken") || 0);
      const page = rows.slice(skip, skip + size);
      const out = { value: page };
      if (skip + size < rows.length) { const n = new URL(url); n.searchParams.set("$skiptoken", String(skip + size)); out["@odata.nextLink"] = n.pathname + n.search; }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out));
    }
    /* The table permissions in docs/DATAVERSE-MIGRATION.md, section 5: owners
       may log a gap and record a portal action; administrators edit the
       matrix directly; nobody writes the archive or a who-did-it column from
       the browser (the action flow does), and a portal action can only name
       the signed-in contact (Contact scope). */
    if (set === "su_archives") return fail(res, 403, "No table permission for this operation.");
    const ownerMay = req.method === "POST" && ["su_compliancegaps", "su_portalactions"].includes(set);
    if (!admin && !ownerMay) return fail(res, 403, "No table permission for this operation.");
    if (req.method === "DELETE" && nav) {
      const row = rows.find(r => r[t.id] === id); if (!row) return fail(res, 404, "Row not found");
      row["_" + nav + "_value"] = null; res.writeHead(204); return res.end();
    }
    if (req.method === "DELETE") {
      const i = rows.findIndex(r => r[t.id] === id); if (i < 0) return fail(res, 404, "Row not found");
      rows.splice(i, 1);
      /* the schema cascades deletes from a function to its children */
      if (tableName === "su_compliancefunction")
        for (const s of ["su_compliancedeadlines", "su_compliancegaps", "su_functionownerships", "su_functionflags"])
          dv[s] = dv[s].filter(r => r._su_function_value !== id);
      res.writeHead(204); return res.end();
    }
    const b = JSON.parse(await body(req) || "{}");
    const err = checkDvBody(tableName, b);
    if (err) return fail(res, 400, err);
    const serverOnly = ["su_completedby", "su_closedby", "su_clearedby", "su_flaggedby"].find(c => (c + "@odata.bind") in b || c in b);
    if (serverOnly) return fail(res, 403, `${serverOnly} is written by the portal action flow, not the browser.`);
    if (set === "su_portalactions" && b["su_requestedby@odata.bind"] !== `/contacts(${contactId})`)
      return fail(res, 403, "No table permission for this operation.");
    if (req.method === "POST") {
      const row = { [t.id]: randomUUID() }; applyDv(tableName, row, b); rows.push(row);
      res.writeHead(204, { entityid: row[t.id], "OData-EntityId": `/_api/${set}(${row[t.id]})` }); return res.end();
    }
    if (req.method === "PATCH") {
      const row = rows.find(r => r[t.id] === id); if (!row) return fail(res, 404, "Row not found");
      applyDv(tableName, row, b); res.writeHead(204); return res.end();
    }
    return fail(res, 405, "Method not allowed");
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/matrix" || url.pathname === "/matrix/") {
        const html = await liquid.parseAndRender(template, {
          user: userCtx(), settings, weblinks, request: { path: url.pathname, path_and_query: url.pathname + url.search }
        });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html);
      }
      /* any other page: the site header and footer around a stand-in body,
         as Power Pages' layout would place them */
      if (/^\/(|policies\/.*|resources\/.*|contact\/)$/.test(url.pathname)) {
        const path = url.pathname;
        const links = JSON.parse(JSON.stringify(weblinks));
        links.Default.weblinks.forEach(l => {
          l.is_sitemap_current = l.url === path;
          l.is_sitemap_ancestor = path !== l.url && l.url !== "/" && path.startsWith(l.url);
          (l.weblinks || []).forEach(k => { k.is_sitemap_current = k.url === path; });
        });
        const ctx = { user: userCtx(), settings, weblinks: links, sitemap, website: { name: "Office of Compliance" }, request: { path, path_and_query: path + url.search } };
        const html = "<!DOCTYPE html><html><head><meta charset=utf-8><title>Site</title></head><body>" +
          await liquid.parseAndRender(siteHeader, ctx) + `<div id="mainContent"><h1>Page ${path}</h1><a href="#">theme link</a></div>` +
          await liquid.parseAndRender(siteFooter, ctx) + "</body></html>";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html);
      }
      if (url.pathname === "/cm-site.js" || url.pathname === "/cm-site.css") {
        res.writeHead(200, { "Content-Type": url.pathname.endsWith(".js") ? "text/javascript" : "text/css" });
        return res.end(readFileSync(join(DIST, url.pathname.slice(1))));
      }
      if (url.pathname === "/cm-matrix.js" || url.pathname === "/cm-matrix.css") {
        res.writeHead(200, { "Content-Type": url.pathname.endsWith(".js") ? "text/javascript" : "text/css" });
        return res.end(readFileSync(join(DIST, url.pathname.slice(1))));
      }
      if (url.pathname === "/favicon.ico") { res.writeHead(204); return res.end(); }
      if (url.pathname === "/_layout/tokenhtml") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(`<input name="__RequestVerificationToken" type="hidden" value="${TOKEN}" />`);
      }
      const fm = /^\/_api\/cloudflow\/v1\.0\/trigger\/([a-z]+)$/.exec(url.pathname);
      if (fm) {
        if (req.method !== "POST") return fail(res, 405, "POST only");
        if (req.headers["__requestverificationtoken"] !== TOKEN) return fail(res, 403, "Missing or invalid anti-forgery token");
        return flow(fm[1], req, res);
      }
      if (url.pathname.startsWith("/_api/")) return webApi(req, res, url);
      fail(res, 404, "Not found: " + url.pathname);
    } catch (e) {
      fail(res, 500, e.stack || String(e));
    }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/matrix/`, base: `http://127.0.0.1:${port}`, sp, dv, log, close: () => new Promise(r => server.close(r)) };
}
