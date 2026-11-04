/* The administrators' deadline editor on Function Detail: edit, add and
   delete a compliance deadline. Changing the cadence recalculates the next
   due date (lib/deadlines.js, recalcDue) and shows the change before it is
   saved. The function is fixed to the page's function. */

import React, { useMemo, useState } from "react";
import { Icon, Modal, ModalHead, Busy, useApp } from "./parts.jsx";
import { allRows } from "../data/model.js";
import { cadenceMonths, recalcDue } from "../lib/deadlines.js";
import { fmtDate, isoDate, toDay } from "../lib/dates.js";

/* [stored value, label]: the stored values are the su_cadence choice labels
   the reminder flow reads */
export const CADENCES = [["Annually", "Annual"], ["Semiannual", "Semi-Annual"], ["Quarterly", "Quarterly"],
  ["Monthly", "Monthly"], ["One-time", "One-Time"], ["Ongoing", "As Needed"]];
/* a row's cadence as one of those values, or as it was entered */
export function cadenceValue(c) {
  const v = String(c || "").trim();
  if (CADENCES.some(([k]) => k === v)) return v;
  const m = cadenceMonths(v);
  const hit = { 12: "Annually", 6: "Semiannual", 3: "Quarterly", 1: "Monthly" }[m];
  if (hit) return hit;
  if (/^one[\s-]?time$/i.test(v)) return "One-time";
  if (/^(ongoing|as needed)$/i.test(v)) return "Ongoing";
  return v;
}

export function DeadlineEditor({ f, dl, onClose }) {
  const { ds, actions, today, flash } = useApp();
  const isNew = !dl;
  const startCadence = isNew ? "Annually" : cadenceValue(dl.cadence);
  const [draft, setDraft] = useState(() => ({
    title: dl ? dl.title : "", due: dl && dl.due ? isoDate(dl.due) : "",
    cadence: startCadence, narrative: dl ? dl.narrative : "", reporting: dl ? dl.reporting : "",
    ownerId: dl && dl.assignee ? String(dl.assignee.id) : ""
  }));
  const [dueTouched, setDueTouched] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tried, setTried] = useState(false);
  const set = patch => setDraft(x => ({ ...x, ...patch }));

  /* the people to choose from: the function's Accountability Structure first */
  const chain = useMemo(() => {
    const seen = new Set();
    return allRows(f).map(r => r.person).filter(p => p && !p.none && p.id != null && !seen.has(String(p.id)) && seen.add(String(p.id)));
  }, [f]);
  const others = useMemo(() => ds.people.filter(p => !p.counselOnly && !chain.some(c => String(c.id) === String(p.id)))
    .sort((a, b) => a.n.localeCompare(b.n)), [ds, chain]);
  const options = CADENCES.some(([k]) => k === startCadence) ? CADENCES : [...CADENCES, [startCadence, startCadence + " (as entered)"]];

  /* a cadence change on an existing deadline: recount the next due date */
  const cadenceChanged = !isNew && draft.cadence !== startCadence;
  const changeCadence = cadence => {
    const patch = { cadence };
    if (!isNew && !dueTouched) {
      const next = cadence === startCadence ? dl.due
        : recalcDue({ cadence, lastDone: dl.lastDone, currentDue: dl.due, today });
      patch.due = next ? isoDate(next) : draft.due;
    }
    set(patch);
  };
  const newDue = toDay(draft.due);
  const preview = cadenceChanged && !dueTouched && dl.due && newDue && isoDate(newDue) !== isoDate(dl.due);

  const ok = draft.title.trim() && newDue;
  const save = async () => {
    if (!ok) { setTried(true); flash("A deadline needs a name and a due date.", "error"); return; }
    try {
      await actions.saveDeadline({
        /* the shown name has the record number taken off: keep the stored
           name unless the administrator changed it */
        id: dl ? dl.id : null, functionId: f.id, title: dl && draft.title.trim() === dl.title && dl.rawTitle ? dl.rawTitle : draft.title.trim(), due: newDue,
        cadence: draft.cadence, cadenceChanged, deadlineType: dl ? dl.deadlineType : null,
        narrative: draft.narrative.trim(), reporting: draft.reporting.trim(), ownerId: draft.ownerId || null
      }, isNew);
      onClose();
    } catch (e) { /* the toast says what failed */ }
  };
  const remove = async () => { try { await actions.deleteDeadline(dl); onClose(); } catch (e) { /* toast */ } };

  const field = (id, label, input, problem) => <div className="dle-f">
    <label className="flab" htmlFor={id}>{label}</label>{input}
    {problem && <p className="lk-problem" role="alert">{problem}</p>}</div>;

  return <Modal onClose={onClose} label={isNew ? "Add deadline" : "Edit deadline"}>
    <ModalHead onClose={onClose} eyebrow={isNew ? "Add deadline" : "Edit deadline"} title={isNew ? "New deadline" : dl.title} sub={f.name} />
    {confirmDel ? <>
      <div className="mbd">
        <p style={{ fontSize: 15, color: "#1d2433" }}>Delete {dl.title}? This removes the deadline and its completion history. This cannot be undone.</p>
      </div>
      <div className="mft">
        <Busy busyKey="dl-del" className="button button-danger" onClick={remove}><Icon n="trash" s={15} />Delete deadline</Busy>
        <button className="button button-secondary-outline" onClick={() => setConfirmDel(false)}>Cancel</button>
      </div>
    </> : <>
      <div className="mbd dle">
        {field("dle-fn", "Compliance function", <input id="dle-fn" className="ti" value={f.name} readOnly disabled />)}
        {field("dle-name", "Name", <input id="dle-name" className="ti" value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="Deadline name" autoFocus />,
          tried && !draft.title.trim() ? "Give the deadline a name." : "")}
        <div className="frow">
          {field("dle-due", "Due date", <input id="dle-due" className="ti" type="date" value={draft.due} onChange={e => { setDueTouched(true); set({ due: e.target.value }); }} />,
            tried && !newDue ? "Choose a due date." : "")}
          {field("dle-cadence", "Cadence", <select id="dle-cadence" className="ti" value={draft.cadence} onChange={e => changeCadence(e.target.value)}>
            {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
        </div>
        {preview && <div className="note dle-preview" role="status">Next due date will change from {fmtDate(dl.due)} to {fmtDate(newDue)}.
          <span className="sub"> {dl.lastDone ? "Counted from the last completion, " + fmtDate(dl.lastDone) + "." : "Counted from the current due date."}</span></div>}
        {field("dle-owner", "Owner", <select id="dle-owner" className="ti" value={draft.ownerId} onChange={e => set({ ownerId: e.target.value })}>
          <option value="">{"The function's compliance owner" + (f.owner && !f.owner.none ? " (" + f.owner.n + ")" : "")}</option>
          {chain.length > 0 && <optgroup label="This function's Accountability Structure">{chain.map(p => <option key={p.id} value={String(p.id)}>{p.n}</option>)}</optgroup>}
          <optgroup label="Compliance Directory">{others.map(p => <option key={p.id} value={String(p.id)}>{p.n}</option>)}</optgroup>
        </select>)}
        {field("dle-desc", "Description", <textarea id="dle-desc" className="ti" value={draft.narrative} onChange={e => set({ narrative: e.target.value })} placeholder="What is due" />)}
        {field("dle-reporting", "Reporting requirement", <textarea id="dle-reporting" className="ti" value={draft.reporting} onChange={e => set({ reporting: e.target.value })} placeholder="What the filing or report must contain" />)}
        {!isNew && <p className="sub dle-changed">{dl.changedOn
          ? "Last changed " + fmtDate(toDay(dl.changedOn)) + (dl.changedBy ? " by " + dl.changedBy.n : "") + "."
          : "Not changed on the portal yet."}</p>}
      </div>
      <div className="mft">
        <Busy busyKey="dl-edit" className="button button-primary" onClick={save}><Icon n="check" s={15} />{isNew ? "Add deadline" : "Save changes"}</Busy>
        <button className="button button-secondary-outline" onClick={onClose}>Cancel</button>
        {!isNew && <button className="button button-danger-outline" style={{ marginLeft: "auto" }} onClick={() => setConfirmDel(true)}><Icon n="trash" s={15} />Delete deadline</button>}
      </div>
    </>}
  </Modal>;
}
