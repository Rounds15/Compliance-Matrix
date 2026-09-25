/* Reporting, in the design's tabbed layout: the embedded Power BI report
   and report catalogue, the datasets with their live row counts and the
   canvas app's model notes, and downloads.

   The app's subtitle says reports connect to "Dataverse tables", while the
   live backend is SharePoint lists (parity spec section 3, wording to be
   confirmed). Until it is, the subtitle names whichever backend this site is
   configured for. */

import React, { useState } from "react";
import { Icon, PageHead, useApp } from "./parts.jsx";
import { useVisibleDeadlines } from "./Completion.jsx";
import { LISTS } from "../data/adapters/sharepoint.js";
import { DEFAULT_SETS } from "../data/adapters/dataverse.js";
import { matrixCsv, gapsCsv, ownershipCsv, deadlinesIcs, download } from "./exports.js";

const CATALOGUE = [
  ["Compliance Executive Overview", "Portfolio risk, gap counts, and deadline health for senior leadership."],
  ["Deadline Health", "Overdue and upcoming obligations by unit, with reminder-response rates."],
  ["Gap Aging", "Open gaps by severity and days-open, with closure throughput over time."]
];

export function Reporting() {
  const { cfg, ds, adapter, today } = useApp();
  const deadlines = useVisibleDeadlines();
  const [tab, setTab] = useState("embed");
  const dv = adapter.name === "dataverse";
  const store = dv ? "Dataverse tables" : "SharePoint lists";
  const L = cfg.links;
  const sources = dv
    ? [["Compliance Functions", DEFAULT_SETS.su_compliancefunction, ds.fns.length], ["Function Ownership", DEFAULT_SETS.su_functionownership, (ds.raw.ownership || []).length],
      ["Deadlines", DEFAULT_SETS.su_compliancedeadline, ds.allDeadlines.length], ["Gaps", DEFAULT_SETS.su_compliancegap, ds.gaps.length], ["Flags", DEFAULT_SETS.su_functionflag, ds.allFlags.length], ["Directory", DEFAULT_SETS.su_compliancedirectory, ds.people.length]]
    : [["Compliance Functions", LISTS.functions, ds.fns.length], ["Accountability Structure", LISTS.ownership, (ds.raw.ownership || []).length],
      ["Deadlines", LISTS.deadlines, ds.allDeadlines.length], ["Gaps", LISTS.gaps, ds.gaps.length], ["Flags", LISTS.flags, ds.allFlags.length], ["Directory", LISTS.people, ds.people.length]];
  const host = window.location.hostname || "syr.edu";
  const EXPORTS = [
    ["Full matrix (CSV)", "All functions with the complete column set and ownership chain, for offline review or an audit request.", () => download("compliance-matrix.csv", matrixCsv(ds), "text/csv;charset=utf-8")],
    ["Deadline calendar (ICS)", "Open deadlines as all-day events. Import into Outlook to see due dates beside your meetings.", () => download("compliance-deadlines.ics", deadlinesIcs(deadlines.filter(d => d.due && d.status !== "Completed"), host), "text/calendar;charset=utf-8")],
    ["Gap register (CSV)", "Open and closed gaps with severity, aging, and closure notes.", () => download("compliance-gaps.csv", gapsCsv(ds, today), "text/csv;charset=utf-8")],
    ["Ownership chains (CSV)", "One row per person per role per function, with sub-role and email.", () => download("compliance-ownership.csv", ownershipCsv(ds), "text/csv;charset=utf-8")]
  ];
  const TABS = [["embed", "Embedded report"], ["data", "Datasets and connection"], ["export", "Exports"]];

  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Reporting"
      sub={`The matrix is the system of record; Power BI is the visualization layer. Reports connect straight to the ${store}, so leadership never sees a stale copy.`}
      right={<a className="button button-primary button-sm" href={L.powerBi} target="_blank" rel="noopener"><Icon n="ext" s={14} />Open in Power BI</a>} />
    <div className="tabs" role="tablist">
      {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}
    </div>

    {tab === "embed" && <>
      {L.powerBiEmbed ? <iframe className="pbi-frame pbi-live" src={L.powerBiEmbed} title="Power BI report" allowFullScreen></iframe>
        : <div className="pbi-frame">
          <Icon n="chart" s={38} style={{ color: "#ADB3B8" }} />
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 17 }}>Power BI report renders here</div>
          <p className="sub" style={{ maxWidth: "52ch" }}>Once the workspace and report IDs are set: put the report's <b>Secure embed</b> link in the site setting <code>ComplianceMatrix/PowerBIEmbedUrl</code>, and each viewer sees only what their Power BI access allows.</p>
        </div>}
      <div className="note" style={{ marginTop: 14 }}>Workspace: Compliance and ERM {"·"} Refresh: every 3 hours {"·"} Row-level security: by ownership chain</div>
      <div className="cm-grid pbi" style={{ marginTop: 14 }}>
        {CATALOGUE.map(([t, s]) => <div key={t} className="cm-panel" style={{ padding: 15 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}><Icon n="chart" s={17} style={{ color: "#F76900" }} />
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 14.5 }}>{t}</div></div>
          <p style={{ fontSize: 13, color: "#5b6373", marginTop: 8 }}>{s}</p>
          <a href={L.powerBi} target="_blank" rel="noopener" style={{ fontSize: 12.5, fontWeight: 600, display: "inline-block", marginTop: 8 }}>Open report <Icon n="ext" s={11} style={{ verticalAlign: -1 }} /></a>
        </div>)}
      </div></>}

    {tab === "data" && <>
      <div className="note" style={{ marginBottom: 14 }}><b>Connection.</b> {dv
        ? <>In Power BI Desktop, Get Data, Dataverse, the environment URL, then select the tables below. Publish to the <b>Compliance and ERM</b> workspace and schedule refresh.</>
        : <>In Power BI Desktop, Get Data, SharePoint Online list (2.0 implementation), the Compliance Matrix site, then select the lists below. Publish to the <b>Compliance and ERM</b> workspace and schedule refresh.</>}</div>
      <div className="tblwrap"><table className="table-simple"><thead><tr>
        <th>Dataset</th><th>{dv ? "Table" : "List"}</th><th style={{ textAlign: "right" }}>Rows</th></tr></thead>
        <tbody>{sources.map(([n, src, c]) => <tr key={n} style={{ cursor: "default" }}>
          <td><div className="fname" style={{ fontSize: 13.5 }}>{n}</div></td>
          <td><code style={{ fontSize: 12.5, color: "#203299" }}>{src}</code></td>
          <td className="sub" style={{ textAlign: "right" }}>{c}</td></tr>)}
        </tbody></table></div>
      <div className="sec-h"><span className="lbl">Model notes</span><span className="rule"></span></div>
      <div className="cm-grid pbi">
        <div className="cm-panel" style={{ padding: 15 }}><div className="eyebrow" style={{ marginBottom: 9 }}>Relationships</div>
          <ul className="plain">
            <li><b>Deadlines</b> to Functions on su_function (many-to-one)</li>
            <li><b>Gaps</b> to Functions on su_function (many-to-one)</li>
            <li><b>Function Ownership</b> to Functions and to Directory</li></ul></div>
        <div className="cm-panel" style={{ padding: 15 }}><div className="eyebrow" style={{ marginBottom: 9 }}>Measures to define</div>
          <ul className="plain">
            <li>Open Gap Count, Gap Aging Days, Overdue Deadlines, On-Time Completion percent</li>
            <li>Fiscal calendar starts July 1, mark a custom date table</li></ul></div>
      </div></>}

    {tab === "export" && <div className="cm-grid pbi">
      {EXPORTS.map(([t, s, run]) => <div key={t} className="cm-panel" style={{ padding: 15 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#000E54", fontSize: 14.5 }}>{t}</div>
        <p style={{ fontSize: 13, color: "#5b6373", marginTop: 7 }}>{s}</p>
        <button className="button button-secondary-outline button-sm" style={{ marginTop: 10 }} onClick={run}><Icon n="arrow-right" s={13} style={{ transform: "rotate(90deg)" }} />Download</button></div>)}
    </div>}
  </div>;
}
