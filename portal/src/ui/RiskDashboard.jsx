/* Compliance Risk Dashboard (parity spec 2.9). The canvas app hardcodes these
   figures (parity spec section 3); here every one is computed from live data. */

import React, { useMemo, useState } from "react";
import { Hero, useApp } from "./parts.jsx";

const COLS = [["High", "H", "hH"], ["Moderate", "M", "hM"], ["Low", "L", "hL"], ["Unrated", "Unrated", "hU"]];
/* heat: the more functions in a cell, the stronger its colour */
const RGB = { High: "220,38,38", Moderate: "217,119,6", Low: "22,163,74", Unrated: "150,156,164" };

export function RiskDashboard() {
  const { ds, openFn } = useApp();
  const [cell, setCell] = useState(null); // {areaId, risk}

  const m = useMemo(() => {
    const fns = ds.fns;
    const total = fns.length;
    const areaIds = new Set(ds.topics.map(t => String(t.id)));
    const domainIds = new Set(ds.domains.map(d => String(d.id)));
    const noArea = f => f.topicId == null || !areaIds.has(String(f.topicId));
    const openGapFns = new Set(ds.gaps.filter(g => g.open).map(g => String(g.functionId)));
    const count = r => fns.filter(f => f.risk === r).length;
    const rows = [...ds.topics].sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ id: String(t.id), name: t.name, fns: fns.filter(f => String(f.topicId) === String(t.id)) }));
    const orphans = fns.filter(noArea);
    if (orphans.length) rows.push({ id: "none", name: "No risk area", fns: orphans });
    const max = Math.max(1, ...rows.flatMap(r => COLS.map(([k]) => r.fns.filter(f => f.risk === k).length)));
    return {
      total, max,
      byRisk: COLS.map(([r]) => count(r)),
      rows,
      signals: [
        ["Functions with an open gap", fns.filter(f => openGapFns.has(String(f.id))).length],
        ["High-risk functions with a gap", fns.filter(f => f.risk === "High" && openGapFns.has(String(f.id))).length],
        ["Overdue deadlines", ds.allDeadlines.filter(d => d.status === "Overdue").length],
        ["Unassigned unit-owner roles", fns.filter(f => !f.chain.unit.length).length],
        ["Functions with no risk rating", count("Unrated")],
        ["Functions with no risk area", orphans.length],
        ["Functions with no domain", fns.filter(f => f.areaId == null || !domainIds.has(String(f.areaId))).length]
      ]
    };
  }, [ds]);
  const pct = n => (m.total ? Math.round((n / m.total) * 100) : 0) + "% of the matrix";
  const picked = cell && m.rows.find(r => r.id === cell.areaId);
  const pickedFns = picked ? picked.fns.filter(f => !cell.risk || f.risk === cell.risk).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const tone = ["tone-red", "tone-amber", "tone-green", "tone-grey"];
  const label = ["High risk", "Moderate risk", "Low risk", "Unrated"];

  return <>
    <Hero eyebrow="RISK AND REPORTING, ADMINISTRATOR" title="Compliance Risk Dashboard"
      lede="The executive risk picture: where the institution's high-risk obligations sit, and how gaps and deadlines cluster against them." />
    <div className="wrap">
      <div className="stats">{m.byRisk.map((n, i) => <div key={label[i]} className={"stat " + tone[i]}>
        <b>{n}</b><span className="l">{label[i]}</span><span className="s">{pct(n)}</span></div>)}</div>

      <div className="sechd"><span className="eb">HEAT MAP, RISK AREA BY RISK RATING</span><span className="hint">Select a cell to list the functions</span></div>
      <div className="heat" role="table" aria-label="Heat map, risk area by risk rating">
        <div className="heatrow hd" role="row"><span className="a" role="columnheader"><span className="sr">Risk area</span></span>
          {COLS.map(([, h]) => <span key={h} role="columnheader">{h}</span>)}<span role="columnheader">Total</span></div>
        {m.rows.map(r => <div className="heatrow" role="row" key={r.id}>
          <span className="a" role="rowheader">{r.name}</span>
          {COLS.map(([risk, h, cls]) => {
            const n = r.fns.filter(f => f.risk === risk).length;
            const on = cell && cell.areaId === r.id && cell.risk === risk;
            const heat = n ? { background: `rgba(${RGB[risk]},${(0.12 + 0.55 * n / m.max).toFixed(2)})` } : null;
            return <button key={h} role="cell" style={heat} className={cls + (on ? " sel" : "")} disabled={!n} aria-pressed={on}
              aria-label={`${r.name}, ${risk}: ${n}`} onClick={() => setCell(on ? null : { areaId: r.id, risk })}>{n}</button>;
          })}
          <button role="cell" className={"tot" + (cell && cell.areaId === r.id && !cell.risk ? " sel" : "")} disabled={!r.fns.length}
            aria-label={`${r.name}, total: ${r.fns.length}`} onClick={() => setCell(cell && cell.areaId === r.id && !cell.risk ? null : { areaId: r.id, risk: null })}>{r.fns.length}</button>
        </div>)}
      </div>
      {picked && <div className="cellfns"><h4>{picked.name}{cell.risk ? " · " + (cell.risk === "Unrated" ? "Unrated" : cell.risk) : ""} ({pickedFns.length})</h4>
        <ul>{pickedFns.map(f => <li key={f.id}><button onClick={() => openFn(f)}>{f.name}</button></li>)}</ul></div>}

      <div className="signals">
        <div className="eb">RISK EXPOSURE SIGNALS</div>
        <dl>{m.signals.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
      </div>
    </div>
  </>;
}
