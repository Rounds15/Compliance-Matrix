/* Checks the generated Power Query M (every .pq file under solution/dataflows).

   1. Each query parses with Microsoft's Power Query parser
      (@microsoft/powerquery-parser, a portal dev dependency).
   2. Every plain name a query uses is defined in it: a let step, a function
      parameter, a record field in scope, or _ inside each.
   3. Every library name (Text.From and the like) is on LIBRARY, the M
      standard library functions these queries are written against, so a
      misspelt one fails here instead of in the Power Query editor.

   It does not run the queries: a query that parses and names only real
   things can still fail on the data, which the editor's preview shows.

   Run: node tools/check_m.mjs   (from the repository root) */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "portal", "package.json"));
const pq = require("@microsoft/powerquery-parser");

const LIBRARY = new Set([
  "SharePoint.Tables",
  "Text.From", "Text.Trim", "Text.Combine", "Text.Start", "Text.Lower", "Text.FromBinary",
  "Record.FieldOrDefault", "Record.HasFields", "Record.FromList", "Record.FieldNames", "Record.Field", "Record.RemoveFields",
  "List.IsEmpty", "List.Transform", "List.Select", "List.RemoveNulls", "List.Buffer", "List.Contains",
  "Date.From", "Date.ToText", "DateTimeZone.ToUtc", "DateTimeZone.From", "DateTimeZone.ToText",
  "Int64.From", "Int64.Type", "Number.Round", "Number.From",
  "Table.Buffer", "Table.SelectColumns", "Table.SelectRows", "Table.Sort", "Table.RowCount", "Table.ToRecords", "Table.FromRecords",
  "Json.FromValue", "TextEncoding.Utf8", "MissingField.Ignore"
]);

function files(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".pq") ? [p] : [];
  });
}

const literal = n => n && (n.literal ?? (n.identifier && n.identifier.literal));

function scopeErrors(ast) {
  const errors = [];
  const walk = (n, scope) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(x => walk(x, scope)); return; }
    switch (n.kind) {
      case "LetExpression": {
        const pairs = n.variableList.elements.map(e => e.node);
        const inner = new Set([...scope, ...pairs.map(p => literal(p.key))]);
        pairs.forEach(p => walk(p.value, inner));
        walk(n.expression, inner);
        return;
      }
      case "FunctionExpression": {
        const params = n.parameters.content.elements.map(e => literal(e.node.name));
        walk(n.expression, new Set([...scope, ...params]));
        return;
      }
      case "EachExpression": walk(n.paired, new Set([...scope, "_"])); return;
      case "RecordExpression": {
        const pairs = n.content.elements.map(e => e.node);
        const inner = new Set([...scope, ...pairs.map(p => literal(p.key))]);
        pairs.forEach(p => walk(p.value, inner));
        return;
      }
      case "IdentifierExpression": {
        const name = literal(n.identifier);
        if (name.includes(".")) { if (!LIBRARY.has(name)) errors.push(`unknown library name ${name}`); }
        else if (!scope.has(name)) errors.push(`${name} is not defined`);
        return;
      }
      case "FieldSelector": case "FieldProjection": return; // field names, not references
      default:
        for (const [k, v] of Object.entries(n)) if (k !== "tokenRange" && v && typeof v === "object") walk(v, scope);
    }
  };
  walk(ast, new Set());
  return errors;
}

const dir = join(ROOT, "solution", "dataflows");
let failed = 0, n = 0;
for (const f of files(dir).sort()) {
  n++;
  const src = readFileSync(f, "utf8");
  const r = await pq.TaskUtils.tryLexParse(pq.DefaultSettings, src);
  const name = relative(ROOT, f);
  if (!pq.TaskUtils.isParseStageOk(r)) {
    failed++;
    console.log(`FAIL  ${name}: ${r.error && (r.error.message || r.error.innerError?.message || String(r.error))}`);
    continue;
  }
  const errs = [...new Set(scopeErrors(r.ast))];
  if (errs.length) { failed++; console.log(`FAIL  ${name}: ${errs.join("; ")}`); }
  else console.log(`ok    ${name}`);
}
console.log(`\n${n - failed} of ${n} queries parse, and name only defined steps and known library functions.`);
process.exit(failed || !n ? 1 : 0);
