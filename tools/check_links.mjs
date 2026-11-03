/* Link checker for the matrix's addresses: each function link's su_url, and
   each function's su_statuteurl and su_resourceurl.

   Reads CSV files, so it works from what Dataverse exports:

     --links <file>      Function Links: su_url (or URL), su_name (or Link
                         Label), su_functionname or su_function (optional)
     --functions <file>  Compliance Functions: su_name (or Compliance
                         Function), su_statuteurl (or Statute URL),
                         su_resourceurl (or Resource URL)
     --out <file>        the report (CSV); default link-check.csv

   Each distinct address is asked for once: HEAD first, then GET when the
   site refuses HEAD; redirects are followed (up to 10) and the final
   address is reported. A result is OK (2xx), Moved (2xx at another
   address), Broken (4xx or 5xx), Blocked (the site sent the checker to a
   bot check, so the page itself was not seen), or Failed (no answer: DNS,
   TLS, timeout). An http:// address is also marked "not https".

   www.ecfr.gov sends automated clients to a bot check and asks them to use
   its API, so an eCFR address (title, subtitle, chapter, subchapter, part,
   subpart, section, appendix) is checked with the eCFR API's ancestry
   lookup instead: OK when that part or section exists in the current CFR,
   Broken when it does not. A Cornell CFR address that is not found
   (/cfr/text/45/164) is tried in Cornell's part form (/cfr/text/45/part-164)
   and the note suggests it when that works.

   Run: node tools/check_links.mjs --links "solution/dataflows/6 CM Load 6 - Function links/function-links-import.csv" --functions functions.csv
   Needs outbound access to the sites the links point at. Behind a proxy
   (as in a Claude Code cloud session), run with NODE_USE_ENV_PROXY=1 so
   fetch uses HTTPS_PROXY. */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/* ---------- CSV ---------- */
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(v => v !== ""));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}
const cellOut = v => { const t = String(v ?? ""); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export const toCsv = (head, rows) => [head, ...rows].map(r => r.map(cellOut).join(",")).join("\r\n") + "\r\n";

/* the first of the column names present in a row */
const pick = (r, ...names) => { for (const n of names) if (r[n] != null && r[n] !== "") return String(r[n]).trim(); return ""; };

/* What to check: one entry per (where, address), from both files. */
export function targets({ links = [], functions = [] }) {
  const out = [];
  for (const r of links) {
    const url = pick(r, "su_url", "URL");
    if (url) out.push({ field: "Link (su_url)", fn: pick(r, "su_functionname", "Compliance Function", "su_function"), label: pick(r, "su_name", "Link Label"), url });
  }
  for (const r of functions) {
    const fn = pick(r, "su_name", "Compliance Function");
    const s = pick(r, "su_statuteurl", "Statute URL"), res = pick(r, "su_resourceurl", "Resource URL");
    if (s) out.push({ field: "Statute URL (su_statuteurl)", fn, label: pick(r, "su_citation", "Statute Citation", "su_statute", "Statute"), url: s });
    if (res) out.push({ field: "Resource URL (su_resourceurl)", fn, label: pick(r, "su_resourcelabel", "Resource Label"), url: res });
  }
  return out;
}

/* ---------- checking one address ---------- */
const UA = "Mozilla/5.0 (compatible; SU Compliance Matrix link check)";
const isBotCheck = at => { try { return /^unblock\./i.test(new URL(at).hostname); } catch (e) { return false; } };

/* ---------- eCFR, through its API ---------- */
const ECFR_LEVELS = ["subtitle", "chapter", "subchapter", "part", "subpart", "section", "appendix"];
export function ecfrQuery(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (!/(^|\.)ecfr\.gov$/i.test(u.hostname)) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs[0] !== "current") return null;
  const t = /^title-(\d+)$/.exec(segs[1] || "");
  if (!t) return null;
  const params = new URLSearchParams();
  for (const s of segs.slice(2)) {
    /* a subject group only groups sections; the section names itself */
    if (/^subject-group-/.test(s)) continue;
    const m = /^([a-z]+)-(.+)$/.exec(s);
    if (!m || !ECFR_LEVELS.includes(m[1])) return null;
    params.set(m[1], decodeURIComponent(m[2]));
  }
  return { title: Number(t[1]), params };
}
export function ecfrChecker({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  let titles = null;
  const get = async at => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetchImpl(at, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
  };
  return async q => {
    if (!titles) titles = get("https://www.ecfr.gov/api/versioner/v1/titles.json").then(r => r.json()).then(j => j.titles);
    const title = (await titles).find(x => x.number === q.title);
    if (!title) return { result: "Broken", status: 404, final: "", note: "no title " + q.title + " in the eCFR (checked with the eCFR API)" };
    if (title.reserved) return { result: "Broken", status: 404, final: "", note: "title " + q.title + " is reserved (checked with the eCFR API)" };
    const r = await get(`https://www.ecfr.gov/api/versioner/v1/ancestry/${title.up_to_date_as_of}/title-${q.title}.json${q.params.toString() ? "?" + q.params : ""}`);
    if (r.body && r.body.cancel) r.body.cancel().catch(() => null);
    if (r.status === 200) return { result: "OK", status: 200, final: "", note: "checked with the eCFR API" };
    if (r.status === 404) return { result: "Broken", status: 404, final: "", note: "not in the current CFR (checked with the eCFR API)" };
    return { result: "Failed", status: r.status, final: "", note: "the eCFR API answered " + r.status };
  };
}

/* a Cornell CFR address in the old form: /cfr/text/<title>/<part> */
const cornellPart = url => {
  const m = /^(https?:\/\/www\.law\.cornell\.edu\/cfr\/text\/\d+\/)(\d+[A-Za-z]?)(\/?)$/.exec(url);
  return m ? m[1] + "part-" + m[2] : null;
};

export async function checkUrl(url, { timeoutMs = 20000, fetchImpl = fetch, ecfr = null } = {}) {
  const q = ecfrQuery(url);
  if (q) {
    try { return await (ecfr || ecfrChecker({ fetchImpl, timeoutMs }))(q); }
    catch (e) { return { result: "Failed", status: "", final: "", note: "the eCFR API did not answer: " + String(e.message || e) }; }
  }
  const r = await checkPage(url, { timeoutMs, fetchImpl });
  if (r.result === "Broken" && r.status === 404) {
    const alt = cornellPart(url);
    if (alt) {
      const a = await checkPage(alt, { timeoutMs, fetchImpl });
      if (a.result === "OK" || a.result === "Moved") return { ...r, note: [r.note, "try " + alt].filter(Boolean).join("; ") };
    }
  }
  return r;
}

async function checkPage(url, { timeoutMs = 20000, fetchImpl = fetch } = {}) {
  let u;
  try { u = new URL(url); } catch (e) { return { result: "Failed", status: "", final: "", note: "not a valid address" }; }
  if (!/^https?:$/.test(u.protocol)) return { result: "Failed", status: "", final: "", note: "not a web address" };
  const ask = async (method, at) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetchImpl(at, { method, redirect: "manual", signal: ctl.signal,
        headers: { "User-Agent": UA, Accept: "*/*" } });
    } finally { clearTimeout(timer); }
  };
  const follow = async method => {
    let at = url;
    for (let hop = 0; hop <= 10; hop++) {
      const res = await ask(method, at);
      if (res.body && res.body.cancel) res.body.cancel().catch(() => null);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { at = new URL(loc, at).href; continue; }
      return { status: res.status, final: at };
    }
    return { status: "", final: at, note: "more than 10 redirects" };
  };
  try {
    let r = await follow("HEAD");
    /* sites that refuse or mishandle HEAD */
    if ([403, 405, 429, 501].includes(r.status) || r.status === 404 || r.status >= 500) {
      const g = await follow("GET");
      if (g.status) r = g;
    }
    const notHttps = u.protocol === "http:" ? "not https" : "";
    if (isBotCheck(r.final)) return { result: "Blocked", status: r.status, final: r.final, note: ["the site sent the checker to a bot check; open it by hand", notHttps].filter(Boolean).join("; ") };
    if (!r.status) return { result: "Failed", status: "", final: r.final, note: [r.note, notHttps].filter(Boolean).join("; ") };
    const moved = r.final !== url && !sameish(r.final, url);
    let result = r.status >= 200 && r.status < 300 ? (moved ? "Moved" : "OK") : "Broken";
    const notes = [];
    /* a move to a "not found" page, or to the site's home page */
    if (moved && /not[_-]?found|\b404\b|error/i.test(new URL(r.final).pathname)) { result = "Broken"; notes.push("redirected to a not-found page"); }
    else if (moved && new URL(r.final).pathname === "/" && u.pathname !== "/") notes.push("redirected to the site's home page");
    if (notHttps) notes.push(notHttps);
    return { result, status: r.status, final: moved || result !== "OK" ? r.final : "", note: notes.join("; ") };
  } catch (e) {
    const raw = String((e.cause && (e.cause.code || e.cause.message)) || e.message);
    /* a proxy that cannot reach the host ends the request without a reason */
    const why = e.name === "AbortError" && !/cancel/i.test(raw) ? "no answer in " + Math.round(timeoutMs / 1000) + "s"
      : /cancel|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(raw) ? "no connection: the host may be gone, or reachable on campus only (" + raw.replace(/\.$/, "") + ")"
      : raw;
    return { result: "Failed", status: "", final: "", note: [why, u.protocol === "http:" ? "not https" : ""].filter(Boolean).join("; ") };
  }
}
/* http to https of the same address, or a trailing slash, is not a move */
const sameish = (a, b) => {
  const n = x => x.replace(/^http:/, "https:").replace(/\/$/, "");
  return n(a) === n(b);
};

/* ---------- the run ---------- */
export async function run({ links = [], functions = [], concurrency = 6, timeoutMs, fetchImpl, onProgress } = {}) {
  const list = targets({ links, functions });
  const distinct = [...new Set(list.map(t => t.url))];
  const results = new Map();
  let next = 0, done = 0;
  const ecfr = ecfrChecker({ fetchImpl, timeoutMs });
  const worker = async () => {
    while (next < distinct.length) {
      const url = distinct[next++];
      results.set(url, await checkUrl(url, { timeoutMs, fetchImpl, ecfr }));
      done++;
      if (onProgress) onProgress(done, distinct.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, distinct.length) }, worker));
  const ORDER = { Failed: 0, Broken: 1, Blocked: 2, Moved: 3, OK: 4 };
  const rows = list.map(t => ({ ...t, ...results.get(t.url) }))
    .sort((a, b) => ORDER[a.result] - ORDER[b.result] || a.fn.localeCompare(b.fn) || a.field.localeCompare(b.field));
  const count = k => rows.filter(r => r.result === k).length;
  return { rows, distinct: distinct.length, summary: { OK: count("OK"), Moved: count("Moved"), Broken: count("Broken"), Blocked: count("Blocked"), Failed: count("Failed"), notHttps: rows.filter(r => /not https/.test(r.note)).length } };
}

export const REPORT_HEAD = ["Result", "Status", "Where", "Function", "Label", "Address", "Final address", "Note"];
export const reportCsv = rows => toCsv(REPORT_HEAD, rows.map(r => [r.result, r.status, r.field, r.fn, r.label, r.url, r.final, r.note]));

async function main(argv) {
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const read = f => (f ? parseCsv(readFileSync(f, "utf8")) : []);
  const links = read(arg("--links")), functions = read(arg("--functions"));
  if (!links.length && !functions.length) { console.error("Give --links and/or --functions (CSV files)."); return 2; }
  const out = arg("--out") || "link-check.csv";
  const r = await run({ links, functions, onProgress: (d, n) => { if (d % 25 === 0 || d === n) console.error(`checked ${d} of ${n} addresses`); } });
  writeFileSync(out, reportCsv(r.rows), "utf8");
  console.log(`${r.rows.length} links, ${r.distinct} distinct addresses: ${r.summary.OK} OK, ${r.summary.Moved} moved, ${r.summary.Broken} broken, ${r.summary.Blocked} blocked, ${r.summary.Failed} failed; ${r.summary.notHttps} not https. Report: ${out}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
