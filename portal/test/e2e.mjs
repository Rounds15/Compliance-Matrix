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
    await page.waitForSelector(".figures", { timeout: 20000 });
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
    const t = page.locator(".toast", { hasText: re });
    try { await t.waitFor({ timeout: 15000 }); }
    catch (e) { const shown = await page.locator(".toast").allInnerTexts(); throw new Error("expected toast " + re + ", saw: " + JSON.stringify(shown)); }
    const text = await t.innerText();
    await page.waitForFunction(() => !document.querySelector("button[aria-busy=true]"), null, { timeout: 15000 });
    return text;
  };
  const btn = (text, scope = page) => scope.locator("button", { hasText: text }).first();
  const modal = () => page.locator(".modal").last();
  const view = async label => {
    await page.locator(".viewbtn").click();
    await page.locator(".vmenu button", { hasText: label }).click();
  };
  const fig = async i => page.locator(".fig b").nth(i).innerText();
  return { go, toast, btn, modal, view, fig };
}

const grab = async (page, click) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
};

/* ======================= SharePoint, administrator ======================= */
await session("SharePoint · administrator · header, view modes, every write", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn, modal, view, fig }) => {
  const sp = portal.sp;
  const reads = portal.log.filter(x => x.flow === "read").map(x => x.request.list);
  assert.deepEqual([...new Set(reads)].sort(), ["Accountability Structure", "Compliance Directory", "Compliance Functions", "Deadlines", "Domains", "Flags List", "Gap List", "Risk Areas"]);
  assert.equal(reads.filter(l => l === "Accountability Structure").length, 4, "follows `next` through 7 rows at 2 a page");

  // header (spec 1): utility links, admin-only View button, four nav items
  assert.deepEqual(await page.locator(".util-left > *").allInnerTexts(), ["Compliance Home Page", "Policies", "Definitions"]);
  assert.equal(await page.locator(".util-left a").first().getAttribute("href"), "https://finance.syr.edu/office-of-compliance/");
  assert.equal(await page.locator(".viewbtn").innerText(), "View: User ▾", "default mode is User");
  assert.deepEqual(await page.locator(".nav .navbtn").allInnerTexts(), ["Home", "Browse", "Risk and Reporting", "Executive Team"]);
  assert.equal(await page.locator(".backbtn").count(), 0, "no Back on Home");

  // Home figures are the viewer's own (Camila: function 201 only)
  assert.equal(await fig(0), "1"); assert.equal(await fig(1), "1");
  assert.match(await page.locator(".asof").innerText(), /^As of [A-Z][a-z]+ \d{1,2}, \d{4} · FY\d\d Q[1-4]$/);
  assert.equal(await page.locator(".dest .meta").nth(3).innerText(), "RESTRICTED");

  // Risk Dashboard is restricted outside Admin view; Admin view opens it
  await go("#/risk");
  await page.locator("text=Administrator access required").waitFor();
  await view("Admin view");
  assert.equal(await page.locator(".viewbtn").innerText(), "View: Admin ▾");
  await page.locator("h1", { hasText: "Compliance Risk Dashboard" }).waitFor();
  assert.equal(await page.locator(".stat b").first().innerText(), "1", "one High function, computed");
  assert.equal(await page.locator(".stat .s").first().innerText(), "33% of the matrix");
  await go("#/");
  assert.equal(await fig(0), "1", "Home stays the viewer's own in Admin view");
  assert.equal(await page.locator(".dest .meta").nth(3).innerText(), "ADMINISTRATOR");

  // Browse menu and outside click
  await page.locator(".navbtn", { hasText: "Browse" }).click();
  assert.deepEqual(await page.locator(".menu .t").allInnerTexts(), ["Compliance Functions", "Deadlines", "Directory"]);
  await page.mouse.click(40, 700);
  assert.equal(await page.locator(".menu").count(), 0, "outside click closes the menu");
  await page.locator(".navbtn", { hasText: "Risk and Reporting" }).click();
  assert.equal(await page.locator(".menu button", { hasText: "Gap Tracker" }).locator(".badge").innerText(), "2", "Admin view: every open gap");
  await page.mouse.click(40, 700);

  // navigation extras: quick jump, the strip, filters, the footer
  await page.keyboard.press("Control+k");
  await page.locator(".pal input").fill("I-9");
  assert.equal(await page.locator(".pal-i.on b").innerText(), "Form I-9 Employment Verification");
  await page.keyboard.press("Enter");
  await page.waitForSelector("h1:has-text('Form I-9')");
  assert.deepEqual(await page.locator(".strip .crumb").allInnerTexts(), ["All functions", "Human Resources", "Form I-9 Employment Verification"]);
  await page.locator(".strip .crumb", { hasText: "Human Resources" }).click();
  await page.locator(".fresult", { hasText: "1 of 3 functions" }).waitFor();
  await page.locator(".chip-x", { hasText: "Human Resources" }).click();
  await page.locator(".rail li button", { hasText: "High" }).click();
  assert.match(await page.locator(".fresult").innerText(), /^1 of 3 functions/);
  await page.locator(".chip-x").click();
  assert.match(await page.locator(".fresult").innerText(), /^3 functions/);
  await page.locator(".ftr button", { hasText: "Executive Team" }).click();
  await page.locator("h1", { hasText: "Executive Team" }).waitFor();
  assert.deepEqual(await page.locator(".strip .crumb").allInnerTexts(), ["Executive Team"]);
  await page.keyboard.press("/");
  await page.locator(".pal input").fill("whitaker");
  await page.keyboard.press("Enter");
  await page.locator(".drawer h2", { hasText: "Andrea Whitaker" }).waitFor();
  await page.keyboard.press("Escape");

  // flag
  await go("#/functions/202");
  await page.waitForSelector("h1:has-text('Form I-9')");
  assert.equal(await page.locator(".backbtn").count(), 1);
  await btn("Flag for review").click();
  await page.locator(".fpanel textarea").fill("Citation changed in the 2026 rule.");
  await btn("Submit flag").click();
  await toast(/Flag submitted to the compliance office/);
  const flag = sp["Flags List"].at(-1);
  assert.equal(flag.FunctionId, 202); assert.equal(flag.field_1, "Citation changed in the 2026 rule.");
  assert.equal(flag.field_2, "Manual"); assert.equal(flag.field_3, false); assert.equal(flag.FlaggedById, 101);
  assert.equal(flag.RespondentEmail, "CRuiz@syr.edu", "the directory's email for the signed-in user");

  // gap
  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.match(await page.locator(".rcard").first().innerText(), /Last reviewed\s+May 1, 2026/, "LastAssessedDate, not today");
  await btn("Log a gap").click();
  await page.locator(".fpanel input").fill("Fire log not retained for 2025");
  await page.locator(".fpanel textarea").fill("Retain the log for three years.");
  await btn("Log gap").click();
  await toast(/Gap logged and routed/);
  const gap = sp["Gap List"].at(-1);
  assert.equal(gap.Title, "Fire log not retained for 2025"); assert.equal(gap.FunctionId, 201);
  assert.equal(gap.field_2, "Open"); assert.equal(gap.field_3, "Manual"); assert.equal(gap.field_6, "Retain the log for three years.");

  // complete, then reverse, the function's deadline (spec 2.13)
  await btn("Mark complete for this cycle").click();
  assert.equal(await modal().locator(".eb").innerText(), "MARK DEADLINE COMPLETE");
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
  assert.equal(await modal().locator(".eb").innerText(), "REVERSE COMPLETION");
  await modal().locator("textarea").fill("Filed the wrong year.");
  await btn("Reverse", modal()).click();
  await toast(/Completion reversed/);
  dl = sp.Deadlines.find(r => r.Id === 401);
  assert.equal(dl.field_4, null); assert.equal(dl.field_5, null);
  assert.equal(sp.Archive.at(-1).field_2, "Reversed");

  // calendar file for this function's deadlines
  const ics = await grab(page, () => btn("Add to my calendar").click());
  assert.match(ics.text, /^BEGIN:VCALENDAR\r\n/); assert.match(ics.text, /SUMMARY:Compliance deadline: Clery Act/);
  assert.match(ics.text, /DTSTART;VALUE=DATE:\d{8}/); assert.match(ics.text, /END:VCALENDAR$/);

  // edit the record and its ownership in one save
  await btn("Edit this record").click();
  await page.locator("h1", { hasText: "Editing - Clery Act" }).waitFor();
  await page.locator("#fd-statute").fill("Jeanne Clery Disclosure Act");
  await page.locator("#fd-own-person").selectOption({ label: "Andrea Whitaker" });
  await page.locator(".own-add select").nth(1).selectOption("Unit Owner");
  await page.locator(".own-add select").nth(2).selectOption("Advisory");
  await btn("Add owner").click();
  await page.locator("#fd-own-person").selectOption({ label: "Marcus Delgado" });
  await page.locator(".own-add select").nth(1).selectOption("Support");
  await btn("Add owner").click();
  await btn("Save changes").click();
  await toast(/Changes saved to the matrix/);
  await page.locator("h1", { hasText: /^Clery Act Annual Security Report$/ }).waitFor();
  const fn = sp["Compliance Functions"].find(r => r.Id === 201);
  assert.equal(fn.field_3, "Jeanne Clery Disclosure Act");
  assert.deepEqual(fn.field_5, { Description: "https://www.ed.gov/campus-safety", Url: "https://www.ed.gov/campus-safety" });
  assert.equal(fn.RiskAreaId, 1); assert.equal(fn.DomainId, 10); assert.equal(fn.field_11, "High");
  const chain = sp["Accountability Structure"].filter(r => r.FunctionId === 201);
  assert.equal(chain.length, 6);
  const unit = chain.find(r => r.field_3 === "Unit Owner");
  assert.equal(unit.PersonId, 102); assert.equal(unit.field_4, "Advisory");
  assert.equal(chain.find(r => r.field_3 === "Support").PersonId, 100);
  assert.equal(chain.find(r => r.field_3 === "General Counsel").PersonId, 104, "General Counsel kept");
  assert.equal(chain.find(r => r.field_3 === "General Counsel").field_4, null, "counsel has no sub-role");
  assert.ok(!chain.some(r => [301, 302, 303, 304].includes(r.Id)), "old rows replaced");

  // close a gap from the tracker (Admin view shows every gap)
  await go("#/gaps");
  assert.match(await page.locator(".stat .s").innerText(), /^How long it typically takes to close a gap$/);
  const card = page.locator(".gcard", { hasText: "I-9 Section 2 completed late" });
  assert.match(await card.locator(".meta").innerText(), /^GAP-601 \| \d+d open$/);
  assert.equal(await card.locator(".sev").innerText(), "NR", "unrated function");
  await card.locator("button", { hasText: "Close" }).click();
  await toast(/Gap closed/);
  const closed = sp["Gap List"].find(r => r.Id === 601);
  assert.equal(closed.field_2, "Closed"); assert.ok(closed.field_13); assert.equal(closed.ClosedById, 101);

  // resolve a flag
  await go("#/flags");
  await page.locator(".master li", { hasText: "Clery Act" }).locator("button").click();
  const entry = page.locator(".entry", { hasText: "Citation may be superseded." });
  assert.match(await entry.innerText(), /Flagged by Dwight Ferrell on Sep 18, 2026/);
  await entry.locator("button", { hasText: "Resolve" }).click();
  await toast(/Flag resolved/);
  assert.equal(sp["Flags List"].find(r => r.Id === 501).field_3, true);
  const ar = sp.Archive.at(-1);
  assert.equal(ar.field_1, "Flag Resolution"); assert.equal(ar.field_7, 501); assert.equal(ar.field_11, "Dwight Ferrell");

  // directory: add from Entra through the find-person flow
  await go("#/directory");
  await btn("Manage Directory").click();
  await btn("Add a person", modal()).click();
  await modal().locator("#dir-add-q").fill("Priya");
  await modal().locator(".rows li", { hasText: "Priya Raghavan" }).locator("button", { hasText: "Add" }).click();
  await toast(/added to the Compliance Directory/);
  const added = sp["Compliance Directory"].at(-1);
  assert.equal(added.Title, "Priya Raghavan"); assert.equal(added.field_1, "praghavan@syr.edu");
  assert.equal(await modal().locator(".rows li", { hasText: "Priya Raghavan" }).locator("button").innerText(), "Already in");
  await modal().locator("button.x").click();

  // taxonomy
  await go("#/functions");
  await page.locator(".rail-hd button").click();
  await btn("Domain", modal()).click();
  await modal().locator("#tax-parent").selectOption({ label: "Privacy" });
  await modal().locator("#tax-name").fill("Consumer Privacy");
  await btn("Add domain", modal()).click();
  await toast(/Domain created: Consumer Privacy/);
  assert.deepEqual(sp.Domains.at(-1), { ...sp.Domains.at(-1), Title: "Consumer Privacy", RiskAreaId: 3 });
  await btn("Cancel", modal()).click();

  // new function
  await btn("Add new function").click();
  await page.waitForSelector("h1:has-text('New function')");
  assert.equal(await page.locator(".hero .eyebrow").innerText(), "NEW RECORD");
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
  assert.match(await modal().innerText(), /0 deadline\(s\), 1 gap\(s\), and 0 flag\(s\)\. A copy of each is written to the archive first\. This cannot be undone\./);
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
await session("SharePoint · owner · own scope, member flow only, admin UI absent", { backend: "sharepoint", admin: false, user: { email: "dferrell@syr.edu", name: "Dwight Ferrell" } }, async ({ page, portal, go, toast, btn, modal, fig }) => {
  assert.equal(await page.locator(".viewbtn").count(), 0, "View is for administrators only");
  assert.equal(await fig(0), "2", "Dwight appears on 201 and 202");
  assert.match(await page.locator(".qlinks").innerText(), /Open gaps \(2\)/);

  await page.locator(".navbtn", { hasText: "Risk and Reporting" }).click();
  assert.equal(await page.locator(".menu button", { hasText: "Gap Tracker" }).locator(".badge").innerText(), "2");
  await page.locator(".menu button", { hasText: "Flagged Items" }).click();
  await page.locator("text=Administrator access required").waitFor();
  await go("#/risk");
  await page.locator("text=Administrator access required").waitFor();
  await go("#/reporting");
  await page.locator("text=Administrator access required").waitFor();

  await go("#/functions/201");
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.equal(await btn("Edit this record").count(), 0);
  assert.equal(await btn("Delete this function").count(), 0);
  assert.equal(await page.locator(".hero .pill").innerText(), "HIGH", "owners see the rating");
  await go("#/functions");
  assert.equal(await btn("Add new function").count(), 0);
  assert.equal(await page.locator(".rail-hd button").count(), 0);
  await go("#/directory");
  assert.equal(await btn("Manage Directory").count(), 0);

  await go("#/functions/202");
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fpanel textarea").fill("Owner needs updating.");
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
  assert.equal(await page.locator(".gcard").count(), 1, "the open gap on 202; 602 is In Progress");
  await page.locator(".gcard", { hasText: "I-9 Section 2" }).locator("button", { hasText: "Close" }).click();
  await toast(/Gap closed/);
  assert.equal(portal.sp["Gap List"].find(r => r.Id === 601).field_2, "Closed");
  assert.equal(portal.sp["Gap List"].find(r => r.Id === 601).ClosedById, 103);

  const flows = portal.log.filter(x => x.flow && x.flow !== "read").map(x => x.flow);
  assert.deepEqual([...new Set(flows)], ["write"], "an owner's writes go through the member flow");

  // deadlines: only Dwight's functions (201 and 202)
  await go("#/deadlines");
  await btn("All dates").click();
  await page.locator(".dlctl select").selectOption("All");
  assert.equal(await page.locator(".dlitem").count(), 2);
  assert.match(await page.locator(".dlitem").first().locator(".m").innerText(), /^[A-Z][a-z]{2} \d{1,2}, \d{4} \| \w+ \| /);
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
await session("SharePoint · directory edit, reassign, remove; view as a user", { backend: "sharepoint", admin: true }, async ({ page, portal, go, toast, btn, modal, view, fig }) => {
  const sp = portal.sp;

  // View as specific user: "me" figures follow the picked person
  await page.locator(".viewbtn").click();
  await page.locator(".vmenu button", { hasText: "View as specific user..." }).click();
  await page.locator(".vpick input").fill("dfer");
  await page.locator(".vpick li button", { hasText: "Dwight Ferrell" }).click();
  assert.equal(await page.locator(".viewbtn").innerText(), "View: Dwight Ferrell ▾");
  assert.equal(await fig(0), "2");
  assert.match(await page.locator(".shead", { hasText: "Assigned to you" }).innerText(), /Dwight Ferrell/);
  await go("#/functions/203");
  await page.waitForSelector("h1:has-text('HIPAA')");
  assert.equal(await page.locator(".hero .pill").count(), 0, "not Dwight's function, not Admin view: no rating");
  await view("User view");

  await go("#/directory");
  assert.equal(await page.locator(".toolbar .count").innerText(), "5 people");
  await page.locator(".pcard", { hasText: "Dwight Ferrell" }).click();
  assert.equal(await page.locator(".drawer .role").innerText(), "COMPLIANCE OWNER");
  await page.locator(".drawer button", { hasText: "Edit" }).click();
  await modal().locator("#dir-ed-name").fill("Dwight A. Ferrell");
  assert.match(await modal().locator(".warn").innerText(), /^This person owns 2 function\(s\)\. Renaming is safe now, because ownership is by reference\.$/);
  await btn("Save changes", modal()).click();
  await toast(/^Saved\.$/);
  assert.equal(sp["Compliance Directory"].find(r => r.Id === 103).Title, "Dwight A. Ferrell");
  await page.keyboard.press("Escape");

  // a person who still owns functions cannot be removed
  await btn("Manage Directory").click();
  await btn("Remove a person", modal()).click();
  await modal().locator(".rows li", { hasText: "Dwight A. Ferrell" }).locator("button").click();
  await toast(/Cannot remove Dwight A\. Ferrell\. They still own 2 function\(s\)\. Reassign their ownership first\./);
  await btn("Back", modal()).click();

  // reassign both of Dwight's functions to Andrea
  await btn("Reassign ownership from one person to another", modal()).click();
  await modal().locator(".rows li", { hasText: "Dwight A. Ferrell" }).locator("button").click();
  await btn("Select all", modal()).click();
  assert.match(await modal().innerText(), /2 of 2 selected/);
  await btn("Continue", modal()).click();
  await modal().locator(".rows li", { hasText: "Andrea Whitaker" }).locator("button", { hasText: "Select" }).click();
  assert.match(await modal().innerText(), /Move 2 function\(s\) from Dwight A\. Ferrell to Andrea Whitaker\. Where Andrea Whitaker already holds a role, it will not be duplicated\./);
  await btn("Reassign", modal()).click();
  await toast(/Dwight A\. Ferrell no longer owns any functions\./);
  assert.equal(sp["Accountability Structure"].find(r => r.Id === 303).PersonId, 102);
  assert.equal(sp["Accountability Structure"].find(r => r.Id === 306).PersonId, 102);
  assert.equal(sp["Accountability Structure"].some(r => r.PersonId === 103), false);

  // now he can be removed
  await btn("Back", modal()).click();
  await btn("Back", modal()).click();
  await btn("Remove a person", modal()).click();
  const row = modal().locator(".rows li", { hasText: "Dwight A. Ferrell" });
  await row.locator("button", { hasText: "Remove" }).click();
  await row.locator("button", { hasText: "Confirm?" }).click();
  await toast(/removed from the directory/);
  assert.equal(sp["Compliance Directory"].some(r => r.Id === 103), false);
  await modal().locator("button.x").click();

  // taxonomy: a risk area with functions cannot be deleted; an empty domain can
  await go("#/functions");
  await page.locator(".rail-hd button").click();
  await btn("Manage", modal()).click();
  await modal().locator(".rows li", { hasText: "Privacy" }).first().locator("button").click();
  await toast(/Cannot delete Privacy\. 1 function\(s\)\. 1 domain\(s\)\. Reassign the children first\./);
  const hi = modal().locator(".rows li", { hasText: "Health Information" });
  await hi.locator("button", { hasText: "Delete" }).click();
  await hi.locator("button", { hasText: "Confirm?" }).click();
  await toast(/Domain deleted/);
  assert.equal(sp.Domains.some(r => r.Id === 12), false);
});

/* ======================= Dataverse, administrator ======================= */
await session("Dataverse · administrator · every write", { backend: "dataverse", admin: true }, async ({ page, portal, go, toast, btn, modal, view, fig }) => {
  const dv = portal.dv;
  assert.equal(await fig(0), "1");
  assert.ok(portal.log.some(x => x.api && /skiptoken/.test(x.api)), "follows @odata.nextLink");

  await go("#/functions/" + G(201));
  await page.waitForSelector("h1:has-text('Clery Act')");
  assert.match(await page.locator(".fdhero .chips").innerText(), /CF-3020/);
  assert.match(await page.locator(".rcard.gc").innerText(), /Grace Whitfield/);

  await go("#/functions/" + G(202));
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fpanel textarea").fill("Check the 2026 amendment.");
  await btn("Submit flag").click();
  await toast(/Flag submitted/);
  const flag = dv.su_functionflags.at(-1);
  assert.equal(flag._su_function_value, G(202)); assert.equal(flag._su_flaggedby_value, G(101));
  assert.equal(flag.su_status, 100000050); assert.equal(flag.su_source, 100000110);

  await go("#/functions/" + G(201));
  await page.waitForSelector("h1:has-text('Clery Act')");
  await btn("Log a gap").click();
  await page.locator(".fpanel input").fill("Timely warning not issued");
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
  assert.equal(await page.locator("#fd-gc").count(), 0, "Dataverse keeps counsel by risk area");
  assert.deepEqual(await page.locator(".own-add select").nth(1).locator("option").allInnerTexts(), ["Executive Owner", "Unit Owner", "Compliance Owner"]);
  await page.locator("#fd-risk").selectOption("Moderate");
  await page.locator("#fd-own-person").selectOption({ label: "Andrea Whitaker" });
  await page.locator(".own-add select").nth(1).selectOption("Unit Owner");
  await page.locator(".own-add select").nth(2).selectOption("Advisory");
  await btn("Add owner").click();
  await page.locator(".own-list li", { hasText: "Dwight Ferrell" }).locator("button", { hasText: "Remove" }).click();
  await btn("Save changes").click();
  await toast(/Changes saved/);
  const fn = dv.su_compliancefunctions.find(r => r.su_compliancefunctionid === G(201));
  assert.equal(fn.su_risk, 100000002);
  const rows = dv.su_functionownerships.filter(r => r._su_function_value === G(201));
  assert.deepEqual(rows.map(r => [r._su_person_value, r.su_role, r.su_subrole]).sort(), [
    [G(100), 100000030, 100000040], [G(101), 100000032, 100000040], [G(102), 100000031, 100000041]].sort());
  assert.equal(fn._su_unitowner_value, G(102), "fixed lookup follows the role's person");

  await view("Admin view");
  await go("#/gaps");
  await page.locator(".gcard", { hasText: "I-9 Section 2 completed late" }).locator("button", { hasText: "Close" }).click();
  await toast(/Gap closed/);
  const g = dv.su_compliancegaps.find(r => r.su_compliancegapid === G(601));
  assert.equal(g.su_status, 100000021); assert.equal(g._su_closedby_value, G(101));

  await go("#/flags");
  await page.locator(".entry", { hasText: "Citation may be superseded." }).locator("button", { hasText: "Resolve" }).click();
  await toast(/Flag resolved/);
  assert.equal(dv.su_functionflags.find(r => r.su_functionflagid === G(501)).su_status, 100000051);

  await go("#/reporting");
  assert.match(await page.locator(".hero .lede").innerText(), /connect straight to the Dataverse tables/);

  await go("#/directory");
  await btn("Manage Directory").click();
  await btn("Add a person", modal()).click();
  assert.equal(await modal().locator("#dir-add-q").count(), 0, "no Entra lookup on Dataverse");
  await modal().locator("#dir-add-name").fill("Jordan Lee");
  await modal().locator("#dir-add-mail").fill("jlee@syr.edu");
  await btn("Add", modal()).click();
  await toast(/added to the Compliance Directory/);
  const p = dv.su_compliancedirectorys.at(-1);
  assert.equal(p.su_name, "Jordan Lee"); assert.equal(p.su_email, "jlee@syr.edu"); assert.equal(p.su_active, true);
  await modal().locator("button.x").click();

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
  assert.equal(await page.locator(".viewbtn").count(), 0);
  await go("#/functions/" + G(202));
  await page.waitForSelector("h1:has-text('Form I-9')");
  await btn("Flag for review").click();
  await page.locator(".fpanel textarea").fill("Unit owner changed.");
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
  assert.equal(await page.locator(".toast.err").count(), 1);
});

await browser.close();
console.log(results.join("\n"));
console.log(`\n${passed} of ${results.length} end-to-end sessions passed.`);
process.exit(passed === results.length ? 0 : 1);
