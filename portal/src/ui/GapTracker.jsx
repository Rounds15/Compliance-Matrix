/* Gap Tracker, in the design's layout: stat row, open gaps by risk area,
   tabs, severity filter and gap cards, with a dialog to close a gap. Scope
   and figures follow the canvas app (scr_GapTracker): Admin view sees every
   gap, everyone else the gaps on their own functions; the stats are Open,
   Closed, Not Rated and Avg days open. */

import React, { useMemo, useState } from "react";
import { Icon, Avatar, Risk, Modal, ModalHead, PageHead, Stat, Empty, Busy, useApp } from "./parts.jsx";
import { useVisibleGaps } from "./Header.jsx";
import { fmtDate, dayDiff } from "../lib/dates.js";
import { RISK_COLOR } from "../lib/risk.js";

const SEVS = [["All", "All severities"], ["High", "High"], ["Moderate", "Moderate"], ["Low", "Low"], ["Unrated", "Not rated"]];
const gapNo = g => (/^\d+$/.test(String(g.id)) ? "GAP-" + g.id : /^GAP-/.test(String(g.code)) ? g.code : "GAP-" + g.code);

export function GapTracker() {
  const { ds, today, actions, openFn, adminView, realAdmin, go } = useApp();
  const gaps = useVisibleGaps();
  const [tab, setTab] = useState("open");
  const [sev, setSev] = useState("All");
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState("");
  const days = g => (g.opened ? Math.max(0, dayDiff(today, g.opened)) : 0);
  const open = gaps.filter(g => g.open);
  const closed = gaps.filter(g => !g.open);
  const avg = open.length ? Math.floor(open.reduce((n, g) => n + days(g), 0) / open.length) : 0;
  const list = (tab === "open" ? open : closed).filter(g => sev === "All" || g.severity === sev).sort((a, b) => days(b) - days(a));
  const byTopic = useMemo(() => {
    const m = {};
    open.forEach(g => { m[g.topic] = (m[g.topic] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gaps]); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = g => { const f = ds.fnById.get(String(g.functionId)); if (f) openFn(f); };
  const close = async () => { try { await actions.closeGap(sel, note.trim()); setSel(null); } catch (e) { /* toast */ } };

  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting" title="Gap Tracker"
      sub={(adminView ? "Every open compliance gap across the institution, tied to the function it came from." : "The compliance gaps on the functions you are in the Accountability Structure for.")
        + " Close a gap with documented notes and the count badge updates everywhere it appears."}
      right={realAdmin && ds.flags.length > 0 && <button className="button button-secondary-outline button-sm" onClick={() => go("Flagged Items")}><Icon n="flag" s={14} />{ds.flags.length} flagged for review</button>} />
    <div className="cm-grid g-stat" style={{ marginBottom: 8 }}>
      <Stat n={open.length} l="Open" tone={open.length ? "bad" : null} onClick={() => setTab("open")} />
      <Stat n={closed.length} l="Closed" onClick={() => setTab("closed")} />
      <Stat n={gaps.filter(g => g.severity === "Unrated").length} l="Not rated" tone="warn" onClick={() => { setSev("Unrated"); }} />
      <Stat n={avg} l="Avg days open" s="How long it typically takes to close a gap" />
    </div>
    {byTopic.length > 0 && <>
      <div className="sec-h"><span className="lbl">Open gaps by risk area</span><span className="rule"></span></div>
      <div className="cm-panel" style={{ padding: 16, marginBottom: 8 }}>
        <div className="bars">{byTopic.map(([t, n]) =>
          <div className="bar" key={t}><span style={{ color: "#2b3345", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{t}</span>
            <span className="tr"><span className="fl" style={{ width: (n / byTopic[0][1] * 100) + "%", background: "#F76900" }}></span></span>
            <span style={{ fontWeight: 700, color: "#000E54", textAlign: "right" }}>{n}</span></div>)}
        </div></div></>}
    <div className="tabs" role="tablist" style={{ marginTop: 22 }}>
      <button role="tab" aria-selected={tab === "open"} className={"tab" + (tab === "open" ? " on" : "")} onClick={() => setTab("open")}>Open ({open.length})</button>
      <button role="tab" aria-selected={tab === "closed"} className={"tab" + (tab === "closed" ? " on" : "")} onClick={() => setTab("closed")}>Closed ({closed.length})</button>
    </div>
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
      <select className="fs" value={sev} onChange={e => setSev(e.target.value)} aria-label="Severity">
        {SEVS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <span className="count">{list.length} shown</span></div>
    {!list.length && <Empty title={tab === "open" ? "No open gaps" : "No closed gaps"} sub={sev === "All" ? "Nothing has been logged here yet." : "Nothing matches this severity."} />}
    <div className="cm-grid gap-grid">
      {list.map(g => <div key={g.id} className="cm-panel gcard2" style={{ borderLeft: "4px solid " + (g.open ? (RISK_COLOR[g.severity] || "#8A929E") : "#16A34A") }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 9 }}>
          <Risk r={g.severity} />
          <span className="sub">{gapNo(g)} {"·"} {days(g)}d open</span>
          {g.open && g.status !== "Open" && <span className="pill due">{g.status}</span>}
          {!g.open && <span className="pill ok" style={{ marginLeft: "auto" }}>Closed {g.closed ? fmtDate(g.closed) : ""}</span>}
        </div>
        <div className="gtitle">{g.title}</div>
        {g.note && <p style={{ fontSize: 13, color: "#5b6373", marginTop: 6 }}>{g.note}</p>}
        {(g.targetQuarter || g.targetFY || g.unit) && <div className="sub" style={{ marginTop: 6 }}>{[g.unit, [g.targetQuarter, g.targetFY].filter(Boolean).join(" ") && "Target " + [g.targetQuarter, g.targetFY].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>}
        {!g.open && g.closeNote && <div className="note" style={{ borderLeftColor: "#16A34A", marginTop: 8 }}><b>Closure note:</b> {g.closeNote}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #EEF0F4", flexWrap: "wrap" }}>
          <Avatar person={g.owner} size={26} />
          <div style={{ minWidth: 0, flex: 1 }}><div className="nm" style={{ fontSize: 12.5, fontWeight: 600 }}>{g.functionName}</div>
            <div className="ti">{g.topic}</div></div>
          <button className="button button-secondary-outline button-sm" onClick={() => jump(g)}>Function</button>
          {g.open && <button className="button button-primary button-sm" onClick={() => { setSel(g); setNote(""); }}><Icon n="check" s={13} />Close</button>}
        </div></div>)}
    </div>
    {sel && <Modal onClose={() => setSel(null)} size="sm" label="Close gap">
      <ModalHead onClose={() => setSel(null)} eyebrow="Close gap" title={sel.title} sub={gapNo(sel) + " · " + sel.functionName} />
      <div className="mbd">
        <label className="flab" htmlFor="gap-note">Closure notes</label>
        <textarea id="gap-note" className="ti" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What was remediated, and what prevents recurrence?" />
        <p className="sub" style={{ marginTop: 10 }}>Closing records the date and these notes on the gap. The open-gap count updates everywhere it appears.</p>
      </div>
      <div className="mft"><Busy busyKey={"gap-" + sel.id} className="button button-primary" onClick={close}><Icon n="check" s={15} />Close gap</Busy>
        <button className="button button-secondary-outline" onClick={() => setSel(null)}>Cancel</button></div>
    </Modal>}
  </div>;
}
