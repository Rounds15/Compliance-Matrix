import React, { useMemo, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Empty, dueState, useMedia, useApp } from "./parts.jsx";
import { fmtDate, dayDiff, fiscalQ, MONTHS } from "../lib/dates.js";
import { DeadlineAction } from "./DeadlineAction.jsx";

const byDue = (a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity);

export function Deadlines({ deadlines, openFn }) {
  const { ds, adminView, today } = useApp();
  const [sort, setSort] = useState("due");
  const [scope, setScope] = useState("open");
  const [q, setQ] = useState("");
  const late = d => !d.complete && d.due && dayDiff(d.due, today) < 0;
  const rows = useMemo(() => {
    let r = deadlines.filter(d => scope === "all" || (scope === "open" && !d.complete) || (scope === "late" && late(d)) || (scope === "done" && d.complete));
    if (q) r = r.filter(d => (d.title + d.functionName + d.owner.n).toLowerCase().includes(q.toLowerCase()));
    return r.slice().sort((a, b) => sort === "due" ? byDue(a, b) : sort === "owner" ? a.owner.n.localeCompare(b.owner.n) : a.cadence.localeCompare(b.cadence));
  }, [deadlines, sort, scope, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const narrowDl = useMedia("(max-width:900px)");
  const [view, setView] = useState("calendar");
  const nLate = deadlines.filter(late).length;
  const n30 = deadlines.filter(d => !d.complete && d.due && dayDiff(d.due, today) >= 0 && dayDiff(d.due, today) <= 30).length;
  const open = d => { const x = ds.fnById.get(String(d.functionId)); if (x) openFn(x); };
  return <div className="page wrap" style={{ paddingTop: 14 }}>
    <PageHead eyebrow="Browse" title="Deadlines"
      sub={(adminView ? "Every recurring and one-off due date in the matrix." : "Due dates for the functions you are in the ownership chain for.")
        + " Reminder emails go out automatically at 90 days, 30 days, on the due date, and weekly once an item is overdue."}
      right={<><span className="pill late">{nLate} overdue</span><span className="pill warn">{n30} due in 30 days</span></>} />
    <div className="fbar">
      <div className="srch"><Icon n="search" s={16} /><input placeholder="Search deadlines, functions, owners…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="fs" value={scope} onChange={e => setScope(e.target.value)}>
        <option value="open">Open</option><option value="late">Overdue only</option><option value="done">Completed</option><option value="all">All</option></select>
      <select className="fs" value={sort} onChange={e => setSort(e.target.value)}>
        <option value="due">Sort by due date</option><option value="owner">Sort by owner</option><option value="cadence">Sort by cadence</option></select>
      <span className="count">{rows.length} items</span>
      <div style={{ display: "flex", gap: 4 }}>
        <button className={"button button-sm " + (view === "calendar" ? "button-secondary" : "button-ghost")} onClick={() => setView("calendar")}><Icon n="calendar" s={14} />Calendar</button>
        <button className={"button button-sm " + (view === "list" ? "button-secondary" : "button-ghost")} onClick={() => setView("list")}><Icon n="list" s={14} />List</button>
      </div>
    </div>
    {view === "calendar" ? <DeadlineCalendar rows={rows.filter(d => d.due)} open={open} /> : <>
      {!rows.length && <Empty title="Nothing here" sub="No deadlines match this filter." />}
      {!!rows.length && <><div className="tblwrap" style={{ marginTop: 14 }}>
        <table className="table-simple" role="table"><thead><tr>
          <th style={{ width: 150 }}>Due date</th><th>Deadline</th><th style={{ width: 120 }}>Cadence</th><th>Owner</th><th style={{ width: 130 }}>Status</th><th style={{ width: 140 }}></th></tr></thead>
          <tbody>{rows.map(d => {
            const st = dueState(d, today);
            return <tr key={d.id} className={"dl-row" + (st.cls === "late" ? " late" : "")} onClick={() => open(d)}>
              <td><div style={{ fontWeight: 600, color: "#000E54", fontSize: 13.5 }}>{fmtDate(d.due)}</div><div className="sub">{fiscalQ(d.due)}</div></td>
              <td><div className="fname" style={{ fontSize: 13.5 }}>{d.title}</div><div className="sub">{d.functionName}</div></td>
              <td><span className="chip">{d.cadence}</span></td>
              <td><div className="owner"><Avatar person={d.owner} size={28} /><div style={{ minWidth: 0 }}>
                <div className="nm">{d.owner.n}</div><div className="ti">{d.owner.u}</div></div></div></td>
              <td><span className={"pill " + st.cls}>{st.label}</span></td>
              <td><DeadlineAction dl={d} /></td></tr>;
          })}
          </tbody></table></div>
        {narrowDl && <div className="mobcards" style={{ marginTop: 14 }}>{rows.map(d => {
          const st = dueState(d, today);
          return <div key={d.id} className="fcard" role="button" tabIndex={0} onClick={() => open(d)} style={st.cls === "late" ? { borderLeft: "3px solid #DC2626" } : null}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}><div className="t" style={{ fontSize: 14.5 }}>{d.title}</div>
                <div className="sub" style={{ marginTop: 3 }}>{d.functionName}</div></div><span className={"pill " + st.cls}>{st.label}</span></div>
            <div className="m"><span className="chip"><Icon n="calendar" s={12} />{fmtDate(d.due)}</span><span className="chip">{d.cadence}</span><span className="chip">{fiscalQ(d.due)}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 11, borderTop: "1px solid #EEF0F4" }}>
              <Avatar person={d.owner} size={26} /><div className="nm" style={{ fontSize: 12.5, flex: 1 }}>{d.owner.n}</div><DeadlineAction dl={d} /></div></div>;
        })}
        </div>}</>}</>}
  </div>;
}

/* ---- month calendar: day cells list function names, click a day to expand ---- */
const DAYK = d => d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();

export function DeadlineCalendar({ rows, open }) {
  const { today } = useApp();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [sel, setSel] = useState(null);
  const byDay = useMemo(() => { const m = {}; rows.forEach(d => { const k = DAYK(d.due); (m[k] = m[k] || []).push(d); }); return m; }, [rows]);
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const lead = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let i = 1; i <= days; i++) cells.push(new Date(y, mo, i));
  while (cells.length % 7) cells.push(null);
  const monthCount = rows.filter(d => d.due.getFullYear() === y && d.due.getMonth() === mo).length;
  const selList = sel ? (byDay[sel] || []) : [];
  const step = n => { setCursor(new Date(y, mo + n, 1)); setSel(null); };
  const todayK = DAYK(today);
  const isLate = x => !x.complete && dayDiff(x.due, today) < 0;
  return <div style={{ marginTop: 14 }}>
    <div className="calbar">
      <button className="button button-secondary-outline button-sm" onClick={() => step(-1)}>Previous</button>
      <div className="calmo">{MONTHS[mo]} {y}<span className="sub">{monthCount} deadline{monthCount === 1 ? "" : "s"} this month</span></div>
      <button className="button button-ghost button-sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSel(null); }}>Today</button>
      <button className="button button-secondary-outline button-sm" onClick={() => step(1)}>Next</button>
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
          onClick={() => setSel(sel === k ? null : k)}>
          <span className="cald">{d.getDate()}{late && <span className="caldot"></span>}</span>
          {items.slice(0, 3).map(x => <span key={x.id} className={"calfn" + (isLate(x) ? " late" : "")}>{x.functionName}</span>)}
          {items.length > 3 && <span className="calmore">+{items.length - 3} more</span>}
        </button>;
      })}
    </div>
    {sel && !!selList.length && <div className="caldetail">
      <div className="caldetail-h">{fmtDate(selList[0].due)}<span className="sub">{fiscalQ(selList[0].due)} · {selList.length} due</span></div>
      {selList.map(d => {
        const st = dueState(d, today);
        return <div key={d.id} className="caldrow" role="button" tabIndex={0} onClick={() => open(d)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fname" style={{ fontSize: 13.5 }}>{d.title}</div>
            <div className="sub" style={{ marginTop: 2 }}>{d.functionName} · {d.topic}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              <span className="chip">{d.cadence}</span><Risk r={d.risk} /></div>
          </div>
          <div className="owner" style={{ width: 190 }}><Avatar person={d.owner} size={30} /><div style={{ minWidth: 0 }}>
            <div className="nm">{d.owner.n}</div><div className="ti">{d.owner.u}</div></div></div>
          <span className={"pill " + st.cls}>{st.label}</span>
          <DeadlineAction dl={d} />
        </div>;
      })}
    </div>}
    {!rows.length && <Empty title="Nothing scheduled" sub="No deadlines match this filter." />}
  </div>;
}
