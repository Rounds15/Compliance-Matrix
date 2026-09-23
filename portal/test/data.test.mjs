/* Data layer: deadline roll-forward parity with the canvas app, both
   adapters' mapping, and the model built on top. Run: npm test */

import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, cadenceMonths } from "../src/lib/deadlines.js";
import { addMonths, monthDiff, fiscalQ, toDay } from "../src/lib/dates.js";
import { normRisk } from "../src/lib/risk.js";
import { mapLists, LISTS } from "../src/data/adapters/sharepoint.js";
import { mapTables } from "../src/data/adapters/dataverse.js";
import { buildDataset, functionsFor, visibleDeadlines, NOBODY } from "../src/data/model.js";
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
  assert.equal(clery.code, "CF-3020");
  assert.equal(clery.owner.n, "Camila Ruiz");
  assert.equal(clery.chain.compliance.length, 2);            // junction wins over the fixed lookup
  assert.equal(clery.exec.n, "Marcus Delgado");              // no junction row: fixed lookup used
  assert.equal(clery.counsel.n, "Grace Whitfield");          // su_counselassignment for the risk area
  assert.equal(ds.fnById.get(G(203)).counsel.n, "Marcus Delgado"); // default escalation row
  const i9 = ds.fnById.get(G(202));
  assert.equal(i9.unitOwner.n, "Dwight Ferrell");
  assert.equal(ds.gaps.find(g => g.id === G(601)).severity, "High"); // Dataverse gaps carry their own severity
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
