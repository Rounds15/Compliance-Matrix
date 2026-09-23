import React, { useState } from "react";
import { Icon, Risk, Empty, dueState, useApp } from "./parts.jsx";
import { fmtDate, dayDiff, fiscalQ } from "../lib/dates.js";
import { functionsFor } from "../data/model.js";
import { chainRole } from "./Directory.jsx";
import blockS from "../assets/block-s.png";

export function Home({ go, openFn, filter, setFilter, deadlines }) {
  const { ds, adminView, actingPerson: me, today } = useApp();
  const { fns, gaps, flags, topics } = ds;
  const openGaps = gaps.filter(g => g.open);
  const up90 = deadlines.filter(d => !d.complete && d.due && dayDiff(d.due, today) >= 0 && dayDiff(d.due, today) <= 90);
  const late = deadlines.filter(d => !d.complete && d.due && dayDiff(d.due, today) < 0);
  const mine = functionsFor(me, fns);
  const mineIds = new Set(mine.map(f => String(f.id)));
  const myDl = deadlines.filter(d => mineIds.has(String(d.functionId)) && !d.complete && d.due).sort((a, b) => a.due - b.due).slice(0, 4);
  const [q, setQ] = useState("");
  const search = e => { e.preventDefault(); setFilter({ ...filter, q, topic: "All", risk: "All" }); go("Functions"); };
  const dest = [
    { t: "Definitions", d: "What the matrix is, why we built it, and what every term on these screens means.", s: "Start here", go: "Definitions" },
    { t: "Compliance Functions", d: "Every obligation in the matrix with statute, owner, requirement, and risk rating.", s: fns.length + " records", go: "Functions", lens: "flat" },
    { t: "Risk Areas", d: "The top-level areas of exposure — research, health and safety, privacy, Title IX, and more.", s: topics.length + " risk areas", go: "Functions", lens: "topic" },
    { t: "Domains", d: "The narrower grouping inside each risk area, for people who think in domains rather than exposure.", s: "By domain", go: "Functions", lens: "area" },
    { t: "Deadlines", d: "Filings, certifications, and reports on the calendar, with automatic reminders.", s: up90.length + " in 90 days", go: "Deadlines" },
    { t: "Owner Directory", d: "Every compliance owner, unit owner, and executive sponsor in the matrix.", s: "Contacts", go: "Directory" },
    { t: "Risk Dashboard", d: "Risk concentration by risk area and unit, gap trends, and executive reporting.", s: adminView ? "Administrator" : "Restricted", go: "Risk Dashboard" }
  ];
  const roleLabel = adminView ? "Administrator" : chainRole(me, fns);
  return <>
    <section className="hm-hero">
      <div className="wrap hm-hero-in">
        <div>
          <div className="hm-eyebrow">Office of Compliance &amp; Enterprise Risk Management</div>
          <h1 className="hm-h1">Who is responsible<br />for what — and are<br />we on top of it.</h1>
          <p className="hm-lede">The Compliance Matrix maps every obligation Syracuse University carries to its owner, the law behind it, what it requires, when it is due, and the risk it carries.</p>
          <form className="hm-search" onSubmit={search}>
            <Icon n="search" s={18} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a function, statute, citation, or owner…" aria-label="Search the compliance matrix" />
            <button type="submit" className="button button-primary">Search</button>
          </form>
          <div className="hm-acts">
            <button className="hm-link" onClick={() => go("Deadlines")}><Icon n="calendar" s={15} />What&rsquo;s coming due</button>
            <button className="hm-link" onClick={() => go("Functions", "topic")}><Icon n="grid" s={15} />Browse risk areas</button>
            {adminView && <button className="hm-link" onClick={() => go("Gap Tracker")}><Icon n="flag" s={15} />{"Open gaps (" + openGaps.length + ")"}</button>}
          </div>
        </div>
        <img className="hm-blocks" src={blockS} alt="" aria-hidden="true" />
      </div>
    </section>

    <section className="hm-band">
      <div className="wrap hm-band-in">
        <div className="hm-fig"><span className="hm-n">{fns.length}</span><span className="hm-fl">Compliance functions</span></div>
        <div className="hm-fig"><span className="hm-n">{topics.length}</span><span className="hm-fl">Risk areas</span></div>
        <div className="hm-fig"><span className="hm-n">{up90.length}</span><span className="hm-fl">Due within 90 days</span></div>
        <div className="hm-fig"><span className="hm-n">{late.length}</span><span className="hm-fl">Past due today</span></div>
        <div className="hm-asof">As of {fmtDate(today)}<br />{fiscalQ(today)}</div>
      </div>
    </section>

    <div className="wrap page">
      <div className="sec-h"><span className="lbl">Start here</span><span className="rule"></span>
        <span>Six ways into the matrix</span></div>
      <div className="hm-dest">
        {dest.map(d => <button key={d.t} className="hm-card" onClick={() => go(d.go, d.lens)}>
          <span className="hm-ct">{d.t}</span>
          <span className="hm-cd">{d.d}</span>
          <span className="hm-cm">{d.s}<Icon n="arrow-right" s={14} /></span>
        </button>)}
      </div>

      <div className="sec-h"><span className="lbl">Assigned to you</span><span className="rule"></span>
        <span>{me.n} · {roleLabel}</span></div>
      <div className="cm-grid" style={{ gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)" }}>
        <div className="cm-panel hm-assigned" style={{ overflow: "hidden" }}>
          {mine.length ? mine.slice(0, 5).map(f => {
            const fl = flags.find(x => String(x.functionId) === String(f.id));
            const g = gaps.filter(x => String(x.functionId) === String(f.id) && x.open).length;
            return <button key={f.id} className="srow" onClick={() => openFn(f)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="fname">{f.name}</div>
                <div className="sub">{f.topic} · {f.area}</div>
              </div>
              {g > 0 && <span className="gapbadge" title={g + " open gap(s)"}>{g}</span>}
              {fl && <span className="flagb"><Icon n="flag" s={11} sw={2.2} />Flagged</span>}
              <Risk r={f.risk} />
            </button>;
          }) : <Empty title="Nothing assigned" sub="No functions list this person in the ownership chain." />}
          {mine.length > 5 && <button className="srow" style={{ color: "#D74100", fontWeight: 700, fontSize: 14, justifyContent: "center" }} onClick={() => { setFilter({ q: "", topic: "All", risk: "All", mine: true }); go("Functions"); }}>View all {mine.length} assigned functions →</button>}
          {!!mine.length && <div className="endlist">End of list</div>}
        </div>
        <div className="cm-panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--orange)", fontWeight: 700, marginBottom: 12 }}>Your next deadlines</div>
          {myDl.length ? myDl.map(d => {
            const st = dueState(d, today); const fn = ds.fnById.get(String(d.functionId));
            return <button key={d.id} className="dlmini" onClick={() => fn && openFn(fn)} title={fn ? "Open " + fn.name : ""}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", lineHeight: 1.3 }}>{d.title}</div>
                <div className="sub">{fmtDate(d.due)} · {d.cadence}</div>
                <div className="sub dlmini-fn">{d.functionName}</div>
              </div><span className={"pill " + st.cls}>{st.label}</span>
            </button>;
          }) : <p className="sub">No open deadlines for this person.</p>}
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
        <p>Start with the risk-area lens to see how obligations are organized, then check the directory for the owner of a given domain.</p>
        <button className="button button-secondary-outline" onClick={() => go("Directory")}>Open the directory</button>
      </div>
    </section>
  </>;
}
