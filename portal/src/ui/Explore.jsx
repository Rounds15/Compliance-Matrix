/* Combined browse screen: Risk Areas + Domains + Compliance Functions in one
   view. Facet rail filters; the lens changes how the result set is organized.
   Field names follow the design (f.topic = risk area, f.area = domain). */

import React, { useEffect, useMemo, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Empty, useMedia, useApp } from "./parts.jsx";
import { RISK_COLOR, levelsPresent } from "../lib/risk.js";
import { functionsFor } from "../data/model.js";
import { TaxonomyManager } from "./Taxonomy.jsx";

const LENSES = [["flat", "Functions", "list"], ["topic", "Risk Areas", "layers"], ["area", "Domains", "folder"], ["statute", "Statutes", "scale"]];
const PER = 15;

export const FnCard = ({ f, m, onClick }) => <button className="fcard" onClick={onClick}>
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
    <div style={{ flex: 1, minWidth: 0 }}><div className="t">{f.name}</div>
      <div className="sub" style={{ marginTop: 3 }}>{f.topic} · {f.area}</div></div>
    <Risk r={f.risk} /></div>
  <div className="m">{f.statute && <span className="chip"><Icon n="scale" s={12} />{f.statute}</span>}
    {m.g > 0 && <span className="gapbadge">{m.g} gap</span>}
    {m.fl && <span className="flagb"><Icon n="flag" s={10} sw={2.4} />Flagged</span>}</div>
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 11, borderTop: "1px solid #EEF0F4" }}>
    <Avatar person={f.owner} size={28} /><div style={{ minWidth: 0 }}>
      <div className="nm" style={{ fontSize: 12.5 }}>{f.owner.n}</div><div className="ti">{f.owner.t}</div></div></div>
</button>;

const blob = f => (f.name + f.statute + f.citation + f.owner.n + f.area + f.topic + f.code).toLowerCase();

export function Explore({ openFn, filter, setFilter, lens: lens0, setLens: setLens0, onNew }) {
  const { ds, adminView, actingPerson } = useApp();
  const { fns, gaps, flags } = ds;
  const [lens, setLens] = useState(lens0 || "flat");
  const [domain, setDomain] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState({});
  const [railOpen, setRailOpen] = useState(false);
  const [tax, setTax] = useState(false);
  const narrow = useMedia("(max-width:1000px)");
  const mobile = useMedia("(max-width:700px)");
  const { q, topic, risk } = filter;
  useEffect(() => { if (lens0 && lens0 !== lens) setLens(lens0); }, [lens0]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setFilter({ ...filter, [k]: v }); setPage(0); };
  const openGapsBy = useMemo(() => {
    const m = new Map();
    gaps.forEach(g => { if (g.open) m.set(String(g.functionId), (m.get(String(g.functionId)) || 0) + 1); });
    return m;
  }, [gaps]);
  const flaggedSet = useMemo(() => new Set(flags.map(x => String(x.functionId))), [flags]);
  const gapCount = f => openGapsBy.get(String(f.id)) || 0;
  const flagged = f => flaggedSet.has(String(f.id));
  const mineSet = useMemo(() => filter.mine ? new Set(functionsFor(actingPerson, fns).map(f => String(f.id))) : null, [filter.mine, actingPerson, fns]);

  /* facet counts always reflect the search box, not the facet itself */
  const searched = useMemo(() => fns.filter(f =>
    (!q || blob(f).includes(q.toLowerCase())) && (!mineSet || mineSet.has(String(f.id)))), [fns, q, mineSet]);
  const RISKS = useMemo(() => levelsPresent(fns.map(f => f.risk)), [fns]);
  const areaTree = useMemo(() => {
    const m = new Map();
    searched.forEach(f => {
      if (!m.has(f.topic)) m.set(f.topic, { name: f.topic, n: 0, domains: new Map() });
      const t = m.get(f.topic); t.n++;
      t.domains.set(f.area, (t.domains.get(f.area) || 0) + 1);
    });
    return [...m.values()].sort((a, b) => b.n - a.n).map(t => ({ ...t, domains: [...t.domains.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [searched]);
  const riskCounts = useMemo(() => { const c = {}; RISKS.forEach(r => c[r] = searched.filter(f => f.risk === r).length); return c; }, [searched, RISKS]);

  const rows = useMemo(() => searched.filter(f =>
    (topic === "All" || f.topic === topic) && (domain === "All" || f.area === domain) && (risk === "All" || f.risk === risk) &&
    (status === "All" || (status === "gaps" ? gapCount(f) > 0 : status === "flagged" ? flagged(f) : true))
  ), [searched, topic, domain, risk, status, openGapsBy, flaggedSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (lens === "flat") return null;
    const key = lens === "topic" ? (f => f.topic) : lens === "area" ? (f => f.area) : (f => f.statute || "No statute recorded");
    const m = new Map();
    rows.forEach(f => {
      const k = key(f); if (!m.has(k)) m.set(k, { k, fns: [], meta: new Set() });
      const g = m.get(k); g.fns.push(f); g.meta.add(lens === "topic" ? f.area : lens === "area" ? f.topic : (f.citation || ""));
    });
    return [...m.values()].sort((a, b) => b.fns.length - a.fns.length || a.k.localeCompare(b.k));
  }, [rows, lens]);

  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const pageRows = rows.slice(page * PER, page * PER + PER);
  const activeChips = [
    filter.mine && ["Assigned to " + actingPerson.n, () => set("mine", false)],
    topic !== "All" && ["Risk area: " + topic, () => { set("topic", "All"); setDomain("All"); }],
    domain !== "All" && ["Domain: " + domain, () => setDomain("All")],
    risk !== "All" && ["Risk: " + risk, () => set("risk", "All")],
    status !== "All" && [status === "gaps" ? "Has an open gap" : "Flagged for review", () => setStatus("All")],
    q && ['Search: "' + q + '"', () => set("q", "")]
  ].filter(Boolean);
  const clearAll = () => { setFilter({ q: "", topic: "All", risk: "All" }); setDomain("All"); setStatus("All"); setPage(0); };

  const Rail = <div className="mx-rail">
    <div className="mx-rail-sec">
      <div className="mx-rail-h">Risk Areas</div>
      <button className={"mx-facet" + (topic === "All" ? " on" : "")} onClick={() => { set("topic", "All"); setDomain("All"); }}>
        <span>All risk areas</span><span className="n">{searched.length}</span></button>
      {areaTree.map(t => <div key={t.name}>
        <button className={"mx-facet" + (topic === t.name ? " on" : "")} onClick={() => { set("topic", topic === t.name ? "All" : t.name); setDomain("All"); }}>
          <span>{t.name}</span><span className="n">{t.n}</span></button>
        {topic === t.name && <div className="mx-sub">
          <div className="mx-sub-h">Domains</div>
          <button className={"mx-subf" + (domain === "All" ? " on" : "")} onClick={() => setDomain("All")}>
            <span>All domains</span><span className="n">{t.domains.length}</span></button>
          {t.domains.map(d => <button key={d.name} className={"mx-subf" + (domain === d.name ? " on" : "")} onClick={() => setDomain(domain === d.name ? "All" : d.name)}>
            <span>{d.name}</span><span className="n">{d.n}</span></button>)}
        </div>}
      </div>)}
    </div>
    <div className="mx-rail-sec">
      <div className="mx-rail-h">Risk rating</div>
      <button className={"mx-facet" + (risk === "All" ? " on" : "")} onClick={() => set("risk", "All")}>
        <span>Any rating</span><span className="n">{searched.length}</span></button>
      {RISKS.map(r => <button key={r} className={"mx-facet" + (risk === r ? " on" : "")} onClick={() => set("risk", risk === r ? "All" : r)}>
        <span><i className="mx-dot" style={{ background: RISK_COLOR[r] || "#8A929E" }}></i>{r}</span><span className="n">{riskCounts[r]}</span></button>)}
    </div>
    <div className="mx-rail-sec">
      <div className="mx-rail-h">Record status</div>
      {[["All", "Any status"], ["gaps", "Has an open gap"], ["flagged", "Flagged for review"]].map(([k, l]) =>
        <button key={k} className={"mx-facet" + (status === k ? " on" : "")} onClick={() => setStatus(k)}><span>{l}</span></button>)}
    </div>
  </div>;

  const Row = f => {
    const g = gapCount(f);
    return <tr key={f.id} onClick={() => openFn(f)}>
      <td><div className="fname">{f.name}</div>
        <div className="mx-rowmeta"><span className="sub">{f.code}</span>
          {g > 0 && <span className="gapbadge">{g}</span>}
          {flagged(f) && <span className="flagb"><Icon n="flag" s={10} sw={2.4} />Flagged</span>}</div></td>
      <td><div className="mx-cell">{f.topic}</div><div className="sub">{f.area}</div></td>
      <td><div className="mx-cell">{f.statute}</div><div className="sub">{f.citation}</div></td>
      <td><div className="owner"><Avatar person={f.owner} size={30} /><div style={{ minWidth: 0 }}>
        <div className="nm">{f.owner.n}</div><div className="ti">{f.owner.u}</div></div></div></td>
      <td><Risk r={f.risk} /></td></tr>;
  };

  const Table = list => <div className="tblwrap"><table className="table-simple" role="table"><thead><tr>
    <th style={{ width: "36%" }}>Compliance function</th><th>Risk area / domain</th><th>Statute / citation</th><th>Compliance owner</th><th style={{ width: 104 }}>Risk</th>
  </tr></thead><tbody>{list.map(Row)}</tbody></table></div>;

  const Cards = list => <div className="cm-grid g-wide">{list.map(f =>
    <FnCard key={f.id} f={f} m={{ g: gapCount(f), fl: flagged(f) }} onClick={() => openFn(f)} />)}</div>;

  return <div className="page wrap mx-page">
    <PageHead eyebrow="Browse the matrix" title="Compliance Functions"
      sub="One view of every obligation. Narrow by risk area, domain, rating, or status on the left; switch the lens to read the same result set as a flat list or grouped by risk area, domain, or statute."
      right={<>
        {adminView && <button className="button button-secondary-outline button-sm" onClick={() => setTax(true)}><Icon n="layers" s={14} />Risk areas and domains</button>}
        {adminView && <button className="button button-primary button-sm" onClick={onNew}><Icon n="plus" s={14} />New function</button>}
        <span className="count">{rows.length} of {fns.length} functions</span></>} />

    <div className="mx-bar">
      <div className="srch"><Icon n="search" s={16} />
        <input placeholder="Search functions, statutes, citations, owners…" value={q} onChange={e => set("q", e.target.value)} /></div>
      <div className="mx-lens" role="tablist" aria-label="Lens">
        {LENSES.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={lens === k} className={lens === k ? "on" : ""} onClick={() => { setLens(k); setLens0 && setLens0(k); setPage(0); }}>
          <Icon n={ic} s={14} />{l}</button>)}
      </div>
    </div>

    {!!activeChips.length && <div className="mx-chips">
      {activeChips.map(([l, clear]) => <button key={l} className="mx-chip" onClick={clear}>{l}<span aria-hidden="true">✕</span></button>)}
      <button className="mx-clear" onClick={clearAll}>Clear all</button>
    </div>}

    {narrow && <button className="mx-railtog" onClick={() => setRailOpen(!railOpen)}>
      <Icon n="layers" s={15} />{railOpen ? "Hide filters" : "Risk areas, domains and filters"}</button>}

    <div className="mx-split">
      {(!narrow || railOpen) && Rail}
      <div className="mx-results">
        {!rows.length && <Empty title="No matching functions" sub="Clear a filter or broaden the search to see more of the matrix." />}

        {!!rows.length && lens === "flat" && (mobile ? Cards(pageRows) : Table(pageRows))}
        {!!rows.length && lens === "flat" && rows.length > PER && <div className="pager">
          <button className="button button-secondary-outline button-sm" disabled={page === 0} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }}>Previous</button>
          <span className="count">Page {page + 1} of {pages} · {rows.length} functions</span>
          <button className="button button-secondary-outline button-sm" disabled={page >= pages - 1} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }}>Next</button>
        </div>}

        {!!rows.length && groups && <div className="mx-groups">
          <div className="mx-groups-h">{groups.length + " " + (lens === "topic" ? "risk area" : lens === "area" ? "domain" : "statute") + (groups.length === 1 ? "" : "s") + " · " + rows.length + " function" + (rows.length === 1 ? "" : "s")}
            <button className="mx-expand" onClick={() => setOpen(Object.keys(open).length ? {} : Object.fromEntries(groups.map(g => [g.k, true])))}>
              {Object.keys(open).length ? "Collapse all" : "Expand all"}</button></div>
          {groups.map(g => {
            const isOpen = !!open[g.k]; const max = groups[0].fns.length;
            const meta = [...g.meta].filter(Boolean);
            return <div key={g.k} className={"mx-group" + (isOpen ? " on" : "")}>
              <button className="mx-group-hd" onClick={() => setOpen({ ...open, [g.k]: !isOpen })} aria-expanded={isOpen}>
                <span className="mx-meter"><i style={{ width: Math.max(6, Math.round(g.fns.length / max * 100)) + "%" }}></i></span>
                <span className="mx-group-t">
                  <span className="t">{g.k}</span>
                  <span className="sub">{lens === "topic" ? meta.length + " domain" + (meta.length === 1 ? "" : "s") : meta.join(" · ")}</span>
                </span>
                <span className="mx-mix">{RISKS.map(r => { const n = g.fns.filter(f => f.risk === r).length; return n ? <span key={r} title={n + " " + r} style={{ background: RISK_COLOR[r] || "#8A929E" }}>{n}</span> : null; })}</span>
                <span className="mx-group-n">{g.fns.length}</span>
                <Icon n="chev" s={16} style={{ color: "#6B7280", transform: isOpen ? "rotate(180deg)" : "", flex: "none" }} />
              </button>
              {isOpen && <div className="mx-group-bd">
                {lens === "statute" && g.fns[0].statuteUrl && <a className="mx-statlink" href={g.fns[0].statuteUrl} target="_blank" rel="noopener">Open the statute <Icon n="ext" s={11} /></a>}
                {g.fns.map(f => <button key={f.id} className="mx-grow" onClick={() => openFn(f)}>
                  <span className="mx-grow-t"><span className="fname">{f.name}</span>
                    <span className="sub">{lens === "area" ? f.topic : lens === "statute" ? f.topic + " · " + f.area : f.area} · {f.owner.n}</span></span>
                  {gapCount(f) > 0 && <span className="gapbadge">{gapCount(f)}</span>}
                  {flagged(f) && <span className="flagb"><Icon n="flag" s={10} sw={2.4} />Flagged</span>}
                  <Risk r={f.risk} /></button>)}
              </div>}
            </div>;
          })}
        </div>}
        {!!rows.length && <div className="endlist">{"End of list · " + rows.length + " function" + (rows.length === 1 ? "" : "s")}</div>}
      </div>
    </div>
    {tax && <TaxonomyManager onClose={() => setTax(false)} />}
  </div>;
}
