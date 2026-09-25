/* End-to-end: the built page against a mock Power Pages site, on both
   backends, as an administrator and as an ordinary owner. Every write the
   canvas app makes is driven through the UI and then checked in the backend
   store: column names, values, and which flow or permission carried it.
   The header, view modes and access rules of the parity spec are checked on
   the way.

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
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const problems = [];
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
  const h = helpers(page);
  try {
    await page.goto(portal.url);
    await page.waitForSelector(".hm-band", { timeout: 20000 });
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
  /* wait for the toast this action raises (the previous one can still be on
     screen), then for every write to settle; fail with whatever did appear */
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
  /* the "Viewing as" select: "Admin", "User", or "p:<person id>" */
  const view = async value => { await page.selectOption(".util-role select", value); await page.waitForTimeout(150); };
  const fig = async i => page.locator(".hm-fig .hm-n").nth(i).textContent();
  const text = loc => loc.textContent().then(t => t.trim());
  /* pick someone in the ownership or directory person picker */
  const pick = async (scope, q, name) => {
    await scope.locator(".opick-s input").fill(q);
    await scope.locator(".opick-row", { hasText: name }).first().click();
  };
  return { go, toast, btn, modal, view, fig, text, pick };
}

const grab = async (page, click) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
};

/* ======================= SharePoint, administrator ======================= */
await session("SharePoint · administrator · header, view modes, every write", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn, modal, view, fig, text, pick }) => {
  const sp = portal.sp;
  const reads = portal.log.filter(x => x.flow === "read").map(x => x.request.list);
  assert.deepEqual([...new Set(reads)].sort(), ["Accountability Structure", "Compliance Directory", "Compliance Functions", "Deadlines", "Domains", "Flags List", "Gap List", "Risk Areas"]);
  assert.equal(reads.filter(l => l === "Accountability Structure").length, 4, "follows `next` through 7 rows at 2 a page");

  // header (spec 1): utility links, the admin-only view select, four nav items
  assert.deepEqual(await page.locator(".util-in > a").allTextContents(), ["Portal Home", "Compliance Home Page", "Policies", "Definitions", "Report a Concern"]);
  assert.equal(await page.locator(".util-in a", { hasText: "Compliance Home Page" }).getAttribute("href"), "https://finance.syr.edu/office-of-compliance/");
  assert.equal(await page.locator(".util-role select").inputValue(), "User", "default mode is User");
  assert.deepEqual(await page.locator(".cm-nav .navbtn").allTextContents(), ["Home", "Browse", "Risk and Reporting", "Executive Team"]);
  assert.equal(await page.locator(".backbtn").count(), 0, "no Back on Home");

  // Home figures are the viewer's own (Camila: function 201 only)
  assert.equal(await fig(0), "1"); assert.equal(await fig(1), "1");
  assert.match(await page.locator(".hm-asof").innerText(), /^As of [A-Z][a-z]+ \d{1,2}, \d{4}\nFY\d\d Q[1-4]$/);
  assert.equal(await text(page.locator(".hm-card .hm-cm").nth(3)), "Restricted");

  // Risk Dashboard is restricted outside Admin view; Admin view opens it
  await go("#/risk");
  await page.locator("text=Administrator access required").waitFor();
  await view("Admin");
  await page.locator("h1", { hasText: "Compliance Risk Dashboard" }).waitFor();
  assert.equal(await text(page.locator(".stat .n").first()), "1", "one High function, computed");
  assert.equal(await text(page.locator(".stat .s").first()), "33% of the matrix");
  await go("#/");
  assert.equal(await fig(0), "1", "Home stays the viewer's own in Admin view");
  assert.equal(await text(page.locator(".hm-card .hm-cm").nth(3)), "Administrator");

  // Browse menu and outside click
  await page.locator(".navbtn", { hasText: "Browse" }).click();
  assert.deepEqual(await page.locator(".menu .mi-t").allTextContents(), ["Compliance Functions", "Deadlines", "Directory"]);
  await page.mouse.click(40, 700);
  assert.equal(await page.locator(".menu").count(), 0, "outside click closes the menu");
  await page.locator(".navbtn", { hasText: "Risk and Reporting" }).click();
  assert.equal(await text(page.locator(".menu .mi", { hasText: "Gap Tracker" }).locator(".gapbadge")), "2", "Admin view: every open gap");
  await page.mouse.click(40, 700);

  // a link into a filtered list, as the site header's search makes
  await go("#/functions?q=HIPAA");
  await page.locator(".mx-chips .count", { hasText: "1 of 3 functions" }).waitFor();
  await page.locator(".mx-chip").click();

  // navigation extras: quick jump, the breadcrumb, facets, the footer
  await page.keyboard.press("Control+k");
  await page.locator(".pal input").fill("I-9");
  assert.equal(await text(page.locator(".pal-i.on b")), "Form I-9 Employment Verification");
  await page.keyboard.press("Enter");
  await page.waitForSelector("h1:has-text('Form I-9')");
  assert.deepEqual(await page.locator(".fd-crumb-in > button, .fd-crumb-in > .crumb-here").allTextContents(), ["All functions", "Human Resources", "Form I-9 Employment Verification"]);
  await page.locator(".crumb-link", { hasText: "Human Resources" }).click();
  await page.locator(".mx-chips .count", { hasText: "1 of 3 functions" }).waitFor();
  await page.locator(".mx-chip", { hasText: "Risk area: Human Resources" }).click();
  await page.locator(".mx-facet", { hasText: /^High/ }).click();
  assert.equal(await text(page.locator(".mx-chips .count")), "1 of 3 functions");
  await page.locator(".mx-chip").click();
  assert.equal(await text(page.locator(".mx-chips .count")), "3 functions");
  await page.locator(".ftr a", { hasText: "Executive Team" }).click();
  await page.locator("h1", { hasText: "Executive Team" }).waitFor();
  assert.equal(await text(page.locator(".backbar .sub").last()), "Executive Team");
  await page.keyboard.press("/");
  await page.locator(".pal input").fill("whitaker");
  await page.keyboard.press("Enter");
  await page.locator(".dir-rail h2", { hasText: "Andrea Whitaker" }).waitFor();

  // flag
  await go("#/functions/202");
  await page.waitForSelector("h1:has-text('Form I-9')");
  assert.equal(await page.locator(".crumb-back").count(), 1);
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Citation changed in the 2026 rule.");
  await btn("Submit flag").click();
  await toast(/Flag submitted to the compliance office/);
  const flag = sp["Flags List"].at(-1);
  assert.equal(flag.FunctionId, 202); assert.equal(flag.field_1, "Citation changed in the 2026 rule.");
  assert.equal(flag.field_2, "Manual"); assert.equal(flag.field_3, false); assert.equal(flag.FlaggedById, 101);
  assert.equal(flag.RespondentEmail, "CRuiz@syr.edu", "the directory's email for the signed-in user");

  // gap
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.match(await page.locator(".rail-card").first().innerText(), /Last reviewed\s+May 1, 2026/, "LastAssessedDate, not today");
  await btn("Log a gap").click();
  await page.locator(".fd-panel input").fill("Fire log not retained for 2025");
  await page.locator(".fd-panel textarea").fill("Retain the log for three years.");
  await btn("Log gap").click();
  await toast(/Gap logged and routed/);
  const gap = sp["Gap List"].at(-1);
  assert.equal(gap.Title, "Fire log not retained for 2025"); assert.equal(gap.FunctionId, 201);
  assert.equal(gap.field_2, "Open"); assert.equal(gap.field_3, "Manual"); assert.equal(gap.field_6, "Retain the log for three years.");

  // complete, then reverse, the function's deadline (spec 2.13)
  await btn("Mark complete for this cycle").click();
  assert.equal(await text(modal().locator(".mhd .eyebrow")), "Mark deadline complete");
  assert.equal(await btn("Confirm", modal()).isDisabled(), true, "a reason is required");
  await modal().locator("textarea").fill("ASR published Oct 1; link on file.");
  await btn("Confirm", modal()).click();
  await toast(/Deadline marked complete/);
  let dl = sp.Deadlines.find(r => r.Id === 401);
  assert.ok(dl.field_4 && dl.field_7, "completion date and time written"); assert.equal(dl.field_5, "ASR published Oct 1; link on file.");
  assert.equal(dl.field_6, "Camila Ruiz");
  const arch = sp.Archive.at(-1);
  assert.equal(arch.field_1, "Deadline Completion"); assert.equal(arch.field_2, "Completed"); assert.equal(arch.field_4, 201);
  await btn("Mark complete for this cycle").click();
  assert.equal(await text(modal().locator(".mhd .eyebrow")), "Reverse completion");
  await modal().locator("textarea").fill("Filed the wrong year.");
  await btn(/^Reverse$/, modal()).click();
  await toast(/Completion reversed/);
  dl = sp.Deadlines.find(r => r.Id === 401);
  assert.equal(dl.field_4, null); assert.equal(dl.field_5, null);
  assert.equal(sp.Archive.at(-1).field_2, "Reversed");

  // calendar file for this function's deadlines
  const ics = await grab(page, () => btn("Add to my calendar").click());
  assert.match(ics.text, /^BEGIN:VCALENDAR\r\n/); assert.match(ics.text, /SUMMARY:Compliance deadline: Clery Act/);
  assert.match(ics.text, /DTSTART;VALUE=DATE:\d{8}/); assert.match(ics.text, /END:VCALENDAR$/);

  // edit the record
  await btn("Edit this record").click();
  await page.locator("h1", { hasText: "Editing - Clery Act" }).waitFor();
  await page.locator("#fd-statute").fill("Jeanne Clery Disclosure Act");
  await btn("Save changes").click();
  await toast(/Changes saved to the matrix/);
  await page.locator("h1", { hasText: /^Clery Act Annual Security Report$/ }).waitFor();
  const fn = sp["Compliance Functions"].find(r => r.Id === 201);
  assert.equal(fn.field_3, "Jeanne Clery Disclosure Act");
  assert.deepEqual(fn.field_5, { Description: "https://www.ed.gov/campus-safety", Url: "https://www.ed.gov/campus-safety" });
  assert.equal(fn.RiskAreaId, 1); assert.equal(fn.DomainId, 10); assert.equal(fn.field_11, "High");

  // and its Accountability Structure, with Manage people
  await btn("Manage people").click();
  assert.equal(await btn("Save chain").isDisabled(), true, "nothing to save yet");
  await page.locator(".orole.unit .oadd").click();
  await page.locator(".orole.unit .opick-r select").selectOption("Advisory");
  await pick(page.locator(".orole.unit"), "Andrea", "Andrea Whitaker");
  await page.locator(".orole.support .oadd").click();
  await pick(page.locator(".orole.support"), "Marcus", "Marcus Delgado");
  await btn("Save chain").click();
  await toast(/Ownership chain saved/);
  const chain = sp["Accountability Structure"].filter(r => r.FunctionId === 201);
  assert.equal(chain.length, 6);
  const unit = chain.find(r => r.field_3 === "Unit Owner");
  assert.equal(unit.PersonId, 102); assert.equal(unit.field_4, "Advisory");
  assert.equal(chain.find(r => r.field_3 === "Support").PersonId, 100);
  assert.equal(chain.find(r => r.PersonId === 103).field_4, "Support", "a legacy sub-role is kept as it was");
  assert.equal(chain.find(r => r.field_3 === "General Counsel").PersonId, 104, "General Counsel kept");
  assert.equal(chain.find(r => r.field_3 === "General Counsel").field_4, null, "counsel has no sub-role");
  assert.ok(!chain.some(r => [301, 302, 303, 304].includes(r.Id)), "old rows replaced");
  await page.locator(".orole.unit .operson", { hasText: "Andrea Whitaker" }).waitFor();

  // close a gap from the tracker (Admin view shows every gap)
  await go("#/gaps");
  assert.equal(await text(page.locator(".stat .s")), "How long it typically takes to close a gap");
  const card = page.locator(".gcard2", { hasText: "I-9 Section 2 completed late" });
  assert.match(await text(card.locator(".sub").first()), /^GAP-601 · \d+d open$/);
  assert.equal(await text(card.locator(".risk")), "Not rated", "unrated function");
  await card.locator("button", { hasText: "Close" }).click();
  await modal().locator("textarea").fill("Late forms re-verified.");
  await btn("Close gap", modal()).click();
  await toast(/Gap closed/);
  const closed = sp["Gap List"].find(r => r.Id === 601);
  assert.equal(closed.field_2, "Closed"); assert.ok(closed.field_13); assert.equal(closed.ClosedById, 101);

  // resolve a flag
  await go("#/flags");
  await page.locator(".fl-list .srow", { hasText: "Clery Act" }).click();
  const entry = page.locator(".fl-entry", { hasText: "Citation may be superseded." });
  assert.match(await entry.innerText(), /Flagged by Dwight Ferrell on Sep 18, 2026/);
  await entry.locator("button", { hasText: "Resolve" }).click();
  await toast(/Flag resolved/);
  assert.equal(sp["Flags List"].find(r => r.Id === 501).field_3, true);
  const ar = sp.Archive.at(-1);
  assert.equal(ar.field_1, "Flag Resolution"); assert.equal(ar.field_7, 501); assert.equal(ar.field_11, "Dwight Ferrell");

  // directory: add from Entra through the find-person flow
  await go("#/directory");
  await btn("Add person").click();
  await modal().locator(".opick-s input").fill("Priya");
  await btn("Search the university directory", modal()).click();
  await modal().locator(".opick-row.static", { hasText: "Priya Raghavan" }).locator("button", { hasText: "Add" }).click();
  await toast(/added to the Compliance Directory/);
  const added = sp["Compliance Directory"].at(-1);
  assert.equal(added.Title, "Priya Raghavan"); assert.equal(added.field_1, "praghavan@syr.edu");
  assert.equal(await page.locator(".cm-modal").count(), 0, "the dialog closes once they are added");
  await page.locator(".dir-table tr", { hasText: "Priya Raghavan" }).waitFor();

  // taxonomy
  await go("#/functions");
  await page.locator(".mx-railadd").click();
  await modal().locator("#tax-kind").selectOption("Domain");
  await modal().locator("#tax-parent").selectOption({ label: "Privacy" });
  await modal().locator("#tax-name").fill("Consumer Privacy");
  await btn("Add domain", modal()).click();
  await toast(/Domain created: Consumer Privacy/);
  assert.deepEqual(sp.Domains.at(-1), { ...sp.Domains.at(-1), Title: "Consumer Privacy", RiskAreaId: 3 });
  await modal().locator("#tax-name").fill("consumer privacy");
  assert.match(await modal().innerText(), /That domain already exists under Privacy\./);
  await btn("Done", modal()).click();

  // new function
  await btn("Add new function").click();
  await page.waitForSelector(".crumb-here:has-text('New function')");
  assert.equal(await text(page.locator(".fd-head .eyebrow")), "Administrator · New record");
  await btn("Create function").click();
  await toast(/Function name, risk area, and domain are all required/);
  await page.locator("#fd-name").fill("Drug-Free Workplace Certification");
  await page.locator("#fd-topic").selectOption({ label: "Human Resources" });
  await page.locator("#fd-area").selectOption({ label: "Employment Eligibility" });
  await btn("Create function").click();
  await toast(/New function created and added to the matrix/);
  const nf = sp["Compliance Functions"].at(-1);
  assert.equal(nf.Title, "Drug-Free Workplace Certification"); assert.equal(nf.RiskAreaId, 2); assert.equal(nf.DomainId, 11);
  assert.equal(nf.field_11, null, "Not Scored stays blank"); assert.equal(nf.field_5, null);
  await page.waitForFunction(id => window.location.hash === "#/functions/" + id, nf.Id);

  // delete a function: every child archived first, then removed
  await go("#/functions/203");
  await page.waitForSelector("h1:has-text('HIPAA')");
  await btn("Delete this function").click();
  const said = await modal().innerText();
  assert.match(said, /0 deadline\(s\)\s+1 gap\(s\)\s+0 flag\(s\)/);
  assert.match(said, /A copy of each is written to the archive first\. This cannot be undone\./);
  const archBefore = sp.Archive.length;
  await btn("Delete permanently", modal()).click();
  await toast(/Function deleted and archived/);
  assert.equal(sp["Compliance Functions"].some(r => r.Id === 203), false);
  assert.equal(sp["Gap List"].some(r => r.FunctionId === 203), false);
  const copies = sp.Archive.slice(archBefore);
  assert.deepEqual(copies.map(a => [a.field_1, a.field_4, a.field_7, a.field_8]), [
    ["Function Deleted", 203, 603, "Gap: Old gap"],
    ["Function Deleted", 203, 203, "Function record deleted"]], "the app's Archive copies, children first");

  assert.ok(portal.log.filter(x => x.flow).every(x => x.flow !== "write"), "an administrator's writes all go through the admin flow");
});

/* ======================= SharePoint, owner ======================= */
await session("SharePoint · owner · own scope, member flow only, admin UI absent", { backend: "sharepoint", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal, go, toast, btn, modal, fig, text }) => {
  assert.equal(await page.locator(".util-role select").count(), 0, "the view select is for administrators only");
  assert.equal(await fig(0), "2", "Dwight appears on 201 and 202");
  assert.match(await page.locator(".hm-acts").innerText(), /Open gaps \(2\)/);

  await page.locator(".navbtn", { hasText: "Risk and Reporting" }).click();
  assert.equal(await text(page.locator(".menu .mi", { hasText: "Gap Tracker" }).locator(".gapbadge")), "2");
  await page.locator(".menu .mi", { hasText: "Flagged Items" }).click();
  await page.locator("text=Administrator access required").waitFor();
  await go("#/risk");
  await page.locator("text=Administrator access required").waitFor();
  await go("#/reporting");
  await page.locator("text=Administrator access required").waitFor();

  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.equal(await btn("Edit this record").count(), 0);
  assert.equal(await btn("Delete this function").count(), 0);
  assert.equal(await btn("Manage people").count(), 0);
  assert.equal(await text(page.locator(".fd-tags .risk")), "High", "owners see the rating");
  await go("#/functions");
  assert.equal(await btn("Add new function").count(), 0);
  assert.equal(await page.locator(".mx-railadd").count(), 0);
  await go("#/directory");
  assert.equal(await btn("Add person").count(), 0);
  assert.equal(await page.locator(".dir-rail button", { hasText: "Reassign" }).count(), 0);

  await go("#/functions/202");
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Owner needs updating.");
  await btn("Submit flag").click();
  await toast(/Flag submitted/);
  assert.equal(portal.sp["Flags List"].at(-1).FlaggedById, 103);

  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  await btn("Mark complete for this cycle").click();
  await modal().locator("textarea").fill("Done by the unit.");
  await btn("Confirm", modal()).click();
  await toast(/Deadline marked complete/);

  // an owner closes a gap on their own function through the member flow
  await go("#/gaps");
  assert.equal(await page.locator(".gcard2").count(), 2, "the open gap on 202 and the one in progress on 201");
  assert.equal(await text(page.locator(".gcard2", { hasText: "Fire log" }).locator(".pill.due")), "In Progress");
  await page.locator(".gcard2", { hasText: "I-9 Section 2" }).locator("button", { hasText: "Close" }).click();
  await btn("Close gap", modal()).click();
  await toast(/Gap closed/);
  assert.equal(portal.sp["Gap List"].find(r => r.Id === 601).field_2, "Closed");
  assert.equal(portal.sp["Gap List"].find(r => r.Id === 601).ClosedById, 103);

  const flows = portal.log.filter(x => x.flow && x.flow !== "read").map(x => x.flow);
  assert.deepEqual([...new Set(flows)], ["write"], "an owner's writes go through the member flow");

  // deadlines: only Dwight's functions (201 and 202)
  await go("#/deadlines");
  await btn(/^List$/).click();
  await page.selectOption(".fbar select[aria-label=Scope]", "all");
  assert.equal(await page.locator(".dl-table tbody tr").count(), 2);
  assert.match(await page.locator(".dl-table tbody tr").first().locator("td").first().innerText(), /^[A-Z][a-z]{2} \d{1,2}, \d{4}\nFY\d\d Q[1-4]$/);
});

/* The member flow's allow-list, called directly as a crafted request would be */
await session("SharePoint · member flow refuses administrator operations", { backend: "sharepoint", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal }) => {
  const r = await page.evaluate(async () => {
    const tok = (await (await fetch("/_layout/tokenhtml")).text()).match(/value="([^"]+)"/)[1];
    const call = async ops => (await fetch("/_api/cloudflow/v1.0/trigger/write", { method: "POST", headers: { "Content-Type": "application/json", __RequestVerificationToken: tok },
      body: JSON.stringify({ eventData: JSON.stringify({ request: JSON.stringify({ ops }) }) }) })).json();
    const del = await call([{ op: "delete", list: "Compliance Functions", id: 201 }]);
    const dueDate = await call([{ op: "update", list: "Deadlines", id: 401, fields: { field_1: "2030-01-01T00:00:00Z" } }]);
    const retitle = await call([{ op: "update", list: "Gap List", id: 602, fields: { Title: "Nothing to see", field_2: "Open" } }]);
    const admin = await fetch("/_api/cloudflow/v1.0/trigger/admin", { method: "POST", headers: { "Content-Type": "application/json", __RequestVerificationToken: tok }, body: JSON.stringify({ eventData: JSON.stringify({ request: "{}" }) }) });
    const noToken = await fetch("/_api/cloudflow/v1.0/trigger/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { del: JSON.parse(del.result), dueDate: JSON.parse(dueDate.result), retitle: JSON.parse(retitle.result), admin: admin.status, noToken: noToken.status };
  });
  assert.equal(r.del.ok, false); assert.match(r.del.error, /Not allowed/);
  assert.equal(r.dueDate.ok, true, "the op runs, stripped to the completion columns");
  assert.equal(portal.sp.Deadlines.find(d => d.Id === 401).field_1, "2025-10-01T04:00:00.000Z", "the due date is untouched");
  const g = portal.sp["Gap List"].find(x => x.Id === 602);
  assert.equal(g.Title, "Fire log not retained", "a gap update cannot retitle"); assert.equal(g.field_2, "Closed", "it can only close");
  assert.equal(r.admin, 403); assert.equal(r.noToken, 403);
});

/* ======================= directory upkeep, view as ======================= */
await session("SharePoint · directory edit, reassign, remove; view as a user", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn, modal, view, fig, text, pick }) => {
  const sp = portal.sp;

  // View as a specific person: the "me" figures follow them
  await view("p:103");
  assert.equal(await fig(0), "2");
  assert.match(await page.locator(".sec-h", { hasText: "Assigned to you" }).innerText(), /Dwight Ferrell/);
  await go("#/functions/203");
  await page.waitForSelector("h1:has-text('HIPAA')");
  assert.equal(await page.locator(".fd-tags .risk").count(), 0, "not Dwight's function, not Admin view: no rating");
  await view("User");

  await go("#/directory");
  assert.equal(await text(page.locator(".dir-toolbar .count")), "5 people");
  await page.locator(".dir-table tr", { hasText: "Dwight Ferrell" }).click();
  assert.equal(await text(page.locator(".dir-rail .dir-role")), "Compliance Owner");
  await page.locator(".dir-rail button", { hasText: "Edit" }).click();
  await modal().locator("#pe-name").fill("Dwight A. Ferrell");
  assert.match(await modal().innerText(), /This person owns 2 function\(s\)\. Renaming is safe now, because ownership is by reference\./);
  await btn("Save changes", modal()).click();
  await toast(/^Saved\.$/);
  assert.equal(sp["Compliance Directory"].find(r => r.Id === 103).Title, "Dwight A. Ferrell");

  // a person who still owns functions cannot be removed; the dialog offers Reassign
  await page.locator(".dir-rail button", { hasText: "Remove" }).click();
  assert.match(await modal().innerText(), /Cannot remove Dwight A\. Ferrell\. They still own 2 function\(s\)\. Reassign their ownership first\./);
  await btn("Reassign ownership", modal()).click();
  assert.match(await modal().innerText(), /2 of 2 selected/);
  await pick(modal(), "Andrea", "Andrea Whitaker");
  assert.match(await modal().innerText(), /Move 2 function\(s\) from Dwight A\. Ferrell to Andrea Whitaker\. Where Andrea Whitaker already holds a role, it will not be duplicated\./);
  await btn(/^Reassign$/, modal()).click();
  await toast(/Dwight A\. Ferrell no longer owns any functions\./);
  assert.equal(sp["Accountability Structure"].find(r => r.Id === 303).PersonId, 102);
  assert.equal(sp["Accountability Structure"].find(r => r.Id === 306).PersonId, 102);
  assert.equal(sp["Accountability Structure"].some(r => r.PersonId === 103), false);

  // now he can be removed
  await page.locator(".dir-rail button", { hasText: "Remove" }).click();
  assert.match(await modal().innerText(), /owns no functions/);
  await btn(/^Remove$/, modal()).click();
  await toast(/removed from the directory/);
  assert.equal(sp["Compliance Directory"].some(r => r.Id === 103), false);

  // taxonomy: a risk area with functions cannot be deleted; an empty domain can
  await go("#/functions");
  await page.locator(".mx-railadd").click();
  const privacy = modal().locator(".tax-area", { hasText: "Privacy" }).first().locator("button", { hasText: "Delete" }).first();
  assert.equal(await privacy.isDisabled(), true);
  assert.equal(await privacy.getAttribute("title"), "Cannot delete Privacy. 1 function(s). 1 domain(s). Reassign the children first.");
  await modal().locator("button[aria-label='Delete Health Information']").click();
  await btn(/^Delete$/, modal()).click();
  await toast(/Domain deleted/);
  assert.equal(sp.Domains.some(r => r.Id === 12), false);
});

/* ======================= Dataverse, administrator ======================= */
await session("Dataverse · administrator · every write", { backend: "dataverse", admin: true }, async ({ page, portal, go, toast, btn, modal, view, fig, pick }) => {
  const dv = portal.dv;
  assert.equal(await fig(0), "1");
  assert.ok(portal.log.some(x => x.api && /skiptoken/.test(x.api)), "follows @odata.nextLink");

  await go("#/functions/" + G(201));
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.match(await page.locator(".fd-tags").innerText(), /CF-3020/);
  assert.match(await page.locator(".rail-card.gc").innerText(), /Grace Whitfield/);

  await go("#/functions/" + G(202));
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Check the 2026 amendment.");
  await btn("Submit flag").click();
  await toast(/Flag submitted/);
  const flag = dv.su_functionflags.at(-1);
  assert.equal(flag._su_function_value, G(202)); assert.equal(flag._su_flaggedby_value, G(101));
  assert.equal(flag.su_status, 100000050); assert.equal(flag.su_source, 100000110);

  await go("#/functions/" + G(201));
  await page.waitForSelector("h1:has-text('Clery Act')");
  await btn("Log a gap").click();
  await page.locator(".fd-panel input").fill("Timely warning not issued");
  await btn("Log gap").click();
  await toast(/Gap logged/);
  const gap = dv.su_compliancegaps.at(-1);
  assert.equal(gap.su_status, 100000020); assert.equal(gap.su_severity, 100000001); assert.equal(gap._su_owner_value, G(101));

  await btn("Mark complete for this cycle").click();
  await modal().locator("textarea").fill("Published.");
  await btn("Confirm", modal()).click();
  await toast(/Deadline marked complete/);
  const dl = dv.su_compliancedeadlines.find(r => r.su_compliancedeadlineid === G(401));
  assert.match(dl.su_completeddate, /^\d{4}-\d{2}-\d{2}$/); assert.match(dl.su_notes, /Completed: Published\./);

  await btn("Edit this record").click();
  await page.locator("#fd-risk").selectOption("Moderate");
  await btn("Save changes").click();
  await toast(/Changes saved/);
  const fn = dv.su_compliancefunctions.find(r => r.su_compliancefunctionid === G(201));
  assert.equal(fn.su_risk, 100000002);

  await btn("Manage people").click();
  assert.equal(await page.locator(".orole.counsel").count(), 0, "Dataverse keeps counsel by risk area");
  assert.deepEqual(await page.locator(".orole .orole-t").allTextContents(), ["Executive Owner", "Unit Owner", "Compliance Owner"]);
  await page.locator(".orole.unit .oadd").click();
  await page.locator(".orole.unit .opick-r select").selectOption("Advisory");
  await pick(page.locator(".orole.unit"), "Andrea", "Andrea Whitaker");
  await page.locator(".orole.compliance .operson", { hasText: "Dwight Ferrell" }).locator(".orm").click();
  await btn("Save chain").click();
  await toast(/Ownership chain saved/);
  const rows = dv.su_functionownerships.filter(r => r._su_function_value === G(201));
  assert.deepEqual(rows.map(r => [r._su_person_value, r.su_role, r.su_subrole]).sort(), [
    [G(100), 100000030, 100000040], [G(101), 100000032, 100000040], [G(102), 100000031, 100000041]].sort());
  assert.equal(dv.su_compliancefunctions.find(r => r.su_compliancefunctionid === G(201))._su_unitowner_value, G(102), "fixed lookup follows the role's person");

  await view("Admin");
  await go("#/gaps");
  await page.locator(".gcard2", { hasText: "I-9 Section 2 completed late" }).locator("button", { hasText: "Close" }).click();
  await btn("Close gap", modal()).click();
  await toast(/Gap closed/);
  const g = dv.su_compliancegaps.find(r => r.su_compliancegapid === G(601));
  assert.equal(g.su_status, 100000021); assert.equal(g._su_closedby_value, G(101));

  await go("#/flags");
  await page.locator(".fl-list .srow", { hasText: "Clery Act" }).click();
  await page.locator(".fl-entry", { hasText: "Citation may be superseded." }).locator("button", { hasText: "Resolve" }).click();
  await toast(/Flag resolved/);
  assert.equal(dv.su_functionflags.find(r => r.su_functionflagid === G(501)).su_status, 100000051);

  await go("#/reporting");
  assert.match(await page.locator(".ph p").innerText(), /connect straight to the Dataverse tables/);

  await go("#/directory");
  await btn("Add person").click();
  await modal().locator(".opick-s input").fill("Jordan Lee");
  assert.equal(await btn("Search the university directory", modal()).count(), 0, "no Entra lookup on Dataverse");
  await btn("Enter name and email", modal()).click();
  assert.equal(await modal().locator("#op-name").inputValue(), "Jordan Lee");
  await modal().locator("#op-email").fill("jlee@syr.edu");
  await btn("Add to Compliance Directory", modal()).click();
  await toast(/added to the Compliance Directory/);
  const p = dv.su_compliancedirectorys.at(-1);
  assert.equal(p.su_name, "Jordan Lee"); assert.equal(p.su_email, "jlee@syr.edu"); assert.equal(p.su_active, true);

  await go("#/functions/" + G(203));
  await page.waitForSelector("h1:has-text('HIPAA')");
  await btn("Delete this function").click();
  await btn("Delete permanently", modal()).click();
  await toast(/Function deleted/);
  assert.equal(dv.su_compliancefunctions.some(r => r.su_compliancefunctionid === G(203)), false);
  assert.equal(dv.su_compliancegaps.some(r => r._su_function_value === G(203)), false, "cascade");
});

/* ======================= Dataverse, owner ======================= */
await session("Dataverse · owner · permitted writes succeed, admin UI absent", { backend: "dataverse", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal, go, toast, btn }) => {
  assert.equal(await page.locator(".util-role select").count(), 0);
  await go("#/functions/" + G(202));
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fd-panel textarea").fill("Unit owner changed.");
  await btn("Submit flag").click();
  await toast(/Flag submitted/);
  assert.equal(portal.dv.su_functionflags.at(-1)._su_flaggedby_value, G(103));
});

/* ======================= failure is visible, not silent ======================= */
await session("A write the backend rejects is reported, and nothing changes", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn }) => {
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  const before = portal.sp["Compliance Functions"].find(r => r.Id === 201).Title;
  delete portal.sp["Risk Areas"][0].Id; // the risk-area lookup now points at nothing
  await btn("Edit this record").click();
  await page.locator("#fd-name").fill("Renamed");
  await btn("Save changes").click();
  const t = await toast(/points at missing Risk Areas item/);
  assert.ok(t);
  assert.equal(portal.sp["Compliance Functions"].find(r => r.Id === 201).Title, before);
  assert.equal(await page.locator(".cm-toast.err").count(), 1);
});

/* ======================= phone width: no sideways scroll ======================= */
await session("Phone width · every screen fits, the drawer and profile open", { backend: "sharepoint", admin: true }, async ({ page, go, view }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await view("Admin");
  for (const h of ["#/", "#/definitions", "#/functions", "#/functions/201", "#/deadlines", "#/directory", "#/executives", "#/gaps", "#/risk", "#/reporting", "#/flags"]) {
    await go(h);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll on " + h);
  }
  await page.locator(".hamb").click();
  await page.locator(".drawer .di", { hasText: "Deadlines" }).click();
  await page.locator("h1", { hasText: "Deadlines" }).waitFor();
  await go("#/directory");
  await page.locator(".dir-card", { hasText: "Andrea Whitaker" }).click();
  await page.locator(".cm-modal .dir-rail-hd h2", { hasText: "Andrea Whitaker" }).waitFor();
});

/* ======================= the site header and footer, on every other page ======================= */
async function sitePage(name, opts, body) {
  const portal = await startPortal(opts);
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const problems = [];
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
  try {
    await body({ page, portal });
    assert.deepEqual(problems, [], "no page errors");
    results.push("PASS  " + name); passed++;
  } catch (e) {
    await page.screenshot({ path: "/tmp/cm-e2e-failure.png", fullPage: true }).catch(() => { });
    results.push("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 6).join("\n      ") + (problems.length ? "\n      page: " + problems.join(" | ") : ""));
  } finally { await page.close(); await portal.close(); }
}

await sitePage("Site header · web links, active page, menus, search into the matrix", { backend: "sharepoint", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal }) => {
  await page.goto(portal.base + "/policies/annual/");
  await page.waitForSelector("#cmh[data-ready]");
  // the web link set drives the nav; Home and the matrix are not repeated
  assert.deepEqual(await page.locator(".cmh-nav > .cmh-item > .cmh-top").allInnerTexts(), ["Home", "Compliance Matrix", "Policies and Training", "Resources", "Contact"]);
  assert.equal(await page.locator(".cmh-top.is-here").innerText(), "Policies and Training", "the section of the current page");
  // the signed-in user, with initials
  assert.equal(await page.locator(".cmh-me i").innerText(), "DF");
  // child links and child pages become dropdowns
  await page.locator(".cmh-top", { hasText: "Policies and Training" }).click();
  assert.deepEqual(await page.locator("#cmh-p-3 .cmh-link b").allInnerTexts(), ["Policies and Training", "Annual training", "Conflict of interest"]);
  assert.equal(await page.locator("#cmh-p-3 .cmh-link.is-here b").innerText(), "Annual training");
  await page.mouse.click(40, 600);
  assert.equal(await page.locator("#cmh-p-3").isHidden(), true, "outside click closes");
  await page.locator(".cmh-top", { hasText: "Resources" }).click();
  assert.equal(await page.locator("#cmh-p-4 .cmh-link", { hasText: "Forms" }).locator("span").innerText(), "Every form the office uses");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#cmh-p-4").isHidden(), true, "Escape closes");
  // the matrix menu hides the administrator screens from a non-administrator
  await page.locator(".cmh-top", { hasText: "Compliance Matrix" }).click();
  assert.deepEqual(await page.locator("#cmh-p-matrix .cmh-link b").allInnerTexts(), ["Compliance Functions", "Deadlines", "Directory", "Executive Team", "Gap Tracker", "Definitions"]);
  assert.equal(await page.locator("#cmh-p-matrix .cmh-link", { hasText: "Deadlines" }).getAttribute("href"), "/matrix/#/deadlines");
  await page.keyboard.press("Escape");
  // search lands on a filtered Compliance Functions
  await page.keyboard.press("Control+k");
  await page.locator("#cmh-find-q").fill("I-9");
  assert.match(await page.locator("#cmh-find-list li.is-on").innerText(), /Search the Compliance Matrix for .I-9./);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".mx-chips .count");
  assert.equal((await page.locator(".mx-chips .count").textContent()).trim(), "1 of 3 functions");
  assert.equal(await page.locator(".mx-bar .srch input").inputValue(), "I-9");
  // and the matrix links back out to the site
  assert.equal(await page.locator(".util-in a", { hasText: "Portal Home" }).getAttribute("href"), "/");
  assert.deepEqual(await page.locator(".ftr .cols > div", { has: page.locator(".fh", { hasText: "This site" }) }).locator("a").allTextContents(), ["Home", "Policies and Training", "Resources", "Contact"]);
  await page.keyboard.press("Control+k");
  await page.locator(".pal input").fill("contact");
  assert.ok((await page.locator(".pal-i b").allInnerTexts()).includes("Contact"), "site pages are in the quick jump");
});

await sitePage("Site header · administrator links, signed-out Sign in, home active", { backend: "sharepoint", admin: true }, async ({ page, portal }) => {
  await page.goto(portal.base + "/");
  await page.waitForSelector("#cmh[data-ready]");
  assert.equal(await page.locator(".cmh-top.is-here").innerText(), "Home");
  await page.locator(".cmh-top", { hasText: "Compliance Matrix" }).click();
  assert.equal(await page.locator("#cmh-p-matrix .cmh-link", { hasText: "Flagged Items" }).count(), 1, "administrators see the admin screens");
  await page.keyboard.press("Escape");
  // narrow window: the menu button opens the nav
  await page.setViewportSize({ width: 390, height: 800 });
  await page.locator("#cmh-hamb").click();
  assert.equal(await page.locator("#cmh-nav").isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll");
});

await sitePage("Site header · signed out", { backend: "sharepoint", admin: false, user: null }, async ({ page, portal }) => {
  await page.goto(portal.base + "/contact/");
  await page.waitForSelector("#cmh[data-ready]");
  assert.equal(await page.locator(".cmh-me").count(), 0);
  assert.equal(await page.locator(".cmh-util a", { hasText: "Sign in" }).getAttribute("href"), "/SignIn?returnUrl=%2Fcontact%2F");
  assert.equal(await page.locator(".cmh-top.is-here").innerText(), "Contact");
});

await browser.close();
console.log(results.join("\n"));
console.log(`\n${passed} of ${results.length} end-to-end sessions passed.`);
process.exit(passed === results.length ? 0 : 1);
