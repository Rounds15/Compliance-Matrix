/* Compliance Functions (parity spec 2.3, scr_Functions.pa.yaml): search, the
   four lens tabs, the Risk Areas / Domains rail, a 10-row table and the
   orange pager. Administrators also get "Add new function" and the "+" that
   opens the risk area and domain manager. */

import React, { useEffect, useMemo, useState } from "react";
import { Hero, Icon, RiskPill, Avatar, SearchBox, Modal, Busy, useApp } from "./parts.jsx";

const PAGE = 10;
const LENSES = [["", "Functions", "list"], ["Topic", "Risk Areas", "folder"], ["Domain", "Domains", "layer"], ["Statute", "Statutes", "scale"]];
const byName = (a, b) => a.name.localeCompare(b.name);
const RATINGS = [["High", "High"], ["Moderate", "Moderate"], ["Low", "Low"], ["Unrated", "Not Rated"]];
const RATING_DOT = { High: "#FF431B", Moderate: "#D97706", Low: "#16A34A", Unrated: "#C4C7CE" };

function TaxonomyManager({ onClose }) {
  const { ds, actions, flash } = useApp();
  const [mode, setMode] = useState("Add");
  const [kind, setKind] = useState("Risk area");
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const areas = [...ds.topics].sort(byName);
  const domains = [...ds.domains].sort(byName);
  const n = name.trim().toLowerCase();
  const parentArea = areas.find(a => String(a.id) === parent);
  const hint = !n ? ""
    : kind === "Domain" && !parentArea ? "Choose the risk area this domain sits under."
      : kind === "Domain" && domains.some(d => d.name.trim().toLowerCase() === n && String(d.topicId) === parent) ? `That domain already exists under ${parentArea.name}.`
        : kind === "Risk area" && areas.some(a => a.name.trim().toLowerCase() === n) ? "That risk area already exists." : "";
  const add = async () => {
    try {
      if (kind === "Domain") await actions.addDomain(name.trim(), parentArea.id);
      else await actions.addRiskArea(name.trim());
      setName("");
    } catch (e) { /* toast */ }
  };
  const fnsIn = a => ds.fns.filter(f => String(f.topicId) === String(a.id)).length;
  const domsIn = a => ds.domains.filter(d => String(d.topicId) === String(a.id)).length;
  const fnsInDomain = d => ds.fns.filter(f => String(f.areaId) === String(d.id)).length;
  const delArea = async a => {
    const f = fnsIn(a), d = domsIn(a);
    if (f > 0 || d > 0) { flash(`Cannot delete ${a.name}. ${f > 0 ? f + " function(s). " : ""}${d > 0 ? d + " domain(s). " : ""}Reassign the children first.`, "error"); return; }
    if (confirm !== "RA:" + a.id) { setConfirm("RA:" + a.id); return; }
    try { await actions.deleteRiskArea(a); setConfirm(""); } catch (e) { /* toast */ }
  };
  const delDomain = async d => {
    const f = fnsInDomain(d);
    if (f > 0) { flash(`Cannot delete ${d.name}. ${f} function(s) under ${d.topic} still use it. Reassign them first.`, "error"); return; }
    if (confirm !== "DM:" + d.id) { setConfirm("DM:" + d.id); return; }
    try { await actions.deleteDomain(d); setConfirm(""); } catch (e) { /* toast */ }
  };
  return <Modal onClose={onClose} className={mode === "Manage" ? "wide" : ""} label="Risk areas and domains">
    <h2>{mode === "Manage" ? "Manage risk areas and domains" : kind === "Domain" ? "Add a domain" : "Add a risk area"}</h2>
    <div className="toggle" style={{ marginTop: 14 }}>
      <button className={"btn sm" + (mode === "Add" ? " on" : "")} style={{ minWidth: 100 }} onClick={() => { setMode("Add"); setConfirm(""); }}>Add</button>
      <button className={"btn sm" + (mode === "Manage" ? " on" : "")} style={{ minWidth: 100 }} onClick={() => { setMode("Manage"); setConfirm(""); }}>Manage</button>
    </div>
    {mode === "Add" ? <>
      <div className="toggle" style={{ marginTop: 16 }}>
        <button className={"btn" + (kind === "Risk area" ? " on" : "")} style={{ minWidth: 124 }} onClick={() => setKind("Risk area")}>Risk area</button>
        <button className={"btn" + (kind === "Domain" ? " on" : "")} style={{ minWidth: 124 }} onClick={() => setKind("Domain")}>Domain</button>
      </div>
      {kind === "Domain" && <>
        <label className="flabel" htmlFor="tax-parent" style={{ marginTop: 16 }}>RISK AREA THIS DOMAIN SITS UNDER</label>
        <select id="tax-parent" className="select" value={parent} onChange={e => setParent(e.target.value)}>
          <option value=""></option>
          {areas.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select></>}
      <label className="flabel" htmlFor="tax-name" style={{ marginTop: 16 }}>{kind === "Domain" ? "DOMAIN NAME" : "RISK AREA NAME"}</label>
      <input id="tax-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder={kind === "Domain" ? "New domain name" : "New risk area name"} />
      <div className="warn" style={{ minHeight: 20 }}>{hint}</div>
      <div className="mfoot">
        <Busy busyKey="tax" className="btn primary" style={{ minWidth: 140, minHeight: 46 }} disabled={!n || !!hint} onClick={add}>{kind === "Domain" ? "Add domain" : "Add risk area"}</Busy>
        <button className="btn" style={{ minWidth: 100, minHeight: 46 }} onClick={onClose}>Cancel</button>
      </div>
    </> : <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 18 }}>
        <div><div className="eb">RISK AREAS</div>
          <ul className="rows">{areas.map(a => <li key={a.id}><span className="grow">
            <span className="n">{a.name}</span><span className="m">{fnsIn(a)} function(s) {"·"} {domsIn(a)} domain(s)</span></span>
            <Busy busyKey="tax" className={"btn sm" + (confirm === "RA:" + a.id ? " danger" : "")} onClick={() => delArea(a)}>{confirm === "RA:" + a.id ? "Confirm?" : "Delete"}</Busy></li>)}</ul></div>
        <div><div className="eb" style={{ color: "#203299" }}>DOMAINS</div>
          <ul className="rows">{domains.map(d => <li key={d.id}><span className="grow">
            <span className="n">{d.name}</span><span className="m">Under {d.topic}</span></span>
            <Busy busyKey="tax" className={"btn sm" + (confirm === "DM:" + d.id ? " danger" : "")} onClick={() => delDomain(d)}>{confirm === "DM:" + d.id ? "Confirm?" : "Delete"}</Busy></li>)}</ul></div>
      </div>
      <div className="mfoot"><button className="btn" style={{ minWidth: 100, minHeight: 46 }} onClick={onClose}>Close</button></div>
    </>}
  </Modal>;
}

export function Functions({ filter, setFilter }) {
  const { ds, realAdmin, openFn, newFn } = useApp();
  const [tax, setTax] = useState(false);
  const { q, area, domain, risk, lens, page } = filter;
  const set = patch => setFilter(f => ({ ...f, page: 1, ...patch }));
  const [expanded, setExpanded] = useState(area);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const has = s => String(s || "").toLowerCase().includes(t);
    const list = ds.fns.filter(f =>
      (!t || has(f.name) || has(f.statute) || has(f.citation) || f.chain.compliance.some(r => has(r.person.n)) || has(f.topic) || has(f.area))
      && (!area || String(f.topicId) === area)
      && (!domain || String(f.areaId) === domain)
      && (!risk || f.risk === risk));
    const key = { Topic: f => f.topic, Domain: f => f.area, Statute: f => f.statute }[lens];
    const sorted = [...list].sort(byName);
    return key ? sorted.sort((a, b) => key(a).localeCompare(key(b))) : sorted;
  }, [ds, q, area, domain, risk, lens]);
  const groupOf = { Topic: f => f.topic, Domain: f => f.area, Statute: f => f.statute || "No statute" }[lens];
  /* the rating counts follow the other filters, so they say what a click will show */
  const inScope = f => (!area || String(f.topicId) === area) && (!domain || String(f.areaId) === domain);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  useEffect(() => { if (page > pages) setFilter(f => ({ ...f, page: pages })); }, [page, pages, setFilter]);
  const shown = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const top = React.useRef(null);
  /* turning a page brings the top of the list back into view */
  const turn = n => {
    setFilter(f => ({ ...f, page: n }));
    if (top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const chips = [
    q.trim() && { label: "\u201C" + q.trim() + "\u201D", clear: () => set({ q: "" }) },
    area && { label: (ds.topics.find(t => String(t.id) === area) || {}).name, clear: () => { setExpanded(""); set({ area: "", domain: "" }); } },
    domain && { label: (ds.domains.find(d => String(d.id) === domain) || {}).name, clear: () => set({ domain: "" }) },
    risk && { label: (RATINGS.find(r => r[0] === risk) || [])[1], clear: () => set({ risk: "" }) }
  ].filter(Boolean);

  const areas = [...ds.topics].sort(byName);
  const count = pred => ds.fns.filter(pred).length;
  const pickArea = a => {
    const id = String(a.id);
    setExpanded(e => (e === id ? "" : id));
    set({ area: id, domain: "" });
  };

  return <>
    <Hero eyebrow="BROWSE THE MATRIX" title="Compliance Functions"
      lede="One view of every obligation. Narrow by risk area, domain, rating, or status on the left; switch the lens to read the same result set as a flat list or grouped by risk area, domain, or statute." />
    <div className="wrap">
      <div className="fbar">
        <SearchBox value={q} onChange={v => set({ q: v })} placeholder="Search a function, statute, citation, or owner..." />
        <div className="lenses" role="tablist">{LENSES.map(([k, label, ic]) =>
          <button key={label} role="tab" aria-selected={lens === k} className={"lens" + (lens === k ? " on" : "")}
            onClick={() => set({ lens: k && lens === k ? "" : k })}><Icon n={ic} s={22} />{label}</button>)}</div>
        {realAdmin && <button className="lens" onClick={newFn}><Icon n="plus" s={22} />Add new function</button>}
      </div>
      <div className="fgrid">
        <aside className="rail" aria-label="Risk Areas / Domains">
          <div className="rail-hd">Risk Areas / Domains{realAdmin && <button onClick={() => setTax(true)} aria-label="Add or manage risk areas and domains">+</button>}</div>
          <ul>
            <li className="all"><button className={!area && !domain ? "on" : ""} onClick={() => { setExpanded(""); set({ area: "", domain: "" }); }}>
              All Risk Areas<span className="c">{ds.fns.length}</span></button></li>
            {areas.map(a => <React.Fragment key={a.id}>
              <li><button className={area === String(a.id) && !domain ? "on" : ""} onClick={() => pickArea(a)} aria-expanded={expanded === String(a.id)}>
                {a.name}<span className="c">{a.count}</span></button></li>
              {expanded === String(a.id) && ds.domains.filter(d => String(d.topicId) === String(a.id)).sort(byName).map(d =>
                <li key={d.id} className="dom"><button className={domain === String(d.id) ? "on" : ""} onClick={() => set({ area: String(a.id), domain: String(d.id) })}>
                  {d.name}<span className="c">{count(f => String(f.areaId) === String(d.id))}</span></button></li>)}
            </React.Fragment>)}
          </ul>
          <div className="rail-sub">Risk rating</div>
          <ul>
            <li className="all"><button className={!risk ? "on" : ""} onClick={() => set({ risk: "" })}>Any rating<span className="c">{count(inScope)}</span></button></li>
            {RATINGS.map(([k, label]) => <li key={k}><button className={risk === k ? "on" : ""} onClick={() => set({ risk: risk === k ? "" : k })}>
              <span><i className="rdot" style={{ background: RATING_DOT[k] }}></i>{label}</span><span className="c">{count(f => inScope(f) && f.risk === k)}</span></button></li>)}
          </ul>
        </aside>
        <div>
        <div className="fresult" ref={top}>
          <span className="n">{rows.length === ds.fns.length ? ds.fns.length + " functions" : rows.length + " of " + ds.fns.length + " functions"}</span>
          {chips.map(c => <button key={c.label} className="chip-x" onClick={c.clear} aria-label={"Clear " + c.label}>{c.label}<Icon n="x" s={12} sw={2.4} /></button>)}
          {chips.length > 1 && <button className="linkbtn" onClick={() => { setExpanded(""); setFilter(f => ({ ...f, q: "", area: "", domain: "", risk: "", page: 1 })); }}>Clear all</button>}
        </div>
        <div className="ftable">
          <div className="frow fhead"><span>Name / ID</span><span>Risk Area / Domain</span><span>Statute / Citation</span><span>Comp Owner / Unit</span><span>Risk Rating</span></div>
          {shown.map((f, i) => {
            const co = f.chain.compliance;
            const first = co[0] ? co[0].person : null;
            const g = groupOf && groupOf(f);
            const head = groupOf && (i === 0 || groupOf(shown[i - 1]) !== g)
              ? <div className="fgroup" key={"g" + g + i}>{g}<span>{rows.filter(x => groupOf(x) === g).length}</span></div> : null;
            return <React.Fragment key={f.id}>{head}<button className="frow" onClick={() => openFn(f)}>
              <span><span className="n">{f.name}</span><span className="s">ID {f.code}</span></span>
              <span><span className="b">{f.topic}</span><span className="s">{f.area}</span></span>
              <span><span className="b">{f.statute}</span><span className="s">{f.citation}</span></span>
              <span className="own">{first && <Avatar person={first} size={30} />}<span><span className="n">{first ? first.n + (co.length > 1 ? " +" + (co.length - 1) : "") : ""}</span><span className="s">{first ? first.u : ""}</span></span></span>
              <span><RiskPill r={f.risk} /></span>
            </button></React.Fragment>;
          })}
          {!shown.length && <div className="empty">No functions match. <button className="linkbtn" onClick={() => { setExpanded(""); setFilter(f => ({ ...f, q: "", area: "", domain: "", risk: "", page: 1 })); }}>Clear the filters</button></div>}
          <div className="pager">
            <button className="btn" disabled={cur <= 1} onClick={() => turn(cur - 1)}>Previous</button>
            <span>Page {cur} of {pages}</span>
            <button className="btn" disabled={cur >= pages} onClick={() => turn(cur + 1)}>Next</button>
          </div>
        </div>
        </div>
      </div>
    </div>
    {tax && <TaxonomyManager onClose={() => setTax(false)} />}
  </>;
}
