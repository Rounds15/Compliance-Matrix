/* End-to-end: the built page against a mock Power Pages site, on both
   backends, as an administrator and as an ordinary owner. Every write the
   canvas app makes is driven through the UI and then checked in the backend
   store - column names, values, and which flow or permission carried it.

   Run: node test/e2e.mjs   (needs dist/ built and Chromium) */

import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { startPortal } from "./mock-portal.mjs";
import { DV_IDS as G } from "./fixtures.mjs";

const EXE = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
let passed = 0;
const results = [];

async function session(name, opts, body) {
  const portal = await startPortal(opts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
  const h = helpers(page);
  try {
    await page.goto(portal.url);
    await page.waitForSelector(".hm-hero", { timeout: 20000 });
    await body({ page, portal, ...h });
    assert.deepEqual(problems.filter(p => !/status of 40[03]/.test(p)), [], "no page errors");
    results.push("PASS  " + name);
    passed++;
  } catch (e) {
    await page.screenshot({ path: "/tmp/cm-e2e-failure.png", fullPage: true }).catch(() => { });
    results.push("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 6).join("\n      ") + (problems.length ? "\n      page: " + problems.join(" | ") : ""));
  } finally {
    await page.close();
    await portal.close();
  }
}

function helpers(page) {
  const go = async hash => { await page.evaluate(h => { window.location.hash = h; }, hash); await page.waitForTimeout(250); };
  /* wait for the toast this action raises - the previous one can still be
     on screen - and fail with whatever did appear */
  const toast = async re => {
    const t = page.locator(".cm-toast", { hasText: re });
    try { await t.waitFor({ timeout: 15000 }); }
    catch (e) { const shown = await page.locator(".cm-toast").allInnerTexts(); throw new Error("expected toast " + re + ", saw: " + JSON.stringify(shown)); }
    const text = await t.innerText();
    await page.waitForFunction(() => !document.querySelector("button[aria-busy=true]"), null, { timeout: 15000 });
    return text;
  };
  const btn = (text, scope = page) => scope.locator("button", { hasText: text }).first();
  const modal = () => page.locator(".cm-modal").last();
  return { go, toast, btn, modal };
}

/* ======================= SharePoint, administrator ======================= */
await session("SharePoint · administrator · every write", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn, modal }) => {
  const sp = portal.sp;
  const reads = portal.log.filter(x => x.flow === "read").map(x => x.request.list);
  assert.deepEqual([...new Set(reads)].sort(), ["Accountability Structure", "Compliance Directory", "Compliance Functions", "Deadlines", "Domains", "Flags List", "Gap List", "Risk Areas"]);
  assert.equal(reads.filter(l => l === "Accountability Structure").length, 4, "follows `next` through 7 rows at 2 a page");
  assert.equal(await page.locator(".hm-fig .hm-n").first().innerText(), "3");
  assert.equal(await page.locator(".cm-nav", { hasText: "Risk and Reporting" }).count(), 1);

  // flag (201 already carries an open flag, and a flagged record offers no second one)
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.equal(await btn("Flag for review").count(), 0);
  await go("#/functions/202");
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Citation changed in the 2026 rule.");
  await btn("Submit flag").click();
  await toast(/Flagged for review/);
  const flag = sp["Flags List"].at(-1);
  assert.equal(flag.FunctionId, 202); assert.equal(flag.field_1, "Citation changed in the 2026 rule.");
  assert.equal(flag.field_2, "Manual"); assert.equal(flag.field_3, false); assert.equal(flag.FlaggedById, 101);
  assert.equal(flag.RespondentEmail, "CRuiz@syr.edu", "the directory's email for the signed-in user");

  // gap
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  await page.locator(".rail-acts button", { hasText: "Log a gap" }).click();
  await page.locator(".fd-panel input").fill("Fire log not retained for 2025");
  await page.locator(".fd-panel textarea").fill("Retain the log for three years.");
  await btn("Log gap").click();
  await toast(/Gap logged/);
  const gap = sp["Gap List"].at(-1);
  assert.equal(gap.Title, "Fire log not retained for 2025"); assert.equal(gap.FunctionId, 201);
  assert.equal(gap.field_2, "Open"); assert.equal(gap.field_3, "Manual"); assert.equal(gap.field_6, "Retain the log for three years.");

  // complete, then reverse, a deadline
  await page.locator(".dlrow", { hasText: "Publish Annual Security Report" }).locator("button", { hasText: "Mark complete" }).click();
  await modal().locator("textarea").fill("ASR published Oct 1; link on file.");
  await btn("Mark complete", modal()).click();
  await toast(/marked complete/);
  let dl = sp.Deadlines.find(r => r.Id === 401);
  assert.ok(dl.field_4 && dl.field_7, "completion date and time written"); assert.equal(dl.field_5, "ASR published Oct 1; link on file.");
  assert.equal(dl.field_6, "Camila Ruiz");
  let arch = sp.Archive.at(-1);
  assert.equal(arch.field_1, "Deadline Completion"); assert.equal(arch.field_2, "Completed"); assert.equal(arch.field_4, 201);
  await page.locator(".dlrow", { hasText: "Publish Annual Security Report" }).locator(".pill.ok").waitFor();
  await page.locator(".dlrow", { hasText: "Publish Annual Security Report" }).locator("button", { hasText: "Reverse" }).click();
  await modal().locator("textarea").fill("Filed the wrong year.");
  await btn("Reverse completion", modal()).click();
  await toast(/reversed/);
  dl = sp.Deadlines.find(r => r.Id === 401);
  assert.equal(dl.field_4, null); assert.equal(dl.field_5, null);
  assert.equal(sp.Archive.at(-1).field_2, "Reversed");

  // edit the record
  await btn("Edit this record").click();
  await page.locator(".fldg", { hasText: "Statute" }).locator("input").first().fill("Jeanne Clery Disclosure Act");
  await btn("Save changes").click();
  await toast(/Changes saved/);
  const fn = sp["Compliance Functions"].find(r => r.Id === 201);
  assert.equal(fn.field_3, "Jeanne Clery Disclosure Act");
  assert.deepEqual(fn.field_5, { Description: "https://www.ed.gov/campus-safety", Url: "https://www.ed.gov/campus-safety" });
  assert.equal(fn.RiskAreaId, 1); assert.equal(fn.DomainId, 10); assert.equal(fn.field_11, "High");

  // ownership: add a unit owner, save the chain
  await btn("Manage people").click();
  await page.locator(".orole", { hasText: "Unit Owner" }).locator(".oadd").click();
  await page.locator(".opick input").fill("Whit");
  await page.locator(".opick-row", { hasText: "Andrea Whitaker" }).click();
  await btn("Save chain").click();
  await toast(/Ownership chain saved/);
  const chain = sp["Accountability Structure"].filter(r => r.FunctionId === 201);
  assert.equal(chain.length, 5);
  const unit = chain.find(r => r.field_3 === "Unit Owner");
  assert.equal(unit.PersonId, 102); assert.equal(unit.field_4, "Support");
  assert.equal(chain.find(r => r.field_3 === "General Counsel").field_4, null, "counsel has no sub-role");
  assert.ok(!chain.some(r => [301, 302, 303, 304].includes(r.Id)), "old rows replaced");

  // close a gap from the tracker
  await go("#/gaps");
  const card = page.locator(".cm-panel", { hasText: "I-9 Section 2 completed late" });
  await card.locator("button", { hasText: "Close" }).click();
  await modal().locator("textarea").fill("Hiring managers retrained; audit clean.");
  await btn("Mark closed", modal()).click();
  await toast(/Gap closed/);
  const closed = sp["Gap List"].find(r => r.Id === 601);
  assert.equal(closed.field_2, "Closed"); assert.equal(closed.field_14, "Hiring managers retrained; audit clean."); assert.equal(closed.ClosedById, 101);

  // resolve a flag
  await go("#/flags");
  await page.locator("text=Flagged for review (2)").waitFor();
  await page.locator("div", { hasText: /^Citation may be superseded\.$/ }).first().waitFor().catch(() => { });
  const row = page.locator(".cm-panel > div", { hasText: "Citation may be superseded." });
  await row.locator("button", { hasText: "Clear" }).click();
  await toast(/Flag cleared/);
  assert.equal(sp["Flags List"].find(r => r.Id === 501).field_3, true);
  const ar = sp.Archive.at(-1);
  assert.equal(ar.field_1, "Flag Resolution"); assert.equal(ar.field_7, 501); assert.equal(ar.field_11, "Dwight Ferrell");

  // directory: add from Entra through the find-person flow
  await go("#/directory");
  await btn("Add person").click();
  await modal().locator(".opick input").fill("Priya");
  await btn("Look up in Active Directory", modal()).click();
  await btn("Add to Compliance Directory", modal()).click();
  await toast(/added to the Compliance Directory/);
  const added = sp["Compliance Directory"].at(-1);
  assert.equal(added.Title, "Priya Raghavan"); assert.equal(added.field_1, "praghavan@syr.edu");

  // taxonomy
  await go("#/functions");
  await btn("Risk areas and domains").click();
  await modal().locator("select").first().selectOption("Domain");
  await modal().locator("select").nth(1).selectOption({ label: "Privacy" });
  await modal().locator("input").fill("Consumer Privacy");
  await btn("Add", modal()).click();
  await toast(/Domain added/);
  assert.deepEqual(sp.Domains.at(-1), { ...sp.Domains.at(-1), Title: "Consumer Privacy", RiskAreaId: 3 });
  await btn("Done", modal()).click();

  // new function
  await btn("New function").click();
  await page.waitForSelector("h1:has-text('New compliance function')");
  await page.locator(".fldg", { hasText: "Identification" }).locator("input").first().fill("Drug-Free Workplace Certification");
  await page.locator(".fldg", { hasText: "Identification" }).locator("select").nth(1).selectOption({ label: "Human Resources" });
  await page.locator(".fldg", { hasText: "Identification" }).locator("select").nth(2).selectOption({ label: "Employment Eligibility" });
  await btn("Create function").click();
  await toast(/added to the matrix/);
  const nf = sp["Compliance Functions"].at(-1);
  assert.equal(nf.Title, "Drug-Free Workplace Certification"); assert.equal(nf.RiskAreaId, 2); assert.equal(nf.DomainId, 11);
  assert.equal(nf.field_11, null, "unrated stays blank"); assert.equal(nf.field_5, null);
  await page.waitForFunction(id => window.location.hash === "#/functions/" + id, nf.Id);

  // delete a function and what it owns
  await go("#/functions/203");
  await page.waitForSelector("h1:has-text('HIPAA')");
  await btn("Delete function").click();
  await btn("Delete function", modal()).click();
  await toast(/Function deleted/);
  assert.equal(sp["Compliance Functions"].some(r => r.Id === 203), false);
  assert.equal(sp["Gap List"].some(r => r.FunctionId === 203), false);
  assert.equal(sp.Archive.at(-1).field_1, "Function Deleted");

  assert.ok(portal.log.filter(x => x.flow).every(x => x.flow !== "write"), "an administrator's writes all go through the admin flow");
});

/* ======================= SharePoint, owner ======================= */
await session("SharePoint · owner · member flow only, admin screens gated", { backend: "sharepoint", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal, go, toast, btn, modal }) => {
  assert.equal(await page.locator(".cm-nav", { hasText: "Risk and Reporting" }).count(), 0);
  assert.match(await page.locator(".util").innerText(), /Signed in as Dwight Ferrell/i);
  await go("#/gaps");
  await page.locator("text=Administrator access required").waitFor();
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.equal(await btn("Edit this record").count(), 0);
  assert.equal(await btn("Manage people").count(), 0);
  assert.equal(await btn("Delete function").count(), 0);
  await go("#/functions/202");
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Owner needs updating.");
  await btn("Submit flag").click();
  await toast(/Flagged for review/);
  assert.equal(portal.sp["Flags List"].at(-1).FlaggedById, 103);
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  await page.locator(".dlrow", { hasText: "Publish Annual Security Report" }).locator("button", { hasText: "Mark complete" }).click();
  await modal().locator("textarea").fill("Done by the unit.");
  await btn("Mark complete", modal()).click();
  await toast(/marked complete/);
  const flows = portal.log.filter(x => x.flow && x.flow !== "read").map(x => x.flow);
  assert.deepEqual([...new Set(flows)], ["write"], "an owner's writes go through the member flow");
  // deadlines: only the functions Dwight is in the chain for (201 and 202)
  await go("#/deadlines");
  await btn("List").click();
  await page.locator(".fbar select").first().selectOption("all");
  assert.equal(await page.locator(".dl-row").count(), 2);
});

/* The member flow's allow-list, called directly as a crafted request would be */
await session("SharePoint · member flow refuses administrator operations", { backend: "sharepoint", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal }) => {
  const r = await page.evaluate(async () => {
    const tok = (await (await fetch("/_layout/tokenhtml")).text()).match(/value="([^"]+)"/)[1];
    const call = async ops => (await fetch("/_api/cloudflow/v1.0/trigger/write", { method: "POST", headers: { "Content-Type": "application/json", __RequestVerificationToken: tok },
      body: JSON.stringify({ eventData: JSON.stringify({ request: JSON.stringify({ ops }) }) }) })).json();
    const del = await call([{ op: "delete", list: "Compliance Functions", id: 201 }]);
    const dueDate = await call([{ op: "update", list: "Deadlines", id: 401, fields: { field_1: "2030-01-01T00:00:00Z" } }]);
    const admin = await fetch("/_api/cloudflow/v1.0/trigger/admin", { method: "POST", headers: { "Content-Type": "application/json", __RequestVerificationToken: tok }, body: JSON.stringify({ eventData: JSON.stringify({ request: "{}" }) }) });
    const noToken = await fetch("/_api/cloudflow/v1.0/trigger/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { del: JSON.parse(del.result), dueDate: JSON.parse(dueDate.result), admin: admin.status, noToken: noToken.status };
  });
  assert.equal(r.del.ok, false); assert.match(r.del.error, /Not allowed/);
  assert.equal(r.dueDate.ok, true, "the op runs, stripped to the completion columns");
  assert.equal(portal.sp.Deadlines.find(d => d.Id === 401).field_1, "2025-10-01T04:00:00.000Z", "the due date is untouched");
  assert.equal(r.admin, 403); assert.equal(r.noToken, 403);
});

/* ======================= directory upkeep, view-as, exports ======================= */
await session("SharePoint · directory edit, replace, remove; view-as; exports", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn, modal }) => {
  const sp = portal.sp;
  await go("#/directory");
  await page.locator(".dir-table tr", { hasText: "Dwight Ferrell" }).click();
  await page.locator(".dir-rail-ft button", { hasText: "Edit" }).click();
  await modal().locator("input").first().fill("Dwight A. Ferrell");
  await btn("Save", modal()).click();
  await toast(/Directory record updated/);
  assert.equal(sp["Compliance Directory"].find(r => r.Id === 103).Title, "Dwight A. Ferrell");

  // hand Dwight's portfolio to Andrea
  const before = sp["Accountability Structure"].filter(r => r.PersonId === 103).map(r => r.Id);
  assert.equal(before.length, 2);
  await page.locator(".dir-rail-ft button", { hasText: "Replace" }).click();
  await modal().locator(".opick input").fill("Andrea");
  await modal().locator(".opick-row", { hasText: "Andrea Whitaker" }).click();
  await btn("Move 2 assignments", modal()).click();
  await toast(/now holds every role/);
  assert.deepEqual(sp["Accountability Structure"].filter(r => before.includes(r.Id)).map(r => r.PersonId), [102, 102]);

  // remove someone with no assignments left
  await page.locator(".dir-table tr", { hasText: "Dwight A. Ferrell" }).click();
  await page.locator(".dir-rail-ft button", { hasText: "Remove" }).click();
  assert.match(await modal().innerText(), /no ownership assignments/);
  await btn("Remove", modal()).click();
  await toast(/removed from the directory/);
  assert.equal(sp["Compliance Directory"].some(r => r.Id === 103), false);

  // taxonomy: a domain in use cannot be deleted; an empty one can
  await go("#/functions");
  await btn("Risk areas and domains").click();
  const privacy = modal().locator(".cm-panel", { hasText: "Privacy" });
  assert.equal(await privacy.locator("button", { hasText: "Delete" }).isDisabled(), true, "risk area with functions is locked");
  await privacy.locator(".chip", { hasText: "Health Information" }).locator(".orm").click();
  await btn("Delete", modal()).click();
  await toast(/Domain deleted/);
  assert.equal(sp.Domains.some(r => r.Id === 12), false);
  await btn("Done", modal()).click();

  // view as a person: admin screens and admin actions disappear, writes still made as the admin
  await page.locator(".util-role select").selectOption({ label: "Camila Ruiz" });
  assert.equal(await page.locator(".cm-nav", { hasText: "Risk and Reporting" }).count(), 0);
  await go("#/gaps");
  await page.locator("text=previewing the page as someone without administrator rights").waitFor();
  await page.locator(".util-role select").selectOption("self");
  assert.equal(await page.locator(".cm-nav", { hasText: "Risk and Reporting" }).count(), 1);

  // exports are real files
  await go("#/reporting");
  await btn("Exports").click();
  const grab = async title => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".cm-panel", { hasText: title }).locator("button").click()]);
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    return { name: dl.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
  };
  const csv = await grab("Full matrix");
  assert.equal(csv.name, "compliance-matrix.csv");
  assert.match(csv.text, /^\uFEFFFunction ID,Compliance Function,Risk Area/);
  assert.match(csv.text, /"20 U\.S\.C\. § 1092\(f\)"|20 U\.S\.C\. § 1092\(f\)/);
  assert.equal(csv.text.trim().split("\r\n").length, 1 + sp["Compliance Functions"].length);
  const ics = await grab("Deadline calendar");
  assert.match(ics.text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics.text, /DTSTART;VALUE=DATE:\d{8}/);
  assert.match(ics.text, /END:VCALENDAR$/);
});

/* ======================= Dataverse, administrator ======================= */
await session("Dataverse · administrator · every write", { backend: "dataverse", admin: true }, async ({ page, portal, go, toast, btn, modal }) => {
  const dv = portal.dv;
  assert.equal(await page.locator(".hm-fig .hm-n").first().innerText(), "3");
  assert.ok(portal.log.some(x => x.api && /skiptoken/.test(x.api)), "follows @odata.nextLink");

  await go("#/functions/" + G(201));
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.match(await page.locator(".fd-tags").innerText(), /CF-3020/);
  assert.match(await page.locator(".rail-card.gc").innerText(), /Grace Whitfield/);

  assert.equal(await btn("Flag for review").count(), 0, "already flagged");
  await go("#/functions/" + G(202));
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Check the 2026 amendment.");
  await btn("Submit flag").click();
  await toast(/Flagged for review/);
  await go("#/functions/" + G(201));
  await page.waitForSelector("h1:has-text('Clery Act')");
  const flag = dv.su_functionflags.at(-1);
  assert.equal(flag._su_function_value, G(202)); assert.equal(flag._su_flaggedby_value, G(101));
  assert.equal(flag.su_status, 100000050); assert.equal(flag.su_source, 100000110);

  await page.locator(".rail-acts button", { hasText: "Log a gap" }).click();
  await page.locator(".fd-panel input").fill("Timely warning not issued");
  await btn("Log gap").click();
  await toast(/Gap logged/);
  const gap = dv.su_compliancegaps.at(-1);
  assert.equal(gap.su_status, 100000020); assert.equal(gap.su_severity, 100000001); assert.equal(gap._su_owner_value, G(101));

  await page.locator(".dlrow", { hasText: "Publish Annual Security Report" }).locator("button", { hasText: "Mark complete" }).click();
  await modal().locator("textarea").fill("Published.");
  await btn("Mark complete", modal()).click();
  await toast(/marked complete/);
  const dl = dv.su_compliancedeadlines.find(r => r.su_compliancedeadlineid === G(401));
  assert.match(dl.su_completeddate, /^\d{4}-\d{2}-\d{2}$/); assert.match(dl.su_notes, /Completed: Published\./);
  await page.locator(".dlrow", { hasText: "Publish Annual Security Report" }).locator(".pill.ok").waitFor();

  await btn("Edit this record").click();
  const id = page.locator(".fldg", { hasText: "Identification" });
  await id.locator("select").first().selectOption({ label: "Moderate" });
  await id.locator("select").nth(2).selectOption({ label: "Select a domain" });
  await btn("Save changes").click();
  await toast(/Changes saved/);
  const fn = dv.su_compliancefunctions.find(r => r.su_compliancefunctionid === G(201));
  assert.equal(fn.su_risk, 100000002); assert.equal(fn._su_domain_value, null, "cleared lookup through $ref");

  await btn("Manage people").click();
  await page.locator(".orole", { hasText: "Unit Owner" }).locator(".oadd").click();
  await page.locator(".opick input").fill("Andrea");
  await page.locator(".opick-row", { hasText: "Andrea Whitaker" }).click();
  await page.locator(".orole", { hasText: "Compliance Owner" }).locator(".operson", { hasText: "Dwight Ferrell" }).locator(".orm").click();
  await btn("Save chain").click();
  await toast(/Ownership chain saved/);
  const rows = dv.su_functionownerships.filter(r => r._su_function_value === G(201));
  assert.deepEqual(rows.map(r => [r._su_person_value, r.su_role, r.su_subrole]).sort(), [
    [G(100), 100000030, 100000040], [G(101), 100000032, 100000040], [G(102), 100000031, 100000042]].sort());
  assert.equal(fn._su_unitowner_value, G(102), "fixed lookup follows the role's person");

  await go("#/gaps");
  await page.locator(".cm-panel", { hasText: "I-9 Section 2 completed late" }).locator("button", { hasText: "Close" }).click();
  await modal().locator("textarea").fill("Resolved.");
  await btn("Mark closed", modal()).click();
  await toast(/Gap closed/);
  const g = dv.su_compliancegaps.find(r => r.su_compliancegapid === G(601));
  assert.equal(g.su_status, 100000021); assert.equal(g.su_closenote, "Resolved."); assert.equal(g._su_closedby_value, G(101));

  await go("#/flags");
  await page.locator(".cm-panel > div", { hasText: "Citation may be superseded." }).locator("button", { hasText: "Clear" }).click();
  await toast(/Flag cleared/);
  assert.equal(dv.su_functionflags.find(r => r.su_functionflagid === G(501)).su_status, 100000051);

  await go("#/directory");
  await btn("Add person").click();
  await modal().locator(".opick input").fill("Jordan Lee");
  assert.equal(await btn("Look up in Active Directory", modal()).count(), 0, "no Entra lookup on Dataverse");
  await btn("Enter name and email", modal()).click();
  await modal().locator(".opick-ad input").nth(1).fill("jlee@syr.edu");
  await btn("Add to Compliance Directory", modal()).click();
  await toast(/added to the Compliance Directory/);
  const p = dv.su_compliancedirectorys.at(-1);
  assert.equal(p.su_name, "Jordan Lee"); assert.equal(p.su_email, "jlee@syr.edu"); assert.equal(p.su_active, true);

  await go("#/functions/" + G(203));
  await page.waitForSelector("h1:has-text('HIPAA')");
  await btn("Delete function").click();
  assert.match(await modal().innerText(), /Dataverse auditing/);
  await btn("Delete function", modal()).click();
  await toast(/Function deleted/);
  assert.equal(dv.su_compliancefunctions.some(r => r.su_compliancefunctionid === G(203)), false);
  assert.equal(dv.su_compliancegaps.some(r => r._su_function_value === G(203)), false, "cascade");
});

/* ======================= Dataverse, owner ======================= */
await session("Dataverse · owner · permitted writes succeed, admin UI absent", { backend: "dataverse", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal, go, toast, btn }) => {
  assert.equal(await page.locator(".cm-nav", { hasText: "Risk and Reporting" }).count(), 0);
  await go("#/functions/" + G(202));
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Unit owner changed.");
  await btn("Submit flag").click();
  await toast(/Flagged for review/);
  assert.equal(portal.dv.su_functionflags.at(-1)._su_flaggedby_value, G(103));
});

/* ======================= failure is visible, not silent ======================= */
await session("A write the backend rejects is reported, and nothing changes", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn }) => {
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  const before = portal.sp["Compliance Functions"].find(r => r.Id === 201).Title;
  portal.sp["Compliance Functions"].find(r => r.Id === 201).__lock = true;
  delete portal.sp["Risk Areas"][0].Id; // the risk-area lookup now points at nothing
  await btn("Edit this record").click();
  await page.locator(".fldg", { hasText: "Identification" }).locator("input").first().fill("Renamed");
  await btn("Save changes").click();
  const t = await toast(/points at missing Risk Areas item/);
  assert.ok(t);
  assert.equal(portal.sp["Compliance Functions"].find(r => r.Id === 201).Title, before);
  assert.equal(await page.locator(".cm-toast.err").count(), 1);
});

await browser.close();
console.log(results.join("\n"));
console.log(`\n${passed} of ${results.length} end-to-end sessions passed.`);
process.exit(passed === results.length ? 0 : 1);
