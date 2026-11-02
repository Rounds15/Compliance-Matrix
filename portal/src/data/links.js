/* A function's additional links (su_functionlink): further statutes and
   regulations, guidance and Syracuse University resources, beyond the
   function's own Statute URL and Resource URL.

   Saving writes only the difference, in three steps, the way the ownership
   chain is saved (data/ownership.js):

     1. create the links that are new,
     2. change the links whose label, address, type or order changed,
     3. delete the links that were removed in the editor.

   If a step fails, the steps already done are undone in reverse order, and
   the error names the step and the link. */

export const LINK_TYPES = ["Statute", "Regulation", "Guidance", "SU Resource"];
/* where each type shows on Function Detail */
export const STATUTE_TYPES = ["Statute", "Regulation"];
export const RESOURCE_TYPES = ["Guidance", "SU Resource"];

/* an address the page will save: https:// and a host */
export const validLinkUrl = url => /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i.test(String(url || "").trim());

/* the links in the order the page shows them */
export const byLinkOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.label).localeCompare(String(b.label));

/* What is wrong with one link in the editor, or "" when it can be saved. */
export function linkProblem(l) {
  if (!String(l.label || "").trim()) return "Give the link a label.";
  if (!validLinkUrl(l.url)) return "The address must start with https://.";
  if (!LINK_TYPES.includes(l.type)) return "Choose a link type.";
  return "";
}

/* existing: the function's links now, [{ id, label, url, type, sort, source }]
   rows:     the links to save, in order, [{ id?, label, url, type, source? }]
   Rows are numbered 1, 2, 3 in the order given. */
export function linksPlan(existing, rows) {
  const before = new Map(existing.map(x => [String(x.id), x]));
  const keep = new Set();
  const create = [], update = [];
  rows.forEach((r, i) => {
    const row = { ...r, label: String(r.label || "").trim(), url: String(r.url || "").trim(), sort: i + 1 };
    const old = r.id != null ? before.get(String(r.id)) : null;
    if (!old) { create.push({ ...row, id: undefined }); return; }
    keep.add(String(r.id));
    if (old.label !== row.label || old.url !== row.url || old.type !== row.type || (old.sort ?? 0) !== row.sort)
      update.push({ ...row, id: old.id, old });
  });
  const remove = existing.filter(x => !keep.has(String(x.id)));
  return { create, update, remove };
}

const STEPS = ["", "Step 1 of 3 (adding", "Step 2 of 3 (changing", "Step 3 of 3 (removing"];

/* io: { create(link) -> new ID, update(link), remove(link) } */
export async function runLinksSave(plan, io) {
  const done = { created: [], updated: [], removed: [] };
  let step = 0, at = null;
  try {
    step = 1;
    for (const l of plan.create) { at = l; done.created.push({ ...l, id: await io.create(l) }); }
    step = 2;
    for (const l of plan.update) { at = l; await io.update(l); done.updated.push(l); }
    step = 3;
    for (const l of plan.remove) { at = l; await io.remove(l); done.removed.push(l); }
    return done;
  } catch (e) {
    const what = l => '"' + (l.label || "a link") + '"';
    const notUndone = [];
    for (const l of done.removed.reverse()) { try { await io.create(l); } catch (er) { notUndone.push("put back " + what(l)); } }
    for (const l of done.updated.reverse()) { try { await io.update({ ...l.old, id: l.id }); } catch (er) { notUndone.push("put back " + what(l.old)); } }
    for (const l of done.created.reverse()) { try { if (l.id == null) throw new Error("no ID"); await io.remove(l); } catch (er) { notUndone.push("take out " + what(l)); } }
    const msg = STEPS[step] + " " + what(at) + ") failed: " + String(e.message || e).trim().replace(/[.\s]*$/, "") + ".";
    const undone = done.created.length + done.updated.length + done.removed.length;
    throw new Error("The links were not saved. " + msg + (notUndone.length
      ? " These earlier changes could not be undone: " + notUndone.join("; ") + ". Reload the page to see what is saved."
      : undone ? " The changes made before it were undone." : ""));
  }
}

/* a key that changes when anything the editor saves changes */
export const linksKey = rows => JSON.stringify(rows.map(r => [r.id ?? null, String(r.label || "").trim(), String(r.url || "").trim(), r.type]));
