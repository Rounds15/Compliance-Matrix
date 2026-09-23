import React, { useMemo, useState } from "react";
import { Icon, Avatar, Risk, Modal, PageHead, Stat, Empty, Busy, useApp } from "./parts.jsx";
import { fmtDate, dayDiff, fiscalQ } from "../lib/dates.js";
import { RISK_COLOR, levelsPresent, isSevere } from "../lib/risk.js";
import { matrixCsv, gapsCsv, ownershipCsv, deadlinesIcs, download } from "./exports.js";

const tone = l => (l === "Critical" || l === "High" ? "bad" : l === "Moderate" || l === "Medium" ? "warn" : null);

/* ================= GAP TRACKER ================= */
export function GapTracker({ openFn, initialTab = "open" }) {
  const { ds, actions, today } = useApp();
  const { gaps, flags } = ds;
  const [tab, setTab] = useState(initialTab);
  const [sev, setSev] = useState("All");
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState("");
  const open = gaps.filter(g => g.open);
  const closed = gaps.filter(g => !g.open);
  const levels = levelsPresent(gaps.map(g => g.severity));
  const list = (tab === "open" ? open : closed).filter(g => sev === "All" || g.severity === sev);
  const byTopic = useMemo(() => {
    const m = {};
    open.forEach(g => m[g.topic] = (m[g.topic] || 0) + 1);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gaps]); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = g => { const f = ds.fnById.get(String(g.functionId)); if (f) openFn(f); };
  const age = g => (g.opened ? Math.abs(dayDiff(g.opened, today)) : 0);
  const statLevels = levelsPresent(open.map(g => g.severity)).slice(0, 3);
  const close = async () => { try { await actions.closeGap(sel, note.trim()); setSel(null); } catch (e) { /* toast */ } };
  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Gap Tracker"
      sub="Every open compliance gap across the institution, tied to the function it came from. Close a gap with documented notes; the count badge updates everywhere it appears."
      right={<><span className="pill late">{open.length} open</span><span className="pill ok">{closed.length} closed</span></>} />
    <div className="cm-grid g-stat" style={{ marginBottom: 8 }}>
      {statLevels.map((l, i) => <Stat key={l} n={open.filter(g => g.severity === l).length} l={l} s={i === 0 && isSevere(l) ? "Immediate attention" : null} tone={tone(l)} />)}
      <Stat n={Math.round(open.reduce((s, g) => s + age(g), 0) / Math.max(1, open.length))} l="Avg days open" s="Across open gaps" />
    </div>
    <div className="sec-h"><span className="lbl">Open gaps by risk area</span><span className="rule"></span></div>
    <div className="cm-panel" style={{ padding: 16, marginBottom: 8 }}>
      {byTopic.length ? <div className="bars">{byTopic.map(([t, n]) =>
        <div className="bar" key={t}><span style={{ color: "#2b3345", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{t}</span>
          <span className="tr"><span className="fl" style={{ width: (n / byTopic[0][1] * 100) + "%", background: "#F76900" }}></span></span>
          <span style={{ fontWeight: 700, color: "#000E54", textAlign: "right" }}>{n}</span></div>)}
      </div> : <p className="sub">No open gaps.</p>}</div>
    <div className="tabs" style={{ marginTop: 22 }}>
      <button className={"tab" + (tab === "open" ? " on" : "")} onClick={() => setTab("open")}>Open gaps ({open.length})</button>
      <button className={"tab" + (tab === "closed" ? " on" : "")} onClick={() => setTab("closed")}>Closed ({closed.length})</button>
      <button className={"tab" + (tab === "flags" ? " on" : "")} onClick={() => setTab("flags")}>Flagged for review ({flags.length})</button>
    </div>
    {tab !== "flags" && <>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select className="fs" value={sev} onChange={e => setSev(e.target.value)}>
          <option value="All">All severities</option>{levels.map(s => <option key={s}>{s}</option>)}</select>
        <span className="count">{list.length} shown</span></div>
      {!list.length && <Empty title="No gaps" sub="Nothing matches this filter." />}
      <div className="cm-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))" }}>
        {list.map(g => <div key={g.id} className="cm-panel" style={{ padding: 15, borderLeft: "4px solid " + (g.open ? (RISK_COLOR[g.severity] || "#8A929E") : "#16A34A") }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 9 }}>
            <Risk r={g.severity} />
            <span className="sub">{g.code}</span>
            {g.opened && <span className="sub">· opened {fmtDate(g.opened)} ({age(g)}d)</span>}
            {g.open && g.status !== "Open" && <span className="pill due">{g.status}</span>}
            {!g.open && <span className="pill ok" style={{ marginLeft: "auto" }}>Closed {g.closed ? fmtDate(g.closed) : ""}</span>}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 15, lineHeight: 1.3 }}>{g.title}</div>
          {g.note && <p style={{ fontSize: 13, color: "#5b6373", marginTop: 6 }}>{g.note}</p>}
          {(g.targetQuarter || g.targetFY || g.unit) && <div className="sub" style={{ marginTop: 6 }}>{[g.unit, [g.targetQuarter, g.targetFY].filter(Boolean).join(" ") && "Target " + [g.targetQuarter, g.targetFY].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>}
          {!g.open && g.closeNote && <div className="note" style={{ borderLeftColor: "#16A34A", marginTop: 8 }}><b>Closure note</b> — {g.closeNote}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #EEF0F4", flexWrap: "wrap" }}>
            <Avatar person={g.owner} size={26} />
            <div style={{ minWidth: 0, flex: 1 }}><div className="nm" style={{ fontSize: 12.5, fontWeight: 600 }}>{g.owner.n}</div>
              <div className="ti">{g.functionName}</div></div>
            <button className="button button-secondary-outline button-sm" onClick={() => jump(g)}>Function</button>
            {g.open && <button className="button button-primary button-sm" onClick={() => { setSel(g); setNote(""); }}><Icon n="check" s={13} />Close</button>}
          </div></div>)}
      </div></>}
    {tab === "flags" && <>
      {!flags.length && <Empty title="Nothing flagged" sub="Anyone can flag a function for review from its detail page." />}
      {!!flags.length && <div className="cm-panel" style={{ overflow: "hidden" }}>
        {flags.map(fl => {
          const f = ds.fnById.get(String(fl.functionId)); if (!f) return null;
          const bizDays = fl.at ? businessDays(fl.at, today) : null;
          return <div key={fl.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 15px", borderBottom: "1px solid #E2E5EA", flexWrap: "wrap" }}>
            <Icon n="flag" s={18} style={{ color: "#F76900", marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="fname">{f.name}</div>
              <div className="sub">{f.topic} · flagged by {fl.by}{fl.at ? " on " + fmtDate(fl.at) : ""}{bizDays !== null ? " · " + bizDays + " business day" + (bizDays === 1 ? "" : "s") + " open" : ""}</div>
              <p style={{ fontSize: 13, color: "#5b6373", marginTop: 6 }}>{fl.reason}</p></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button button-secondary-outline button-sm" onClick={() => openFn(f)}>Review</button>
              <Busy busyKey={"flag-" + fl.id} className="button button-primary button-sm" onClick={() => actions.resolveFlag(fl, f).catch(() => null)}><Icon n="check" s={13} />Clear</Busy></div>
          </div>;
        })}
      </div>}</>}
    {sel && <Modal onClose={() => setSel(null)} size="sm">
      <div className="mhd"><div><h2>Close gap</h2>
        <div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{sel.code} · {sel.functionName}</div></div>
        <button className="cl" onClick={() => setSel(null)} aria-label="Close">✕</button></div>
      <div className="mbd">
        <div className="note" style={{ marginBottom: 14 }}><b>{sel.title}</b></div>
        <label className="flab">Closure notes (required)</label>
        <textarea className="ti" value={note} onChange={e => setNote(e.target.value)} placeholder="What was remediated, and what prevents recurrence?" />
        <p className="sub" style={{ marginTop: 10 }}>Closing records the date, the closing user, and these notes on the gap record. The open-gap count updates immediately.</p>
      </div>
      <div className="mft"><Busy busyKey={"gap-" + sel.id} className="button button-primary" disabled={!note.trim()} onClick={close}><Icon n="check" s={15} />Mark closed</Busy>
        <button className="button button-secondary-outline" onClick={() => setSel(null)}>Cancel</button></div>
    </Modal>}
  </div>;
}

/* The canvas Flags screen counts age in business days (Mon-Fri), inclusive. */
export function businessDays(from, to) {
  let n = 0;
  const d = new Date(from.getTime());
  while (d <= to) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return Math.max(0, n - 1);
}

/* ================= RISK DASHBOARD ================= */
export function RiskDashboard({ openFn, deadlines }) {
  const { ds, cfg, today } = useApp();
  const { fns, gaps } = ds;
  const [cell, setCell] = useState(null);
  const LEVELS = levelsPresent(fns.map(f => f.risk));
  const topics = ds.topics.map(t => t.name).filter(t => fns.some(f => f.topic === t));
  if (fns.some(f => f.topic === "No risk area")) topics.push("No risk area");
  const cellFns = (t, l) => fns.filter(f => f.topic === t && f.risk === l);
  const max = Math.max(1, ...topics.flatMap(t => LEVELS.map(l => cellFns(t, l).length)));
  const byRisk = l => fns.filter(f => f.risk === l).length;
  const shade = (l, n) => {
    if (!n) return null; const a = .32 + .68 * (n / max); const c = RISK_COLOR[l] || "#8A929E";
    return { background: c, opacity: 1, boxShadow: "inset 0 0 0 999px rgba(255,255,255," + (1 - a) + ")", color: a > .55 ? "#fff" : "#3d2b1f" };
  };
  const sel = cell ? cellFns(cell[0], cell[1]) : [];
  const severe = topics.map(t => ({ t, n: fns.filter(f => f.topic === t && isSevere(f.risk)).length })).sort((a, b) => b.n - a.n).filter(x => x.n);
  const severeMax = Math.max(1, ...severe.map(x => x.n));
  const sample = cfg.backend === "sample";
  const openGaps = gaps.filter(g => g.open);
  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Risk Dashboard"
      sub="The executive risk picture: where the institution's critical and high-risk obligations sit, and how gaps and deadlines cluster against them." />
    <div className="cm-grid g-stat">
      {LEVELS.map(l => <Stat key={l} n={byRisk(l)} l={l === "Unrated" ? "Unrated" : l + " risk"} s={`${Math.round(byRisk(l) / Math.max(1, fns.length) * 100)}% of ${sample ? "the sample" : "all functions"}`} tone={tone(l)} />)}
    </div>
    <div className="sec-h"><span className="lbl">Heat map — risk area by rating</span><span className="rule"></span>
      <span style={{ fontSize: 12, fontWeight: 400, color: "#707780" }}>select a cell to list the functions</span></div>
    <div className="cm-panel" style={{ padding: 16, overflowX: "auto" }}>
      <table className="heat"><thead><tr><th className="rw"></th>{LEVELS.map(l => <th key={l}>{l}</th>)}<th>Total</th></tr></thead>
        <tbody>{topics.map(t => {
          const tot = LEVELS.reduce((s, l) => s + cellFns(t, l).length, 0);
          return <tr key={t}><th className="rw">{t}</th>
            {LEVELS.map(l => {
              const n = cellFns(t, l).length;
              return <td key={l} className={n ? "" : "z"} style={shade(l, n)} onClick={() => n && setCell([t, l])}>{n || "·"}</td>;
            })}
            <td style={{ background: "#F1F3F6", color: "#000E54" }}>{tot}</td></tr>;
        })}
        </tbody></table>
      <div className="legend">
        {LEVELS.map(l => <span key={l}><i style={{ background: RISK_COLOR[l] || "#8A929E" }}></i>{l}</span>)}
        <span style={{ marginLeft: "auto" }}>Shade intensity = number of functions in the cell</span>
      </div>
    </div>
    <div className="cm-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 22 }}>
      <div className="cm-panel" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Critical and high risk by risk area</div>
        {severe.length ? <div className="bars">{severe.map(({ t, n }) =>
          <div className="bar" key={t}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{t}</span>
            <span className="tr"><span className="fl" style={{ width: (n / severeMax * 100) + "%", background: "#DC2626" }}></span></span>
            <span style={{ fontWeight: 700, color: "#000E54", textAlign: "right" }}>{n}</span></div>)}
        </div> : <p className="sub">No functions are rated high or critical yet.</p>}</div>
      <div className="cm-panel" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Risk exposure signals</div>
        <dl className="kv" style={{ gridTemplateColumns: "1fr auto", rowGap: 11 }}>
          <dt>Functions with an open gap</dt><dd style={{ fontWeight: 700, color: "#000E54" }}>{new Set(openGaps.map(g => String(g.functionId))).size}</dd>
          <dt>High or critical functions with an open gap</dt><dd style={{ fontWeight: 700, color: "#B91C1C" }}>{new Set(openGaps.filter(g => { const f = ds.fnById.get(String(g.functionId)); return f && isSevere(f.risk); }).map(g => String(g.functionId))).size}</dd>
          <dt>Unrated functions</dt><dd style={{ fontWeight: 700, color: "#707780" }}>{byRisk("Unrated")}</dd>
          <dt>Overdue deadlines</dt><dd style={{ fontWeight: 700, color: "#DC2626" }}>{deadlines.filter(d => !d.complete && d.due && dayDiff(d.due, today) < 0).length}</dd>
          <dt>Due this fiscal quarter</dt><dd style={{ fontWeight: 700, color: "#D97706" }}>{deadlines.filter(d => !d.complete && d.due && fiscalQ(d.due) === fiscalQ(today)).length}</dd>
          <dt>Unassigned unit-owner roles</dt><dd style={{ fontWeight: 700, color: "#707780" }}>{fns.filter(f => !f.unitOwner).length}</dd>
        </dl>
        <div className="note" style={{ marginTop: 14 }}>{sample
          ? `Percentages reflect the ${fns.length}-function sample loaded in this preview, not the full matrix.`
          : `Percentages are of all ${fns.length} functions in the matrix. Unrated functions carry no rating yet; they are counted, not assumed low.`}</div>
      </div>
    </div>
    {cell && <Modal onClose={() => setCell(null)}>
      <div className="mhd"><div><div className="eyebrow" style={{ color: "#FF8E00" }}>{cell[1]}{cell[1] === "Unrated" ? "" : " risk"}</div>
        <h2 style={{ marginTop: 5 }}>{cell[0]}</h2>
        <div style={{ fontSize: 12.5, color: "#C3CCE4", marginTop: 4 }}>{sel.length} function{sel.length === 1 ? "" : "s"}</div></div>
        <button className="cl" onClick={() => setCell(null)} aria-label="Close">✕</button></div>
      <div className="mbd">{sel.map(f => <button key={f.id} className="srow" style={{ border: "1px solid #E2E5EA", borderRadius: 4, marginBottom: 6 }} onClick={() => { setCell(null); openFn(f); }}>
        <div style={{ flex: 1, minWidth: 0 }}><div className="fname" style={{ fontSize: 13.5 }}>{f.name}</div>
          <div className="sub">{f.area} · {f.owner.n}</div></div><Risk r={f.risk} /></button>)}</div>
      <div className="mft"><button className="button button-secondary-outline" style={{ marginLeft: "auto" }} onClick={() => setCell(null)}>Close</button></div>
    </Modal>}
  </div>;
}

/* ================= REPORTING / POWER BI ================= */
export function Reporting({ deadlines }) {
  const { ds, cfg, adapter, today } = useApp();
  const [tab, setTab] = useState("embed");
  const sp = adapter.name === "sharepoint";
  const DATASETS = sp ? [
    ["Compliance Functions", "Compliance Functions", "One row per obligation: statute, citation, requirement, deadline narrative, risk rating.", ds.fns.length + " rows"],
    ["Accountability Structure", "Accountability Structure", "One row per person per role per function, with the sub-role. The authority for who owns what.", "junction"],
    ["Deadlines", "Deadlines", "One row per due event: base date, cadence, last completion and reason.", ds.allDeadlines.length + " rows"],
    ["Gap List", "Gap List", "Open and closed gaps with corrective measure, target quarter, and closure notes.", ds.gaps.length + " rows"],
    ["Compliance Directory", "Compliance Directory", "People layer: name and email.", ds.people.length + " rows"],
    ["Archive", "Archive", "Audit trail: completions, reversals, resolved flags, deleted functions.", "append-only"]
  ] : [
    ["Compliance Functions", "su_compliancefunction", "One row per obligation with the full ownership chain, statute, cadence, and risk rating.", ds.fns.length + " rows"],
    ["Function Ownership", "su_functionownership", "Person, role and sub-role per function. Drives row-level security.", "junction"],
    ["Compliance Deadlines", "su_compliancedeadline", "One row per due date, joined to its function; carries cadence and completion.", ds.allDeadlines.length + " rows"],
    ["Compliance Gaps", "su_compliancegap", "Open and closed gaps with severity, opened/closed dates, and closure notes.", ds.gaps.length + " rows"],
    ["Compliance Directory", "su_compliancedirectory", "People layer: name, title, unit, email, phone, location.", ds.people.length + " rows"]
  ];
  const embed = cfg.links.powerBiEmbed;
  const host = window.location.hostname || "compliance-matrix";
  const EXPORTS = [
    ["Full matrix (CSV)", "All functions with the complete column set and ownership chain, for offline review or an audit request.", () => download("compliance-matrix.csv", matrixCsv(ds), "text/csv;charset=utf-8")],
    ["Deadline calendar (ICS)", "Open deadlines as all-day events. Import into Outlook to see due dates beside your meetings.", () => download("compliance-deadlines.ics", deadlinesIcs(deadlines, host), "text/calendar;charset=utf-8")],
    ["Gap register (CSV)", "Open and closed gaps with severity, aging, and closure notes.", () => download("compliance-gaps.csv", gapsCsv(ds, today), "text/csv;charset=utf-8")],
    ["Ownership chains (CSV)", "One row per person per role per function, with sub-role and email.", () => download("compliance-ownership.csv", ownershipCsv(ds), "text/csv;charset=utf-8")]
  ];
  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Reporting"
      sub={"The matrix is the system of record; Power BI is the visualization layer. Reports connect straight to the " + (sp ? "SharePoint lists" : "Dataverse tables") + ", so what leadership sees is never a stale copy."}
      right={<a className="button button-primary" href={cfg.links.powerBi} target="_blank" rel="noopener"><Icon n="ext" s={15} />Open in Power BI</a>} />
    <div className="tabs">
      <button className={"tab" + (tab === "embed" ? " on" : "")} onClick={() => setTab("embed")}>Embedded report</button>
      <button className={"tab" + (tab === "data" ? " on" : "")} onClick={() => setTab("data")}>Datasets and connection</button>
      <button className={"tab" + (tab === "export" ? " on" : "")} onClick={() => setTab("export")}>Exports</button>
    </div>
    {tab === "embed" && <>
      {embed ? <iframe className="pbi-frame" style={{ padding: 0, border: "1px solid #E2E5EA", width: "100%", minHeight: 620 }} src={embed} title="Compliance Executive Overview" allowFullScreen></iframe>
        : <div className="pbi-frame">
          <Icon n="chart" s={38} style={{ color: "#ADB3B8" }} />
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 17 }}>Power BI report renders here</div>
          <p className="sub" style={{ maxWidth: "52ch" }}>Set the site setting <code>ComplianceMatrix/PowerBIEmbedUrl</code> to a report's <b>Secure embed</b> link and it renders in this frame, with each viewer seeing only what their Power BI access allows.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
            <span className="chip">Workspace: Compliance &amp; ERM</span><span className="chip">RLS: by ownership chain</span></div>
        </div>}
      <div className="cm-grid pbi" style={{ marginTop: 14 }}>
        {[["Compliance Executive Overview", "Portfolio risk, gap counts, and deadline health for the senior leadership team."],
          ["Deadline Health", "Overdue and upcoming obligations by unit, with reminder-response rates."],
          ["Gap Aging", "Open gaps by severity and days-open, with closure throughput over time."]].map(([t, s]) =>
          <div key={t} className="cm-panel" style={{ padding: 15 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}><Icon n="chart" s={17} style={{ color: "#F76900" }} />
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 14.5 }}>{t}</div></div>
            <p style={{ fontSize: 13, color: "#5b6373", marginTop: 8 }}>{s}</p>
            <a href={cfg.links.powerBi} target="_blank" rel="noopener" style={{ fontSize: 12.5, fontWeight: 600, display: "inline-block", marginTop: 8 }}>Open report <Icon n="ext" s={11} style={{ verticalAlign: -1 }} /></a>
          </div>)}
      </div></>}
    {tab === "data" && <>
      <div className="note" style={{ marginBottom: 14 }}><b>Connection.</b> {sp
        ? <>Power BI Desktop → Get Data → SharePoint Online list (2.0 implementation) → the Compliance Matrix site → select the lists below. Publish to the <b>Compliance &amp; ERM</b> workspace and schedule refresh.</>
        : <>Power BI Desktop → Get Data → Dataverse → environment URL → select the tables below. Publish to the <b>Compliance &amp; ERM</b> workspace and schedule refresh; no intermediate export is required.</>}</div>
      <div className="tblwrap"><table className="table-simple" role="table"><thead><tr>
        <th>{sp ? "List" : "Table"}</th><th>{sp ? "List title" : "Logical name"}</th><th>Contents</th><th>Volume</th></tr></thead>
        <tbody>{DATASETS.map(([n, l, d, v]) => <tr key={l} style={{ cursor: "default" }}>
          <td><div className="fname" style={{ fontSize: 13.5 }}>{n}</div></td>
          <td><code style={{ fontSize: 12.5, color: "#203299" }}>{l}</code></td>
          <td style={{ fontSize: 13, color: "#5b6373" }}>{d}</td>
          <td className="sub">{v}</td></tr>)}
        </tbody></table></div>
      <div className="cm-grid pbi" style={{ marginTop: 14 }}>
        <div className="cm-panel" style={{ padding: 15 }}><div className="eyebrow" style={{ marginBottom: 9 }}>Relationships</div>
          <dl className="kv" style={{ gridTemplateColumns: "1fr", rowGap: 7, fontSize: 13 }}>
            <dd><b>Deadlines</b> → Functions on the Function lookup (many-to-one)</dd>
            <dd><b>Gaps</b> → Functions on the Function lookup (many-to-one)</dd>
            <dd><b>{sp ? "Accountability Structure" : "Function Ownership"}</b> → Functions and Directory (the ownership junction)</dd></dl></div>
        <div className="cm-panel" style={{ padding: 15 }}><div className="eyebrow" style={{ marginBottom: 9 }}>Measures to define</div>
          <dl className="kv" style={{ gridTemplateColumns: "1fr", rowGap: 7, fontSize: 13 }}>
            <dd>Open Gap Count, Gap Aging Days</dd><dd>Overdue Deadlines, On-Time Completion %</dd>
            <dd>Severe Exposure = high or critical functions with an open gap</dd>
            <dd>Fiscal calendar starts July 1 — mark a custom date table</dd></dl></div>
      </div></>}
    {tab === "export" && <div className="cm-grid pbi">
      {EXPORTS.map(([t, s, run]) =>
        <div key={t} className="cm-panel" style={{ padding: 15 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 14.5 }}>{t}</div>
          <p style={{ fontSize: 13, color: "#5b6373", marginTop: 7 }}>{s}</p>
          <button className="button button-secondary-outline button-sm" style={{ marginTop: 10 }} onClick={run}>Download</button></div>)}
    </div>}
  </div>;
}

export function NoAccess({ go }) {
  const { realAdmin } = useApp();
  return <div className="page wrap"><div className="cm-panel" style={{ padding: "48px 24px", textAlign: "center" }}>
    <Icon n="shield" s={38} style={{ color: "#ADB3B8" }} />
    <h2 style={{ fontFamily: "var(--font-display)", color: "#000E54", margin: "12px 0 6px" }}>Administrator access required</h2>
    <p className="sub" style={{ maxWidth: "48ch", margin: "0 auto" }}>{realAdmin
      ? "You are previewing the page as someone without administrator rights. Switch “Viewing as” back to Administrator to see these screens."
      : "Risk and Reporting is limited to compliance office staff who hold the Compliance Matrix administrator role. Contact the Office of Compliance if you need access."}</p>
    <button className="button button-secondary" style={{ marginTop: 18 }} onClick={() => go("Home")}>Back to Home</button>
  </div></div>;
}
