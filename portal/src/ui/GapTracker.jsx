/* Gap Tracker (parity spec 2.8, scr_GapTracker.pa.yaml). Administrators in
   Admin view see every gap; everyone else sees the gaps on their own
   functions. */

import React, { useState } from "react";
import { Hero, Busy, useApp } from "./parts.jsx";
import { useVisibleGaps } from "./Header.jsx";
import { dayDiff } from "../lib/dates.js";

const SEVS = ["All severities", "High", "Moderate", "Low", "Not Rated"];
const sevOf = g => (!g.severity || g.severity === "Unrated" ? "Not Rated" : g.severity);
const gapNo = g => (/^\d+$/.test(String(g.id)) ? g.id : String(g.code).replace(/^GAP-/, ""));

export function GapTracker() {
  const { ds, today, actions, openFn } = useApp();
  const gaps = useVisibleGaps();
  const [tab, setTab] = useState("Open");
  const [sev, setSev] = useState("All severities");
  const days = g => (g.opened ? Math.max(0, dayDiff(today, g.opened)) : 0);
  const open = gaps.filter(g => g.status === "Open");
  const closed = gaps.filter(g => g.status === "Closed");
  const avg = open.length ? Math.floor(open.reduce((n, g) => n + days(g), 0) / open.length) : 0;
  const list = gaps.filter(g => g.status === tab && (sev === "All severities" || sevOf(g) === sev)).sort((a, b) => days(b) - days(a));
  const close = async g => { try { await actions.closeGap(g, ""); } catch (e) { /* toast */ } };

  return <>
    <Hero eyebrow="RISK AND REPORTING" title="Gap Tracker"
      lede="Every open compliance gap across the institution, tied to the function it came from. Close a gap with documented notes and the count badge updates everywhere it appears." />
    <div className="wrap">
      <div className="stats">
        <div className="stat tone-red"><b>{open.length}</b><span className="l">Open</span></div>
        <div className="stat tone-amber"><b>{closed.length}</b><span className="l">Closed</span></div>
        <div className="stat tone-green"><b>{gaps.filter(g => sevOf(g) === "Not Rated").length}</b><span className="l">Not Rated</span></div>
        <div className="stat"><b>{avg}</b><span className="l">Avg days open</span><span className="s">How long it typically takes to close a gap</span></div>
      </div>
      <div className="tabs">
        <button className={"btn" + (tab === "Open" ? " on" : "")} style={{ minWidth: 170 }} onClick={() => setTab("Open")}>Open ({open.length})</button>
        <button className={"btn" + (tab === "Closed" ? " on" : "")} onClick={() => setTab("Closed")}>Closed ({closed.length})</button>
        <span className="sp"></span>
        <select className="select" value={sev} onChange={e => setSev(e.target.value)} aria-label="Severity">{SEVS.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="gaplist">{list.map(g => {
        const f = ds.fnById.get(String(g.functionId));
        return <div className="gcard" key={g.id}><div className="body">
          <div className="top"><span className="sev">{sevOf(g) === "Not Rated" ? "NR" : sevOf(g)}</span><span className="meta">GAP-{gapNo(g)} | {days(g)}d open</span></div>
          <h3>{g.title}</h3>
          {g.note && <p className="note">{g.note}</p>}
          <p className="fn">{g.functionName} | {g.topic}</p>
          <div className="row">
            <button className="btn" style={{ minWidth: 110 }} onClick={() => f && openFn(f)}>Function</button>
            {g.status !== "Closed" && <Busy busyKey={"gap-" + g.id} className="btn" onClick={() => close(g)}>Close</Busy>}
          </div>
        </div></div>;
      })}</div>
    </div>
  </>;
}
