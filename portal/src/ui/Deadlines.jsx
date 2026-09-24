/* Deadlines (parity spec 2.5, scr_Deadlines.pa.yaml): scope, the month
   calendar and the day or all-dates list. Admin view sees every deadline;
   User view and View as see the deadlines of the viewer's own functions. */

import React, { useMemo, useState } from "react";
import { Hero, useApp } from "./parts.jsx";
import { CompleteButton, useVisibleDeadlines } from "./Completion.jsx";
import { addDays, dayDiff, fmtDate, MONTHS } from "../lib/dates.js";
import { deadlinesIcs, download } from "./exports.js";

const SCOPES = ["Open", "Overdue only", "Completed", "All"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function Deadlines() {
  const { ds, today, openFn } = useApp();
  const visible = useVisibleDeadlines();
  const [scope, setScope] = useState("Open");
  const [view, setView] = useState("Day");
  const [sel, setSel] = useState(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const dated = useMemo(() => visible.filter(d => d.due), [visible]);
  const inScope = d => scope === "All"
    || (scope === "Open" && d.status !== "Completed")
    || (scope === "Completed" && d.status === "Completed")
    || (scope === "Overdue only" && d.due < today && d.status !== "Completed");
  const list = dated.filter(d => (view !== "Day" || sameDay(d.due, sel)) && inScope(d)).sort((a, b) => a.due - b.due);
  const monthCount = dated.filter(d => d.due.getFullYear() === month.getFullYear() && d.due.getMonth() === month.getMonth()).length;
  const first = addDays(month, -month.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const shift = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => { setSel(today); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); };
  const firstOwner = d => { const f = ds.fnById.get(String(d.functionId)); return f && f.chain.compliance[0] ? f.chain.compliance[0].person.n : ""; };
  const pill = d => d.status === "Completed" ? <span className="pill done">COMPLETED</span>
    : d.due < today ? <span className="pill late">OVERDUE {dayDiff(today, d.due)}D</span>
      : <span className="pill due">DUE {dayDiff(d.due, today)}D</span>;
  const addToCalendar = () => download(view === "Day" ? "compliance-deadlines-day.ics" : "compliance-deadlines.ics",
    deadlinesIcs(view === "Day" ? list : list.filter(d => d.due >= today), window.location.hostname || "syr.edu"), "text/calendar");

  return <>
    <Hero eyebrow="BROWSE" title="Deadlines"
      lede="Every recurring and one-off due date in the matrix. Reminder emails go out automatically at 90, 30, and 0 days, then weekly once overdue." />
    <div className="wrap">
      <div className="dlctl">
        <select className="select" value={scope} onChange={e => setScope(e.target.value)} aria-label="Scope">{SCOPES.map(s => <option key={s}>{s}</option>)}</select>
        <span className="sp"></span>
        <button className={"btn" + (view === "Day" ? " on" : "")} style={{ minWidth: 130 }} onClick={() => setView("Day")}>Selected day</button>
        <button className={"btn" + (view === "All" ? " on" : "")} style={{ minWidth: 110 }} onClick={() => setView("All")}>All dates</button>
        <button className="btn" onClick={addToCalendar} disabled={!list.some(d => d.status !== "Completed")}>{view === "Day" ? "Add this day's deadlines to my calendar" : "Add all deadlines to my calendar"}</button>
      </div>
      <div className="dlsplit">
        <div>
          <div className="monthnav">
            <button className="btn" onClick={() => shift(-1)}>{"< Prev"}</button>
            <span className="m">{MONTHS[month.getMonth()]} {month.getFullYear()} | {monthCount} this month</span>
            <button className="btn" onClick={goToday}>Today</button>
            <button className="btn" onClick={() => shift(1)}>{"Next >"}</button>
          </div>
          <div className="dow">{DOW.map(d => <div key={d}>{d}</div>)}</div>
          <div className="cal">{cells.map(c => {
            const n = dated.filter(d => sameDay(d.due, c)).length;
            const cls = [c.getMonth() !== month.getMonth() ? "out" : "", sameDay(c, today) ? "today" : "", sameDay(c, sel) ? "sel" : ""].join(" ").trim();
            return <button key={c.getTime()} className={cls} onClick={() => setSel(c)} aria-pressed={sameDay(c, sel)}
              aria-label={fmtDate(c) + (n ? ", " + n + " due" : "")}>
              <span className="d">{c.getDate()}</span><span className="c">{n > 0 ? n + " due" : ""}</span></button>;
          })}</div>
        </div>
        <div className="dllist">
          <div className="eb">{view === "Day" ? `${DAYS[sel.getDay()]}, ${MONTHS[sel.getMonth()]} ${sel.getDate()}, ${sel.getFullYear()}`.toUpperCase() : "ALL DEADLINES"}</div>
          {list.map(d => <div className="dlitem" key={d.id}>
            <button className="hit" onClick={() => openFn(ds.fnById.get(String(d.functionId)))}>
              <span className="n">{d.functionName}</span>
              <span className="m">{fmtDate(d.due)} | {d.cadence} | {firstOwner(d)}</span></button>
            {pill(d)}
            <CompleteButton dl={d} />
          </div>)}
          {!list.length && <p className="empty" style={{ padding: "12px 0" }}>{view === "Day" ? "No deadlines on this day" : "No deadlines match this filter"}</p>}
        </div>
      </div>
    </div>
  </>;
}
