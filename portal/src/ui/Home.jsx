/* Home (parity spec 2.1, Home.pa.yaml). Every figure and both quick-link
   counts are the viewer's own: functions where they appear anywhere in the
   Accountability Structure, in every view mode. Whether Admin view should
   show institution-wide counts is an open question (spec section 4.3). */

import React, { useMemo, useState } from "react";
import { Hero, Icon, SearchBox, DuePill, RiskPill, useApp } from "./parts.jsx";
import { CompleteButton } from "./Completion.jsx";
import { functionsFor, roleOn } from "../data/model.js";
import { addDays, fiscalQ, fmtDate, MONTHS } from "../lib/dates.js";

const ROLE_CLASS = { "Executive Owner": "exec", "Unit Owner": "unit", "Compliance Owner": "comp" };

export function Home() {
  const { ds, today, actingPerson, adminView, go, openFn } = useApp();
  const [q, setQ] = useState("");

  const mine = useMemo(() => functionsFor(actingPerson, ds.fns), [ds, actingPerson]);
  const mineIds = useMemo(() => new Set(mine.map(f => String(f.id))), [mine]);
  const in90 = addDays(today, 90);
  const myDeadlines = ds.allDeadlines.filter(d => mineIds.has(String(d.functionId)));
  const upcoming = myDeadlines.filter(d => d.status === "Upcoming" && d.due && d.due <= in90).sort((a, b) => a.due - b.due);
  const due90 = upcoming.length;
  const overdue = myDeadlines.filter(d => d.status === "Overdue").length;
  const openGapsOf = id => ds.gaps.filter(g => g.open && String(g.functionId) === String(id)).length;
  const openGaps = ds.gaps.filter(g => g.open && mineIds.has(String(g.functionId))).length;
  const riskAreas = new Set(mine.map(f => String(f.topicId))).size;
  const asOf = `As of ${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()} · ${fiscalQ(today)}`;
  const assigned = [...mine].sort((a, b) => a.name.localeCompare(b.name));

  const dests = [
    { title: "Compliance Functions", body: "Every obligation in the matrix with statute, owner, requirement, and risk rating.", meta: mine.length + " RECORDS", to: () => go("Functions"), icon: "list" },
    { title: "Deadlines", body: "Filings, certifications, and reports on the calendar, with automatic reminders.", meta: due90 + " IN 90 DAYS", to: () => go("Deadlines"), icon: "calendar" },
    { title: "Owner Directory", body: "Every compliance owner, unit owner, and executive sponsor in the matrix.", meta: "CONTACTS", to: () => go("Directory"), icon: "users" },
    { title: "Risk Dashboard", body: "Risk concentration by topic and unit, gap trends, and executive reporting.", meta: adminView ? "ADMINISTRATOR" : "RESTRICTED", to: () => go("Risk Dashboard"), icon: adminView ? "chart" : "shield", locked: !adminView }
  ];

  return <>
    <Hero className="home-hero" watermark eyebrow="OFFICE OF COMPLIANCE" title="The Compliance Matrix is the foundation of the University's Compliance Program"
      lede="Mapping regulatory obligations to owners" noRule>
      <SearchBox value={q} onChange={setQ} placeholder="Search a function, statute, citation, or owner..." button="Search"
        onSubmit={() => go("Functions", { q: q.trim() })} />
      <div className="qlinks">
        <button onClick={() => go("Deadlines")}><Icon n="calendar" />What's coming due ({due90})</button>
        <button onClick={() => go("Gap Tracker")}><Icon n="warning" />Open gaps ({openGaps})</button>
      </div>
    </Hero>

    <div className="figures">
      <div className="wrap">
        <button className="fig" onClick={() => go("Functions")}><b>{mine.length}</b><span>COMPLIANCE FUNCTIONS</span></button>
        <button className="fig" onClick={() => go("Functions")}><b>{riskAreas}</b><span>RISK AREAS</span></button>
        <button className="fig" onClick={() => go("Deadlines")}><b>{due90}</b><span>DUE WITHIN 90 DAYS</span></button>
        <button className="fig" onClick={() => go("Deadlines")}><b>{overdue}</b><span>PAST DUE TODAY</span></button>
        <div className="asof">{asOf}</div>
      </div>
    </div>

    <div className="section"><div className="wrap">
      <div className="shead"><h2>Start here</h2><span className="note">Four ways into the matrix</span></div>
      <div className="dests">{dests.map(d => <button key={d.title} className={"dest" + (d.locked ? " locked" : "")} onClick={d.to}>
        <span className="dest-ic"><Icon n={d.icon} s={20} /></span>
        <h3>{d.title}</h3><p>{d.body}</p><span className="meta">{d.meta}<Icon n="arrow" s={14} sw={2.2} /></span></button>)}</div>
    </div></div>

    <div className="section" style={{ paddingTop: 8 }}><div className="wrap help">
      <div><h3>Something look wrong?</h3>
        <p>Owners can flag any record for review from its detail page. The compliance office responds within five business days.</p>
        <button className="btn" onClick={() => go("Functions")}>Find a record to flag</button></div>
      <div><h3>New to the matrix?</h3>
        <p>Start with the topic view to see how obligations are organized, then check the directory for the owner of a given area.</p>
        <button className="btn" onClick={() => go("Directory")}>Open the directory</button></div>
    </div></div>

    <div className="section" style={{ paddingBottom: 48 }}><div className="wrap">
      <div className="shead"><h2>Assigned to you</h2><span className="note">{actingPerson.n}</span></div>
      <div className="assigned">
        <div className="panel">
          {assigned.length ? <ul className="mylist">{assigned.map(f => {
            const role = roleOn(f, actingPerson);
            const g = openGapsOf(f.id);
            return <li key={f.id}><button className="myrow" onClick={() => openFn(f)}>
              <span className="grow"><span className="n">{f.name}</span><span className="m">{f.topic} {"·"} {f.area}</span></span>
              {g > 0 && <span className={"gapbadge" + (g >= 5 ? " g5" : g >= 3 ? " g3" : "")}>{g} {g === 1 ? "Gap" : "Gaps"}</span>}
              <span className={"rolepill " + ROLE_CLASS[role]}>{role}</span>
              <RiskPill r={f.risk} />
            </button></li>;
          })}</ul> : null}
        </div>
        <div className="panel">
          <div className="eb">YOUR NEXT DEADLINES</div>
          {upcoming.length ? upcoming.map(d => <div className="dlrow" key={d.id}>
            <button className="hit" onClick={() => openFn(ds.fnById.get(String(d.functionId)))}>
              <span className="n">{d.functionName}</span><span className="m">{fmtDate(d.due)} {"·"} {d.cadence}</span></button>
            <DuePill dl={d} today={today} />
            <CompleteButton dl={d} />
          </div>) : null}
          <div className="dlnote">Reminders are sent automatically at 90 days, 30 days, on the due date, and weekly once overdue.</div>
        </div>
      </div>
    </div></div>
  </>;
}
