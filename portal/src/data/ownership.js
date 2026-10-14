/* Saving a function's people (its Function Ownership rows) without losing
   any of them.

   An editor sends the whole chain it shows. The save writes only the
   difference, in three steps:

     1. create the rows for people newly added,
     2. change the sub-role of rows whose sub-role was changed,
     3. delete the rows the person removed in the editor.

   A row is deleted only when the editor showed it (its row ID was on
   screen) and it is no longer in the chain. Rows the page could not show,
   such as one pointing at an inactive or missing directory person or with
   a role the page does not know, are left alone, as is a second row for
   the same person and role.

   If a step fails, the steps already done are undone in reverse order
   (created rows deleted, sub-roles put back, deleted rows created again),
   and the error names the step and the person. */

import { ROLE_COUNSEL } from "./model.js";

const keyOf = (personId, role) => String(personId).toLowerCase() + "|" + role;
const subOf = (role, sub) => (role === ROLE_COUNSEL ? "" : sub || "Primary");

/* existing: the function's rows now, [{ id, personId, role, sub, name? }]
   rows:     the chain to save, [{ personId, name, role, sub }]
   shownIds: the row IDs the editor started from */
export function ownershipPlan(existing, rows, shownIds) {
  const shown = new Set((shownIds || []).filter(id => id != null).map(String));
  const byKey = new Map();
  for (const e of existing) {
    const k = keyOf(e.personId, e.role);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(e);
  }
  const wanted = new Map();
  for (const r of rows) { const k = keyOf(r.personId, r.role); if (!wanted.has(k)) wanted.set(k, r); }

  const create = [], update = [], remove = [];
  for (const [k, r] of wanted) {
    const there = byKey.get(k);
    if (!there) { create.push(r); continue; }
    for (const e of there)
      if (shown.has(String(e.id)) && subOf(e.role, e.sub) !== subOf(r.role, r.sub))
        update.push({ ...r, id: e.id, oldSub: e.sub });
  }
  for (const e of existing)
    if (shown.has(String(e.id)) && !wanted.has(keyOf(e.personId, e.role))) remove.push(e);
  /* the roles whose people changed, for the function's own owner columns */
  const roles = [...new Set([...create, ...update, ...remove].map(x => x.role))];
  return { create, update, remove, roles };
}

const STEPS = ["", "Step 1 of 3 (adding", "Step 2 of 3 (changing the sub-role of", "Step 3 of 3 (removing"];

/* io: { create(row) -> new row ID, update(row, sub), remove(row) } */
export async function runOwnershipSave(plan, io) {
  const done = { created: [], updated: [], removed: [] };
  let step = 0, at = null;
  try {
    step = 1;
    for (const r of plan.create) { at = r; done.created.push({ ...r, id: await io.create(r) }); }
    step = 2;
    for (const r of plan.update) { at = r; await io.update(r, r.sub); done.updated.push(r); }
    step = 3;
    for (const x of plan.remove) { at = x; await io.remove(x); done.removed.push(x); }
    return done;
  } catch (e) {
    const who = x => (x.name || "a person") + " as " + x.role;
    const notUndone = [];
    for (const x of done.removed.reverse()) {
      try { await io.create(x); } catch (er) { notUndone.push("put back " + who(x)); }
    }
    for (const r of done.updated.reverse()) {
      try { await io.update(r, r.oldSub); } catch (er) { notUndone.push("put back the sub-role of " + who(r)); }
    }
    for (const r of done.created.reverse()) {
      try { if (r.id == null) throw new Error("no ID"); await io.remove(r); } catch (er) { notUndone.push("take out " + who(r)); }
    }
    const what = STEPS[step] + " " + who(at) + ") failed: " + String(e.message || e).trim().replace(/[.\s]*$/, "") + ".";
    const undone = done.created.length + done.updated.length + done.removed.length;
    throw new Error("The people were not saved. " + what + (notUndone.length
      ? " These earlier changes could not be undone: " + notUndone.join("; ") + ". Reload the page to see what is saved."
      : undone ? " The changes made before it were undone." : ""));
  }
}
