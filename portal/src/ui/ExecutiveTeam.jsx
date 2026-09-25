/* Executive Team, in the design's card grid and portfolio dialog. The data
   follows the canvas app (scr_ExecutiveTeam): executive owners are anyone
   holding the Executive Owner role on a function, sorted by last name (or by
   portfolio size); each card counts their functions and the deadlines due
   in the next 90 days; the dialog switches between All functions and Due
   90d. */

import React, { useMemo, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Field, Stat, Modal, Empty, DuePill, useApp } from "./parts.jsx";
import { samePerson } from "../data/model.js";
import { addDays, fmtDate } from "../lib/dates.js";

const lastName = p => p.n.trim().split(/\s+/).slice(-1)[0] || "";

export function ExecutiveTeam() {
  const { ds, today, openFn } = useApp();
  const [sort, setSort] = useState("az");
  const [sel, setSel] = useState(null); // { id, tab: "all" | "due" }
  const in90 = addDays(today, 90);
  const rows = useMemo(() => ds.executives.map(p => {
    const fns = ds.fns.filter(f => f.chain.exec.some(r => samePerson(r.person, p))).sort((a, b) => a.name.localeCompare(b.name));
    const ids = new Set(fns.map(f => String(f.id)));
    const due = ds.allDeadlines.filter(d => ids.has(String(d.functionId)) && d.status !== "Completed" && d.due && d.due >= today && d.due <= in90).sort((a, b) => a.due - b.due);
    return { p, fns, due, areas: new Set(fns.map(f => String(f.topicId))).size };
  }), [ds, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = [...rows].sort(sort === "port"
    ? (a, b) => b.fns.length - a.fns.length || lastName(a.p).localeCompare(lastName(b.p))
    : (a, b) => lastName(a.p).localeCompare(lastName(b.p)));
  const cur = sel && rows.find(r => String(r.p.id) === String(sel.id));
  const open = f => { setSel(null); openFn(f); };

  return <div className="page wrap">
    <PageHead eyebrow="Portfolio view" title="Executive Team"
      sub="Executive owners sit at the top of every ownership chain, sorted by last name, with initials for each."
      right={<><span className="count">{rows.length} executive owners</span>
        <select className="fs" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
          <option value="az">Sort by name A-Z</option><option value="port">Sort by portfolio size</option></select></>} />
    {!list.length && <Empty title="No executive owners found" sub="Executive owners come from the Accountability Structure list. Assign an Executive Owner on a function and they appear here." />}
    <div className="cm-grid g-card">{list.map(r =>
      <div key={r.p.id} className="tcard et-card">
        <div className="bar"></div>
        <button className="bd et-open" onClick={() => setSel({ id: r.p.id, tab: "all" })}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar person={r.p} size={54} />
            <div style={{ minWidth: 0 }}><h3>{r.p.n}</h3>
              {r.p.t && <div className="et-t">{r.p.t}</div>}
              {r.p.u && <div className="sub" style={{ fontSize: 11.5, marginTop: 2 }}>{r.p.u}</div>}</div></div>
        </button>
        <div className="ft">
          <button className="chip et-chip" onClick={() => setSel({ id: r.p.id, tab: "all" })}>{r.fns.length} functions</button>
          <button className={"pill et-chip " + (r.due.length ? "due" : "")} onClick={() => setSel({ id: r.p.id, tab: "due" })}>{r.due.length} upcoming</button>
        </div>
      </div>)}
    </div>
    {cur && <Modal onClose={() => setSel(null)} label={cur.p.n}>
      <div className="mhd"><Avatar person={cur.p} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}><div className="eyebrow" style={{ color: "#FF8E00" }}>Executive Owner</div>
          <h2 style={{ marginTop: 4 }}>{cur.p.n}</h2>
          <div style={{ fontSize: 13, color: "#C3CCE4", marginTop: 4 }}>{[cur.p.t, cur.p.u].filter(Boolean).join(" · ") || cur.p.e}</div></div>
        <button className="cl" onClick={() => setSel(null)} aria-label="Close">{"✕"}</button></div>
      <div className="mbd">
        <div className="cm-grid g-stat" style={{ marginBottom: 20 }}>
          <Stat n={cur.fns.length} l="Assigned functions" s="Executive Owner" />
          <Stat n={cur.areas} l="Risk areas" />
          <Stat n={cur.due.length} l="Due in 90 days" tone={cur.due.length ? "warn" : ""} />
        </div>
        <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
          <button role="tab" aria-selected={sel.tab === "all"} className={"tab" + (sel.tab === "all" ? " on" : "")} onClick={() => setSel({ ...sel, tab: "all" })}>All functions</button>
          <button role="tab" aria-selected={sel.tab === "due"} className={"tab" + (sel.tab === "due" ? " on" : "")} onClick={() => setSel({ ...sel, tab: "due" })}>Due 90d</button>
        </div>
        {sel.tab === "all" ? <Field label="Portfolio">
          {cur.fns.map(f => <button key={f.id} className="srow et-row" onClick={() => open(f)}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="fname" style={{ fontSize: 13.5 }}>{f.name}</div>
              <div className="sub">{f.topic} {"·"} {f.area}</div></div><Risk r={f.risk} /></button>)}
        </Field> : <Field label="Due in the next 90 days">
          {cur.due.length ? cur.due.map(d => { const f = ds.fnById.get(String(d.functionId)); return <button key={d.id} className="srow et-row" onClick={() => f && open(f)}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="fname" style={{ fontSize: 13.5 }}>{d.functionName}</div>
              <div className="sub">Due {fmtDate(d.due)} {"·"} {d.cadence}</div></div><DuePill dl={d} today={today} /></button>; })
            : <p className="sub">Nothing due in the next 90 days.</p>}
        </Field>}
      </div>
      <div className="mft">{cur.p.e && <a className="button button-primary" href={"mailto:" + cur.p.e}><Icon n="mail" s={15} />Email</a>}
        <button className="button button-secondary-outline" onClick={() => setSel(null)}>Close</button></div>
    </Modal>}
  </div>;
}
