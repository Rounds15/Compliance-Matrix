/* Reporting (parity spec 2.10, scr_Reporting.pa.yaml).

   The app's subtitle says reports connect to "Dataverse tables", while the
   live backend is SharePoint lists (parity spec section 3, wording to be
   confirmed). Until it is, the subtitle names whichever backend this site is
   configured for. */

import React, { useState } from "react";
import { Hero, useApp } from "./parts.jsx";
import { LISTS } from "../data/adapters/sharepoint.js";
import { DEFAULT_SETS } from "../data/adapters/dataverse.js";

const CATALOGUE = [
  ["Compliance Executive Overview", "Portfolio risk, gap counts, and deadline health for senior leadership."],
  ["Deadline Health", "Overdue and upcoming obligations by unit, with reminder-response rates."],
  ["Gap Aging", "Open gaps by severity and days-open, with closure throughput over time."]
];
const MODEL_NOTES = "Relationships\nDeadlines to Functions on su_function (many-to-one)\nGaps to Functions on su_function (many-to-one)\nFunction Ownership to Functions and to Directory\n\nMeasures to define\nOpen Gap Count, Gap Aging Days, Overdue Deadlines, On-Time Completion percent\nFiscal calendar starts July 1, mark a custom date table";

export function Reporting() {
  const { cfg, ds, adapter } = useApp();
  const [tab, setTab] = useState("Embed");
  const store = adapter.name === "dataverse" ? "Dataverse tables" : "SharePoint lists";
  const L = cfg.links;
  const sources = adapter.name === "dataverse"
    ? [["Compliance Functions", DEFAULT_SETS.su_compliancefunction, ds.fns.length], ["Function Ownership", DEFAULT_SETS.su_functionownership, ds.fns.reduce((n, f) => n + f.chain.exec.length + f.chain.unit.length + f.chain.compliance.length, 0)],
      ["Deadlines", DEFAULT_SETS.su_compliancedeadline, ds.allDeadlines.length], ["Gaps", DEFAULT_SETS.su_compliancegap, ds.gaps.length], ["Flags", DEFAULT_SETS.su_functionflag, ds.allFlags.length], ["Directory", DEFAULT_SETS.su_compliancedirectory, ds.people.length]]
    : [["Compliance Functions", LISTS.functions, ds.fns.length], ["Accountability Structure", LISTS.ownership, (ds.raw.ownership || []).length],
      ["Deadlines", LISTS.deadlines, ds.allDeadlines.length], ["Gaps", LISTS.gaps, ds.gaps.length], ["Flags", LISTS.flags, ds.allFlags.length], ["Directory", LISTS.people, ds.people.length]];

  return <>
    <Hero eyebrow="RISK AND REPORTING, ADMINISTRATOR" title="Reporting"
      lede={`The matrix is the system of record; Power BI is the visualization layer. Reports connect straight to the ${store}, so leadership never sees a stale copy.`} />
    <div className="wrap">
      <div className="tabs">
        <button className={"btn" + (tab === "Embed" ? " on" : "")} style={{ minWidth: 190 }} onClick={() => setTab("Embed")}>Embedded report</button>
        <button className={"btn" + (tab === "Data" ? " on" : "")} style={{ minWidth: 230 }} onClick={() => setTab("Data")}>Datasets and connection</button>
        <span className="sp"></span>
        <a className="btn primary" style={{ minWidth: 190, minHeight: 42 }} href={L.powerBi} target="_blank" rel="noopener">Open in Power BI</a>
      </div>
      {tab === "Embed"
        ? <div className="pbi">{L.powerBiEmbed
          ? <iframe title="Power BI report" src={L.powerBiEmbed} allowFullScreen></iframe>
          : "Power BI report renders here once the workspace and report IDs are set"}</div>
        : <div className="dsets"><table>
          <thead><tr><th>Dataset</th><th>{adapter.name === "dataverse" ? "Table" : "List"}</th><th>Rows</th></tr></thead>
          <tbody>{sources.map(([n, src, c]) => <tr key={n}><td>{n}</td><td>{src}</td><td>{c}</td></tr>)}</tbody>
        </table></div>}
      <div className="rnote">Workspace: Compliance and ERM | Refresh: every 3 hours | Row-level security: by ownership chain</div>
      <div className="catalogue">{CATALOGUE.map(([t, b]) => <div className="rcat" key={t}>
        <h3>{t}</h3><p>{b}</p><a className="btn" href={L.powerBi} target="_blank" rel="noopener">Open report</a></div>)}</div>
      <div className="model"><div className="eb">MODEL NOTES</div><p className="body">{MODEL_NOTES}</p></div>
    </div>
  </>;
}
