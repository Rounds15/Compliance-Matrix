/* Compliance Risk Dashboard, in the design's layout: rating stats, the
   shaded heat map (click a cell for its functions), high risk by risk area
   and the exposure signals. The canvas app hardcodes these figures (parity
   spec section 3); here every one is computed from live data, over the
   ratings the lists use (High, Moderate, Low, and Unrated). */

import React, { useMemo, useState } from "react";
import { Risk, Modal, ModalHead, PageHead, Stat, useApp } from "./parts.jsx";
import { RISK_COLOR } from "../lib/risk.js";

const LEVELS = [["High", "High risk", "bad"], ["Moderate", "Moderate risk", "warn"], ["Low", "Low risk", null], ["Unrated", "Unrated", null]];

export function RiskDashboard() {
  const { ds, cfg, openFn } = useApp();
  const [cell, setCell] = useState(null); // { id, risk | null }

  const m = useMemo(() => {
    const fns = ds.fns;
    const areaIds = new Set(ds.topics.map(t => String(t.id)));
    const domainIds = new Set(ds.domains.map(d => String(d.id)));
    const noArea = f => f.topicId == null || !areaIds.has(String(f.topicId));
    const openGapFns = new Set(ds.gaps.filter(g => g.open).map(g => String(g.functionId)));
    const rows = [...ds.topics].sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ id: String(t.id), name: t.name, fns: fns.filter(f => String(f.topicId) === String(t.id)) }));
    const orphans = fns.filter(noArea);
    if (orphans.length) rows.push({ id: "none", name: "No risk area", fns: orphans });
    const max = Math.max(1, ...rows.flatMap(r => LEVELS.map(([k]) => r.fns.filter(f => f.risk === k).length)));
    const high = rows.map(r => ({ t: r.name, n: r.fns.filter(f => f.risk === "High").length })).filter(x => x.n).sort((a, b) => b.n - a.n);
    return {
      total: fns.length, max, rows, high,
      count: r => fns.filter(f => f.risk === r).length,
      signals: [
        ["Functions with an open gap", fns.filter(f => openGapFns.has(String(f.id))).length, "#000E54"],
        ["High-risk functions with a gap", fns.filter(f => f.risk === "High" && openGapFns.has(String(f.id))).length, "#B91C1C"],
        ["Overdue deadlines", ds.allDeadlines.filter(d => d.status === "Overdue").length, "#DC2626"],
        ["Unassigned unit-owner roles", fns.filter(f => !f.chain.unit.length).length, "#707780"],
        ["Functions with no risk rating", fns.filter(f => f.risk === "Unrated").length, "#707780"],
        ["Functions with no risk area", orphans.length, "#707780"],
        ["Functions with no domain", fns.filter(f => f.areaId == null || !domainIds.has(String(f.areaId))).length, "#707780"]
      ]
    };
  }, [ds]);
  const pct = n => (m.total ? Math.round(n / m.total * 100) : 0) + "% of " + (cfg.backend === "sample" ? "the sample" : "the matrix");
  const shade = (l, n) => {
    if (!n) return null;
    const a = .32 + .68 * (n / m.max);
    return { background: RISK_COLOR[l], boxShadow: "inset 0 0 0 999px rgba(255,255,255," + (1 - a).toFixed(2) + ")", color: a > .55 ? "#fff" : "#3d2b1f" };
  };
  const picked = cell && m.rows.find(r => r.id === cell.id);
  const pickedFns = picked ? picked.fns.filter(f => !cell.risk || f.risk === cell.risk).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const highMax = Math.max(1, ...m.high.map(x => x.n));

  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Compliance Risk Dashboard"
      sub="The executive risk picture: where the institution's high-risk obligations sit, and how gaps and deadlines cluster against them." />
    <div className="cm-grid g-stat">
      {LEVELS.map(([l, label, tone]) => <Stat key={l} n={m.count(l)} l={label} s={pct(m.count(l))} tone={tone} />)}
    </div>
    <div className="sec-h"><span className="lbl">Heat map, risk area by risk rating</span><span className="rule"></span>
      <span style={{ fontSize: 12, fontWeight: 400, color: "#707780" }}>Select a cell to list the functions</span></div>
    <div className="cm-panel" style={{ padding: 16, overflowX: "auto" }}>
      <table className="heat"><thead><tr><th className="rw"><span className="sr">Risk area</span></th>{LEVELS.map(([l]) => <th key={l}>{l}</th>)}<th>Total</th></tr></thead>
        <tbody>{m.rows.map(r => <tr key={r.id}><th className="rw">{r.name}</th>
          {LEVELS.map(([l]) => {
            const n = r.fns.filter(f => f.risk === l).length;
            return <td key={l} className={n ? "" : "z"} style={shade(l, n)}>{n
              ? <button className="heat-b" aria-label={`${r.name}, ${l}: ${n}`} onClick={() => setCell({ id: r.id, risk: l })}>{n}</button> : "·"}</td>;
          })}
          <td style={{ background: "#F1F3F6", color: "#000E54" }}>{r.fns.length
            ? <button className="heat-b" aria-label={`${r.name}, total: ${r.fns.length}`} onClick={() => setCell({ id: r.id, risk: null })}>{r.fns.length}</button> : 0}</td></tr>)}
        </tbody></table>
      <div className="legend">
        {LEVELS.map(([l]) => <span key={l}><i style={{ background: RISK_COLOR[l] }}></i>{l}</span>)}
        <span style={{ marginLeft: "auto" }}>Shade intensity = number of functions in the cell</span>
      </div>
    </div>
    <div className="cm-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", marginTop: 22 }}>
      <div className="cm-panel" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>High risk by risk area</div>
        {m.high.length ? <div className="bars">{m.high.map(({ t, n }) =>
          <div className="bar" key={t}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{t}</span>
            <span className="tr"><span className="fl" style={{ width: (n / highMax * 100) + "%", background: "#DC2626" }}></span></span>
            <span style={{ fontWeight: 700, color: "#000E54", textAlign: "right" }}>{n}</span></div>)}
        </div> : <p className="sub">No functions are rated high yet.</p>}</div>
      <div className="cm-panel" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Risk exposure signals</div>
        <dl className="kv signals" style={{ gridTemplateColumns: "1fr auto", rowGap: 11 }}>
          {m.signals.map(([k, v, c]) => <React.Fragment key={k}><dt>{k}</dt><dd style={{ fontWeight: 700, color: c, textAlign: "right" }}>{v}</dd></React.Fragment>)}
        </dl>
        <div className="note" style={{ marginTop: 14 }}>{cfg.backend === "sample"
          ? `Percentages reflect the ${m.total}-function sample loaded in this preview, not the full matrix.`
          : `Percentages are of all ${m.total} functions in the matrix. Unrated functions carry no rating yet; they are counted, not assumed low.`}</div>
      </div>
    </div>
    {picked && <Modal onClose={() => setCell(null)} label={picked.name}>
      <ModalHead onClose={() => setCell(null)} eyebrow={cell.risk ? (cell.risk === "Unrated" ? "Unrated" : cell.risk + " risk") : "All ratings"}
        title={picked.name} sub={pickedFns.length + " function" + (pickedFns.length === 1 ? "" : "s")} />
      <div className="mbd">{pickedFns.map(f => <button key={f.id} className="srow et-row" onClick={() => { setCell(null); openFn(f); }}>
        <div style={{ flex: 1, minWidth: 0 }}><div className="fname" style={{ fontSize: 13.5 }}>{f.name}</div>
          <div className="sub">{f.area} {"·"} {f.owner.n}</div></div><Risk r={f.risk} /></button>)}</div>
      <div className="mft"><button className="button button-secondary-outline" style={{ marginLeft: "auto" }} onClick={() => setCell(null)}>Close</button></div>
    </Modal>}
  </div>;
}
