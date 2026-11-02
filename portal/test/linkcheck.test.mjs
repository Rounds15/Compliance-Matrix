/* tools/check_links.mjs against a local site: each kind of answer, both
   input files, and the report. */

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { parseCsv, targets, checkUrl, run, reportCsv } from "../../tools/check_links.mjs";

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
    assert.deepEqual(r.summary, { OK: 3, Moved: 1, Broken: 1, Failed: 0, notHttps: 5 });
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
