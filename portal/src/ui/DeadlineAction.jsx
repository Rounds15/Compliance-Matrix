/* Complete / reverse a deadline, with a required reason - the canvas app's
   CompleteDeadline(). A completion holds the deadline as Complete for 30 days,
   then it rolls forward to its next occurrence (lib/deadlines.js). Owners of
   the function and administrators may do this; everyone else sees the status. */

import React, { useState } from "react";
import { Icon, Modal, Busy, useApp } from "./parts.jsx";
import { fmtDate } from "../lib/dates.js";
import { functionsFor } from "../data/model.js";

export function useCanComplete() {
  const { ds, adminView, actingPerson } = useApp();
  const mine = new Set(functionsFor(actingPerson, ds.fns).map(f => String(f.id)));
  return dl => adminView || mine.has(String(dl.functionId));
}

export function DeadlineAction({ dl, small = true }) {
  const { ds, actions } = useApp();
  const canComplete = useCanComplete();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!canComplete(dl) || !dl.due) return null;
  const fn = ds.fnById.get(String(dl.functionId));
  const reversing = dl.complete;
  const submit = async () => {
    try {
      await (reversing ? actions.reverseDeadline(dl, fn, reason.trim()) : actions.completeDeadline(dl, fn, reason.trim()));
      setOpen(false); setReason("");
    } catch (e) { /* toast shown */ }
  };
  /* the control sits inside clickable rows; keep its clicks - and the
     dialog's, which bubble through the React tree - from opening the row */
  return <span onClick={e => e.stopPropagation()} style={{ display: "contents" }}>
    <button className={"button button-sm " + (reversing ? "button-ghost" : "button-secondary-outline")} style={small ? { minHeight: 30, padding: "2px 10px", fontSize: 13 } : null}
      onClick={() => setOpen(true)}>
      <Icon n={reversing ? "undo" : "check"} s={13} />{reversing ? "Reverse" : "Mark complete"}</button>
    {open && <Modal onClose={() => setOpen(false)} size="sm">
        <div className="mhd"><div><h2>{reversing ? "Reverse completion" : "Mark deadline complete"}</h2>
          <div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{dl.title} · {fmtDate(dl.due)}</div></div>
          <button className="cl" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
        <div className="mbd">
          <label className="flab">{reversing ? "Why is this being reversed? (required)" : "What was filed or done? (required)"}</label>
          <textarea className="ti" value={reason} onChange={e => setReason(e.target.value)}
            placeholder={reversing ? "e.g. Marked complete in error; the filing was rejected." : "e.g. Report submitted through the agency portal; confirmation number on file."} />
          <p className="sub" style={{ marginTop: 10 }}>{reversing
            ? "Clears the completion and keeps the reason on record. The deadline returns to its scheduled date."
            : "Records today as the completion date and keeps the reason on record. The deadline shows as Complete for 30 days, then rolls forward to its next " + (dl.cadence || "occurrence").toLowerCase() + " date."}</p>
        </div>
        <div className="mft">
          <Busy busyKey={"dl-" + dl.id} className="button button-primary" disabled={!reason.trim()} onClick={submit}><Icon n={reversing ? "undo" : "check"} s={15} />{reversing ? "Reverse completion" : "Mark complete"}</Busy>
          <button className="button button-secondary-outline" onClick={() => setOpen(false)}>Cancel</button>
        </div>
    </Modal>}
  </span>;
}
