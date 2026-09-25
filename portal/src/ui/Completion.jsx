/* Completing or reversing a deadline (the canvas app's CompleteDeadline()):
   a reason is required; a completion writes Deadlines and Archive and
   notifies the compliance office, and holds the deadline as Completed for
   30 days before it rolls to its next occurrence (lib/deadlines.js). */

import React, { useMemo, useState } from "react";
import { Icon, Modal, ModalHead, Busy, useApp } from "./parts.jsx";
import { functionsFor } from "../data/model.js";
import { fmtDate } from "../lib/dates.js";

/* Admin view shows every deadline; User view and View as show the
   deadlines of the viewer's own functions. */
export function useVisibleDeadlines() {
  const { ds, adminView, actingPerson } = useApp();
  return useMemo(() => {
    if (!ds) return [];
    if (adminView) return ds.allDeadlines;
    const mine = new Set(functionsFor(actingPerson, ds.fns).map(f => String(f.id)));
    return ds.allDeadlines.filter(d => mine.has(String(d.functionId)));
  }, [ds, adminView, actingPerson]);
}

export function CompletionDialog({ dl, onClose }) {
  const { ds, actions } = useApp();
  const [reason, setReason] = useState("");
  const reversing = dl.status === "Completed";
  const fn = ds.fnById.get(String(dl.functionId));
  const confirm = async () => {
    try {
      await (reversing ? actions.reverseDeadline(dl, fn, reason.trim()) : actions.completeDeadline(dl, fn, reason.trim()));
      onClose();
    } catch (e) { /* the toast says what failed */ }
  };
  return <Modal onClose={onClose} size="sm" label={reversing ? "Reverse completion" : "Mark deadline complete"}>
    <ModalHead onClose={onClose} eyebrow={reversing ? "Reverse completion" : "Mark deadline complete"} title={dl.functionName}
      sub={dl.title + (dl.due ? " · " + fmtDate(dl.due) : "") + " · " + dl.cadence} />
    <div className="mbd">
      <p className="sub" style={{ marginBottom: 14 }}>{reversing
        ? "This reopens the deadline for its current cycle and notifies the compliance office."
        : "This records the completion for the current cycle and notifies the compliance office."}</p>
      <label className="flab" htmlFor="cm-reason">{reversing ? "Why are you reversing this?" : "Why are you marking this complete?"}</label>
      <textarea id="cm-reason" className="ti" style={{ minHeight: 130 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter a brief reason..." />
    </div>
    <div className="mft">
      <Busy busyKey={"dl-" + dl.id} className="button button-primary" disabled={!reason.trim()} onClick={confirm}>
        <Icon n={reversing ? "undo" : "check"} s={15} />{reversing ? "Reverse" : "Confirm"}</Busy>
      <button className="button button-secondary-outline" onClick={onClose}>Cancel</button>
    </div>
  </Modal>;
}

/* "Complete?" / "Reverse" on a deadline row; the row itself is often
   clickable, so the control keeps its clicks to itself */
export function CompleteButton({ dl }) {
  const [open, setOpen] = useState(false);
  if (!dl.due) return null;
  const done = dl.status === "Completed";
  return <span onClick={e => e.stopPropagation()} style={{ display: "contents" }}>
    <button className={"button button-sm " + (done ? "button-ghost" : "button-secondary-outline")} style={{ minHeight: 30, padding: "2px 10px", fontSize: 13 }}
      onClick={() => setOpen(true)}><Icon n={done ? "undo" : "check"} s={13} />{done ? "Reverse" : "Complete?"}</button>
    {open && <CompletionDialog dl={dl} onClose={() => setOpen(false)} />}
  </span>;
}
