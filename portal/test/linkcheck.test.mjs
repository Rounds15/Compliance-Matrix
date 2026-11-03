/* tools/check_links.mjs against a local site: each kind of answer, both
   input files, and the report. */

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { parseCsv, targets, checkUrl, run, reportCsv, ecfrQuery } from "../../tools/check_links.mjs";

async function site() {
  const server = http.createServer((req, res) => {
    const p = req.url;
    if (p === "/ok") { res.writeHead(200); return res.end(req.method === "HEAD" ? undefined : "fine"); }
    if (p === "/moved") { res.writeHead(301, { Location: "/new-home" }); return res.end(); }
    if (p === "/new-home") { res.writeHead(200); return res.end(); }
    if (p === "/slash") { res.writeHead(301, { Location: "/slash/" }); return res.end(); }
    if (p === "/slash/") { res.writeHead(200); return res.end(); }
    if (p === "/gone") { res.writeHead(404); return res.end(); }
    if (p === "/nohead") { res.writeHead(req.method === "HEAD" ? 405 : 200); return res.end(); }
    if (p === "/loop") { res.writeHead(302, { Location: "/loop" }); return res.end(); }
    if (p === "/slow") { setTimeout(() => { res.writeHead(200); res.end(); }, 1500); return; }
    if (p === "/error") { res.writeHead(500); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
}

test("link check: each kind of answer", async () => {
  const s = await site();
  try {
    const c = p => checkUrl(s.base + p, { timeoutMs: 800 });
    assert.deepEqual(await c("/ok"), { result: "OK", status: 200, final: "", note: "not https" });
    assert.deepEqual(await c("/moved"), { result: "Moved", status: 200, final: s.base + "/new-home", note: "not https" });
    assert.equal((await c("/slash")).result, "OK", "a trailing slash is not a move");
    assert.deepEqual(await c("/gone"), { result: "Broken", status: 404, final: s.base + "/gone", note: "not https" });
    assert.equal((await c("/nohead")).result, "OK", "a site that refuses HEAD is asked with GET");
    assert.equal((await c("/error")).result, "Broken");
    assert.deepEqual(await c("/loop"), { result: "Failed", status: "", final: s.base + "/loop", note: "more than 10 redirects; not https" });
    assert.equal((await c("/slow")).note, "no answer in 1s; not https");
    assert.equal((await checkUrl("not a url")).note, "not a valid address");
    assert.equal((await checkUrl("javascript:alert(1)")).note, "not a web address");
  } finally { await s.close(); }
});

test("link check: reads the import CSV and a functions export, asks each address once, reports worst first", async () => {
  const s = await site();
  try {
    const links = parseCsv(`su_function,su_functionname,su_name,su_linktype,su_url,su_sortorder,su_source\r\n` +
      `g1,Air Emissions,"42 U.S.C. §§ 7401-7671q",Statute,${s.base}/ok,1,HECA Statute 1\r\n` +
      `g1,Air Emissions,"40 C.F.R. § 50",Regulation,${s.base}/gone,2,HECA Regulation 1\r\n` +
      `g2,Clery Act,"34 C.F.R. § 668.46",Regulation,${s.base}/ok,1,HECA Regulation 1\r\n`);
    // a Dataverse export uses display names
    const functions = parseCsv(`Compliance Function,Statute URL,Resource URL\r\nClery Act,${s.base}/moved,\r\nTitle IX,,${s.base}/ok\r\n`);
    assert.equal(targets({ links, functions }).length, 5);
    let asked = 0;
    const counting = (u, o) => { asked++; return fetch(u, o); };
    const r = await run({ links, functions, timeoutMs: 800, fetchImpl: counting });
    assert.equal(r.distinct, 3);
    // /ok once, /moved twice (the redirect), /gone twice (a 404 on HEAD is asked again with GET)
    assert.equal(asked, 5, "each distinct address once, not once per link");
    assert.deepEqual(r.summary, { OK: 3, Moved: 1, Broken: 1, Blocked: 0, Failed: 0, notHttps: 5 });
    assert.deepEqual(r.rows.map(x => [x.result, x.field, x.fn]), [
      ["Broken", "Link (su_url)", "Air Emissions"], ["Moved", "Statute URL (su_statuteurl)", "Clery Act"],
      ["OK", "Link (su_url)", "Air Emissions"], ["OK", "Link (su_url)", "Clery Act"], ["OK", "Resource URL (su_resourceurl)", "Title IX"]]);
    const csv = reportCsv(r.rows);
    assert.match(csv, /^Result,Status,Where,Function,Label,Address,Final address,Note\r\nBroken,404,Link \(su_url\),Air Emissions,40 C\.F\.R\. § 50,/);
  } finally { await s.close(); }
});

test("link check: the import CSV parses to its 517 links, all https", () => {
  const rows = parseCsv(readFileSync(new URL("../../solution/dataflows/6 CM Load 6 - Function links/function-links-import.csv", import.meta.url), "utf8"));
  assert.equal(rows.length, 517);
  const t = targets({ links: rows });
  assert.equal(t.length, 517);
  assert.ok(t.every(x => x.url.startsWith("https://")));
  assert.equal(new Set(t.map(x => x.url)).size, 229);
});

/* a stand-in for the internet: answers by address */
const fake = table => async (url, opts = {}) => {
  const hit = table[url] || table[url.split("?")[0] + "?*"];
  const [status, location] = hit || [404];
  return { status, headers: new Map(location ? [["location", location]] : []), body: { cancel: async () => {} }, json: async () => hit[2] };
};
const TITLES = ["https://www.ecfr.gov/api/versioner/v1/titles.json", [200, null, { titles: [
  { number: 34, up_to_date_as_of: "2026-10-30", reserved: false }, { number: 26, up_to_date_as_of: "2026-10-29", reserved: false }, { number: 35, up_to_date_as_of: "2026-10-30", reserved: true }] }]];

test("link check: eCFR addresses are checked with the eCFR API, not the bot-checked page", async () => {
  assert.deepEqual([...ecfrQuery("https://www.ecfr.gov/current/title-34/subtitle-B/chapter-VI/part-668/subpart-D/section-668.46").params],
    [["subtitle", "B"], ["chapter", "VI"], ["part", "668"], ["subpart", "D"], ["section", "668.46"]]);
  assert.equal(ecfrQuery("https://www.ecfr.gov/current/title-40/part-50").title, 40);
  assert.deepEqual([...ecfrQuery("https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/subject-group-ECFRb467872627553f1/section-1.125-3").params],
    [["chapter", "I"], ["subchapter", "A"], ["part", "1"], ["section", "1.125-3"]], "a subject group is skipped");
  assert.equal(ecfrQuery("https://www.ecfr.gov/cgi-bin/text-idx?node=x"), null, "an old eCFR address is checked as a page");
  assert.equal(ecfrQuery("https://www.law.cornell.edu/cfr/text/34/668.46"), null);
  const net = fake(Object.fromEntries([TITLES,
    ["https://www.ecfr.gov/api/versioner/v1/ancestry/2026-10-30/title-34.json?part=668&section=668.46", [200]],
    ["https://www.ecfr.gov/api/versioner/v1/ancestry/2026-10-29/title-26.json?section=1.457", [404]]]));
  assert.deepEqual(await checkUrl("https://www.ecfr.gov/current/title-34/part-668/section-668.46", { fetchImpl: net }),
    { result: "OK", status: 200, final: "", note: "checked with the eCFR API" });
  assert.equal((await checkUrl("https://www.ecfr.gov/current/title-26/section-1.457", { fetchImpl: net })).note, "not in the current CFR (checked with the eCFR API)");
  assert.equal((await checkUrl("https://www.ecfr.gov/current/title-35/part-1", { fetchImpl: net })).note, "title 35 is reserved (checked with the eCFR API)");
});

test("link check: a bot check is Blocked, not Moved; a Cornell CFR 404 suggests the part form", async () => {
  const net = fake({
    "https://www.uscis.gov/i-9": [302, "https://unblock.federalregister.gov/"],
    "https://unblock.federalregister.gov/": [200],
    "https://www.law.cornell.edu/cfr/text/45/164": [404],
    "https://www.law.cornell.edu/cfr/text/45/part-164": [200],
    "https://www.law.cornell.edu/cfr/text/45/999": [404]
  });
  const b = await checkUrl("https://www.uscis.gov/i-9", { fetchImpl: net });
  assert.equal(b.result, "Blocked");
  const net2 = fake({
    "https://www.ethics.senate.gov/manual.pdf": [302, "https://www.senate.gov/general/file_not_found.htm"],
    "https://www.senate.gov/general/file_not_found.htm": [200],
    "https://www.bis.doc.gov/ear": [301, "https://www.bis.gov/"], "https://www.bis.gov/": [200] });
  assert.deepEqual(await checkUrl("https://www.ethics.senate.gov/manual.pdf", { fetchImpl: net2 }),
    { result: "Broken", status: 200, final: "https://www.senate.gov/general/file_not_found.htm", note: "redirected to a not-found page" });
  assert.equal((await checkUrl("https://www.bis.doc.gov/ear", { fetchImpl: net2 })).note, "redirected to the site's home page");
  const c = await checkUrl("https://www.law.cornell.edu/cfr/text/45/164", { fetchImpl: net });
  assert.deepEqual([c.result, c.note], ["Broken", "try https://www.law.cornell.edu/cfr/text/45/part-164"]);
  assert.equal((await checkUrl("https://www.law.cornell.edu/cfr/text/45/999", { fetchImpl: net })).note, "", "no suggestion when the part form is not found either");
});
