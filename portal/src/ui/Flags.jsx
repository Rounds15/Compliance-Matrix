/* Flagged for Review (parity spec 2.11, scr_Flags.pa.yaml), administrators only. */

import React, { useMemo, useState } from "react";
import { Hero, Busy, useApp } from "./parts.jsx";
import { dayDiff, fmtDate } from "../lib/dates.js";

/* business days open, as the app's AgeBiz computes it */
export function ageBiz(at, today) {
  if (!at) return 0;
  const d = dayDiff(today, at);
  const sunday = x => x.getDay() === 0;
  return (d + 1) - 2 * Math.floor(d / 7) - (sunday(at) ? 1 : 0) - (sunday(today) ? 1 : 0);
}

export function Flags() {
  const { ds, today, actions, openFn } = useApp();
  const open = useMemo(() => ds.flags.map(x => ({ ...x, age: ageBiz(x.at, today) })), [ds, today]);
  const byFn = useMemo(() => {
    const m = new Map();
    open.forEach(x => {
      const k = String(x.functionId);
      if (!m.has(k)) m.set(k, { fn: ds.fnById.get(k), flags: [] });
      m.get(k).flags.push(x);
    });
    return [...m.values()].filter(g => g.fn).map(g => ({ ...g, oldest: Math.max(...g.flags.map(x => x.age)) }))
      .sort((a, b) => b.oldest - a.oldest);
  }, [open, ds]);
  const [selId, setSelId] = useState(null);
  const sel = byFn.find(g => String(g.fn.id) === selId) || byFn[0] || null;
  const entries = sel ? [...sel.flags].sort((a, b) => (a.at || 0) - (b.at || 0)) : [];
  const resolve = async x => { try { await actions.resolveFlag(x, sel.fn); } catch (e) { /* toast */ } };

  return <>
    <Hero eyebrow="RISK AND REPORTING" title="Flagged for Review"
      lede="Functions with open flags from owners. The response target is five business days from the flag date. Functions clear from this list when their last open flag is resolved." />
    <div className="wrap">
      <div className="stats three">
        <div className="stat cap"><b>{byFn.length}</b><span className="l">FUNCTIONS FLAGGED</span></div>
        <div className="stat cap tone-od"><b>{open.length}</b><span className="l">OPEN FLAGS</span></div>
        <div className="stat cap tone-od"><b>{open.filter(x => x.age > 5).length}</b><span className="l">PAST 5 BUSINESS DAYS</span></div>
      </div>
      <div className="flags">
        <div className="master">
          <div className="hd">FLAGGED FUNCTIONS</div>
          {byFn.length ? <ul>{byFn.map(g => <li key={g.fn.id}>
            <button className={(sel === g ? "on" : "") + (g.oldest > 5 ? " late" : "")} onClick={() => setSelId(String(g.fn.id))}>
              <span className="grow"><span className="n">{g.fn.name}</span><span className="m">{g.fn.topic}</span></span>
              <span className="cnt">{g.flags.length}</span></button></li>)}</ul>
            : <p className="empty">No open flags.</p>}
        </div>
        <div className="detail">
          {sel ? <>
            <div className="hd"><div className="grow"><h2>{sel.fn.name}</h2>
              <div className="m">{sel.fn.topic} {sel.flags.length} {sel.flags.length === 1 ? "open flag" : "open flags"}</div></div>
              <button className="btn navy" onClick={() => openFn(sel.fn)}>Open function</button></div>
            {entries.map(x => <div className={"entry" + (x.age > 5 ? " late" : "")} key={x.id}>
              <div className="grow"><p className="r">{x.reason}</p>
                <p className="by">Flagged by {x.by} on {x.at ? fmtDate(x.at) : ""}</p>
                <p className="age">{x.age} {x.age === 1 ? "business day open" : "business days open"}</p></div>
              <Busy busyKey={"flag-" + x.id} className="btn primary" onClick={() => resolve(x)}>Resolve</Busy>
            </div>)}
          </> : <p className="empty">Select a function on the left to review its flags.</p>}
        </div>
      </div>
    </div>
  </>;
}
