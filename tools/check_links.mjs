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
   address), Broken (4xx or 5xx), or Failed (no answer: DNS, TLS, timeout).
   An http:// address is also marked "not https".

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
export async function checkUrl(url, { timeoutMs = 20000, fetchImpl = fetch } = {}) {
  let u;
  try { u = new URL(url); } catch (e) { return { result: "Failed", status: "", final: "", note: "not a valid address" }; }
  if (!/^https?:$/.test(u.protocol)) return { result: "Failed", status: "", final: "", note: "not a web address" };
  const ask = async (method, at) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetchImpl(at, { method, redirect: "manual", signal: ctl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SU Compliance Matrix link check)", Accept: "*/*" } });
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
    if (!r.status) return { result: "Failed", status: "", final: r.final, note: [r.note, notHttps].filter(Boolean).join("; ") };
    const moved = r.final !== url && !sameish(r.final, url);
    const result = r.status >= 200 && r.status < 300 ? (moved ? "Moved" : "OK") : "Broken";
    return { result, status: r.status, final: moved || result !== "OK" ? r.final : "", note: notHttps };
  } catch (e) {
    const why = e.name === "AbortError" ? "no answer in " + Math.round(timeoutMs / 1000) + "s" : String((e.cause && (e.cause.code || e.cause.message)) || e.message);
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
  const worker = async () => {
    while (next < distinct.length) {
      const url = distinct[next++];
      results.set(url, await checkUrl(url, { timeoutMs, fetchImpl }));
      done++;
      if (onProgress) onProgress(done, distinct.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, distinct.length) }, worker));
  const ORDER = { Failed: 0, Broken: 1, Moved: 2, OK: 3 };
  const rows = list.map(t => ({ ...t, ...results.get(t.url) }))
    .sort((a, b) => ORDER[a.result] - ORDER[b.result] || a.fn.localeCompare(b.fn) || a.field.localeCompare(b.field));
  const count = k => rows.filter(r => r.result === k).length;
  return { rows, distinct: distinct.length, summary: { OK: count("OK"), Moved: count("Moved"), Broken: count("Broken"), Failed: count("Failed"), notHttps: rows.filter(r => /not https/.test(r.note)).length } };
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
  console.log(`${r.rows.length} links, ${r.distinct} distinct addresses: ${r.summary.OK} OK, ${r.summary.Moved} moved, ${r.summary.Broken} broken, ${r.summary.Failed} failed; ${r.summary.notHttps} not https. Report: ${out}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
