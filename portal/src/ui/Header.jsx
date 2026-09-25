/* The header, in the Claude design's look: navy utility strip, white
   masthead with the Block S lockup, orange-underlined navigation. What it
   holds follows the canvas app: Definitions sits in the utility strip; the
   main nav is Home, Browse, Risk and Reporting, Executive Team; only
   administrators get the view switch (Admin view, User view, or any person
   in the directory). */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, useApp } from "./parts.jsx";
import { functionsFor } from "../data/model.js";
import blockS from "../assets/block-s.png";

export const BROWSE = [
  { screen: "Functions", title: "Compliance Functions", desc: "Every obligation, filter by risk area or domain", icon: "list" },
  { screen: "Deadlines", title: "Deadlines", desc: "Upcoming and recurring due dates", icon: "calendar" },
  { screen: "Directory", title: "Directory", desc: "Owners, titles, units, contacts", icon: "users" }
];
export const RISK = [
  { screen: "Gap Tracker", title: "Gap Tracker", desc: "Open gaps and closure workflow", icon: "alert" },
  { screen: "Risk Dashboard", title: "Risk Dashboard", desc: "Heat map and risk rollups", icon: "chart" },
  { screen: "Reporting", title: "Reporting", desc: "Power BI datasets and exports", icon: "layers" },
  { screen: "Flagged Items", title: "Flagged Items", desc: "Functions flagged for compliance review", icon: "flag" }
];

/* open gaps, scoped like the Gap Tracker: all of them in Admin view,
   otherwise those on the viewer's own functions */
export function useVisibleGaps() {
  const { ds, adminView, actingPerson } = useApp();
  return useMemo(() => {
    if (!ds) return [];
    if (adminView) return ds.gaps;
    const mine = new Set(functionsFor(actingPerson, ds.fns).map(f => String(f.id)));
    return ds.gaps.filter(g => mine.has(String(g.functionId)));
  }, [ds, adminView, actingPerson]);
}

function Dropdown({ label, icon, items, on, go, badges }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  return <div ref={ref} style={{ position: "relative" }}>
    <button className={"navbtn" + (on ? " on" : "")} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
      <Icon n={icon} />{label}<Icon n="chev" s={13} sw={2.2} style={{ opacity: .65 }} />
    </button>
    {open && <div className="menu" role="menu">{items.map(i =>
      <button key={i.screen} role="menuitem" className="mi" onClick={() => { go(i.screen); setOpen(false); }}>
        <Icon n={i.icon} /><span><span className="mi-t">{i.title}</span>{badges && badges[i.screen] ? <span className="gapbadge" style={{ marginLeft: 8 }}>{badges[i.screen]}</span> : null}
          <span className="mi-sub">{i.desc}</span></span>
      </button>)}</div>}
  </div>;
}

/* "Viewing as": administrators only */
function ViewAs() {
  const { ds, viewAs, setViewAs, realAdmin } = useApp();
  if (!ds || !realAdmin) return null;
  const value = viewAs.mode === "AsUser" ? "p:" + viewAs.personId : viewAs.mode;
  const onChange = e => {
    const v = e.target.value;
    setViewAs(v.startsWith("p:") ? { mode: "AsUser", personId: v.slice(2) } : { mode: v });
  };
  return <label className="util-role">Viewing as
    <select value={value} onChange={onChange} title="See the matrix as an administrator, as yourself, or as any person in the directory would. Changes you make are still saved as you.">
      <option value="Admin">Admin view</option>
      <option value="User">User view</option>
      <optgroup label="View as specific user...">
        {ds.people.map(p => <option key={p.id} value={"p:" + p.id}>{p.n}</option>)}
      </optgroup>
    </select></label>;
}

const inBrowse = s => BROWSE.some(i => i.screen === s);
const inRisk = s => RISK.some(i => i.screen === s);

export function Header({ screen, go, onSearch }) {
  const { cfg } = useApp();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [screen]);
  const gaps = useVisibleGaps();
  const badge = { "Gap Tracker": gaps.filter(g => g.open).length };
  const L = cfg.links;
  const nav = s => { setDrawer(false); go(s); };
  return <>
    <div className="util">
      <div className="util-in">
        {cfg.backend !== "sample" && <a href={L.siteHome}>Portal Home</a>}
        <a href={L.complianceHome} target="_blank" rel="noopener">Compliance Home Page</a>
        <a href={L.policies} target="_blank" rel="noopener">Policies</a>
        <a href="#/definitions" className={screen === "Definitions" ? "here" : ""} onClick={e => { e.preventDefault(); nav("Definitions"); }}>Definitions</a>
        <a className="sp" href={L.reportConcern} target="_blank" rel="noopener">Report a Concern</a>
        <ViewAs />
      </div>
    </div>
    <header className="hdr">
      <div className="hdr-in">
        <button className="lockup" onClick={() => nav("Home")} title="Compliance Matrix home">
          <img className="block-s" src={blockS} alt="" aria-hidden="true" />
          <span><span className="app">Syracuse University</span><span className="unit">Compliance Matrix</span></span>
        </button>
        <nav className="cm-nav" aria-label="Compliance Matrix">
          <button className={"navbtn" + (screen === "Home" ? " on" : "")} onClick={() => nav("Home")}><Icon n="home" />Home</button>
          <Dropdown label="Browse" icon="grid" items={BROWSE} on={inBrowse(screen)} go={nav} />
          <Dropdown label="Risk and Reporting" icon="chart" items={RISK} on={inRisk(screen)} go={nav} badges={badge} />
          <button className={"navbtn" + (screen === "Executive Team" ? " on" : "")} onClick={() => nav("Executive Team")}><Icon n="users" />Executive Team</button>
        </nav>
        <div className="hdr-right">
          <button className="hdr-find" onClick={onSearch} aria-label="Search the matrix" title="Search the matrix (Ctrl K)">
            <Icon n="search" s={17} sw={2} /><span className="t">Search</span><kbd>Ctrl K</kbd></button>
          <button className="hamb" onClick={() => setDrawer(!drawer)} aria-label="Menu" aria-expanded={drawer}><Icon n={drawer ? "x" : "menu"} s={20} /></button>
        </div>
      </div>
    </header>
    {drawer && <div className="drawer">
      <button className="di" onClick={() => nav("Home")}><Icon n="home" s={20} />Home</button>
      <div className="dgrp">Browse</div>
      {BROWSE.map(i => <button key={i.screen} className="di" onClick={() => nav(i.screen)}><Icon n={i.icon} s={20} />{i.title}</button>)}
      <div className="dgrp">Risk and Reporting</div>
      {RISK.map(i => <button key={i.screen} className="di" onClick={() => nav(i.screen)}><Icon n={i.icon} s={20} />{i.title}
        {badge[i.screen] ? <span className="gapbadge" style={{ marginLeft: 6 }}>{badge[i.screen]}</span> : null}</button>)}
      <div className="dgrp">More</div>
      <button className="di" onClick={() => nav("Executive Team")}><Icon n="users" s={20} />Executive Team</button>
      <button className="di" onClick={() => nav("Definitions")}><Icon n="book" s={20} />Definitions</button>
    </div>}
  </>;
}
