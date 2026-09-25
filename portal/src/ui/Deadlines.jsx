/* Deadlines, in the design's layout: filter bar, then a month calendar (click
   a day to open its list) or a sortable table. Scoping and actions follow the
   canvas app (scr_Deadlines): Admin view sees every deadline; User view and
   View as see the deadlines of the viewer's own functions; the scopes are
   Open, Overdue only, Completed and All; each deadline can be completed or
   reversed with a reason; and what is shown can be added to a calendar. */

import React, { useMemo, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Empty, DuePill, useMedia, useApp } from "./parts.jsx";
import { CompleteButton, useVisibleDeadlines } from "./Completion.jsx";
import { fmtDate, dayDiff, fiscalQ, MONTHS } from "../lib/dates.js";
import { deadlinesIcs, download } from "./exports.js";

const SCOPES = [["open", "Open"], ["late", "Overdue only"], ["done", "Completed"], ["all", "All"]];
const byDue = (a, b) => a.due - b.due;

export function Deadlines() {
  const { ds, adminView, today, openFn } = useApp();
  const visible = useVisibleDeadlines();
  const [sort, setSort] = useState("due");
  const [scope, setScope] = useState("open");
  const [q, setQ] = useState("");
  const [view, setView] = useState(() => (window.matchMedia("(max-width:700px)").matches ? "list" : "calendar"));
  const narrowDl = useMedia("(max-width:900px)");
  const dated = useMemo(() => visible.filter(d => d.due), [visible]);
  const late = d => d.status === "Overdue";
  const rows = useMemo(() => {
    let r = dated.filter(d => scope === "all" || (scope === "open" && d.status !== "Completed") || (scope === "late" && late(d)) || (scope === "done" && d.status === "Completed"));
    const t = q.trim().toLowerCase();
    if (t) r = r.filter(d => (d.title + " " + d.functionName + " " + d.owner.n + " " + d.topic).toLowerCase().includes(t));
    return r.slice().sort((a, b) => sort === "due" ? byDue(a, b) : sort === "owner" ? a.owner.n.localeCompare(b.owner.n) || byDue(a, b) : a.cadence.localeCompare(b.cadence) || byDue(a, b));
  }, [dated, sort, scope, q]);
  const nLate = dated.filter(late).length;
  const n30 = dated.filter(d => d.status !== "Completed" && dayDiff(d.due, today) >= 0 && dayDiff(d.due, today) <= 30).length;
  const open = d => { const x = ds.fnById.get(String(d.functionId)); if (x) openFn(x); };
  const toCal = list => download("compliance-deadlines.ics", deadlinesIcs(list.filter(d => d.status !== "Completed"), window.location.hostname || "syr.edu"), "text/calendar");

  return <div className="page wrap">
    <PageHead eyebrow="Browse" title="Deadlines"
      sub={(adminView ? "Every recurring and one-off due date in the matrix." : "Due dates for the functions you are in the Accountability Structure for.")
        + " Reminder emails go out automatically at 90, 30, and 0 days, then weekly once overdue."}
      right={<><button className="pill late pillbtn" onClick={() => { setScope("late"); setView("list"); }}>{nLate} overdue</button>
        <span className="pill warn">{n30} due in 30 days</span></>} />
    <div className="fbar">
      <div className="srch"><Icon n="search" s={16} /><input placeholder="Search deadlines, functions, owners..." aria-label="Search deadlines" value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="fs" value={scope} onChange={e => setScope(e.target.value)} aria-label="Scope">
        {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {view === "list" && <select className="fs" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
        <option value="due">Sort by due date</option><option value="owner">Sort by owner</option><option value="cadence">Sort by cadence</option></select>}
      <span className="count">{rows.length} {rows.length === 1 ? "item" : "items"}</span>
      <div className="vt" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === "calendar"} className={"button button-sm " + (view === "calendar" ? "button-secondary" : "button-ghost")} onClick={() => setView("calendar")}><Icon n="calendar" s={14} />Calendar</button>
        <button role="tab" aria-selected={view === "list"} className={"button button-sm " + (view === "list" ? "button-secondary" : "button-ghost")} onClick={() => setView("list")}><Icon n="list" s={14} />List</button>
      </div>
    </div>
    {view === "calendar" ? <DeadlineCalendar rows={rows} open={open} toCal={toCal} /> : <>
      {!rows.length && <Empty title="Nothing here" sub="No deadlines match this filter." />}
      {!!rows.length && <>
        <div className="dl-acts"><button className="button button-ghost button-sm" onClick={() => toCal(rows)} disabled={!rows.some(d => d.status !== "Completed")}>
          <Icon n="plus" s={14} />Add these deadlines to my calendar</button></div>
        {!narrowDl ? <div className="tblwrap">
          <table className="table-simple dl-table"><thead><tr>
            <th style={{ width: 150 }}>Due date</th><th>Deadline</th><th style={{ width: 120 }}>Cadence</th><th>Owner</th><th style={{ width: 130 }}>Status</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>{rows.map(d => <tr key={d.id} className={"dl-row" + (late(d) ? " late" : "")} onClick={() => open(d)}>
              <td><div style={{ fontWeight: 600, color: "#000E54", fontSize: 13.5 }}>{fmtDate(d.due)}</div><div className="sub">{fiscalQ(d.due)}</div></td>
              <td><div className="fname" style={{ fontSize: 13.5 }}>{d.functionName}</div><div className="sub">{d.title !== d.functionName ? d.title + " · " : ""}{d.topic}</div></td>
              <td><span className="chip">{d.cadence}</span></td>
              <td><div className="owner"><Avatar person={d.owner} size={28} /><div style={{ minWidth: 0 }}>
                <div className="nm">{d.owner.n}</div><div className="ti">{d.owner.u}</div></div></div></td>
              <td><DuePill dl={d} today={today} /></td>
              <td><CompleteButton dl={d} /></td></tr>)}
            </tbody></table></div>
          : <div className="mobcards">{rows.map(d => <div key={d.id} className="fcard" role="button" tabIndex={0} onClick={() => open(d)} style={late(d) ? { borderLeft: "3px solid #DC2626" } : null}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}><div className="t" style={{ fontSize: 14.5 }}>{d.functionName}</div>
                <div className="sub" style={{ marginTop: 3 }}>{d.topic}</div></div><DuePill dl={d} today={today} /></div>
            <div className="m"><span className="chip"><Icon n="calendar" s={12} />{fmtDate(d.due)}</span><span className="chip">{d.cadence}</span><span className="chip">{fiscalQ(d.due)}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 11, borderTop: "1px solid #EEF0F4" }}>
              <Avatar person={d.owner} size={26} /><div className="nm" style={{ fontSize: 12.5, flex: 1 }}>{d.owner.n}</div><CompleteButton dl={d} /></div></div>)}
          </div>}
      </>}</>}
  </div>;
}

/* month calendar: day cells list function names; click a day to open its list */
const DAYK = d => d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();

export function DeadlineCalendar({ rows, open, toCal }) {
  const { today } = useApp();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [sel, setSel] = useState(() => DAYK(today));
  const byDay = useMemo(() => { const m = {}; rows.forEach(d => { const k = DAYK(d.due); (m[k] = m[k] || []).push(d); }); return m; }, [rows]);
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const lead = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let i = 1; i <= days; i++) cells.push(new Date(y, mo, i));
  while (cells.length % 7) cells.push(null);
  const monthRows = rows.filter(d => d.due.getFullYear() === y && d.due.getMonth() === mo);
  const selList = sel ? (byDay[sel] || []) : [];
  const step = n => { setCursor(new Date(y, mo + n, 1)); setSel(null); };
  const todayK = DAYK(today);
  const isLate = x => x.status === "Overdue";
  return <div style={{ marginTop: 14 }}>
    <div className="calbar">
      <button className="button button-secondary-outline button-sm" onClick={() => step(-1)} aria-label="Previous month">Previous</button>
      <div className="calmo">{MONTHS[mo]} {y}<span className="sub">{monthRows.length} deadline{monthRows.length === 1 ? "" : "s"} this month</span></div>
      <button className="button button-ghost button-sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSel(todayK); }}>Today</button>
      <button className="button button-secondary-outline button-sm" onClick={() => step(1)} aria-label="Next month">Next</button>
      {monthRows.some(d => d.status !== "Completed") && <button className="button button-ghost button-sm" onClick={() => toCal(monthRows)}><Icon n="plus" s={14} />Add this month to my calendar</button>}
    </div>
    <div className="calgrid">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="caldow">{d}</div>)}
      {cells.map((d, i) => {
        if (!d) return <div key={"e" + i} className="calcell out"></div>;
        const k = DAYK(d), items = byDay[k] || [];
        const late = items.some(isLate);
        if (!items.length) return <div key={k} className={"calcell empty" + (k === todayK ? " today" : "")}>
          <span className="cald">{d.getDate()}</span></div>;
        return <button key={k} className={"calcell" + (sel === k ? " on" : "") + (k === todayK ? " today" : "")}
          onClick={() => setSel(sel === k ? null : k)} aria-pressed={sel === k} aria-label={fmtDate(d) + ", " + items.length + " due"}>
          <span className="cald">{d.getDate()}{late && <span className="caldot"></span>}</span>
          {items.slice(0, 3).map(x => <span key={x.id} className={"calfn" + (isLate(x) ? " late" : "")}>{x.functionName}</span>)}
          {items.length > 3 && <span className="calmore">+{items.length - 3} more</span>}
        </button>;
      })}
    </div>
    {sel && !!selList.length && <div className="caldetail">
      <div className="caldetail-h">{fmtDate(selList[0].due)}<span className="sub">{fiscalQ(selList[0].due)} {"·"} {selList.length} due</span></div>
      {selList.map(d => <div key={d.id} className="caldrow" role="button" tabIndex={0} onClick={() => open(d)} onKeyDown={e => { if (e.key === "Enter") open(d); }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fname" style={{ fontSize: 13.5 }}>{d.functionName}</div>
          <div className="sub" style={{ marginTop: 2 }}>{d.title !== d.functionName ? d.title + " · " : ""}{d.topic}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
            <span className="chip">{d.cadence}</span><Risk r={d.risk} /></div>
        </div>
        <div className="owner" style={{ width: 190 }}><Avatar person={d.owner} size={30} /><div style={{ minWidth: 0 }}>
          <div className="nm">{d.owner.n}</div><div className="ti">{d.owner.u}</div></div></div>
        <DuePill dl={d} today={today} />
        <CompleteButton dl={d} />
      </div>)}
    </div>}
    {!selList.length && rows.length > 0 && (() => {
      const next = rows.filter(d => d.due >= today).slice(0, 5);
      return <div className="caldetail">
        <div className="caldetail-h">{next.length ? "Coming up" : "Nothing ahead"}<span className="sub">{sel ? "No deadlines on the selected day. " : ""}{next.length ? "The next " + next.length + " in this view" : "No upcoming deadlines in this view"}</span></div>
        {next.map(d => <div key={d.id} className="caldrow" role="button" tabIndex={0} onClick={() => { setCursor(new Date(d.due.getFullYear(), d.due.getMonth(), 1)); setSel(DAYK(d.due)); }}
          onKeyDown={e => { if (e.key === "Enter") { setCursor(new Date(d.due.getFullYear(), d.due.getMonth(), 1)); setSel(DAYK(d.due)); } }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fname" style={{ fontSize: 13.5 }}>{d.functionName}</div>
            <div className="sub" style={{ marginTop: 2 }}>{fmtDate(d.due)} {"·"} {d.cadence} {"·"} {d.owner.n}</div>
          </div>
          <DuePill dl={d} today={today} />
          <CompleteButton dl={d} />
        </div>)}
      </div>;
    })()}
    {!rows.length && <Empty title="Nothing scheduled" sub="No deadlines match this filter." />}
  </div>;
}
