/* Home: the Claude design's layout (navy hero with the Block S, orange
   figures band, Start here cards, Assigned to you, help). The figures and
   lists follow the canvas app: they are the viewer's own, the functions
   where they appear anywhere in the Accountability Structure, in every view
   mode (whether Admin view should show the whole matrix is an open
   question, parity spec 4.3). */

import React, { useMemo, useState } from "react";
import { Icon, Risk, DuePill, useApp } from "./parts.jsx";
import { CompleteButton } from "./Completion.jsx";
import { functionsFor, roleOn } from "../data/model.js";
import { addDays, fiscalQ, fmtDate, MONTHS } from "../lib/dates.js";
import blockS from "../assets/block-s.png";

export function Home() {
  const { ds, today, actingPerson: me, adminView, go, openFn } = useApp();
  const [q, setQ] = useState("");
  const mine = useMemo(() => functionsFor(me, ds.fns).sort((a, b) => a.name.localeCompare(b.name)), [ds, me]);
  const mineIds = useMemo(() => new Set(mine.map(f => String(f.id))), [mine]);
  const in90 = addDays(today, 90);
  const myDl = ds.allDeadlines.filter(d => mineIds.has(String(d.functionId)));
  const upcoming = myDl.filter(d => d.status === "Upcoming" && d.due && d.due <= in90).sort((a, b) => a.due - b.due);
  const overdue = myDl.filter(d => d.status === "Overdue").length;
  const openGaps = ds.gaps.filter(g => g.open && mineIds.has(String(g.functionId))).length;
  const riskAreas = new Set(mine.map(f => String(f.topicId))).size;
  const gapsOf = f => ds.gaps.filter(g => g.open && String(g.functionId) === String(f.id)).length;
  const flagOf = f => ds.flags.some(x => String(x.functionId) === String(f.id));
  const search = e => { e.preventDefault(); go("Functions", { q: q.trim() }); };

  const dest = [
    { t: "Compliance Functions", d: "Every obligation in the matrix with statute, owner, requirement, and risk rating.", s: mine.length + " records", to: () => go("Functions") },
    { t: "Deadlines", d: "Filings, certifications, and reports on the calendar, with automatic reminders.", s: upcoming.length + " in 90 days", to: () => go("Deadlines") },
    { t: "Owner Directory", d: "Every compliance owner, unit owner, and executive sponsor in the matrix.", s: "Contacts", to: () => go("Directory") },
    { t: "Risk Dashboard", d: "Risk concentration by topic and unit, gap trends, and executive reporting.", s: adminView ? "Administrator" : "Restricted", to: () => go("Risk Dashboard") }
  ];
  const SHOW = 6;

  return <>
    <section className="hm-hero">
      <div className="wrap hm-hero-in">
        <div>
          <div className="hm-eyebrow">Office of Compliance</div>
          <h1 className="hm-h1">The Compliance Matrix is the foundation of the University's Compliance Program</h1>
          <p className="hm-lede">Mapping regulatory obligations to owners</p>
          <form className="hm-search" onSubmit={search} role="search">
            <Icon n="search" s={18} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a function, statute, citation, or owner..." aria-label="Search the compliance matrix" />
            <button type="submit" className="button button-primary">Search</button>
          </form>
          <div className="hm-acts">
            <button className="hm-link" onClick={() => go("Deadlines")}><Icon n="calendar" s={15} />What's coming due ({upcoming.length})</button>
            <button className="hm-link" onClick={() => go("Gap Tracker")}><Icon n="alert" s={15} />Open gaps ({openGaps})</button>
          </div>
        </div>
        <img className="hm-blocks" src={blockS} alt="" aria-hidden="true" />
      </div>
    </section>

    <section className="hm-band">
      <div className="wrap hm-band-in">
        <button className="hm-fig" onClick={() => go("Functions", { filter: { mine: true } })}><span className="hm-n">{mine.length}</span><span className="hm-fl">Compliance functions</span></button>
        <button className="hm-fig" onClick={() => go("Functions", { filter: { mine: true }, lens: "topic" })}><span className="hm-n">{riskAreas}</span><span className="hm-fl">Risk areas</span></button>
        <button className="hm-fig" onClick={() => go("Deadlines")}><span className="hm-n">{upcoming.length}</span><span className="hm-fl">Due within 90 days</span></button>
        <button className="hm-fig" onClick={() => go("Deadlines")}><span className="hm-n">{overdue}</span><span className="hm-fl">Past due today</span></button>
        <div className="hm-asof">As of {MONTHS[today.getMonth()]} {today.getDate()}, {today.getFullYear()}<br />{fiscalQ(today)}</div>
      </div>
    </section>

    <div className="wrap page">
      <div className="sec-h"><span className="lbl">Start here</span><span className="rule"></span><span>Four ways into the matrix</span></div>
      <div className="hm-dest">
        {dest.map(d => <button key={d.t} className="hm-card" onClick={d.to}>
          <span className="hm-ct">{d.t}</span>
          <span className="hm-cd">{d.d}</span>
          <span className="hm-cm">{d.s}<Icon n="arrow-right" s={14} /></span>
        </button>)}
      </div>

      <div className="sec-h"><span className="lbl">Assigned to you</span><span className="rule"></span><span>{me.n}</span></div>
      <div className="cm-grid hm-split">
        <div className="cm-panel hm-assigned" style={{ overflow: "hidden" }}>
          {mine.length ? mine.slice(0, SHOW).map(f => {
            const g = gapsOf(f);
            return <button key={f.id} className="srow" onClick={() => openFn(f)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="fname">{f.name}</div>
                <div className="sub">{f.topic} {"·"} {f.area} {"·"} {roleOn(f, me)}</div>
              </div>
              {g > 0 && <span className="gapbadge" title={g + (g === 1 ? " open gap" : " open gaps")}>{g} {g === 1 ? "Gap" : "Gaps"}</span>}
              {flagOf(f) && <span className="flagb"><Icon n="flag" s={11} sw={2.2} />Flagged</span>}
              <Risk r={f.risk} />
            </button>;
          }) : <div className="empty" style={{ border: 0 }}><h3>Nothing assigned</h3><p className="sub">No functions list {me.n} in the Accountability Structure.</p></div>}
          {mine.length > SHOW && <button className="srow hm-more" onClick={() => go("Functions", { filter: { mine: true } })}>View all {mine.length} assigned functions <Icon n="arrow-right" s={14} /></button>}
          {!!mine.length && <div className="endlist">End of list</div>}
        </div>
        <div className="cm-panel" style={{ padding: 16 }}>
          <div className="hm-panel-h">Your next deadlines</div>
          {upcoming.length ? upcoming.map(d => {
            const fn = ds.fnById.get(String(d.functionId));
            return <div key={d.id} className="dlmini" role="button" tabIndex={0} onClick={() => fn && openFn(fn)} onKeyDown={e => { if (e.key === "Enter" && fn) openFn(fn); }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", lineHeight: 1.3 }}>{d.functionName}</div>
                <div className="sub">{fmtDate(d.due)} {"·"} {d.cadence}</div>
              </div>
              <DuePill dl={d} today={today} />
              <CompleteButton dl={d} />
            </div>;
          }) : <p className="sub">Nothing due in the next 90 days.</p>}
          <div className="note" style={{ marginTop: 14 }}><b>Reminders</b> are sent automatically at 90 days, 30 days, on the due date, and weekly once overdue.</div>
        </div>
      </div>
    </div>

    <section className="wrap hm-help">
      <div>
        <h3>Something look wrong?</h3>
        <p>Owners can flag any record for review from its detail page. The compliance office responds within five business days.</p>
        <button className="button button-secondary-outline" onClick={() => go("Functions")}>Find a record to flag</button>
      </div>
      <div>
        <h3>New to the matrix?</h3>
        <p>Start with the topic view to see how obligations are organized, then check the directory for the owner of a given area.</p>
        <button className="button button-secondary-outline" onClick={() => go("Directory")}>Open the directory</button>
      </div>
    </section>
  </>;
}
