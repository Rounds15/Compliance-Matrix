/* Runs the solution's generated cloud flows (solution/src/Workflows/*.json)
   in the tests, so what the tests check is the flow that is imported.

   A strict interpreter for the part of the Workflow Definition Language the
   flows use: the expressions and functions in FUNCS, and the action types in
   runAction. Anything else throws, so a flow cannot quietly depend on
   something this does not model. Connectors are emulated over the mock's
   tables: Dataverse (ListRecords, GetItem, CreateRecord, UpdateRecord,
   DeleteRecord, with formatted values and cascades), Office 365 Users
   (UserProfile_V2) and Office 365 Outlook (SendEmailV2).

   Not modelled: retries, parallel branches, and platform validation of the
   definition itself. Those are proved only by importing the solution. */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORKFLOWS = join(HERE, "..", "..", "solution", "src", "Workflows");
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* the generated flows, by display name */
export function loadFlows() {
  const out = {};
  for (const f of readdirSync(WORKFLOWS).filter(n => n.endsWith(".json.data.xml"))) {
    const xml = readFileSync(join(WORKFLOWS, f), "utf8");
    const name = /Name="([^"]+)"/.exec(xml)[1];
    out[name] = JSON.parse(readFileSync(join(WORKFLOWS, f.replace(/\.data\.xml$/, "")), "utf8"));
  }
  return out;
}

class FlowError extends Error {}
class ConnectorError extends Error { constructor(status, message) { super(message); this.status = status; } }
class Terminate { constructor(status, message) { this.status = status; this.message = message; } }

/* ---------------- expressions ---------------- */
function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let s = ""; i++;
      for (;;) {
        if (i >= src.length) throw new FlowError("unterminated string in " + src);
        if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
        s += src[i++];
      }
      out.push({ t: "str", v: s }); continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num && (c !== "-" || /[\d]/.test(src[i + 1]))) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if ("(),[].?".includes(c)) { out.push({ t: c }); i++; continue; }
    throw new FlowError(`unexpected '${c}' in expression: ${src}`);
  }
  return out;
}

/* every expression in a definition value: whole-value "@..." and each "@{...}" */
export function expressionsIn(v, out = []) {
  if (typeof v === "string") {
    if (v.startsWith("@") && !v.startsWith("@{") && !v.startsWith("@@")) out.push(v.slice(1));
    let i = 0;
    while ((i = v.indexOf("@{", i)) >= 0) {
      let k = i + 2, depth = 1, inStr = false;
      while (k < v.length && depth) {
        const c = v[k];
        if (inStr) { if (c === "'") { if (v[k + 1] === "'") k++; else inStr = false; } }
        else if (c === "'") inStr = true; else if (c === "{") depth++; else if (c === "}") depth--;
        k++;
      }
      if (depth) throw new FlowError("unclosed @{ in " + v);
      out.push(v.slice(i + 2, k - 1));
      i = k;
    }
  } else if (Array.isArray(v)) v.forEach(x => expressionsIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach(x => expressionsIn(x, out));
  return out;
}

export function parseExpression(src) {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], take = t => { const k = toks[p]; if (!k || (t && k.t !== t)) throw new FlowError(`expected ${t} at ${p} in: ${src}`); p++; return k; };
  function primary() {
    const k = take();
    if (k.t === "str" || k.t === "num") return { lit: k.v };
    if (k.t !== "id") throw new FlowError(`unexpected ${k.t} in: ${src}`);
    if (peek() && peek().t === "(") {
      take("("); const args = [];
      if (peek().t !== ")") { args.push(expr()); while (peek().t === ",") { take(","); args.push(expr()); } }
      take(")");
      if (!FUNCS[k.v] && !CTX_FUNCS.has(k.v)) throw new FlowError(`function ${k.v}() is not modelled (in: ${src})`);
      return { fn: k.v, args };
    }
    if (k.v === "true") return { lit: true };
    if (k.v === "false") return { lit: false };
    if (k.v === "null") return { lit: null };
    throw new FlowError(`bare name ${k.v} in: ${src}`);
  }
  function expr() {
    let node = primary();
    for (;;) {
      const k = peek(); if (!k) break;
      let safe = false;
      if (k.t === "?") { take("?"); safe = true; }
      const n = peek();
      if (n && n.t === "[") { take("["); const key = expr(); take("]"); node = { get: node, key, safe }; }
      else if (n && n.t === "." ) { take("."); node = { get: node, key: { lit: take("id").v }, safe }; }
      else if (safe) throw new FlowError("? without [ or . in: " + src);
      else break;
    }
    return node;
  }
  const tree = expr();
  if (p !== toks.length) throw new FlowError("trailing tokens in: " + src);
  return tree;
}

const str = v => {
  if (typeof v !== "string") throw new FlowError(`expected a string, got ${JSON.stringify(v)}`);
  return v;
};
const bool = v => { if (typeof v !== "boolean") throw new FlowError(`expected a boolean, got ${JSON.stringify(v)}`); return v; };
const numArg = v => { if (typeof v !== "number") throw new FlowError(`expected a number, got ${JSON.stringify(v)}`); return v; };
const asText = v => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

function easternParts(d) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const o = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { y: o.year, m: o.month, d: o.day };
}
function fmtDate(parts, fmt) {
  if (fmt === "yyyy-MM-dd") return `${parts.y}-${parts.m}-${parts.d}`;
  if (fmt === "MM/dd/yyyy") return `${parts.m}/${parts.d}/${parts.y}`;
  throw new FlowError("date format not modelled: " + fmt);
}

const FUNCS = {
  equals: (a, b) => (a !== null && typeof a === "object") || (b !== null && typeof b === "object") ? JSON.stringify(a) === JSON.stringify(b) : a === b,
  and: (...a) => a.every(bool), or: (...a) => a.some(bool), not: a => !bool(a),
  empty: v => {
    if (v === null || v === undefined) return true;
    if (typeof v === "string" || Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    throw new FlowError("empty() of " + JSON.stringify(v));
  },
  length: v => { if (typeof v === "string" || Array.isArray(v)) return v.length; throw new FlowError("length() of " + JSON.stringify(v)); },
  first: v => { if (Array.isArray(v)) return v.length ? v[0] : null; if (typeof v === "string") return v[0] ?? ""; throw new FlowError("first() of " + JSON.stringify(v)); },
  if: (c, a, b) => (bool(c) ? a : b),
  concat: (...a) => a.map(asText).join(""),
  replace: (s, a, b) => str(s).split(str(a)).join(str(b)),
  toLower: s => str(s).toLowerCase(),
  trim: s => str(s).trim(),
  coalesce: (...a) => { const v = a.find(x => x !== null && x !== undefined); return v === undefined ? null : v; },
  greater: (a, b) => numArg(a) > numArg(b),
  sub: (a, b) => numArg(a) - numArg(b),
  min: (...a) => Math.min(...a.map(numArg)),
  int: v => { const n = parseInt(String(v), 10); if (Number.isNaN(n) || !/^-?\d+$/.test(String(v).trim())) throw new FlowError("int() of " + JSON.stringify(v)); return n; },
  string: v => asText(v),
  json: v => { try { return JSON.parse(str(v)); } catch (e) { throw new FlowError("json() of " + JSON.stringify(v)); } },
  addProperty: (o, k, v) => { if (!o || typeof o !== "object" || k in o) throw new FlowError("addProperty() on " + JSON.stringify(o)); return { ...o, [k]: v }; },
  substring: (s, start, len) => { str(s); if (start < 0 || start + len > s.length) throw new FlowError(`substring(${JSON.stringify(s)}, ${start}, ${len}) is out of range`); return s.substr(start, len); },
  utcNow: () => new Date().toISOString(),
  convertFromUtc: (ts, tz, fmt) => { if (tz !== "Eastern Standard Time") throw new FlowError("time zone not modelled: " + tz); return fmtDate(easternParts(new Date(str(ts))), fmt); },
  formatDateTime: (ts, fmt) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(ts)); if (!m) throw new FlowError("formatDateTime() of " + ts);
    return fmtDate({ y: m[1], m: m[2], d: m[3] }, fmt);
  }
};
const CTX_FUNCS = new Set(["triggerBody", "triggerOutputs", "body", "outputs", "actions", "variables", "item", "items", "workflow", "parameters"]);

function getProp(obj, key, safe) {
  if (obj === null || obj === undefined) {
    if (safe) return null;
    throw new FlowError(`property '${key}' of null`);
  }
  if (typeof obj !== "object") throw new FlowError(`property '${key}' of ${JSON.stringify(obj)}`);
  if (Array.isArray(obj)) { if (typeof key !== "number") throw new FlowError(`array index ${key}`); return obj[key] ?? null; }
  if (key in obj) return obj[key];
  /* Power Automate's path keys: triggerOutputs()?['body/column'] */
  if (typeof key === "string" && key.includes("/")) {
    return key.split("/").reduce((o, k) => getProp(o, k, true), obj);
  }
  return null;
}

/* ---------------- the run ---------------- */
export function runFlow(def, { trigger = {}, dataverse, users, outlook, workflow = {} }) {
  const d = def.properties.definition;
  const run = { states: {}, vars: {}, loops: [], emails: [], response: null, log: [] };
  /* only the connectors the flow declares a connection reference for */
  const all = { shared_commondataserviceforapps: dataverse, shared_office365users: users, shared_office365: outlook };
  const conns = Object.fromEntries(Object.keys(def.properties.connectionReferences).map(k => [k, all[k]]));
  const wf = { name: "flow", tags: { environmentName: "env" }, run: { name: "run" }, ...workflow };

  function state(name) {
    const s = run.states[name];
    if (!s) throw new FlowError(`action '${name}' has not run`);
    if (s.status === "Skipped") throw new FlowError(`action '${name}' was skipped`);
    return s;
  }
  function call(fn, args) {
    switch (fn) {
      case "triggerBody": return trigger.body ?? null;
      case "triggerOutputs": return trigger;
      case "body": return state(args[0]).body ?? null;
      case "outputs": return state(args[0]).outputs ?? null;
      case "actions": { const s = run.states[args[0]]; if (!s) throw new FlowError(`action '${args[0]}' has not run`); return { status: s.status, outputs: s.outputs ?? null }; }
      case "variables": if (!(args[0] in run.vars)) throw new FlowError(`variable '${args[0]}' is not initialized`); return run.vars[args[0]];
      case "item": if (!run.loops.length) throw new FlowError("item() outside a loop"); return run.loops.at(-1).item;
      case "items": { const l = run.loops.findLast(x => x.name === args[0]); if (!l) throw new FlowError(`items('${args[0]}') outside that loop`); return l.item; }
      case "workflow": return wf;
      case "parameters": return {};
      default: return FUNCS[fn](...args);
    }
  }
  function evalNode(n) {
    if ("lit" in n) return n.lit;
    if (n.fn) return call(n.fn, n.args.map(evalNode));
    return getProp(evalNode(n.get), evalNode(n.key), n.safe);
  }
  const expr = src => evalNode(parseExpression(src));
  function interpolate(s) {
    let out = "", i = 0;
    while (i < s.length) {
      const j = s.indexOf("@{", i);
      if (j < 0) { out += s.slice(i); break; }
      out += s.slice(i, j);
      let k = j + 2, depth = 1, inStr = false;
      while (k < s.length && depth) {
        const c = s[k];
        if (inStr) { if (c === "'") { if (s[k + 1] === "'") k++; else inStr = false; } }
        else if (c === "'") inStr = true; else if (c === "{") depth++; else if (c === "}") depth--;
        k++;
      }
      if (depth) throw new FlowError("unclosed @{ in " + s);
      out += asText(expr(s.slice(j + 2, k - 1)));
      i = k;
    }
    return out;
  }
  function value(v) {
    if (typeof v === "string") {
      if (v.startsWith("@@")) return v.slice(1);
      if (v.startsWith("@") && !v.startsWith("@{")) return expr(v.slice(1));
      return v.includes("@{") ? interpolate(v) : v;
    }
    if (Array.isArray(v)) return v.map(value);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)]));
    return v;
  }
  function condition(c) {
    if (typeof c === "string") return bool(value(c));
    const [op, arg] = Object.entries(c)[0];
    if (op === "and") return arg.map(condition).every(Boolean);
    if (op === "or") return arg.map(condition).some(Boolean);
    if (op === "not") return !condition(arg);
    if (op === "equals") return FUNCS.equals(value(arg[0]), value(arg[1]));
    throw new FlowError("condition operator not modelled: " + op);
  }

  /* Run a scope's actions in dependency order. Its status: Failed when an
     action failed and nothing in the scope runs after that failure. */
  function runScope(actions) {
    const names = Object.keys(actions);
    const done = new Set();
    for (const n of names) delete run.states[n];
    while (done.size < names.length) {
      const ready = names.find(n => !done.has(n) && Object.keys(actions[n].runAfter || {}).every(dep => done.has(dep)));
      if (!ready) throw new FlowError("runAfter cycle or missing dependency among " + names.join(", "));
      const a = actions[ready];
      const ok = Object.entries(a.runAfter || {}).every(([dep, sts]) => sts.includes(run.states[dep].status));
      if (ok) runAction(ready, a); else run.states[ready] = { status: "Skipped" };
      done.add(ready);
    }
    const handled = n => names.some(m => Object.entries(actions[m].runAfter || {})
      .some(([dep, sts]) => dep === n && (sts.includes("Failed") || sts.includes("TimedOut"))));
    return names.some(n => ["Failed", "TimedOut"].includes(run.states[n].status) && !handled(n)) ? "Failed" : "Succeeded";
  }

  function runAction(name, a) {
    const set = (status, extra = {}) => { run.states[name] = { status, ...extra }; };
    try {
      switch (a.type) {
        case "Compose": { const v = value(a.inputs); return set("Succeeded", { outputs: v, body: v }); }
        case "InitializeVariable": { for (const v of a.inputs.variables) run.vars[v.name] = value(v.value); return set("Succeeded"); }
        case "SetVariable": {
          if (!(a.inputs.name in run.vars)) throw new FlowError(`variable '${a.inputs.name}' is not initialized`);
          run.vars[a.inputs.name] = value(a.inputs.value); return set("Succeeded");
        }
        case "If": {
          const branch = condition(a.expression) ? a.actions : (a.else && a.else.actions) || {};
          return set(runScope(branch));
        }
        case "Switch": {
          const v = value(a.expression);
          const c = Object.values(a.cases).find(x => x.case === v);
          return set(runScope(c ? c.actions : (a.default && a.default.actions) || {}));
        }
        case "Scope": return set(runScope(a.actions));
        case "Foreach": {
          const list = value(a.foreach);
          if (!Array.isArray(list)) throw new FlowError(`Foreach over ${JSON.stringify(list)}`);
          let status = "Succeeded";
          for (const item of list) {
            run.loops.push({ name, item });
            try { if (runScope(a.actions) === "Failed") status = "Failed"; } finally { run.loops.pop(); }
          }
          return set(status);
        }
        case "Query": {
          const from = value(a.inputs.from);
          if (!Array.isArray(from)) throw new FlowError("Query from " + JSON.stringify(from));
          const out = from.filter(item => { run.loops.push({ name, item }); try { return bool(value(a.inputs.where)); } finally { run.loops.pop(); } });
          return set("Succeeded", { body: out, outputs: { body: out } });
        }
        case "Terminate": throw new Terminate(a.inputs.runStatus, a.inputs.runError && a.inputs.runError.message);
        case "Response": {
          const r = { statusCode: value(a.inputs.statusCode), body: value(a.inputs.body) };
          if (!run.response) run.response = r;
          return set("Succeeded");
        }
        case "OpenApiConnection": {
          const host = a.inputs.host;
          const handler = conns[host.connectionName];
          if (!handler) throw new FlowError("no connector " + host.connectionName);
          const params = value(a.inputs.parameters);
          run.log.push({ action: name, op: host.operationId, params });
          const body = handler(host.operationId, params);
          return set("Succeeded", { body, outputs: { statusCode: 200, body } });
        }
        default: throw new FlowError("action type not modelled: " + a.type);
      }
    } catch (e) {
      if (e instanceof Terminate) throw e;
      if (e instanceof ConnectorError) return set("Failed", { body: { error: { message: e.message } }, outputs: { statusCode: e.status, body: { error: { message: e.message } } }, error: e.message });
      throw e; // a FlowError is a bug in the flow or in this model: fail the test
    }
  }

  let status = "Succeeded", message = null;
  try {
    const trig = Object.values(d.triggers)[0];
    for (const c of trig.conditions || []) {
      if (!bool(value(c.expression))) return { status: "NotTriggered", response: null, emails: run.emails, log: run.log };
    }
    status = runScope(d.actions);
  } catch (e) {
    if (!(e instanceof Terminate)) throw e;
    status = e.status; message = e.message;
  }
  return { status, message, response: run.response, emails: outlook && outlook.sent, log: run.log, vars: run.vars };
}

/* ---------------- connectors over the mock's tables ---------------- */

/* OData $filter: comparisons with eq, joined by and / or, in parentheses */
function parseFilter(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src[i] === "(" || src[i] === ")") { toks.push(src[i++]); continue; }
    if (src[i] === "'") {
      let s = ""; i++;
      for (;;) { if (i >= src.length) throw new ConnectorError(400, "unterminated string in $filter"); if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; } s += src[i++]; }
      toks.push({ s }); continue;
    }
    const w = /^[A-Za-z0-9_.\-]+/.exec(src.slice(i));
    if (!w) throw new ConnectorError(400, "bad $filter: " + src);
    toks.push(w[0]); i += w[0].length;
  }
  let p = 0;
  const lit = t => {
    if (t && typeof t === "object") return t.s;
    if (t === "null") return null; if (t === "true") return true; if (t === "false") return false;
    if (GUID.test(t)) return t.toLowerCase();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    throw new ConnectorError(400, `bad value '${t}' in $filter: ${src}`);
  };
  function term() {
    if (toks[p] === "(") { p++; const e = or(); if (toks[p++] !== ")") throw new ConnectorError(400, "unbalanced $filter: " + src); return e; }
    const field = toks[p++], op = toks[p++], v = lit(toks[p++]);
    if (op !== "eq") throw new ConnectorError(400, `operator ${op} not modelled in $filter`);
    return { field, v };
  }
  function and() { let e = term(); while (toks[p] === "and") { p++; e = { and: [e, term()] }; } return e; }
  function or() { let e = and(); while (toks[p] === "or") { p++; e = { or: [e, and()] }; } return e; }
  const tree = or();
  if (p !== toks.length) throw new ConnectorError(400, "trailing $filter: " + src);
  return tree;
}
function matches(row, f) {
  if (f.and) return f.and.every(x => matches(row, x));
  if (f.or) return f.or.some(x => matches(row, x));
  const v = row[f.field] ?? null;
  if (f.v === null) return v === null;
  if (typeof f.v === "string" && typeof v === "string") return v.toLowerCase() === f.v.toLowerCase();
  return v === f.v;
}

export function dataverseConnector({ dv, schema, contacts = [], roleRelationship }) {
  /* the tables the flows touch that are not in the solution */
  const SYSTEM = {
    contacts: { id: "contactid", primaryName: "fullname", columns: { contactid: 1, fullname: 1, emailaddress1: 1, [roleRelationship]: 1 } },
    adx_externalidentities: { id: "adx_externalidentityid", primaryName: "adx_username", columns: { adx_externalidentityid: 1, adx_username: 1, adx_identityprovidername: 1, _adx_contactid_value: 1 }, lookups: { _adx_contactid_value: "contacts" } }
  };
  dv.contacts = contacts;
  dv.adx_externalidentities = dv.adx_externalidentities || [];
  const tableOf = set => {
    if (SYSTEM[set]) return { set, ...SYSTEM[set] };
    const e = Object.entries(schema).find(([, t]) => t.set === set);
    if (!e) throw new ConnectorError(404, `Resource not found for the segment '${set}'.`);
    return { set, logical: e[0], ...e[1] };
  };
  const knows = (t, col) => {
    if (col === t.id || col === "statecode") return true;
    if (t.logical) { const lk = /^_(.+)_value$/.exec(col); return col in t.columns || (lk && String(t.columns[lk[1]] || "").startsWith("lookup:")); }
    return col in t.columns;
  };
  const nameOf = (set, id) => {
    const t = tableOf(set), row = (dv[set] || []).find(r => String(r[t.id]).toLowerCase() === String(id).toLowerCase());
    return row ? row[t.primaryName] ?? null : null;
  };
  /* what the connector returns: the row, plus formatted values */
  function shape(t, row) {
    const out = { ...row };
    if (t.logical) {
      for (const [col, kind] of Object.entries(t.columns)) {
        if (kind.startsWith("lookup:") && row["_" + col + "_value"]) {
          const target = kind.slice(7);
          if (schema[target]) out["_" + col + "_value" + FORMATTED] = nameOf(schema[target].set, row["_" + col + "_value"]);
        }
        if (t.choiceLabels[col] && row[col] != null) out[col + FORMATTED] = t.choiceLabels[col][String(row[col])] ?? null;
      }
    }
    for (const [col, set] of Object.entries(t.lookups || {})) if (row[col]) out[col + FORMATTED] = nameOf(set, row[col]);
    return out;
  }
  function write(t, row, params) {
    for (const [k, v] of Object.entries(params)) {
      if (!k.startsWith("item/")) continue;
      const col = k.slice(5);
      if (col.endsWith("@odata.bind")) {
        const nav = col.slice(0, -11);
        const kind = String(t.columns[nav] || "");
        if (!kind.startsWith("lookup:")) throw new ConnectorError(400, `${t.logical} has no lookup ${nav}`);
        if (v === null) { row["_" + nav + "_value"] = null; continue; }
        const m = /^\/?([a-z_]+)\(([0-9a-f-]{36})\)$/i.exec(String(v));
        if (!m) throw new ConnectorError(400, `${col} must be <entityset>(<guid>), got ${v}`);
        const target = kind.slice(7);
        const tset = target === "contact" ? "contacts" : schema[target].set;
        if (m[1] !== tset) throw new ConnectorError(400, `${col} must bind to ${tset}, got ${m[1]}`);
        if (target !== "contact" && !dv[tset].some(r => r[target + "id"] === m[2].toLowerCase())) throw new ConnectorError(400, `${col} points at a missing ${target}`);
        row["_" + nav + "_value"] = m[2].toLowerCase();
        continue;
      }
      const kind = t.columns[col];
      if (!kind) throw new ConnectorError(400, `${t.logical} has no column ${col}`);
      if (kind.startsWith("lookup:")) throw new ConnectorError(400, `${col} is a lookup; bind it`);
      if (v !== null && kind === "Choice" && !Number.isInteger(v)) throw new ConnectorError(400, `${col} is a choice; got ${JSON.stringify(v)}`);
      if (v !== null && kind === "Boolean" && typeof v !== "boolean") throw new ConnectorError(400, `${col} is yes/no; got ${JSON.stringify(v)}`);
      if (v !== null && (kind === "Integer" || kind === "Decimal") && typeof v !== "number") throw new ConnectorError(400, `${col} is a number; got ${JSON.stringify(v)}`);
      if (v !== null && kind === "DateTime" && !/^\d{4}-\d{2}-\d{2}/.test(v)) throw new ConnectorError(400, `${col} needs a date; got ${JSON.stringify(v)}`);
      if (v !== null && (kind === "String" || kind === "Memo") && typeof v !== "string") throw new ConnectorError(400, `${col} is text; got ${JSON.stringify(v)}`);
      row[col] = v;
    }
  }
  function remove(t, id) {
    const rows = dv[t.set];
    const i = rows.findIndex(r => r[t.id] === id);
    if (i < 0) throw new ConnectorError(404, `${t.logical} ${id} does not exist`);
    rows.splice(i, 1);
    /* the relationships' delete behavior: Cascade where the schema says so, otherwise Remove Link */
    for (const [logical, other] of Object.entries(schema)) {
      for (const [col, kind] of Object.entries(other.columns)) {
        if (kind !== "lookup:" + t.logical) continue;
        const refs = (dv[other.set] || []).filter(r => r["_" + col + "_value"] === id);
        for (const r of refs) {
          if (other.cascadeDelete[col] === "Cascade") remove({ set: other.set, logical, ...other }, r[other.id]);
          else r["_" + col + "_value"] = null;
        }
      }
    }
  }

  return (operation, p) => {
    const t = tableOf(p.entityName);
    const rows = dv[t.set];
    switch (operation) {
      case "ListRecords": {
        for (const c of String(p.$select || "").split(",").filter(Boolean)) if (!knows(t, c)) throw new ConnectorError(400, `Could not find a property named '${c}' on ${t.set}`);
        const f = p.$filter ? parseFilter(p.$filter) : null;
        const check = n => { if (n.and || n.or) (n.and || n.or).forEach(check); else if (!knows(t, n.field)) throw new ConnectorError(400, `Could not find a property named '${n.field}' on ${t.set}`); };
        if (f) check(f);
        let out = rows.filter(r => !f || matches(r, f)).map(r => shape(t, r));
        if (p.$expand) {
          const rel = /^([A-Za-z_]+)/.exec(p.$expand)[1];
          if (rel !== roleRelationship || t.set !== "contacts") throw new ConnectorError(400, `cannot expand ${rel} on ${t.set}`);
          out = out.map(r => ({ ...r, [rel]: (r[rel] || []).map(name => ({ name })) }));
        }
        if (p.$top) out = out.slice(0, Number(p.$top));
        return { value: out };
      }
      case "GetItem": {
        if (!GUID.test(String(p.recordId))) throw new ConnectorError(400, `'${p.recordId}' is not a valid id`);
        const row = rows.find(r => String(r[t.id]).toLowerCase() === String(p.recordId).toLowerCase());
        if (!row) throw new ConnectorError(404, `${t.set} With Id = ${p.recordId} Does Not Exist`);
        return shape(t, row);
      }
      case "UpdateRecord": {
        if (!GUID.test(String(p.recordId))) throw new ConnectorError(400, `'${p.recordId}' is not a valid id`);
        const row = rows.find(r => r[t.id] === String(p.recordId).toLowerCase());
        if (!row) throw new ConnectorError(404, `${t.set} With Id = ${p.recordId} Does Not Exist`);
        write(t, row, p);
        return shape(t, row);
      }
      case "CreateRecord": {
        const row = { [t.id]: randomUUID() };
        write(t, row, p);
        rows.push(row);
        return shape(t, row);
      }
      case "DeleteRecord": remove(t, String(p.recordId).toLowerCase()); return {};
      default: throw new FlowError("Dataverse operation not modelled: " + operation);
    }
  };
}

export function usersConnector(people) {
  return (operation, p) => {
    if (operation !== "UserProfile_V2") throw new FlowError("Office 365 Users operation not modelled: " + operation);
    const id = String(p.id || "").toLowerCase();
    const u = people.find(x => x.id.toLowerCase() === id || x.userPrincipalName.toLowerCase() === id);
    if (!u) throw new ConnectorError(404, "User not found");
    const fields = String(p.$select || "").split(",").filter(Boolean);
    return fields.length ? Object.fromEntries(fields.map(f => [f, u[f] ?? null])) : { ...u };
  };
}

export function outlookConnector() {
  const sent = [];
  const fn = (operation, p) => {
    if (operation !== "SendEmailV2") throw new FlowError("Outlook operation not modelled: " + operation);
    for (const k of ["emailMessage/To", "emailMessage/Subject", "emailMessage/Body"]) if (!p[k]) throw new ConnectorError(400, k + " is required");
    sent.push({ to: p["emailMessage/To"], subject: p["emailMessage/Subject"], body: p["emailMessage/Body"] });
    return {};
  };
  fn.sent = sent;
  return fn;
}
