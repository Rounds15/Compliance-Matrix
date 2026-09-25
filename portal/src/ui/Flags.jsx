/* Flagged for Review (scr_Flags), administrators only, drawn with the
   design's panels: stats, a list of flagged functions (oldest first) and the
   selected function's flags, each resolvable. Age is counted in business
   days, as the app's AgeBiz does, against a five business day target. */

import React, { useMemo, useState } from "react";
import { Icon, PageHead, Stat, Empty, Busy, useApp } from "./parts.jsx";
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
  const late = open.filter(x => x.age > 5).length;

  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Flagged for Review"
      sub="Functions with open flags from owners. The response target is five business days from the flag date. Functions clear from this list when their last open flag is resolved." />
    <div className="cm-grid g-stat">
      <Stat n={byFn.length} l="Functions flagged" />
      <Stat n={open.length} l="Open flags" tone={open.length ? "warn" : null} />
      <Stat n={late} l="Past 5 business days" tone={late ? "bad" : null} />
    </div>
    {!byFn.length ? <div style={{ marginTop: 22 }}><Empty title="No open flags" sub="Anyone can flag a function for review from its detail page." /></div>
      : <div className="fl-split">
        <div className="cm-panel fl-list">
          <div className="fl-h">Flagged functions</div>
          {byFn.map(g => <button key={g.fn.id} className={"srow" + (sel === g ? " on" : "") + (g.oldest > 5 ? " late" : "")} onClick={() => setSelId(String(g.fn.id))} aria-pressed={sel === g}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="fname">{g.fn.name}</div>
              <div className="sub">{g.fn.topic} {"·"} oldest {g.oldest} {g.oldest === 1 ? "business day" : "business days"}</div></div>
            <span className={"gapbadge" + (g.oldest > 5 ? "" : " calm")}>{g.flags.length}</span>
          </button>)}
        </div>
        <div className="cm-panel fl-detail">
          <div className="fl-dh">
            <div style={{ flex: 1, minWidth: 0 }}><div className="eyebrow">{sel.fn.topic}</div>
              <h2>{sel.fn.name}</h2>
              <div className="sub">{sel.flags.length} {sel.flags.length === 1 ? "open flag" : "open flags"}</div></div>
            <button className="button button-secondary-outline button-sm" onClick={() => openFn(sel.fn)}>Open function <Icon n="arrow-right" s={13} /></button>
          </div>
          {entries.map(x => <div key={x.id} className={"fl-entry" + (x.age > 5 ? " late" : "")}>
            <Icon n="flag" s={17} style={{ color: x.age > 5 ? "#DC2626" : "#F76900", marginTop: 2, flex: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="fl-r">{x.reason}</p>
              <div className="sub">Flagged by {x.by}{x.at ? " on " + fmtDate(x.at) : ""} {"·"} <b className={x.age > 5 ? "fl-late" : ""}>{x.age} {x.age === 1 ? "business day open" : "business days open"}</b></div>
            </div>
            <Busy busyKey={"flag-" + x.id} className="button button-primary button-sm" onClick={() => resolve(x)}><Icon n="check" s={13} />Resolve</Busy>
          </div>)}
        </div>
      </div>}
  </div>;
}
