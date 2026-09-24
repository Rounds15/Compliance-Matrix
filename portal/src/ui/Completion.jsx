/* Deadline completion (parity spec 2.13), shared by Home, Deadlines and
   Function Detail: the canvas app's con_DlReasonOverlay and CompleteDeadline().
   A completion writes Deadlines and Archive and notifies the administrators;
   it holds the deadline as Completed for 30 days, then it rolls forward to its
   next occurrence (lib/deadlines.js). */

import React, { useMemo, useState } from "react";
import { Modal, Busy, useApp } from "./parts.jsx";
import { functionsFor } from "../data/model.js";

/* Admin view shows every deadline; User view and View as show the deadlines
   of the viewer's own functions only (spec 2.5). */
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
  return <Modal onClose={onClose} label={reversing ? "Reverse completion" : "Mark deadline complete"}>
    <div className="eb">{reversing ? "REVERSE COMPLETION" : "MARK DEADLINE COMPLETE"}</div>
    <div className="fname">{dl.functionName}</div>
    <p className="sub">{reversing
      ? "This reopens the deadline for its current cycle and notifies the compliance office."
      : "This records the completion for the current cycle and notifies the compliance office."}</p>
    <label className="flabel" htmlFor="cm-reason" style={{ color: "#000E54", textTransform: "none", letterSpacing: 0, fontSize: 13, marginTop: 18 }}>
      {reversing ? "Why are you reversing this?" : "Why are you marking this complete?"}</label>
    <textarea id="cm-reason" className="textarea" style={{ minHeight: 168 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter a brief reason..." />
    <div className="mfoot">
      <button className="btn" style={{ minWidth: 120, minHeight: 44 }} onClick={onClose}>Cancel</button>
      <Busy busyKey={"dl-" + dl.id} className="btn primary" style={{ minWidth: 120, minHeight: 44 }} disabled={!reason.trim()} onClick={confirm}>
        {reversing ? "Reverse" : "Confirm"}</Busy>
    </div>
  </Modal>;
}

/* "Complete?" / "Reverse" on a deadline row */
export function CompleteButton({ dl, className = "cbtn" }) {
  const [open, setOpen] = useState(false);
  if (!dl.due) return null;
  const done = dl.status === "Completed";
  return <>
    <button className={className + (done ? " rev" : "")} onClick={e => { e.stopPropagation(); setOpen(true); }}>{done ? "Reverse" : "Complete?"}</button>
    {open && <CompletionDialog dl={dl} onClose={() => setOpen(false)} />}
  </>;
}
