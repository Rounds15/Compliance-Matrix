/* Compliance Functions, in the design's combined browse layout: search and
   lens bar, a facet rail (risk areas with their domains, rating, record
   status), removable filter chips, and the result set as a table, cards on a
   phone, or accordion groups. The data follows the canvas app: every risk
   area is listed, even one with no functions yet; the owner shown is the
   first Compliance Owner (+n when there are more); administrators get "Add
   new function" and the risk area and domain manager. */

import React, { useMemo, useRef, useState } from "react";
import { Icon, Avatar, Risk, PageHead, Empty, useMedia, useApp } from "./parts.jsx";
import { RISK_COLOR } from "../lib/risk.js";
import { functionsFor } from "../data/model.js";
import { TaxonomyManager } from "./Taxonomy.jsx";

const LENSES = [["flat", "Functions", "list"], ["topic", "Risk Areas", "layers"], ["area", "Domains", "folder"], ["statute", "Statutes", "scale"]];
const RATINGS = [["High", "High"], ["Moderate", "Moderate"], ["Low", "Low"], ["Unrated", "Not rated"]];
const PER = 15;
const byName = (a, b) => a.name.localeCompare(b.name);

/* the first Compliance Owner, and how many more there are */
const ownerOf = f => {
  const co = f.chain.compliance;
  return { p: co[0] ? co[0].person : null, more: Math.max(0, co.length - 1) };
};

const blob = f => [f.name, f.code, f.statute, f.citation, f.topic, f.area, ...f.chain.compliance.map(r => r.person.n)].join(" ").toLowerCase();

export const FnCard = ({ f, g, fl, onClick }) => {
  const o = ownerOf(f);
  return <button className="fcard" onClick={onClick}>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}><div className="t">{f.name}</div>
        <div className="sub" style={{ marginTop: 3 }}>{f.topic} {"·"} {f.area}</div></div>
      <Risk r={f.risk} /></div>
    <div className="m">{f.statute && <span className="chip"><Icon n="scale" s={12} />{f.statute}</span>}
      {g > 0 && <span className="gapbadge">{g} {g === 1 ? "gap" : "gaps"}</span>}
      {fl && <span className="flagb"><Icon n="flag" s={10} sw={2.4} />Flagged</span>}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 11, borderTop: "1px solid #EEF0F4" }}>
      <Avatar person={o.p} size={28} /><div style={{ minWidth: 0 }}>
        <div className="nm" style={{ fontSize: 12.5 }}>{o.p ? o.p.n + (o.more ? " +" + o.more : "") : "Not assigned"}</div>
        <div className="ti">{o.p ? o.p.u : ""}</div></div></div>
  </button>;
};

export function Functions({ filter, setFilter }) {
  const { ds, realAdmin, actingPerson, openFn, newFn } = useApp();
  const { fns, gaps, flags } = ds;
  const [open, setOpen] = useState({});
  const [railOpen, setRailOpen] = useState(false);
  const [tax, setTax] = useState(false);
  const narrow = useMedia("(max-width:1000px)");
  const mobile = useMedia("(max-width:700px)");
  const top = useRef(null);
  const { q, area, domain, risk, status, lens, page } = filter;
  const set = patch => setFilter(f => ({ ...f, page: 0, ...patch }));

  const openGapsBy = useMemo(() => {
    const m = new Map();
    gaps.forEach(g => { if (g.open) m.set(String(g.functionId), (m.get(String(g.functionId)) || 0) + 1); });
    return m;
  }, [gaps]);
  const flaggedSet = useMemo(() => new Set(flags.map(x => String(x.functionId))), [flags]);
  const gapCount = f => openGapsBy.get(String(f.id)) || 0;
  const flagged = f => flaggedSet.has(String(f.id));
  const mineSet = useMemo(() => filter.mine ? new Set(functionsFor(actingPerson, fns).map(f => String(f.id))) : null, [filter.mine, actingPerson, fns]);

  /* facet counts follow the search box and "assigned to", not the facet itself */
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    return fns.filter(f => (!t || blob(f).includes(t)) && (!mineSet || mineSet.has(String(f.id))));
  }, [fns, q, mineSet]);
  const areas = useMemo(() => [...ds.topics].sort(byName).map(t => ({
    ...t, n: searched.filter(f => String(f.topicId) === String(t.id)).length,
    domains: ds.domains.filter(d => String(d.topicId) === String(t.id)).sort(byName)
      .map(d => ({ ...d, n: searched.filter(f => String(f.areaId) === String(d.id)).length }))
  })), [ds, searched]);
  const inArea = f => (!area || String(f.topicId) === area) && (!domain || String(f.areaId) === domain);
  const riskCounts = useMemo(() => Object.fromEntries(RATINGS.map(([k]) => [k, searched.filter(f => inArea(f) && f.risk === k).length])), [searched, area, domain]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => searched.filter(f => inArea(f) && (!risk || f.risk === risk) &&
    (!status || (status === "gaps" ? gapCount(f) > 0 : flagged(f)))
  ).sort(byName), [searched, area, domain, risk, status, openGapsBy, flaggedSet]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const cur = Math.min(page, pages - 1);
  const pageRows = rows.slice(cur * PER, cur * PER + PER);
  const turn = n => {
    setFilter(f => ({ ...f, page: n }));
    if (top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const nameOf = (list, id) => (list.find(x => String(x.id) === id) || {}).name || "";
  const activeChips = [
    filter.mine && ["Assigned to " + actingPerson.n, () => set({ mine: false })],
    area && ["Risk area: " + nameOf(ds.topics, area), () => set({ area: "", domain: "" })],
    domain && ["Domain: " + nameOf(ds.domains, domain), () => set({ domain: "" })],
    risk && ["Risk: " + (RATINGS.find(r => r[0] === risk) || [0, risk])[1], () => set({ risk: "" })],
    status && [status === "gaps" ? "Has an open gap" : "Flagged for review", () => set({ status: "" })],
    q.trim() && ['Search: "' + q.trim() + '"', () => set({ q: "" })]
  ].filter(Boolean);
  const clearAll = () => set({ q: "", area: "", domain: "", risk: "", status: "", mine: false });

  const Rail = <div className="mx-rail">
    <div className="mx-rail-sec">
      <div className="mx-rail-h">Risk Areas / Domains
        {realAdmin && <button className="mx-railadd" onClick={() => setTax(true)} aria-label="Add or manage risk areas and domains" title="Add or manage risk areas and domains"><Icon n="plus" s={13} sw={2.2} /></button>}</div>
      <button className={"mx-facet" + (!area ? " on" : "")} onClick={() => set({ area: "", domain: "" })}>
        <span>All risk areas</span><span className="n">{searched.length}</span></button>
      {areas.map(t => {
        const on = area === String(t.id);
        return <div key={t.id}>
          <button className={"mx-facet" + (on && !domain ? " on" : "")} aria-expanded={on} onClick={() => set({ area: on && !domain ? "" : String(t.id), domain: "" })}>
            <span>{t.name}</span><span className="n">{t.n}</span></button>
          {on && <div className="mx-sub">
            <div className="mx-sub-h">Domains</div>
            {t.domains.length ? <>
              <button className={"mx-subf" + (!domain ? " on" : "")} onClick={() => set({ domain: "" })}>
                <span>All domains</span><span className="n">{t.n}</span></button>
              {t.domains.map(d => <button key={d.id} className={"mx-subf" + (domain === String(d.id) ? " on" : "")} onClick={() => set({ domain: domain === String(d.id) ? "" : String(d.id) })}>
                <span>{d.name}</span><span className="n">{d.n}</span></button>)}
            </> : <div className="sub" style={{ padding: "4px 10px" }}>No domains yet</div>}
          </div>}
        </div>;
      })}
    </div>
    <div className="mx-rail-sec">
      <div className="mx-rail-h">Risk rating</div>
      <button className={"mx-facet" + (!risk ? " on" : "")} onClick={() => set({ risk: "" })}>
        <span>Any rating</span><span className="n">{searched.filter(inArea).length}</span></button>
      {RATINGS.map(([k, l]) => <button key={k} className={"mx-facet" + (risk === k ? " on" : "")} onClick={() => set({ risk: risk === k ? "" : k })}>
        <span><i className="mx-dot" style={{ background: RISK_COLOR[k] }}></i>{l}</span><span className="n">{riskCounts[k]}</span></button>)}
    </div>
    <div className="mx-rail-sec">
      <div className="mx-rail-h">Record status</div>
      {[["", "Any status"], ["gaps", "Has an open gap"], ["flagged", "Flagged for review"]].map(([k, l]) =>
        <button key={l} className={"mx-facet" + (status === k ? " on" : "")} onClick={() => set({ status: k })}><span>{l}</span></button>)}
    </div>
  </div>;

  const Row = f => {
    const g = gapCount(f), o = ownerOf(f);
    return <tr key={f.id} onClick={() => openFn(f)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") openFn(f); }}>
      <td><div className="fname">{f.name}</div>
        <div className="mx-rowmeta"><span className="sub">ID {f.code}</span>
          {g > 0 && <span className="gapbadge" title={g + (g === 1 ? " open gap" : " open gaps")}>{g}</span>}
          {flagged(f) && <span className="flagb"><Icon n="flag" s={10} sw={2.4} />Flagged</span>}</div></td>
      <td><div className="mx-cell">{f.topic}</div><div className="sub">{f.area}</div></td>
      <td><div className="mx-cell">{f.statute}</div><div className="sub">{f.citation}</div></td>
      <td><div className="owner"><Avatar person={o.p} size={30} /><div style={{ minWidth: 0 }}>
        <div className="nm">{o.p ? o.p.n + (o.more ? " +" + o.more : "") : "Not assigned"}</div><div className="ti">{o.p ? o.p.u : ""}</div></div></div></td>
      <td><Risk r={f.risk} /></td></tr>;
  };

  const Table = list => <div className="tblwrap"><table className="table-simple mx-table"><thead><tr>
    <th>Compliance function</th><th>Risk area / domain</th><th>Statute / citation</th><th>Compliance owner / unit</th><th>Risk rating</th>
  </tr></thead><tbody>{list.map(Row)}</tbody></table></div>;

  const Cards = list => <div className="cm-grid g-wide">{list.map(f =>
    <FnCard key={f.id} f={f} g={gapCount(f)} fl={flagged(f)} onClick={() => openFn(f)} />)}</div>;

  return <div className="page wrap mx-page">
    <PageHead eyebrow="Browse the matrix" title="Compliance Functions"
      sub="One view of every obligation. Narrow by risk area, domain, rating, or status on the left; switch the lens to read the same result set as a flat list or grouped by risk area, domain, or statute."
      right={<>
        {realAdmin && <button className="button button-secondary-outline button-sm" onClick={() => setTax(true)}><Icon n="layers" s={14} />Risk areas and domains</button>}
        {realAdmin && <button className="button button-primary button-sm" onClick={newFn}><Icon n="plus" s={14} />Add new function</button>}
      </>} />

    <div className="mx-bar">
      <div className="srch"><Icon n="search" s={16} />
        <input placeholder="Search a function, statute, citation, or owner..." aria-label="Search compliance functions" value={q} onChange={e => set({ q: e.target.value })} /></div>
      <div className="mx-lens" role="tablist" aria-label="Lens">
        {LENSES.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={lens === k} className={lens === k ? "on" : ""} onClick={() => { set({ lens: k }); setOpen({}); }}>
          <Icon n={ic} s={14} />{l}</button>)}
      </div>
    </div>

    <div className="mx-chips" ref={top}>
      <span className="count">{rows.length === fns.length ? fns.length + " functions" : rows.length + " of " + fns.length + " functions"}</span>
      {activeChips.map(([l, clear]) => <button key={l} className="mx-chip" onClick={clear} aria-label={"Clear " + l}>{l}<span aria-hidden="true">{"✕"}</span></button>)}
      {activeChips.length > 1 && <button className="mx-clear" onClick={clearAll}>Clear all</button>}
    </div>

    {narrow && <button className="mx-railtog" onClick={() => setRailOpen(!railOpen)} aria-expanded={railOpen}>
      <Icon n="layers" s={15} />{railOpen ? "Hide filters" : "Risk areas, domains and filters"}</button>}

    <div className="mx-split">
      {(!narrow || railOpen) && Rail}
      <div className="mx-results">
        {!rows.length && <div className="empty"><h3>No matching functions</h3>
          <p style={{ color: "#707780" }}>Clear a filter or broaden the search to see more of the matrix.</p>
          {!!activeChips.length && <button className="button button-secondary-outline button-sm" style={{ marginTop: 12 }} onClick={clearAll}>Clear the filters</button>}</div>}

        {!!rows.length && lens === "flat" && (mobile ? Cards(pageRows) : Table(pageRows))}
        {!!rows.length && lens === "flat" && rows.length > PER && <div className="pager">
          <button className="button button-secondary-outline button-sm" disabled={cur === 0} onClick={() => turn(cur - 1)}>Previous</button>
          <span className="count">Page {cur + 1} of {pages} {"·"} {rows.length} functions</span>
          <button className="button button-secondary-outline button-sm" disabled={cur >= pages - 1} onClick={() => turn(cur + 1)}>Next</button>
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
                <span className="mx-mix">{RATINGS.map(([r, l]) => { const n = g.fns.filter(f => f.risk === r).length; return n ? <span key={r} title={n + " " + l} style={{ background: RISK_COLOR[r] }}>{n}</span> : null; })}</span>
                <span className="mx-group-n">{g.fns.length}</span>
                <Icon n="chev" s={16} style={{ color: "#6B7280", transform: isOpen ? "rotate(180deg)" : "", flex: "none" }} />
              </button>
              {isOpen && <div className="mx-group-bd">
                {lens === "statute" && g.fns[0].statuteUrl && <a className="mx-statlink" href={g.fns[0].statuteUrl} target="_blank" rel="noopener">Open the statute <Icon n="ext" s={11} /></a>}
                {g.fns.map(f => { const o = ownerOf(f); return <button key={f.id} className="mx-grow" onClick={() => openFn(f)}>
                  <span className="mx-grow-t"><span className="fname">{f.name}</span>
                    <span className="sub">{lens === "area" ? f.topic : lens === "statute" ? f.topic + " · " + f.area : f.area} {"·"} {o.p ? o.p.n : "Not assigned"}</span></span>
                  {gapCount(f) > 0 && <span className="gapbadge">{gapCount(f)}</span>}
                  {flagged(f) && <span className="flagb"><Icon n="flag" s={10} sw={2.4} />Flagged</span>}
                  <Risk r={f.risk} /></button>; })}
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
