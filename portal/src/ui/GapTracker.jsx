/* Gap Tracker: stat row, open gaps by risk area, Open and Closed tabs, a
   risk-level filter, and one card per function holding its gaps. Scope
   follows the canvas app (scr_GapTracker): an administrator sees every gap
   (outside View as specific user), everyone else the gaps on their own
   functions.

   A risk rating belongs to a function (from its assessments), not to a gap:
   a gap is a missing control an assessment found. So a card shows its
   function's rating and the filter narrows by it; gaps carry no rating of
   their own here. Gaps with no function share a last card. A gap row opens
   a dialog with the gap's detail, where an open gap is closed with a note,
   and an administrator can reopen a closed one with a reason (Dataverse). */

import React, { useMemo, useState } from "react";
import { Icon, Risk, Modal, ModalHead, PageHead, Stat, Empty, Busy, useApp } from "./parts.jsx";
import { useVisibleGaps } from "./Header.jsx";
import { fmtDate, dayDiff, fiscalTarget } from "../lib/dates.js";

const LEVELS = [["", "All risk levels"], ["High", "High"], ["Moderate", "Moderate"], ["Low", "Low"], ["Unrated", "Not rated"]];
const RANK = { High: 0, Moderate: 1, Low: 2, Unrated: 3 };
/* the function's rating on the four-level scale (the design's Critical and
   Medium read as High and Moderate) */
const levelOf = r => (r === "Critical" || r === "High" ? "High" : r === "Moderate" || r === "Medium" ? "Moderate" : r === "Low" ? "Low" : "Unrated");
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
/* the gap's control code ("6c", "7e"), from GapCode; the load fills a blank
   GapCode with "GAP-" and the SharePoint ID, which is not a control */
const controlOf = g => (/^GAP-\d+$/i.test(String(g.gapCode || "").trim()) ? "" : String(g.gapCode || "").trim());

/* the target chip: red once an open gap is past its quarter's end, amber
   when no target is set, neutral otherwise */
function targetOf(g, today) {
  const t = fiscalTarget(g.targetQuarter, g.targetFY);
  if (!t) return { label: "No target", cls: "warn", end: null, late: false };
  const late = !!(g.open && t.end && dayDiff(today, t.end) > 0);
  return { label: t.label, cls: late ? "late" : "", end: t.end, late };
}

function TargetChip({ t }) {
  return <span className={"pill gt-target" + (t.cls ? " " + t.cls : "")} title={t.end ? (t.late ? "Past its target, which ended " : "Target ends ") + fmtDate(t.end) : undefined}>{t.label}</span>;
}

export function GapTracker() {
  const { ds, adapter, today, actions, openFn, fullAccess, realAdmin, go } = useApp();
  const gaps = useVisibleGaps();
  const [tab, setTab] = useState("open");
  const [level, setLevel] = useState("");
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState("");
  /* days open: to today for an open gap, to its closed date for a closed one */
  const days = g => (g.opened ? Math.max(0, dayDiff(!g.open && g.closed ? g.closed : today, g.opened)) : 0);
  const open = gaps.filter(g => g.open);
  const closed = gaps.filter(g => !g.open);
  const avg = open.length ? Math.floor(open.reduce((n, g) => n + days(g), 0) / open.length) : 0;
  const fnsWithOpen = new Set(open.filter(g => g.functionId != null && g.functionId !== "").map(g => String(g.functionId))).size;
  const byTopic = useMemo(() => {
    const m = {};
    open.filter(g => g.topic).forEach(g => { m[g.topic] = (m[g.topic] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gaps]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the current tab's gaps, one card per function, the unlinked ones last */
  const cards = useMemo(() => {
    const inTab = tab === "open" ? open : closed;
    const groups = new Map();
    for (const g of inTab) {
      const f = g.functionId ? ds.fnById.get(String(g.functionId)) : null;
      const key = f ? "f:" + f.id : "none";
      if (!groups.has(key)) groups.set(key, { key, f, gaps: [] });
      groups.get(key).gaps.push(g);
    }
    const list = [...groups.values()]
      .filter(c => !level || (c.f && levelOf(c.f.displayRisk) === level))
      .map(c => {
        const rows = c.gaps.map(g => ({ g, age: days(g), t: targetOf(g, today) })).sort((a, b) => b.age - a.age);
        return { ...c, rows, oldest: rows.length ? rows[0].age : 0, late: rows.filter(r => r.t.late).length };
      });
    return list.sort((a, b) => (!a.f) - (!b.f)
      || (a.f && b.f ? RANK[levelOf(a.f.displayRisk)] - RANK[levelOf(b.f.displayRisk)] : 0)
      || b.oldest - a.oldest
      || (a.f && b.f ? a.f.name.localeCompare(b.f.name) : 0));
  }, [gaps, tab, level, ds, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = cards.reduce((n, c) => n + c.rows.length, 0);

  const pick = g => { setSel(g); setNote(""); };
  const close = async () => { try { await actions.closeGap(sel, note.trim()); setSel(null); } catch (e) { /* the toast says what failed */ } };
  /* reopening is for administrators, where the backend has it */
  const canReopen = realAdmin && typeof adapter.reopenGap === "function";
  const reopen = async () => { try { await actions.reopenGap(sel, note.trim()); setSel(null); } catch (e) { /* the toast says what failed */ } };
  const selFn = sel && sel.functionId ? ds.fnById.get(String(sel.functionId)) : null;
  const selT = sel ? targetOf(sel, today) : null;

  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting" title="Gap Tracker"
      sub={(fullAccess ? "Every open compliance gap across the institution, tied to the function it came from." : "The compliance gaps on the functions you are in the Accountability Structure for.")
        + " Close a gap with documented notes and the count badge updates everywhere it appears."}
      right={realAdmin && ds.flags.length > 0 && <button className="button button-secondary-outline button-sm" onClick={() => go("Flagged Items")}><Icon n="flag" s={14} />{ds.flags.length} flagged for review</button>} />
    <div className="cm-grid g-stat" style={{ marginBottom: 8 }}>
      <Stat n={open.length} l="Open" tone={open.length ? "bad" : null} onClick={() => setTab("open")} />
      <Stat n={closed.length} l="Closed" onClick={() => setTab("closed")} />
      <Stat n={fnsWithOpen} l="Functions with open gaps" onClick={() => setTab("open")} />
      <Stat n={avg} l="Avg days open" s="The average age of the gaps open now" />
    </div>
    {byTopic.length > 0 && <>
      <div className="sec-h"><span className="lbl">Open gaps by risk area</span><span className="rule"></span></div>
      <div className="cm-panel" style={{ padding: 16, marginBottom: 8 }}>
        <div className="bars">{byTopic.map(([t, n]) =>
          <div className="bar" key={t}><span style={{ color: "#2b3345", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{t}</span>
            <span className="tr"><span className="fl" style={{ width: (n / byTopic[0][1] * 100) + "%", background: "#F76900" }}></span></span>
            <span style={{ fontWeight: 700, color: "#000E54", textAlign: "right" }}>{n}</span></div>)}
        </div></div></>}
    <div className="tabs" role="tablist" style={{ marginTop: 22 }}>
      <button role="tab" aria-selected={tab === "open"} className={"tab" + (tab === "open" ? " on" : "")} onClick={() => setTab("open")}>Open ({open.length})</button>
      <button role="tab" aria-selected={tab === "closed"} className={"tab" + (tab === "closed" ? " on" : "")} onClick={() => setTab("closed")}>Closed ({closed.length})</button>
    </div>
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
      <select className="fs" value={level} onChange={e => setLevel(e.target.value)} aria-label="Function risk level">
        {LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <span className="count">{shown} shown</span></div>
    {!cards.length && <Empty title={tab === "open" ? "No open gaps" : "No closed gaps"} sub={level ? "No function at this risk level has gaps here." : "Nothing has been logged here yet."} />}
    <div className="gt-grid">
      {cards.map(c => <section key={c.key} className={"cm-panel gt-card" + (c.f ? "" : " none")} aria-label={c.f ? c.f.name : "Not linked to a function"}>
        <header className="gt-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            {c.f ? <button className="gt-fn" onClick={() => openFn(c.f)}>{c.f.name}</button>
              : <div className="gt-fn">Not linked to a function</div>}
            {c.f && <div className="sub">{c.f.topic} {"·"} {c.f.area}</div>}
          </div>
          <div className="gt-meta">{c.f && <Risk r={c.f.displayRisk} />}
            <span className="gt-n">{plural(c.rows.length, tab === "open" ? "open gap" : "closed gap", tab === "open" ? "open gaps" : "closed gaps")}</span></div>
        </header>
        <ul className="gt-rows">{c.rows.map(({ g, age, t }) => <li key={g.id}>
          <button className="gt-row" onClick={() => pick(g)} aria-haspopup="dialog">
            <span className="gt-title">{g.title}</span>
            <span className="gt-facts">{controlOf(g) && <span className="gt-code" title="Control">{controlOf(g)}</span>}
              <span className="sub">{age}d open</span>
              <TargetChip t={t} /></span>
          </button></li>)}</ul>
        <footer className="gt-foot">
          <span className="sub">Oldest {c.oldest}d</span>
          {tab === "open" && <span className={"sub" + (c.late ? " gt-late" : "")}>{c.late} past target</span>}
          {c.f && <button className="button button-secondary-outline button-sm" style={{ marginLeft: "auto" }} onClick={() => openFn(c.f)}>View function</button>}
        </footer>
      </section>)}
    </div>

    {sel && <Modal onClose={() => setSel(null)} size="sm" label={sel.open ? "Close gap" : "Closed gap"}>
      <ModalHead onClose={() => setSel(null)} eyebrow={sel.open ? "Compliance gap" : "Closed gap"} title={sel.title}
        sub={selFn ? selFn.name + " · " + selFn.topic : "Not linked to a function"} />
      <div className="mbd">
        <dl className="gt-dl">
          {controlOf(sel) && <><dt>Control</dt><dd>{controlOf(sel)}</dd></>}
          <dt>Status</dt><dd>{sel.status}</dd>
          <dt>Days open</dt><dd>{days(sel)}{sel.opened ? " (opened " + fmtDate(sel.opened) + ")" : ""}</dd>
          <dt>Corrective measure</dt><dd>{sel.note || "None recorded"}</dd>
          <dt>Responsible unit</dt><dd>{sel.unit || "None recorded"}</dd>
          <dt>Target</dt><dd><TargetChip t={selT} />{selT.end ? " Ends " + fmtDate(selT.end) : ""}</dd>
          <dt>Source</dt><dd>{sel.source || "None recorded"}</dd>
          {!sel.open && <><dt>Closed</dt><dd>{sel.closed ? fmtDate(sel.closed) : "No date recorded"}</dd>
            <dt>Closure note</dt><dd>{sel.closeNote || "None recorded"}</dd></>}
        </dl>
        {sel.open && <>
          <label className="flab" htmlFor="gap-note" style={{ marginTop: 14 }}>Closure note</label>
          <textarea id="gap-note" className="ti" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What was remediated, and what prevents recurrence?" />
          <p className="sub" style={{ marginTop: 10 }}>Closing records the date and this note on the gap. The open-gap count updates everywhere it appears.</p>
        </>}
        {!sel.open && canReopen && <>
          <label className="flab" htmlFor="gap-reopen" style={{ marginTop: 14 }}>Why are you reopening this?</label>
          <textarea id="gap-reopen" className="ti" value={note} onChange={e => setNote(e.target.value)} placeholder="Enter a brief reason..." />
          <p className="sub" style={{ marginTop: 10 }}>Reopening clears the closed date and closure note. The archive keeps the closure note with this reason.</p>
        </>}
      </div>
      <div className="mft">
        {sel.open && <Busy busyKey={"gap-" + sel.id} className="button button-primary" disabled={!note.trim()} onClick={close}><Icon n="check" s={15} />Mark as closed</Busy>}
        {!sel.open && canReopen && <Busy busyKey={"gap-" + sel.id} className="button button-primary" disabled={!note.trim()} onClick={reopen}><Icon n="undo" s={15} />Reopen gap</Busy>}
        <button className="button button-secondary-outline" onClick={() => setSel(null)}>{sel.open ? "Cancel" : canReopen ? "Cancel" : "Close"}</button>
      </div>
    </Modal>}
  </div>;
}
