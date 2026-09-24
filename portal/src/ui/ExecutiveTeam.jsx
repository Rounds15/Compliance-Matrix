/* Executive Team (parity spec 2.7, scr_ExecutiveTeam.pa.yaml). */

import React, { useMemo, useState } from "react";
import { Hero, Avatar, useApp } from "./parts.jsx";
import { PersonDrawer } from "./Directory.jsx";
import { samePerson } from "../data/model.js";
import { addDays, fmtDate } from "../lib/dates.js";

const lastName = p => p.n.trim().split(/\s+/).slice(-1)[0] || "";

export function ExecutiveTeam() {
  const { ds, today } = useApp();
  const [sort, setSort] = useState("AZ");
  const [sel, setSel] = useState(null); // {person, port: All | Due}

  const in90 = addDays(today, 90);
  const rows = useMemo(() => ds.executives.map(p => {
    const fns = ds.fns.filter(f => f.chain.exec.some(r => samePerson(r.person, p))).sort((a, b) => a.name.localeCompare(b.name));
    const ids = new Set(fns.map(f => String(f.id)));
    const due = ds.allDeadlines.filter(d => ids.has(String(d.functionId)) && d.due && d.due >= today && d.due <= in90).sort((a, b) => a.due - b.due);
    return { p, fns, due, areas: new Set(fns.map(f => String(f.topicId))).size };
  }), [ds, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = [...rows].sort(sort === "Port"
    ? (a, b) => b.fns.length - a.fns.length || lastName(a.p).localeCompare(lastName(b.p))
    : (a, b) => lastName(a.p).localeCompare(lastName(b.p)));
  const cur = sel && rows.find(r => r.p.id === sel.person.id);

  return <>
    <Hero eyebrow="PORTFOLIO VIEW" title="Executive Team"
      lede="Executive owners sit at the top of every ownership chain, sorted by last name, with initials for each." />
    <div className="wrap">
      <div className="toolbar">
        <span className="count" style={{ flex: 1 }}>{rows.length} executive owners</span>
        <label className="count" htmlFor="et-sort" style={{ fontSize: 13 }}>Sort by:</label>
        <select id="et-sort" className="select" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="AZ">Name A-Z</option><option value="Port">Portfolio size</option></select>
      </div>
      {list.length ? <div className="pgrid">{list.map(r => <div key={r.p.id} style={{ position: "relative" }}>
        <button className={"pcard" + (cur && cur.p.id === r.p.id ? " on" : "")} style={{ width: "100%", height: "100%" }} onClick={() => setSel({ person: r.p, port: "All" })}>
          <Avatar person={r.p} size={100} />
          <span className="grow"><span className="n">{r.p.n}</span><span className="t">{r.p.t}</span><span className="u">{r.p.u}</span>
            <span className="chips"><span className="chip">{r.fns.length} functions</span>
              <span className={"chip " + (r.due.length ? "due" : "none")}
                onClick={e => { e.stopPropagation(); setSel({ person: r.p, port: "Due" }); }}>{r.due.length} upcoming</span></span></span>
        </button></div>)}</div>
        : <p className="empty">No executive owners found. Executive owners come from the Accountability Structure list.</p>}
    </div>
    {cur && <PersonDrawer person={cur.p} eyebrow="EXECUTIVE OWNER" stats={[cur.fns.length, cur.areas]}
      toggle={<div className="toggle">
        <button className={"btn sm" + (sel.port === "All" ? " on" : "")} style={{ minWidth: 120 }} onClick={() => setSel({ ...sel, port: "All" })}>All functions</button>
        <button className={"btn sm" + (sel.port === "Due" ? " on" : "")} style={{ minWidth: 120 }} onClick={() => setSel({ ...sel, port: "Due" })}>Due 90d</button>
      </div>}
      portfolio={sel.port === "Due"
        ? cur.due.map(d => ({ key: d.id, fn: ds.fnById.get(String(d.functionId)), line1: d.functionName, line2: "Due " + fmtDate(d.due) + " · " + d.cadence, due: true }))
        : cur.fns.map(f => ({ key: f.id, fn: f, line1: f.name, line2: f.topic }))}
      onClose={() => setSel(null)} />}
  </>;
}
