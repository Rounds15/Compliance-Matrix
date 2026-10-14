/* Data layer: deadline roll-forward parity with the canvas app, both
   adapters' mapping, and the model built on top. Run: npm test */

import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, cadenceMonths } from "../src/lib/deadlines.js";
import { addMonths, monthDiff, fiscalQ, toDay } from "../src/lib/dates.js";
import { normRisk } from "../src/lib/risk.js";
import { mapLists, LISTS } from "../src/data/adapters/sharepoint.js";
import { mapTables, DEFAULT_SETS, WEBAPI_FIELDS } from "../src/data/adapters/dataverse.js";
import { readFileSync } from "node:fs";
import { buildDataset, functionsFor, visibleDeadlines, roleOn, NOBODY, deadlineTitle } from "../src/data/model.js";
import { createSampleAdapter } from "../src/data/adapters/sample.js";
import { parseFlowResult, flowUrl } from "../src/data/transport.js";
import { sharepointLists, dataverseTables, DV_IDS as G } from "./fixtures.mjs";

const D = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const T = D("2026-09-23");

/* ---------------- dates: the Power Fx semantics the roll-forward leans on ---------------- */
test("DateAdd months clamps to the end of a short month", () => {
  assert.deepEqual(addMonths(D("2026-01-31"), 1), D("2026-02-28"));
  assert.deepEqual(addMonths(D("2024-01-31"), 1), D("2024-02-29"));
  assert.deepEqual(addMonths(D("2025-12-15"), 3), D("2026-03-15"));
});
test("DateDiff months counts boundaries, not days", () => {
  assert.equal(monthDiff(D("2026-01-31"), D("2026-02-01")), 1);
  assert.equal(monthDiff(D("2025-03-31"), D("2026-09-23")), 18);
  assert.equal(monthDiff(D("2026-09-01"), D("2026-09-30")), 0);
});
test("fiscal quarters start in July", () => {
  assert.equal(fiscalQ(D("2026-07-01")), "FY27 Q1");
  assert.equal(fiscalQ(D("2026-09-23")), "FY27 Q1");
  assert.equal(fiscalQ(D("2027-01-02")), "FY27 Q3");
  assert.equal(fiscalQ(D("2027-06-30")), "FY27 Q4");
});

/* ---------------- RefreshDeadlines() parity ---------------- */
test("cadence vocabulary matches CadenceMonths()", () => {
  assert.equal(cadenceMonths("Annually"), 12);
  assert.equal(cadenceMonths("Annual"), 12);
  assert.equal(cadenceMonths("Semi-Annually"), 6);
  assert.equal(cadenceMonths("Every 2 Years"), 24);
  assert.equal(cadenceMonths("Ongoing"), 0);
  assert.equal(cadenceMonths(""), 0);
});
test("a missed annual deadline stays overdue on its latest occurrence", () => {
  const r = nextOccurrence(D("2025-03-31"), "Annual", null, T);
  assert.deepEqual(r.next, D("2026-03-31"));
  assert.equal(r.status, "Overdue");
});
test("completing the latest occurrence rolls to the next one after the hold", () => {
  const r = nextOccurrence(D("2025-03-31"), "Annual", D("2026-04-10"), T);
  assert.deepEqual(r.next, D("2027-03-31"));
  assert.equal(r.status, "Upcoming");
});
test("a completion inside 30 days holds the row as Completed on its stored date", () => {
  const r = nextOccurrence(D("2025-03-31"), "Annual", D("2026-09-01"), T);
  assert.equal(r.withinHold, true);
  assert.deepEqual(r.next, D("2025-03-31"));
  assert.equal(r.status, "Completed");
  // Today() <= DateAdd(lastDone, 30, Days): completed Aug 24 holds through Sep 23, Aug 23 does not
  assert.equal(nextOccurrence(D("2025-03-31"), "Annual", D("2026-08-24"), T).status, "Completed");
  assert.equal(nextOccurrence(D("2025-03-31"), "Annual", D("2026-08-23"), T).withinHold, false);
});
test("quarterly steps by whole periods and does not skip past an unfinished one", () => {
  const r = nextOccurrence(D("2026-01-15"), "Quarterly", null, T);
  assert.deepEqual(r.next, D("2026-07-15"));
  assert.equal(r.status, "Overdue");
});
test("no cadence or no date leaves the row as stored", () => {
  assert.deepEqual(nextOccurrence(D("2026-12-01"), "Ongoing", null, T).next, D("2026-12-01"));
  const blank = nextOccurrence(null, "Annual", null, T);
  assert.equal(blank.next, null);
  assert.equal(blank.status, "Upcoming");
});

/* ---------------- risk vocabulary ---------------- */
test("blank and 'Not Scored' ratings read as Unrated; legacy values survive", () => {
  assert.equal(normRisk(null), "Unrated");
  assert.equal(normRisk(""), "Unrated");
  assert.equal(normRisk("Not Scored"), "Unrated");
  assert.equal(normRisk({ Value: "moderate" }), "Moderate");
  assert.equal(normRisk("Critical"), "Critical");
});

/* ---------------- SharePoint mapping ---------------- */
const spRaw = () => {
  const L = sharepointLists();
  const key = Object.fromEntries(Object.entries(LISTS).map(([k, v]) => [v, k]));
  return mapLists(Object.fromEntries(Object.entries(L).filter(([n]) => key[n] && n !== "Archive").map(([n, rows]) => [key[n], rows])));
};

test("SharePoint rows map through internal column names", () => {
  const raw = spRaw();
  const f = raw.functions.find(x => x.id === 201);
  assert.equal(f.statute, "Jeanne Clery Act");
  assert.equal(f.citation, "20 U.S.C. § 1092(f)");
  assert.equal(f.statuteUrl, "https://www.ed.gov/campus-safety"); // hyperlink object -> Url
  assert.equal(f.resourceUrl, "https://policies.syr.edu");
  assert.equal(f.risk, "High");
  assert.equal(f.code, "#201");
  assert.equal(raw.functions.find(x => x.id === 203).statuteUrl, "https://www.hhs.gov/hipaa"); // plain text also accepted
  const g = raw.gaps.find(x => x.id === 601);
  assert.equal(g.code, "Late");
  assert.equal(g.targetQuarter, "Q2");
  assert.equal(raw.flags.find(x => x.id === 502).open, false);
});

test("SharePoint model: chain, counsel, severity, deadlines, flags, identity", () => {
  const ds = buildDataset(spRaw(), { today: T, meEmail: "cruiz@syr.edu", meName: "Camila Ruiz" });
  const clery = ds.fnById.get("201");
  assert.equal(clery.exec.n, "Marcus Delgado");
  assert.equal(clery.owner.n, "Camila Ruiz");               // the Primary, not the Support
  assert.equal(clery.chain.compliance.length, 2);
  assert.equal(clery.unitOwner, null);
  assert.equal(clery.counsel.n, "Grace Whitfield");          // General Counsel row on the function
  const i9 = ds.fnById.get("202");
  assert.equal(i9.risk, "Unrated");
  assert.equal(i9.owner, NOBODY);                            // no compliance owner recorded
  assert.equal(i9.chain.unit.length, 1);                     // the row for a deleted person is dropped
  const hipaa = ds.fnById.get("203");
  assert.equal(hipaa.area, "No domain");

  assert.equal(ds.me.n, "Camila Ruiz");                      // email matched case-insensitively
  assert.deepEqual(functionsFor(ds.me, ds.fns).map(f => f.id), [201]);

  const gap = ds.gaps.find(g => g.id === 601);
  assert.equal(gap.severity, "Unrated");                     // Gap Tracker rates by the function's risk
  assert.equal(ds.gaps.find(g => g.id === 602).open, true);  // In Progress is still open
  assert.equal(ds.gaps.find(g => g.id === 603).open, false);
  assert.equal(ds.gaps.find(g => g.id === 602).owner.n, "Camila Ruiz");

  assert.equal(ds.allDeadlines.length, 2);                   // the orphan deadline is dropped
  const asr = ds.allDeadlines.find(d => d.id === 401);
  assert.equal(asr.status, "Overdue");
  assert.deepEqual(asr.due, D("2025-10-01"));
  const i9dl = ds.allDeadlines.find(d => d.id === 402);
  assert.equal(i9dl.complete, true);                         // completed 13 days ago

  assert.equal(ds.flags.length, 1);                          // resolved flags are history, not badges
  assert.equal(ds.flags[0].by, "Dwight Ferrell");
  assert.deepEqual(ds.executives.map(p => p.n), ["Delgado", "Whitaker"].map(l => ds.people.find(p => p.n.endsWith(l)).n));
  assert.equal(ds.topics[0].count >= ds.topics[ds.topics.length - 1].count, true);
});

test("non-administrators see only their functions' deadlines", () => {
  const ds = buildDataset(spRaw(), { today: T, meEmail: "cruiz@syr.edu" });
  assert.deepEqual(visibleDeadlines(ds, ds.me, false).map(d => d.id), [401]);
  assert.equal(visibleDeadlines(ds, ds.me, true).length, 2);
});

test("own functions are every Accountability Structure role, General Counsel and Support included", () => {
  const ds = buildDataset(spRaw(), { today: T, meEmail: "gwhitfield@syr.edu" });
  assert.deepEqual(functionsFor(ds.me, ds.fns).map(f => f.id), [201], "Grace is General Counsel on 201");
  const raw = spRaw();
  raw.ownership.push({ id: 399, functionId: 203, personId: 104, role: "Support", sub: "Primary" });
  const ds2 = buildDataset(raw, { today: T, meEmail: "gwhitfield@syr.edu" });
  assert.deepEqual(functionsFor(ds2.me, ds2.fns).map(f => f.id).sort(), [201, 203]);
  assert.equal(ds2.fnById.get("203").chain.support[0].person.n, "Grace Whitfield");
});

test("the Assigned to you role: Executive, then Unit, else Compliance Owner", () => {
  const ds = buildDataset(spRaw(), { today: T, meEmail: "dferrell@syr.edu" });
  assert.equal(roleOn(ds.fnById.get("201"), ds.me), "Compliance Owner");
  assert.equal(roleOn(ds.fnById.get("202"), ds.me), "Unit Owner");
  const andrea = ds.people.find(p => p.n === "Andrea Whitaker");
  assert.equal(roleOn(ds.fnById.get("202"), andrea), "Executive Owner");
});

test("a signed-in user missing from the directory still gets a usable identity", () => {
  const ds = buildDataset(spRaw(), { today: T, meEmail: "newhire@syr.edu", meName: "New Hire" });
  assert.equal(ds.me.n, "New Hire");
  assert.equal(functionsFor(ds.me, ds.fns).length, 0);
});

/* ---------------- Dataverse mapping ---------------- */
const dvRaw = () => {
  const t = dataverseTables();
  return mapTables({
    riskAreas: t.su_riskareas, domains: t.su_domains, people: t.su_compliancedirectorys, functions: t.su_compliancefunctions,
    ownership: t.su_functionownerships, deadlines: t.su_compliancedeadlines, gaps: t.su_compliancegaps,
    flags: t.su_functionflags, counsel: t.su_counselassignments
  });
};

test("Dataverse rows map choice codes and lookups", () => {
  const raw = dvRaw();
  assert.equal(raw.functions.find(f => f.id === G(201)).risk, "High");
  assert.equal(raw.functions.find(f => f.id === G(203)).risk, "Moderate");
  assert.equal(raw.ownership[0].role, "Compliance Owner");
  assert.equal(raw.ownership[1].sub, "Support");
  assert.equal(raw.deadlines[0].cadence, "Annually");
  assert.equal(raw.gaps[0].status, "Open");
  assert.equal(raw.flags[1].open, false);
  assert.equal(raw.people.some(p => p.name === "Left Already"), false); // inactive rows are leavers
});

test("Dataverse model: junction first, fixed lookups fill gaps, counsel by risk area", () => {
  const ds = buildDataset(dvRaw(), { today: T, meEmail: "cruiz@syr.edu" });
  const clery = ds.fnById.get(G(201));
  assert.equal(clery.code, "201");                          // the SharePoint ID is the function ID
  assert.equal(clery.owner.n, "Camila Ruiz");
  assert.equal(clery.chain.compliance.length, 2);            // junction wins over the fixed lookup
  assert.equal(clery.exec.n, "Marcus Delgado");              // no junction row: fixed lookup used
  assert.equal(clery.counsel.n, "Grace Whitfield");          // su_counselassignment for the risk area
  assert.equal(ds.fnById.get(G(203)).counsel.n, "Marcus Delgado"); // default escalation row
  const i9 = ds.fnById.get(G(202));
  assert.equal(i9.unitOwner.n, "Dwight Ferrell");
  assert.equal(ds.gaps.find(g => g.id === G(601)).severity, "High"); // Dataverse gaps carry their own severity
});

test("Dataverse: General Counsel and Support are ownership roles; counsel per function wins", () => {
  const t = dataverseTables();
  t.su_functionownerships.push(
    { su_functionownershipid: G(310), _su_function_value: G(201), _su_person_value: G(102), su_role: 100000033, su_subrole: 100000041 },
    { su_functionownershipid: G(311), _su_function_value: G(201), _su_person_value: G(100), su_role: 100000034, su_subrole: 100000040 });
  t.su_compliancedeadlines[1].su_completedreason = "Sample reviewed";
  Object.assign(t.su_compliancegaps[0], { su_responsibleunit: "Human Resources", su_gapsource: "Assessment" });
  t.su_functionflags[0].su_respondentemail = "dferrell@syr.edu";
  const raw = mapTables({ riskAreas: t.su_riskareas, domains: t.su_domains, people: t.su_compliancedirectorys, functions: t.su_compliancefunctions,
    ownership: t.su_functionownerships, deadlines: t.su_compliancedeadlines, gaps: t.su_compliancegaps, flags: t.su_functionflags, counsel: t.su_counselassignments });
  assert.deepEqual(raw.ownership.slice(-2).map(o => [o.role, o.sub]), [["General Counsel", "Advisory"], ["Support", "Primary"]]);
  assert.equal(raw.deadlines[1].reason, "Sample reviewed");
  assert.equal(raw.gaps[0].unit, "Human Resources");
  assert.equal(raw.gaps[0].source, "Assessment");
  assert.equal(raw.flags[0].byEmail, "dferrell@syr.edu");
  const ds = buildDataset(raw, { today: T, meEmail: "cruiz@syr.edu" });
  const clery = ds.fnById.get(G(201));
  assert.equal(clery.counsel.n, "Andrea Whitaker");          // the function's own General Counsel row
  assert.equal(clery.chain.support[0].person.n, "Marcus Delgado");
});

test("both backends describe the same matrix the same way", () => {
  const a = buildDataset(spRaw(), { today: T, meEmail: "cruiz@syr.edu" });
  const b = buildDataset(dvRaw(), { today: T, meEmail: "cruiz@syr.edu" });
  const shape = ds => ds.fns.map(f => [f.name, f.topic, f.owner.n, f.chain.compliance.length]).sort();
  assert.deepEqual(shape(a), shape(b));
  assert.deepEqual(a.allDeadlines.map(d => [d.title, d.status]).sort(), b.allDeadlines.map(d => [d.title, d.status]).sort());
});

/* ---------------- sample backend reproduces the design ---------------- */
test("sample data matches the design prototype's figures", async () => {
  const raw = await createSampleAdapter().load(null, { today: T });
  const ds = buildDataset(raw, { today: T, meEmail: "cruiz@syr.edu" });
  assert.equal(ds.fns.length, 42);
  assert.equal(ds.topics.length, 13);
  assert.equal(ds.gaps.filter(g => g.open).length, 14);
  assert.equal(ds.gaps.filter(g => !g.open).length, 3);
  assert.equal(ds.flags.length, 2);
  assert.equal(ds.fnById.get("CF-9082").unitOwner, null);
  assert.equal(ds.people.some(p => p.counselOnly), false);    // counsel-only records stay out of the directory
  assert.equal(ds.fnById.get("CF-5040").counsel.n, "Miriam Adler");
  assert.equal(ds.fnById.get("CF-8070").counsel.n, "Grace Whitfield");
  assert.deepEqual([...new Set(ds.fns.map(f => f.risk))].sort(), ["High", "Low", "Moderate"], "the live rating vocabulary");
  assert.ok(ds.fns.every(f => f.lastReviewed && f.lastReviewed < T), "last reviewed is a past assessment, not today");
});

/* ---------------- flow responses ---------------- */
test("flow results unwrap whatever envelope comes back", () => {
  assert.deepEqual(parseFlowResult(JSON.stringify({ result: JSON.stringify({ items: [1] }) })), { items: [1] });
  assert.deepEqual(parseFlowResult(JSON.stringify({ Result: JSON.stringify({ items: [2] }) })), { items: [2] });
  assert.deepEqual(parseFlowResult(JSON.stringify({ items: [3] })), { items: [3] });
  assert.throws(() => parseFlowResult(JSON.stringify({ result: JSON.stringify({ ok: false, error: "List not allowed" }) })), /List not allowed/);
  assert.equal(flowUrl("44a4b2f2-0d1a-4820-bf93-9376278d49c4"), "/_api/cloudflow/v1.0/trigger/44a4b2f2-0d1a-4820-bf93-9376278d49c4");
  assert.equal(flowUrl("/_api/cloudflow/v1.0/trigger/x"), "/_api/cloudflow/v1.0/trigger/x");
});

test("toDay reads both backends' date-only values as the local calendar day", () => {
  assert.deepEqual(toDay("2026-10-01T04:00:00Z"), D("2026-10-01")); // SharePoint: Eastern midnight in UTC
  assert.deepEqual(toDay("2026-10-01"), D("2026-10-01"));           // Dataverse DateOnly
  assert.equal(toDay(""), null);
  assert.equal(toDay("not a date"), null);
});

test("the Dataverse adapter requests each table by the solution's entity set name", () => {
  const schema = JSON.parse(readFileSync(new URL("./dv-schema.json", import.meta.url), "utf8"));
  for (const [table, set] of Object.entries(DEFAULT_SETS)) {
    assert.ok(schema[table], table + " is in the solution");
    assert.equal(set, schema[table].set, table + " is requested as its EntitySetName");
    assert.notEqual(set, table, "the entity set is plural, not the logical name");
  }
});

test("the guide lists each table's Webapi fields value exactly as the adapter uses it", () => {
  const guide = readFileSync(new URL("../../docs/DATAVERSE-MIGRATION.md", import.meta.url), "utf8");
  for (const [table, fields] of Object.entries(WEBAPI_FIELDS)) {
    assert.ok(guide.includes(`| ${table} | ${DEFAULT_SETS[table]} | \`${fields}\` |`), table + " row in section 5");
    assert.ok(!fields.includes("*") && !fields.includes(" "), table + ": explicit, no spaces");
    const schema = JSON.parse(readFileSync(new URL("./dv-schema.json", import.meta.url), "utf8"));
    for (const c of fields.split(",")) {
      const kind = String(schema[table].columns[c] || "");
      assert.ok(!kind.startsWith("lookup:"), table + ": lookup " + c + " must be listed as _" + c + "_value");
      const lk = /^_(.+)_value$/.exec(c);
      if (lk) assert.ok(String(schema[table].columns[lk[1]] || "").startsWith("lookup:"), table + ": " + c + " is a lookup");
    }
  }
});

test("deadline titles drop the record number the SharePoint Title led with", () => {
  assert.equal(deadlineTitle("344 | Annual Security Report (ASR) and Crime Statistics | 10/1/2026"), "Annual Security Report (ASR) and Crime Statistics | 10/1/2026");
  assert.equal(deadlineTitle("CF-3020 | Fire Safety Report", { code: "CF-3020" }), "Fire Safety Report", "the function's own code too");
  assert.equal(deadlineTitle("Title IX | Annual training"), "Title IX | Annual training", "a name with a bar is left alone");
  assert.equal(deadlineTitle("Publish Annual Security Report"), "Publish Annual Security Report");
  assert.equal(deadlineTitle(""), "");
  assert.equal(deadlineTitle("\uFEFF344 | Annual Security Report"), "Annual Security Report", "a leading byte-order mark");
  assert.equal(deadlineTitle("\u200B344\u00A0|\u00A0Annual Security Report"), "Annual Security Report", "zero-width and non-breaking spaces");
  assert.equal(deadlineTitle("344 \uFF5C Annual Security Report"), "Annual Security Report", "a full-width bar");
  assert.equal(deadlineTitle("#344 | Annual Security Report"), "Annual Security Report");
  assert.equal(deadlineTitle("344|Annual Security Report|10/1/2026"), "Annual Security Report|10/1/2026", "no spaces round the bar");
  assert.equal(deadlineTitle("344"), "", "a bare number falls back to the function name");
  const ds = buildDataset({
    functions: [{ id: 344, code: "344", name: "Clery Act", riskAreaId: 1 }], riskAreas: [{ id: 1, name: "Safety" }],
    deadlines: [{ id: 1, functionId: 344, title: "344 | Annual Security Report | 10/1/2026", base: new Date(2026, 9, 1), cadence: "Annual" }]
  }, { today: new Date(2026, 6, 1) });
  assert.equal(ds.allDeadlines[0].title, "Annual Security Report | 10/1/2026");
});

test("the administrator web role is the site's Administrators role, the same in both templates and the flow", () => {
  const role = t => (t.match(/AdminWebRole'\] \| default: '([^']*)'/) || [])[1];
  const page = readFileSync(new URL("../power-pages/compliance-matrix.webtemplate.liquid", import.meta.url), "utf8");
  const header = readFileSync(new URL("../power-pages/site-header.webtemplate.liquid", import.meta.url), "utf8");
  const flows = readFileSync(new URL("../../solution/schema/flows.yaml", import.meta.url), "utf8");
  assert.equal(role(page), "Administrators");
  assert.equal(role(header), "Administrators");
  assert.equal((flows.match(/^adminWebRole: (.*)$/m) || [])[1], "Administrators");
});
